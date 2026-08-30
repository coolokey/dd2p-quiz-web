# DDP 網路雙人對戰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改變既有單機、雙人本機和輸入控制契約的前提下，建立可由 Firebase Realtime Database 同步的班級網路雙人對戰。

**Architecture:** 瀏覽器將可測試的房間碼、配對和對戰狀態拆成純函式模組；Firebase adapter 僅負責讀寫和訂閱。`app.mjs` 透過一個網路模式控制器把既有戰鬥生命週期映射為共享事件，所有遠端事件仍交給現有 renderer 與 lifecycle 播放。

**Tech Stack:** 原生 ES modules、Node test runner、Firebase Web SDK（Realtime Database）、GitHub Pages、現有 CSS 與 Gamepad API。

---

## File structure

- Create: `web/js/online/room-code.mjs` — 房間碼、暱稱與逾時資料驗證。
- Create: `web/js/online/online-state.mjs` — 大廳、配對與二人對戰的純 reducer／序列化資料。
- Create: `web/js/online/firebase-config.mjs` — 預設停用的公開 Firebase 設定讀取點；不含管理憑證。
- Create: `web/js/online/firebase-transport.mjs` — 可注入 SDK 的 Firebase 訂閱與 transaction adapter。
- Create: `web/js/online/online-lobby.mjs` — 主持人與加入者頁面 HTML、事件綁定。
- Create: `web/js/online/online-session-controller.mjs` — `app.mjs` 與 transport 的生命週期橋接。
- Create: `tests/room-code.test.mjs`、`tests/online-state.test.mjs`、`tests/firebase-transport.test.mjs`、`tests/online-lobby.test.mjs`、`tests/online-session-controller.test.mjs`。
- Modify: `web/js/game-mode.mjs`、`web/js/start-screen.mjs`、`web/js/app.mjs`、`web/js/battle-lifecycle.mjs`、`web/js/battle-pause-menu.mjs`、`web/css/app.css`。
- Modify: `tests/game-mode.test.mjs`、`tests/start-screen.test.mjs`、`tests/app-integration.test.mjs`、`tests/gamepad-input.test.mjs`。
- Create: `firebase/database.rules.json`、`firebase/firebase.json`、`docs/online-firebase-setup.md`。

### Task 1: Add a disabled-safe online game mode

**Files:**
- Modify: `web/js/game-mode.mjs`
- Modify: `web/js/start-screen.mjs`
- Test: `tests/game-mode.test.mjs`
- Test: `tests/start-screen.test.mjs`

- [ ] **Step 1: Write failing mode and start-screen tests**

```js
assert.equal(GAME_MODES.online, 'online');
assert.deepEqual(requiredCharacterPlayers(GAME_MODES.online), ['left']);
assert.match(buildStartScreen({ quizCount: 31, muted: false, scene: '', fighters: [], onlineEnabled: false }), /網路雙人對戰[\s\S]*disabled/);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/game-mode.test.mjs tests/start-screen.test.mjs`

Expected: FAIL because `online` and `onlineEnabled` do not yet exist.

- [ ] **Step 3: Implement the minimal mode and button**

```js
export const GAME_MODES = Object.freeze({ solo: 'solo', local: 'local', online: 'online' });
export function requiredCharacterPlayers(mode) {
  return mode === GAME_MODES.local ? ['left', 'right'] : ['left'];
}
```

