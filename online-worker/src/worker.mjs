import {
  buildCorsHeaders,
  generateRoomCode,
  generateSecretId,
  hashResumeToken,
  isValidRoomCode,
  normalizeRoomCode,
  sanitizeDisplayName,
  validateAnswerPayload,
  validateCharacterPayload,
  validateCreateRoomPayload,
  validateSessionHeaders,
} from './validation.mjs';

const RPC_TIMEOUT_MS = 8000;
const MAX_ROOM_CODE_RETRIES = 5;

export async function callSupabaseRpc(env, fnName, params = {}, requestImpl = fetch) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_PUBLISHABLE_KEY) {
    return { ok: false, status: 503, code: 'CONFIGURATION_MISSING' };
  }
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fnName}`;
  try {
    const response = await requestImpl(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel?.();
      return { ok: false, status: 502, code: 'UPSTREAM_REJECTED', upstreamStatus: response.status };
    }
    const data = await response.json();
    if (!data || typeof data !== 'object') {
      return { ok: false, status: 502, code: 'INVALID_UPSTREAM_RESPONSE' };
    }
    return { ok: true, status: 200, data };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
    };
  }
}

async function readJsonBody(request) {
  try {
    const text = await request.text();
    if (!text) return {};
    if (text.length > 16_384) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function jsonResponse(payload, status, headers) {
  return Response.json(payload, { status, headers });
}

function statusForRpcCode(code) {
  switch (code) {
    case 'ROOM_NOT_FOUND': return 404;
    case 'UNAUTHORIZED': return 401;
    case 'ROOM_FULL':
    case 'ROOM_ALREADY_STARTED':
    case 'CHARACTER_TAKEN':
    case 'CHARACTER_REQUIRED':
    case 'INVALID_ROOM_STATE':
    case 'REMATCH_UNAVAILABLE':
      return 409;
    default:
      return 400;
  }
}

function generateQuestionSeed(randomBytes = size => crypto.getRandomValues(new Uint8Array(size))) {
  const bytes = randomBytes(4);
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 1;
  return Math.max(1, value);
}

export function createWorkerHandler({
  fetchImpl = fetch,
  randomBytes = size => crypto.getRandomValues(new Uint8Array(size)),
} = {}) {
  return async function handleRequest(request, env = {}) {
    const headers = buildCorsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/' && request.method === 'GET') {
      return jsonResponse({
        ok: true,
        service: 'ddp-online-battle',
        endpoints: ['/health', '/api/rooms'],
      }, 200, headers);
    }

    if (path === '/health') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { ...headers, Allow: 'GET, OPTIONS' });
      }
      const start = Date.now();
      const result = await callSupabaseRpc(env, 'ddp_online_health', {}, fetchImpl);
      if (!result.ok || result.data?.ok !== true) {
        return jsonResponse({
          ok: false,
          code: result.code ?? 'UPSTREAM_ERROR',
          elapsed_ms: Date.now() - start,
        }, result.status ?? 503, headers);
      }
      return jsonResponse({
        ok: true,
        code: 'CONNECTED',
        service: 'ddp-online-battle',
        database_time: result.data.database_time,
        active_rooms: result.data.active_rooms ?? 0,
        elapsed_ms: Date.now() - start,
      }, 200, headers);
    }

    // POST /api/rooms — 建立新房間
    if (path === '/api/rooms') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { ...headers, Allow: 'POST, OPTIONS' });
      }
      const body = await readJsonBody(request);
      const parsed = validateCreateRoomPayload(body);
      if (!parsed.ok) return jsonResponse({ ok: false, code: parsed.code }, 400, headers);

      const playerId = `p_${generateSecretId(8, randomBytes)}`;
      const resumeToken = generateSecretId(24, randomBytes);
      const tokenHash = await hashResumeToken(resumeToken);

      for (let attempt = 0; attempt < MAX_ROOM_CODE_RETRIES; attempt += 1) {
        const roomCode = generateRoomCode(randomBytes);
        const rpc = await callSupabaseRpc(env, 'ddp_online_create_room', {
          p_room_code: roomCode,
          p_player_id: playerId,
          p_token_hash: tokenHash,
          p_player_name: parsed.value.playerName,
          p_quiz_id: parsed.value.quizId,
          p_quiz_name: parsed.value.quizName,
          p_arena_id: parsed.value.arenaId,
          p_rule_mode: parsed.value.ruleMode,
          p_rule_limit: parsed.value.ruleLimit,
          p_question_count: parsed.value.questionCount,
        }, fetchImpl);
        if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
        if (rpc.data.ok) {
          return jsonResponse({
            ok: true,
            room: rpc.data.room,
            session: { roomCode, playerId, resumeToken, seat: 'left' },
          }, 201, headers);
        }
        if (rpc.data.code !== 'ROOM_CODE_CONFLICT') {
          return jsonResponse({ ok: false, code: rpc.data.code ?? 'CREATE_FAILED' }, statusForRpcCode(rpc.data.code), headers);
        }
      }
      return jsonResponse({ ok: false, code: 'ROOM_CODE_EXHAUSTED' }, 503, headers);
    }

    // /api/rooms/:code/:action
    const match = path.match(/^\/api\/rooms\/([^/]+)\/(join|state|character|ready|answer|timeout|rematch|leave)$/);
    if (!match) {
      return jsonResponse({ ok: false, code: 'NOT_FOUND' }, 404, headers);
    }

    const roomCode = normalizeRoomCode(decodeURIComponent(match[1]));
    const action = match[2];
    if (!isValidRoomCode(roomCode)) {
      return jsonResponse({ ok: false, code: 'INVALID_ROOM_CODE' }, 400, headers);
    }

    if (action === 'join') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { ...headers, Allow: 'POST, OPTIONS' });
      }
      const body = await readJsonBody(request);
      if (body === null) return jsonResponse({ ok: false, code: 'INVALID_BODY' }, 400, headers);

      const resumePlayerId = typeof body.playerId === 'string' && body.playerId.trim() ? body.playerId.trim() : null;
      const resumeTokenInput = typeof body.resumeToken === 'string' && body.resumeToken.trim().length >= 16
        ? body.resumeToken.trim()
        : null;
      const playerId = resumePlayerId ?? `p_${generateSecretId(8, randomBytes)}`;
      const resumeToken = resumeTokenInput ?? generateSecretId(24, randomBytes);
      const tokenHash = await hashResumeToken(resumeToken);
      const playerName = sanitizeDisplayName(body.playerName, '藍隊玩家');

      const rpc = await callSupabaseRpc(env, 'ddp_online_join_room', {
        p_room_code: roomCode,
        p_player_id: playerId,
        p_token_hash: tokenHash,
        p_player_name: playerName,
      }, fetchImpl);
      if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
      if (!rpc.data.ok) {
        return jsonResponse({ ok: false, code: rpc.data.code }, statusForRpcCode(rpc.data.code), headers);
      }
      return jsonResponse({
        ok: true,
        resumed: Boolean(rpc.data.resumed),
        room: rpc.data.room,
        session: { roomCode, playerId, resumeToken, seat: rpc.data.seat },
      }, 200, headers);
    }

    // 以下端點均需有效玩家憑證標頭
    const auth = validateSessionHeaders(request);
    if (!auth.ok) return jsonResponse({ ok: false, code: auth.code }, 401, headers);
    const tokenHash = await hashResumeToken(auth.value.resumeToken);

    if (action === 'state') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { ...headers, Allow: 'GET, OPTIONS' });
      }
      const sinceRaw = url.searchParams.get('sinceVersion');
      const sinceVersion = sinceRaw !== null && /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : 0;
      const rpc = await callSupabaseRpc(env, 'ddp_online_get_state', {
        p_room_code: roomCode,
        p_player_id: auth.value.playerId,
        p_token_hash: tokenHash,
        p_since_version: sinceVersion,
      }, fetchImpl);
      if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
      if (!rpc.data.ok) {
        return jsonResponse({ ok: false, code: rpc.data.code }, statusForRpcCode(rpc.data.code), headers);
      }
      return jsonResponse(rpc.data, 200, headers);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { ...headers, Allow: 'POST, OPTIONS' });
    }
    const body = await readJsonBody(request);
    if (body === null) return jsonResponse({ ok: false, code: 'INVALID_BODY' }, 400, headers);

    if (action === 'character') {
      const parsed = validateCharacterPayload(body);
      if (!parsed.ok) return jsonResponse({ ok: false, code: parsed.code }, 400, headers);
      const rpc = await callSupabaseRpc(env, 'ddp_online_select_character', {
        p_room_code: roomCode,
        p_player_id: auth.value.playerId,
        p_token_hash: tokenHash,
        p_character_id: parsed.value.characterId,
      }, fetchImpl);
      if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
      return jsonResponse(rpc.data, rpc.data.ok ? 200 : statusForRpcCode(rpc.data.code), headers);
    }

    if (action === 'ready') {
      const rpc = await callSupabaseRpc(env, 'ddp_online_set_ready', {
        p_room_code: roomCode,
        p_player_id: auth.value.playerId,
        p_token_hash: tokenHash,
        p_ready: Boolean(body.ready),
        p_question_seed: generateQuestionSeed(randomBytes),
      }, fetchImpl);
      if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
      return jsonResponse(rpc.data, rpc.data.ok ? 200 : statusForRpcCode(rpc.data.code), headers);
    }

    if (action === 'answer') {
      const parsed = validateAnswerPayload(body);
      if (!parsed.ok) return jsonResponse({ ok: false, code: parsed.code }, 400, headers);
      const rpc = await callSupabaseRpc(env, 'ddp_online_submit_answer', {
        p_room_code: roomCode,
        p_player_id: auth.value.playerId,
        p_token_hash: tokenHash,
        p_question_index: parsed.value.questionIndex,
        p_answer_index: parsed.value.answerIndex,
        p_correct_answer_index: parsed.value.correctAnswerIndex,
        p_attack_type: parsed.value.attackType,
      }, fetchImpl);
      if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
      return jsonResponse(rpc.data, rpc.data.ok ? 200 : statusForRpcCode(rpc.data.code), headers);
    }

    if (action === 'timeout') {
      const rpc = await callSupabaseRpc(env, 'ddp_online_finish_time', {
        p_room_code: roomCode,
        p_player_id: auth.value.playerId,
        p_token_hash: tokenHash,
      }, fetchImpl);
      if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
      return jsonResponse(rpc.data, rpc.data.ok ? 200 : statusForRpcCode(rpc.data.code), headers);
    }

    if (action === 'rematch') {
      const rpc = await callSupabaseRpc(env, 'ddp_online_request_rematch', {
        p_room_code: roomCode,
        p_player_id: auth.value.playerId,
        p_token_hash: tokenHash,
        p_question_seed: generateQuestionSeed(randomBytes),
      }, fetchImpl);
      if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
      return jsonResponse(rpc.data, rpc.data.ok ? 200 : statusForRpcCode(rpc.data.code), headers);
    }

    if (action === 'leave') {
      const rpc = await callSupabaseRpc(env, 'ddp_online_leave_room', {
        p_room_code: roomCode,
        p_player_id: auth.value.playerId,
        p_token_hash: tokenHash,
      }, fetchImpl);
      if (!rpc.ok) return jsonResponse({ ok: false, code: rpc.code }, rpc.status, headers);
      return jsonResponse(rpc.data, rpc.data.ok ? 200 : statusForRpcCode(rpc.data.code), headers);
    }

    return jsonResponse({ ok: false, code: 'NOT_FOUND' }, 404, headers);
  };
}

export default {
  fetch: createWorkerHandler(),
};
