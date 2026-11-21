import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkerHandler } from '../online-worker/src/worker.mjs';
import { hashResumeToken, isValidRoomCode, normalizeRoomCode } from '../online-worker/src/validation.mjs';

const TEST_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_secret_test_value_123456',
  ALLOWED_ORIGINS: 'https://coolokey.github.io,http://localhost:3000',
};

function makeDeterministicBytes(seed = 0) {
  let counter = seed;
  return size => Uint8Array.from({ length: size }, () => (counter += 7) & 0xff);
}

test('Cloudflare Worker 健康檢查成功並附加正確 CORS 標頭', async () => {
  const calls = [];
  const handler = createWorkerHandler({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({
        ok: true,
        service: 'ddp-online-battle',
        database_time: '2026-11-22T01:00:00Z',
        active_rooms: 3,
      });
    },
  });

  const response = await handler(new Request('https://worker.test/health', {
    headers: { Origin: 'https://coolokey.github.io' },
  }), TEST_ENV);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://coolokey.github.io');
  assert.equal(body.ok, true);
  assert.equal(body.code, 'CONNECTED');
  assert.equal(body.active_rooms, 3);
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/ddp_online_health');
  assert.equal(calls[0].init.redirect, 'manual');
});

test('缺少環境設定或上游失敗時回傳精簡錯誤碼且絕不洩漏金鑰', async () => {
  const handlerMissing = createWorkerHandler();
  const resMissing = await handlerMissing(new Request('https://worker.test/health'), {});
  assert.equal(resMissing.status, 503);
  assert.equal((await resMissing.json()).code, 'CONFIGURATION_MISSING');

  const handlerFail = createWorkerHandler({
    fetchImpl: async () => new Response(`bad key ${TEST_ENV.SUPABASE_PUBLISHABLE_KEY}`, { status: 401 }),
  });
  const resFail = await handlerFail(new Request('https://worker.test/health'), TEST_ENV);
  const textFail = await resFail.text();
  assert.equal(resFail.status, 502);
  assert.doesNotMatch(textFail, new RegExp(TEST_ENV.SUPABASE_PUBLISHABLE_KEY));
  assert.equal(JSON.parse(textFail).code, 'UPSTREAM_REJECTED');
});

test('OPTIONS 預檢請求回傳 204 與允許的自訂標頭', async () => {
  const handler = createWorkerHandler();
  const response = await handler(new Request('https://worker.test/api/rooms', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' },
  }), TEST_ENV);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /X-DDP-Player-Id/);
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /X-DDP-Resume-Token/);
});

test('建立房間會雜湊 resumeToken 並在房號碰撞時自動重試', async () => {
  const rpcBodies = [];
  let attempt = 0;
  const handler = createWorkerHandler({
    randomBytes: makeDeterministicBytes(1),
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(init.body);
      rpcBodies.push(payload);
      attempt += 1;
      if (attempt === 1) return Response.json({ ok: false, code: 'ROOM_CODE_CONFLICT' });
      return Response.json({
        ok: true,
        seat: 'left',
        room: { roomCode: payload.p_room_code, status: 'waiting', version: 1 },
      });
    },
  });

  const response = await handler(new Request('https://worker.test/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quizId: 'cap-115-math-01-10',
      quizName: '115 年國中教育會考數學第 1～10 題',
      arenaId: 'daxi-gate',
      ruleMode: 'questions',
      ruleLimit: 10,
      questionCount: 10,
      playerName: '大溪老師',
    }),
  }), TEST_ENV);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(rpcBodies.length, 2);
  assert.equal(isValidRoomCode(body.session.roomCode), true);
  assert.equal(body.session.seat, 'left');
  assert.equal(rpcBodies[1].p_token_hash, await hashResumeToken(body.session.resumeToken));
  assert.notEqual(rpcBodies[1].p_token_hash, body.session.resumeToken);
});

test('建立房間會拒絕不合法的題庫或規則參數', async () => {
  const handler = createWorkerHandler();
  const response = await handler(new Request('https://worker.test/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quizId: '../bad',
      arenaId: 'daxi-gate',
      ruleMode: 'questions',
      ruleLimit: 10,
      questionCount: 10,
    }),
  }), TEST_ENV);

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_QUIZ_ID');
});

