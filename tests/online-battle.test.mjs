import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteUrl,
  normalizeApiUrl,
  readInviteParams,
  resolveOnlineApiUrl,
  saveOnlineApiUrl,
} from '../web/js/online/online-config.mjs';
import { createSeededQuestionDeck, isValidRoomCode, normalizeRoomCode } from '../web/js/online/room-code.mjs';
import {
  clearOnlineSession,
  createOnlineTransport,
  loadOnlineSession,
  saveOnlineSession,
} from '../web/js/online/online-transport.mjs';
import { createOnlineController, DISCONNECT_GRACE_MS } from '../web/js/online/online-controller.mjs';
import {
  buildOnlineHubView,
  buildOnlineResultView,
  buildOnlineWaitingRoomView,
} from '../web/js/online/online-views.mjs';
import { bindStartScreen, buildStartScreen } from '../web/js/start-screen.mjs';
import { buildMobileAnswerControls } from '../web/js/mobile-controls.mjs';
import { buildBattleMarkup } from '../web/js/battle-renderer.mjs';
import { battleStatus, GAME_MODES } from '../web/js/game-mode.mjs';

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  };
}

test('伺服器網址驗證與優先權：網址參數 > 本機儲存 > 預設值', () => {
  assert.equal(normalizeApiUrl('https://ddp.workers.dev///'), 'https://ddp.workers.dev');
  assert.equal(normalizeApiUrl('http://localhost:8787/'), 'http://localhost:8787');
  assert.equal(normalizeApiUrl('http://insecure.example.com'), '');
  assert.equal(normalizeApiUrl('javascript:alert(1)'), '');

  const storage = makeMemoryStorage();
  saveOnlineApiUrl('https://saved.workers.dev', storage);
  assert.equal(
    resolveOnlineApiUrl({ search: '?onlineApi=https://query.workers.dev', storage, defaultUrl: 'https://default.workers.dev' }),
    'https://query.workers.dev',
  );
  assert.equal(
    resolveOnlineApiUrl({ search: '', storage, defaultUrl: 'https://default.workers.dev' }),
    'https://saved.workers.dev',
  );
  saveOnlineApiUrl('', storage);
  assert.equal(
    resolveOnlineApiUrl({ search: '', storage, defaultUrl: 'https://default.workers.dev' }),
    'https://default.workers.dev',
  );
});

test('邀請連結產生與解析保留 6 碼房號與伺服器參數', () => {
  const invite = buildInviteUrl({
    roomCode: 'k7m-9p2',
    pageUrl: 'https://coolokey.github.io/dd2p-quiz-web/?old=1#hash',
    apiUrl: 'https://ddp.workers.dev',
  });
  const parsedUrl = new URL(invite);
  assert.equal(parsedUrl.pathname, '/dd2p-quiz-web/');
  assert.deepEqual(readInviteParams(parsedUrl.search), {
    roomCode: 'K7M9P2',
    apiUrl: 'https://ddp.workers.dev',
  });
  assert.equal(isValidRoomCode('0O1IL2'), false);
  assert.equal(normalizeRoomCode(' k7m-9p2 '), 'K7M9P2');
});

test('兩個獨立瀏覽器使用相同 questionSeed 會產生完全一致的題序與選項位置', () => {
  const sampleQuestions = Array.from({ length: 8 }, (_, index) => ({
    id: String(index + 1).padStart(3, '0'),
    prompt: `題目 ${index + 1}`,
    choices: ['選項A', '選項B', '選項C', '選項D'],
    answerIndex: index % 4,
    image: null,
  }));

  const clientLeft = createSeededQuestionDeck(sampleQuestions, 20261122, 'random');
  const clientRight = createSeededQuestionDeck(sampleQuestions, 20261122, 'random');

  for (let i = 0; i < 14; i += 1) {
    assert.deepEqual(clientLeft.getQuestion(i), clientRight.getQuestion(i));
  }

  const fixedLeft = createSeededQuestionDeck(sampleQuestions, 987654, 'fixed');
  const fixedRight = createSeededQuestionDeck(sampleQuestions, 987654, 'fixed');
  assert.equal(fixedLeft.getQuestion(0).id, '001');
  assert.deepEqual(fixedLeft.getQuestion(0), fixedRight.getQuestion(0));
});

