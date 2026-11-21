export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const ATTACK_TYPES = new Set(['energy', 'punch', 'kick']);

export function normalizeRoomCode(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidRoomCode(value) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value));
}

export function generateRoomCode(randomBytes = size => crypto.getRandomValues(new Uint8Array(size))) {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

export function generateSecretId(byteLength = 16, randomBytes = size => crypto.getRandomValues(new Uint8Array(size))) {
  const bytes = randomBytes(byteLength);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashResumeToken(token) {
  const data = new TextEncoder().encode(String(token ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function sanitizeDisplayName(value, fallback = '玩家') {
  const cleaned = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
  return cleaned || fallback;
}

export function validateCreateRoomPayload(body) {
  if (!body || typeof body !== 'object') return { ok: false, code: 'INVALID_BODY' };
  const quizId = String(body.quizId ?? '').trim();
  const arenaId = String(body.arenaId ?? '').trim();
  const quizName = sanitizeDisplayName(body.quizName, quizId).slice(0, 60);
  const playerName = sanitizeDisplayName(body.playerName, '紅隊玩家');
  const ruleMode = body.ruleMode === 'time' ? 'time' : body.ruleMode === 'questions' ? 'questions' : null;
  const ruleLimit = Number(body.ruleLimit);
  const questionCount = Number(body.questionCount);

  if (!SAFE_ID_PATTERN.test(quizId)) return { ok: false, code: 'INVALID_QUIZ_ID' };
  if (!SAFE_ID_PATTERN.test(arenaId)) return { ok: false, code: 'INVALID_ARENA_ID' };
  if (!ruleMode) return { ok: false, code: 'INVALID_RULE_MODE' };
  const maxLimit = ruleMode === 'time' ? 600 : 500;
  if (!Number.isInteger(ruleLimit) || ruleLimit < 1 || ruleLimit > maxLimit) {
    return { ok: false, code: 'INVALID_RULE_LIMIT' };
  }
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 5000) {
    return { ok: false, code: 'INVALID_QUESTION_COUNT' };
  }

  return {
    ok: true,
    value: { quizId, quizName, arenaId, playerName, ruleMode, ruleLimit, questionCount },
  };
}

export function validateSessionHeaders(request) {
  const playerId = String(request.headers.get('X-DDP-Player-Id') ?? '').trim();
  const resumeToken = String(request.headers.get('X-DDP-Resume-Token') ?? '').trim();
  if (!SAFE_ID_PATTERN.test(playerId) || resumeToken.length < 16 || resumeToken.length > 128) {
    return { ok: false, code: 'UNAUTHORIZED' };
  }
  return { ok: true, value: { playerId, resumeToken } };
}

export function validateCharacterPayload(body) {
  const characterId = String(body?.characterId ?? '').trim();
  if (!SAFE_ID_PATTERN.test(characterId)) return { ok: false, code: 'INVALID_CHARACTER_ID' };
  return { ok: true, value: { characterId } };
}

export function validateAnswerPayload(body) {
  const questionIndex = Number(body?.questionIndex);
  const answerIndex = Number(body?.answerIndex);
  const correctAnswerIndex = Number(body?.correctAnswerIndex);
  const attackType = ATTACK_TYPES.has(body?.attackType) ? body.attackType : 'energy';
  if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 5000) {
    return { ok: false, code: 'INVALID_QUESTION_INDEX' };
  }
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
    return { ok: false, code: 'INVALID_ANSWER_INDEX' };
  }
  if (!Number.isInteger(correctAnswerIndex) || correctAnswerIndex < 0 || correctAnswerIndex > 3) {
    return { ok: false, code: 'INVALID_CORRECT_INDEX' };
  }
  return { ok: true, value: { questionIndex, answerIndex, correctAnswerIndex, attackType } };
}

export function buildCorsHeaders(request, env = {}) {
  const origin = request.headers.get('Origin') ?? '';
  const allowedRaw = String(env.ALLOWED_ORIGINS ?? '*').trim();
  let allowOrigin = '*';
  if (allowedRaw !== '*') {
    const allowedList = allowedRaw.split(',').map(item => item.trim()).filter(Boolean);
    allowOrigin = allowedList.includes(origin) ? origin : (allowedList[0] ?? 'null');
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-DDP-Player-Id, X-DDP-Resume-Token',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Origin',
  };
}