Add a `data-game-mode="online"` start button, bind it exactly once, and show `網路對戰尚未啟用` when `onlineEnabled` is false. Do not alter solo/local markup or handlers.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/game-mode.test.mjs tests/start-screen.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/js/game-mode.mjs web/js/start-screen.mjs tests/game-mode.test.mjs tests/start-screen.test.mjs
git commit -m "feat: add disabled-safe online game mode"
```

### Task 2: Define validated room and player primitives

**Files:**
- Create: `web/js/online/room-code.mjs`
- Test: `tests/room-code.test.mjs`

- [ ] **Step 1: Write failing validation tests**

```js
assert.match(createRoomCode(() => 0), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
assert.equal(normalizeRoomCode(' ab2-cd3 '), 'AB2CD3');
assert.equal(normalizeRoomCode('O0I1L2'), null);
assert.equal(normalizeNickname('  溪羽  '), '溪羽');
assert.equal(normalizeNickname('一'), null);
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/room-code.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the validation module**

```js
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function normalizeRoomCode(value) {
  const code = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code) ? code : null;
}
export function normalizeNickname(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{N} ]{2,8}$/u.test(name) ? name : null;
}
```

Implement `createRoomCode(random)` with six selections from `ALPHABET`, `createToken(random)` with 24 random alphabet characters, and `expiresAt(now, milliseconds)`.

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/room-code.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/js/online/room-code.mjs tests/room-code.test.mjs
git commit -m "feat: validate online room identities"
```

### Task 3: Build the deterministic online room state reducer

**Files:**
- Create: `web/js/online/online-state.mjs`
- Test: `tests/online-state.test.mjs`

- [ ] **Step 1: Write failing room, pairing, and answer-claim tests**

```js
const room = createOnlineRoom({ code: 'AB2CD3', hostId: 'host', now: 1000, settings });
const joined = joinRoom(room, { playerId: 'p1', displayName: '溪羽', resumeToken: 'token' });
assert.equal(joined.players.p1.displayName, '溪羽');
assert.deepEqual(autoPair(joined), [['p1', 'p2']]);
assert.equal(claimAnswer({ claimedBy: null }, 'p1', 2, 2000).claimedBy, 'p1');
assert.equal(claimAnswer({ claimedBy: 'p1' }, 'p2', 1, 2001).claimedBy, 'p1');
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/online-state.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure state functions**

```js
export const PAIRING_MODES = Object.freeze({ student: 'student', teacher: 'teacher', auto: 'auto' });
export const NAME_MODES = Object.freeze({ nickname: 'nickname', roster: 'roster', guest: 'guest' });
export function claimAnswer(answer, playerId, answerIndex, claimedAt) {
  return answer?.claimedBy ? answer : { claimedBy: playerId, answerIndex, claimedAt, resolution: 'pending' };
}
```

Implement `createOnlineRoom`, `joinRoom`, `leaveRoom`, `pairPlayers`, `autoPair`, `markReady`, `canStartMatch`, `createMatch`, `applyResolvedAnswer`, and `expireRoom`. Keep all return values JSON serializable.

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/online-state.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/js/online/online-state.mjs tests/online-state.test.mjs
git commit -m "feat: add online room state reducer"
```

### Task 4: Add a Firebase transport behind a testable interface

**Files:**
- Create: `web/js/online/firebase-config.mjs`
- Create: `web/js/online/firebase-transport.mjs`
- Test: `tests/firebase-transport.test.mjs`

- [ ] **Step 1: Write failing transport tests with an injected fake SDK**

```js
const calls = [];
const transport = await createFirebaseTransport({ projectId: 'test' }, { sdk: fakeFirebase(calls) });
await transport.claimAnswer('AB2CD3', 'match-1', 0, 'p1', 2);
assert.deepEqual(calls.at(-1), ['transaction', 'rooms/AB2CD3/matches/match-1/answers/0', 'p1']);
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/firebase-transport.test.mjs`

Expected: FAIL because the transport does not exist.

- [ ] **Step 3: Implement the adapter**

```js
export async function createFirebaseTransport(config, { sdk = loadFirebaseSdk } = {}) {
  if (!config?.projectId) return createDisabledTransport('網路對戰尚未啟用');
  const api = await sdk(config);
  return {
    subscribeRoom: (code, listener) => api.subscribe(`rooms/${code}`, listener),
    claimAnswer: (code, matchId, index, playerId, answerIndex) =>
      api.transaction(`rooms/${code}/matches/${matchId}/answers/${index}`, current =>
        current?.claimedBy ? current : { claimedBy: playerId, answerIndex, claimedAt: api.serverTimestamp(), resolution: 'pending' }),
  };
}
```

`loadFirebaseSdk` must dynamically import the pinned Firebase Web SDK only in a browser invocation. It must never import an admin SDK or embed a service-account key. Implement `createRoom`, `joinRoom`, `updatePlayerPresence`, `writeMatch`, `subscribeMatch`, `resolveAnswer`, and `closeRoom` alongside `claimAnswer`.

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/firebase-transport.test.mjs`

Expected: PASS without network access.

- [ ] **Step 5: Commit**

```powershell
git add web/js/online/firebase-config.mjs web/js/online/firebase-transport.mjs tests/firebase-transport.test.mjs
git commit -m "feat: add firebase online room transport"
```

### Task 5: Implement host and join lobby UI

**Files:**
- Create: `web/js/online/online-lobby.mjs`
- Test: `tests/online-lobby.test.mjs`
- Modify: `web/css/app.css`

- [ ] **Step 1: Write failing UI tests**

```js
const html = buildOnlineLobby({ role: 'host', code: 'AB2CD3', pairingMode: 'auto', nameMode: 'nickname', players: [] });
assert.match(html, /班級大廳/);
assert.match(html, /AB2CD3/);
assert.match(html, /學生自行選對手/);
assert.match(html, /老師安排配對/);
assert.match(html, /系統自動配對/);
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/online-lobby.test.mjs`

Expected: FAIL because the lobby module does not exist.

- [ ] **Step 3: Implement accessible lobby rendering and bindings**

```js
export function buildOnlineLobby({ role, code, pairingMode, nameMode, players }) {
  return `<section class="online-lobby" aria-label="班級大廳">...</section>`;
}
export function bindOnlineLobby(root, handlers) {
  root.querySelector('[data-online-auto-pair]').onclick = handlers.autoPair;
}
```

Render all three pairing controls and all three name-mode controls. Bind host-only actions only for `role === 'host'`; bind joining users to a code input and a visible status announcement. Add responsive CSS that does not overlap the existing touch answer controls.

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/online-lobby.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/js/online/online-lobby.mjs web/css/app.css tests/online-lobby.test.mjs
git commit -m "feat: add online class lobby"
```

### Task 6: Bridge the online session to the existing battle lifecycle

**Files:**
- Create: `web/js/online/online-session-controller.mjs`
- Modify: `web/js/app.mjs`
- Modify: `web/js/battle-lifecycle.mjs`
- Test: `tests/online-session-controller.test.mjs`
- Test: `tests/app-integration.test.mjs`

- [ ] **Step 1: Write failing synchronization tests**

```js
const controller = createOnlineSessionController({ transport, now: () => 1000, onRemoteAnswer });
await controller.submitLocalAnswer({ questionIndex: 0, answerIndex: 2 });
assert.deepEqual(transport.claims, [{ questionIndex: 0, answerIndex: 2 }]);
controller.receiveMatch({ state: { questionIndex: 0 }, answers: { 0: { claimedBy: 'remote', answerIndex: 1 } } });
assert.deepEqual(received, [{ player: 'right', answerIndex: 1 }]);
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/online-session-controller.test.mjs tests/app-integration.test.mjs`

Expected: FAIL because the controller and online integration do not exist.

- [ ] **Step 3: Implement the controller and narrow app integration**

```js
export function createOnlineSessionController({ transport, onRemoteAnswer, onConnectionChange }) {
  let match = null;
  return {
    attach(nextMatch) { match = nextMatch; },
    submitLocalAnswer({ questionIndex, answerIndex }) {
      return transport.claimAnswer(match.roomCode, match.id, questionIndex, match.localPlayerId, answerIndex);
    },
  };
}
```

In `app.mjs`, route only online local input to `submitLocalAnswer`; render received resolved events through the existing `resolveBattleAnswer` and `animateBattleAnswer` paths. Ensure remote events never call the local keyboard/gamepad listener and that solo/local code paths remain unchanged.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/online-session-controller.test.mjs tests/app-integration.test.mjs tests/battle-lifecycle.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/js/online/online-session-controller.mjs web/js/app.mjs web/js/battle-lifecycle.mjs tests/online-session-controller.test.mjs tests/app-integration.test.mjs
git commit -m "feat: synchronize online battle sessions"
```

### Task 7: Handle reconnect, pause, exit, and non-regression inputs

**Files:**
- Modify: `web/js/online/online-session-controller.mjs`
- Modify: `web/js/app.mjs`
- Modify: `web/js/battle-pause-menu.mjs`
- Test: `tests/online-session-controller.test.mjs`
- Test: `tests/battle-pause-menu.test.mjs`
- Test: `tests/gamepad-input.test.mjs`

- [ ] **Step 1: Write failing lifecycle tests**

```js
controller.markDisconnected();
assert.equal(controller.getConnectionState().reconnectDeadline, 46000);
assert.equal(controller.resume('stored-token'), true);
assert.equal(controller.expireReconnect(46001).status, 'ended');
assert.equal(mapGamepadButtonToEvent('left', 3).answerIndex, 0);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/online-session-controller.test.mjs tests/battle-pause-menu.test.mjs tests/gamepad-input.test.mjs`

Expected: FAIL because reconnect behavior is not implemented.

- [ ] **Step 3: Implement 45-second reconnect and online-aware exits**

```js
export function reconnectDeadline(now) { return now + 45_000; }
export function canResume(session, token, now) {
  return Boolean(session?.resumeToken === token && now <= session.reconnectDeadline);
}
```

Save only the room code, player ID and resume token in `sessionStorage`. On pause-menu exit, write a `left` status for the match before returning to lobby. Preserve all original pause button text and gamepad mapping; add tests proving an online remote event cannot create a second local answer event.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/online-session-controller.test.mjs tests/battle-pause-menu.test.mjs tests/gamepad-input.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/js/online/online-session-controller.mjs web/js/app.mjs web/js/battle-pause-menu.mjs tests/online-session-controller.test.mjs tests/battle-pause-menu.test.mjs tests/gamepad-input.test.mjs
git commit -m "feat: recover online sessions safely"
```

### Task 8: Configure Firebase Rules and teacher setup documentation

**Files:**
- Create: `firebase/database.rules.json`
- Create: `firebase/firebase.json`
- Create: `docs/online-firebase-setup.md`
- Test: `tests/firebase-transport.test.mjs`

- [ ] **Step 1: Write a failing rule-shape test**

```js
const rules = JSON.parse(readFileSync('firebase/database.rules.json', 'utf8'));
assert.equal(rules.rules.rooms['$roomCode']['.read'], "auth != null");
assert.match(rules.rules.rooms['$roomCode']['.validate'], /expiresAt/);
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/firebase-transport.test.mjs`

Expected: FAIL because the Firebase rules file does not exist.

- [ ] **Step 3: Add least-privilege rules and setup guide**

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": "auth != null",
        ".write": "auth != null && newData.child('lobby/expiresAt').val() > now"
      }
    }
  }
}
```

Expand the rules with path-level validation for six-character room codes, player-owned `resumeToken` sessions, exactly two players per match, and expiring data. The guide must include anonymous-authentication enablement, project configuration, rules deployment, usage alert setup, test-room deletion, and the statement that Firebase client configuration is public but service-account keys are forbidden in the repository.

- [ ] **Step 4: Run test to verify pass**

Run: `node --test tests/firebase-transport.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add firebase/database.rules.json firebase/firebase.json docs/online-firebase-setup.md tests/firebase-transport.test.mjs
git commit -m "docs: add online firebase setup and rules"
```

### Task 9: Execute full regression, real two-browser check, and publication checklist

**Files:**
- Modify: `README.md`
- Test: all existing `tests/*.test.mjs`

- [ ] **Step 1: Add README test and operation notes**

Document the third mode, room-code joining, the three pairing/name choices, short reconnect window, privacy boundary, and Firebase setup link. Do not remove existing local-device instructions.

- [ ] **Step 2: Run complete automated regression**

Run: `node --test tests/*.test.mjs`

Expected: PASS with no skipped online protocol tests.

- [ ] **Step 3: Perform manual two-browser matrix**

Run: `npm run start`

Check in two separate browser profiles: host/create, guest/join by code, all pairing modes, all name modes, two concurrent matches, same-question answer race, wrong-answer handoff, disconnect/reload within 45 seconds, timeout exit, mobile landscape touch controls, keyboard input, and USB gamepad mapping. Record exact failures before changing code.

- [ ] **Step 4: Verify static publication and Firebase safety**

Run: `git diff --check; git status --short; rg -n "service[_-]?account|private_key|BEGIN PRIVATE KEY" -g '!docs/**'`

Expected: no whitespace errors and no service-account/private keys; any Firebase public client config is intentionally documented.

- [ ] **Step 5: Commit and publish only after explicit authorization**

```powershell
git add README.md
git commit -m "docs: document online battle mode"
git push origin main
```

Synchronize the approved `main:web` build to the legacy `gh-pages` root only after the user explicitly asks to publish, then verify the exact public URL and the real two-browser flow.