test('加入房間支援重連憑證，並將滿房與查無房間對應至 409 與 404', async () => {
  const captured = [];
  const handler = createWorkerHandler({
    randomBytes: makeDeterministicBytes(9),
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(init.body);
      captured.push(payload);
      if (payload.p_room_code === 'K7M9P2') {
        return Response.json({ ok: true, seat: 'right', resumed: true, room: { roomCode: 'K7M9P2', status: 'waiting' } });
      }
      if (payload.p_room_code === 'FU9922') {
        return Response.json({ ok: false, code: 'ROOM_FULL' });
      }
      return Response.json({ ok: false, code: 'ROOM_NOT_FOUND' });
    },
  });

  const resumeRes = await handler(new Request('https://worker.test/api/rooms/k7m-9p2/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: 'p_abc12345', resumeToken: '1234567890abcdef1234567890abcdef', playerName: '藍隊' }),
  }), TEST_ENV);
  const resumeBody = await resumeRes.json();
  assert.equal(resumeRes.status, 200);
  assert.equal(resumeBody.resumed, true);
  assert.equal(captured[0].p_room_code, normalizeRoomCode('k7m-9p2'));
  assert.equal(captured[0].p_player_id, 'p_abc12345');

  const fullRes = await handler(new Request('https://worker.test/api/rooms/FU9922/join', {
    method: 'POST',
    body: JSON.stringify({ playerName: '挑戰者' }),
  }), TEST_ENV);
  assert.equal(fullRes.status, 409);

  const missingRes = await handler(new Request('https://worker.test/api/rooms/M3N4P5/join', {
    method: 'POST',
    body: JSON.stringify({ playerName: '挑戰者' }),
  }), TEST_ENV);
  assert.equal(missingRes.status, 404);
});

test('受保護的狀態與作答端點會驗證標頭與答案索引範圍', async () => {
  const forwarded = [];
  const handler = createWorkerHandler({
    fetchImpl: async (url, init) => {
      forwarded.push({ url, body: JSON.parse(init.body) });
      return Response.json({ ok: true, accepted: true, room: { roomCode: 'K7M9P2', version: 5 } });
    },
  });

  const unauth = await handler(new Request('https://worker.test/api/rooms/K7M9P2/state'), TEST_ENV);
  assert.equal(unauth.status, 401);

  const headers = {
    'Content-Type': 'application/json',
    'X-DDP-Player-Id': 'p_host001',
    'X-DDP-Resume-Token': 'abcdef1234567890abcdef1234567890',
  };

  const badAnswer = await handler(new Request('https://worker.test/api/rooms/K7M9P2/answer', {
    method: 'POST',
    headers,
    body: JSON.stringify({ questionIndex: 0, answerIndex: 7, correctAnswerIndex: 1 }),
  }), TEST_ENV);
  assert.equal(badAnswer.status, 400);
  assert.equal((await badAnswer.json()).code, 'INVALID_ANSWER_INDEX');

  const goodAnswer = await handler(new Request('https://worker.test/api/rooms/K7M9P2/answer', {
    method: 'POST',
    headers,
    body: JSON.stringify({ questionIndex: 2, answerIndex: 1, correctAnswerIndex: 1, attackType: 'kick' }),
  }), TEST_ENV);
  assert.equal(goodAnswer.status, 200);
  assert.match(forwarded[0].url, /ddp_online_submit_answer$/);
  assert.equal(forwarded[0].body.p_question_index, 2);
  assert.equal(forwarded[0].body.p_attack_type, 'kick');

  const stateRes = await handler(new Request('https://worker.test/api/rooms/K7M9P2/state?sinceVersion=4', { headers }), TEST_ENV);
  assert.equal(stateRes.status, 200);
  assert.equal(forwarded[1].body.p_since_version, 4);
});

test('Supabase Schema 啟用 RLS、移除資料表公開權限並以 FOR UPDATE 鎖定原子裁定', async () => {
  const sql = await readFile(new URL('../online-worker/supabase/schema.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.ddp_online_rooms from public, anon, authenticated/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /ddp_online_submit_answer/i);
  const serializeFn = sql.slice(sql.indexOf('_ddp_serialize_room'), sql.indexOf('ddp_online_health'));
  assert.doesNotMatch(serializeFn, /token_hash/i, '公開序列化快照絕不可包含 token_hash');
});