test('online-transport 附加玩家憑證標頭並正確保存與清除 session', async () => {
  const storage = makeMemoryStorage();
  const session = { roomCode: 'K7M9P2', playerId: 'p_1', resumeToken: 'tok_1234567890abcdef', seat: 'left' };
  saveOnlineSession(session, storage);
  assert.equal(loadOnlineSession(storage).roomCode, 'K7M9P2');

  const calls = [];
  const transport = createOnlineTransport({
    apiUrl: 'https://ddp.workers.dev',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ ok: true, changed: false, version: 3 });
    },
  });
  const res = await transport.getState(session, 3);
  assert.equal(res.ok, true);
  assert.equal(calls[0].init.headers['X-DDP-Player-Id'], 'p_1');
  assert.equal(calls[0].init.headers['X-DDP-Resume-Token'], 'tok_1234567890abcdef');

  clearOnlineSession(storage);
  assert.equal(loadOnlineSession(storage), null);
});

test('online-controller 對相同 event.seq 只觸發一次動畫事件，並追蹤斷線寬限與倒數校準', async () => {
  let now = Date.parse('2026-11-22T01:00:10Z');
  const timers = [];
  let pollMode = 'event';
  const transport = {
    async getState(_session, sinceVersion) {
      if (pollMode === 'event') {
        return {
          ok: true,
          changed: true,
          serverTime: new Date(now + 2000).toISOString(),
          room: {
            roomCode: 'K7M9P2',
            status: 'playing',
            version: sinceVersion + 1,
            ruleMode: 'time',
            ruleLimit: 60,
            startedAt: '2026-11-22T01:00:00Z',
            serverTime: new Date(now + 2000).toISOString(),
            eventSeq: 1,
            lastEvent: { seq: 1, type: 'answer', player: 'left', correct: true },
          },
        };
      }
      return { ok: false, code: 'NETWORK_ERROR', message: '斷線' };
    },
    async leaveRoom() { return { ok: true }; },
  };

  const events = [];
  const statuses = [];
  const controller = createOnlineController({
    transport,
    onBattleEvent: evt => events.push(evt.seq),
    onConnectionChange: status => statuses.push(status),
    setTimeoutFn: fn => { timers.push(fn); return timers.length; },
    clearTimeoutFn: () => {},
    nowFn: () => now,
  });

  controller.start(
    { roomCode: 'K7M9P2', playerId: 'p_1', resumeToken: 'tok_1234567890abcdef', seat: 'left' },
    {
      roomCode: 'K7M9P2',
      status: 'playing',
      version: 1,
      ruleMode: 'time',
      ruleLimit: 60,
      startedAt: '2026-11-22T01:00:00Z',
      serverTime: '2026-11-22T01:00:10Z',
      eventSeq: 0,
      lastEvent: null,
    },
  );

  await controller.pollOnce();
  await controller.pollOnce();
  assert.deepEqual(events, [1], '相同 seq 的戰鬥事件不可重複觸發');
  assert.equal(controller.getRemainingSeconds(), 48, '依據伺服器時間差計算剩餘秒數');

  pollMode = 'error';
  now += 5000;
  await controller.pollOnce();
  assert.equal(controller.getConnectionStatus(), 'reconnecting');

  now += DISCONNECT_GRACE_MS;
  await controller.pollOnce();
  assert.equal(controller.getConnectionStatus(), 'disconnected');
  assert.ok(statuses.includes('reconnecting') && statuses.includes('disconnected'));

  await controller.leaveRoom();
  assert.equal(controller.getRoom(), null);
});

test('起始畫面提供第三種網路雙人對戰模式並可綁定點擊', () => {
  const html = buildStartScreen({ quizCount: 36, muted: false, scene: './scene.png', fighters: ['./l.png', './r.png'] });
  assert.match(html, /data-game-mode="online"[^>]*>[^<]*網路雙人對戰/s);

  const elements = { solo: {}, local: {}, online: {}, '#start-help': {}, '#start-audio': {} };
  const picked = [];
  bindStartScreen({
    querySelector: selector => selector === '[data-game-mode="solo"]' ? elements.solo
      : selector === '[data-game-mode="local"]' ? elements.local
        : selector === '[data-game-mode="online"]' ? elements.online
          : elements[selector],
  }, { onMode: mode => picked.push(mode), onHelp() {}, onAudio() {} });

  elements.online.onclick();
  assert.deepEqual(picked, ['online']);
});

test('網路模式觸控面板只建立本地席位，戰鬥畫面顯示連線徽章與離開確認框', () => {
  const rightOnly = buildMobileAnswerControls({
    gameMode: GAME_MODES.online,
    choiceCount: 4,
    eligiblePlayers: ['right'],
    localPlayer: 'right',
  });
  assert.equal((rightOnly.match(/data-player="right"/g) ?? []).length, 4);
  assert.doesNotMatch(rightOnly, /data-player="left"/);

  const html = buildBattleMarkup({
    scene: { label: '大溪校門對決', image: './gate.webp' },
    gameMode: GAME_MODES.online,
    localPlayer: 'right',
    onlineBadge: '線上｜K7M9P2',
    onlineLeaveConfirm: true,
    eligiblePlayers: ['right'],
    players: {
      left: { name: '紅隊', health: 100, score: 1, image: './l.webp' },
      right: { name: '藍隊', health: 90, score: 0, image: './r.webp' },
    },
    progress: '2／10',
    prompt: '測試題目',
    choices: ['A', 'B', 'C', 'D'],
    status: battleStatus(GAME_MODES.online, ['right'], 'regulation', { localSeat: 'right', playerNames: { right: '藍隊' } }),
    phase: 'regulation',
  });

  assert.match(html, /class="online-battle-badge"[^>]*>線上｜K7M9P2/);
  assert.match(html, /data-online-leave-battle/);
  assert.match(html, /data-online-leave-confirm/);
  assert.match(html, /輪到你（藍隊）作答/);
});

test('網路大廳、備戰室與結算畫面正確呈現房間碼、對手鎖定角與再戰按鈕', () => {
  const hubHtml = buildOnlineHubView({
    apiUrl: 'https://ddp.workers.dev',
    healthState: 'connected',
    playerName: '溪羽',
    savedSession: { roomCode: 'K7M9P2' },
  });
  assert.match(hubHtml, /伺服器連線正常/);
  assert.match(hubHtml, /id="online-resume-btn"/);

  const waitingHtml = buildOnlineWaitingRoomView({
    room: {
      roomCode: 'K7M9P2',
      quizName: '115 會考數學',
      ruleMode: 'questions',
      ruleLimit: 10,
      arenaId: 'daxi-gate',
      players: {
        left: { name: '紅方', characterId: 'hero-1', ready: false },
        right: { name: '藍方', characterId: 'hero-2', ready: true },
      },
    },
    seat: 'left',
    characters: [
      { id: 'hero-1', label: '溪羽', playable: true },
      { id: 'hero-2', label: '崁迅', playable: true },
    ],
    inviteUrl: 'https://coolokey.github.io/dd2p-quiz-web/?room=K7M9P2',
  });
  assert.match(waitingHtml, /data-room-code="K7M9P2"/);
  assert.match(waitingHtml, /data-online-character="hero-2"[^>]*disabled/);
  assert.match(waitingHtml, /id="online-copy-link"/);

  const resultHtml = buildOnlineResultView({
    room: {
      winner: 'left',
      endReason: 'ko',
      scores: { left: 10, right: 4 },
      rematch: { left: false, right: true },
      players: { left: { name: '紅方' }, right: { name: '藍方' } },
    },
    seat: 'left',
  });
  assert.match(resultHtml, /KO！/);
  assert.match(resultHtml, /對手邀請再戰！立即開局/);
});
