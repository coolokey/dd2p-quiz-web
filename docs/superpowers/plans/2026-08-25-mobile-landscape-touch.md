# Mobile Landscape Touch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable landscape-only mobile and tablet play with touch controls for solo and local two-player modes while preserving every existing keyboard control.

**Architecture:** Add focused modules for touch-control markup/binding and battle-orientation state, extend the existing CPU controller with resumable timing, then wire those units into the current renderer and `app.mjs` lifecycle. Keyboard and touch both create the same `{ player, answerIndex }` intent and pass through the existing input gate, battle lifecycle, scoring, and animation code.

**Tech Stack:** Static HTML, CSS, native ES modules, Pointer Events, Fullscreen API, Screen Orientation API, Node.js built-in test runner, GitHub Actions, GitHub Pages.

---

## File map

- Create `web/js/mobile-controls.mjs`: pure touch-control markup plus Pointer Event binding and lock-state helpers.
- Create `tests/mobile-controls.test.mjs`: touch markup, mapping, eligibility, and duplicate-event tests.
- Create `web/js/battle-orientation.mjs`: fullscreen/orientation feature detection and portrait-state lifecycle.
- Create `tests/battle-orientation.test.mjs`: portrait detection, safe API rejection, listeners, and cleanup tests.
- Modify `web/js/cpu-player.mjs`: preserve the remaining CPU delay across portrait pause/resume.
- Modify `tests/cpu-player.test.mjs`: verify remaining time, stale callback rejection, and single resume callback.
- Modify `web/js/battle-renderer.mjs`: render touch controls and the portrait blocker from view-model state.
- Modify `tests/battle-renderer.test.mjs`: renderer contract and responsive CSS assertions.
- Modify `web/js/async-navigation.mjs`: return the submitted action result or promise from the input gate.
- Modify `tests/async-navigation.test.mjs`: prove async success and rejection remain observable.
- Modify `web/js/app.mjs`: coordinate touch input, orientation pause/resume, CPU timing, full screen, and recovery.
- Modify `tests/app-integration.test.mjs`: protect integration wiring and existing keyboard behavior.
- Modify `web/assets/app.css`: landscape touch layout, safe areas, portrait blocker, coarse-pointer display, and locked states.
- Modify `README.md`: document mobile play and retained keyboard controls.

### Task 1: Touch-control module

**Files:**
- Create: `web/js/mobile-controls.mjs`
- Create: `tests/mobile-controls.test.mjs`

- [ ] **Step 1: Write failing tests for markup, player mapping, and pointer binding**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerInputFromTouchTarget,
  bindMobileAnswerControls,
  buildMobileAnswerControls,
  setMobileAnswerControlsLocked,
} from '../web/js/mobile-controls.mjs';

test('單人模式只建立左方答案鍵，本機雙人建立左右兩組', () => {
  const solo = buildMobileAnswerControls({ gameMode: 'solo', choiceCount: 4, eligiblePlayers: ['left'] });
  assert.equal((solo.match(/data-touch-answer/g) ?? []).length, 4);
  assert.doesNotMatch(solo, /data-player="right"/);
  const local = buildMobileAnswerControls({ gameMode: 'local', choiceCount: 3, eligiblePlayers: ['left', 'right'] });
  assert.equal((local.match(/data-touch-answer/g) ?? []).length, 6);
});

test('觸控目標轉成與鍵盤相同的答案輸入', () => {
  const target = { dataset: { touchAnswer: '2', player: 'right' } };
  assert.deepEqual(answerInputFromTouchTarget(target), { player: 'right', answerIndex: 2 });
});

test('不可作答玩家與全域鎖定都產生 disabled', () => {
  const html = buildMobileAnswerControls({ gameMode: 'local', choiceCount: 2, eligiblePlayers: ['left'], locked: true });
  assert.equal((html.match(/disabled/g) ?? []).length, 4);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/mobile-controls.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/js/mobile-controls.mjs`.

- [ ] **Step 3: Implement the focused module**

```js
const esc = value => String(value).replace(/[&<>"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
})[char]);

function playerMarkup(player, choiceCount, eligiblePlayers, locked) {
  const disabled = locked || !eligiblePlayers.includes(player);
  const buttons = Array.from({ length: choiceCount }, (_, answerIndex) =>
    `<button type="button" class="mobile-answer" data-touch-answer="${answerIndex}" data-player="${player}"${disabled ? ' disabled' : ''}><span>${answerIndex + 1}</span></button>`
  ).join('');
  return `<div class="mobile-answer-pad mobile-answer-pad-${esc(player)}" data-mobile-player="${esc(player)}">${buttons}</div>`;
}

export function buildMobileAnswerControls({ gameMode, choiceCount, eligiblePlayers = [], locked = false }) {
  const count = Math.max(0, Math.min(4, Number(choiceCount) || 0));
  const players = gameMode === 'solo' ? ['left'] : ['left', 'right'];
  return `<div class="mobile-answer-controls mode-${esc(gameMode)}" aria-label="觸控作答">${players.map(player => playerMarkup(player, count, eligiblePlayers, locked)).join('')}</div>`;
}

export function answerInputFromTouchTarget(target) {
  const answerIndex = Number(target?.dataset?.touchAnswer);
  const player = target?.dataset?.player;
  if (!['left', 'right'].includes(player) || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;
  return { player, answerIndex };
}

export function bindMobileAnswerControls(root, { onAnswer }) {
  const activePointers = new Set();
  const release = event => activePointers.delete(event.pointerId);
  for (const button of root.querySelectorAll('[data-touch-answer]')) {
    button.onpointerdown = event => {
      event.preventDefault();
      if (button.disabled || activePointers.has(event.pointerId)) return;
      activePointers.add(event.pointerId);
      const input = answerInputFromTouchTarget(button);
      if (input) onAnswer(input);
    };
    button.onpointerup = release;
    button.onpointercancel = release;
  }
}

export function setMobileAnswerControlsLocked(root, locked) {
  for (const button of root.querySelectorAll('[data-touch-answer]')) button.disabled = Boolean(locked);
}
```

- [ ] **Step 4: Complete binding tests with fake buttons and run them**

```js
test('同一觸點不重複提交但兩位玩家可同時觸碰', () => {
  const left = { disabled: false, dataset: { touchAnswer: '0', player: 'left' } };
  const right = { disabled: false, dataset: { touchAnswer: '1', player: 'right' } };
  const root = { querySelectorAll: () => [left, right] };
  const answers = [];
  bindMobileAnswerControls(root, { onAnswer: input => answers.push(input) });
  const event1 = { pointerId: 11, preventDefault() {} };
  left.onpointerdown(event1);
  left.onpointerdown(event1);
  right.onpointerdown({ pointerId: 22, preventDefault() {} });
  assert.deepEqual(answers, [
    { player: 'left', answerIndex: 0 },
    { player: 'right', answerIndex: 1 },
  ]);
  left.onpointerup(event1);
  left.onpointerdown(event1);
  assert.equal(answers.length, 3);
});

test('鎖定 helper 同步停用全部觸控鍵', () => {
  const buttons = [{ disabled: false }, { disabled: false }];
  setMobileAnswerControlsLocked({ querySelectorAll: () => buttons }, true);
  assert.deepEqual(buttons.map(button => button.disabled), [true, true]);
});
```

Run: `node --test tests/mobile-controls.test.mjs`

Expected: PASS for all mobile-control tests.

- [ ] **Step 5: Commit**

```powershell
git add web/js/mobile-controls.mjs tests/mobile-controls.test.mjs
git commit -m "feat: add mobile answer controls"
```

### Task 2: Orientation and fullscreen controller

**Files:**
- Create: `web/js/battle-orientation.mjs`
- Create: `tests/battle-orientation.test.mjs`

- [ ] **Step 1: Write failing orientation-controller tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleOrientationController, isPortraitViewport } from '../web/js/battle-orientation.mjs';

test('只在高度大於寬度時判定直向', () => {
  assert.equal(isPortraitViewport({ width: 390, height: 844 }), true);
  assert.equal(isPortraitViewport({ width: 844, height: 390 }), false);
});

test('方向鎖定拒絕時仍依 viewport 通知直向狀態', async () => {
  const states = [];
  const controller = createBattleOrientationController({
    windowRef: { innerWidth: 390, innerHeight: 844, addEventListener() {}, removeEventListener() {} },
    documentRef: { documentElement: { requestFullscreen: async () => { throw new Error('denied'); } }, addEventListener() {}, removeEventListener() {} },
    screenRef: { orientation: { lock: async () => { throw new Error('unsupported'); }, addEventListener() {}, removeEventListener() {}, unlock() {} } },
    onPortraitChange: state => states.push(state),
  });
  await controller.enterBattle();
  assert.equal(states.at(-1), true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/battle-orientation.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement safe feature detection, listeners, and cleanup**

```js
export function isPortraitViewport({ width, height }) {
  return Number(height) > Number(width);
}

export function createBattleOrientationController({ windowRef = window, documentRef = document, screenRef = screen, onPortraitChange }) {
  let active = false;
  let lastPortrait = null;
  const sync = () => {
    if (!active) return false;
    const portrait = isPortraitViewport({ width: windowRef.innerWidth, height: windowRef.innerHeight });
    if (portrait !== lastPortrait) {
      lastPortrait = portrait;
      onPortraitChange(portrait);
    }
    return portrait;
  };
  const addListeners = () => {
    windowRef.addEventListener?.('resize', sync);
    screenRef.orientation?.addEventListener?.('change', sync);
    documentRef.addEventListener?.('fullscreenchange', sync);
    documentRef.addEventListener?.('visibilitychange', sync);
  };
  const removeListeners = () => {
    windowRef.removeEventListener?.('resize', sync);
    screenRef.orientation?.removeEventListener?.('change', sync);
    documentRef.removeEventListener?.('fullscreenchange', sync);
    documentRef.removeEventListener?.('visibilitychange', sync);
  };
  async function enterBattle() {
    if (!active) { active = true; addListeners(); }
    sync();
    try { await documentRef.documentElement?.requestFullscreen?.(); } catch {}
    try { await screenRef.orientation?.lock?.('landscape'); } catch {}
    sync();
  }
  function exitBattle() {
    if (!active) return;
    active = false; lastPortrait = null; removeListeners();
    try { screenRef.orientation?.unlock?.(); } catch {}
  }
  return { enterBattle, exitBattle, isActive: () => active, sync };
}
```

- [ ] **Step 4: Add tests for listener removal and repeated enter/exit**

Assert that `enterBattle()` called twice registers each listener once, `exitBattle()` removes each once, and later fake orientation events do not call `onPortraitChange`.

Run: `node --test tests/battle-orientation.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add web/js/battle-orientation.mjs tests/battle-orientation.test.mjs
git commit -m "feat: add battle orientation controller"
```

### Task 3: Resumable CPU delay

**Files:**
- Modify: `web/js/cpu-player.mjs`
- Modify: `tests/cpu-player.test.mjs`

- [ ] **Step 1: Add failing pause/resume tests**

```js
test('暫停 CPU 後保存剩餘時間且只恢復一個新 callback', () => {
  let now = 1000;
  const scheduled = [];
  const cleared = [];
  const cpu = createCpuController({
    now: () => now,
    setTimer: (callback, delay) => (scheduled.push({ callback, delay }), scheduled.length),
    clearTimer: id => cleared.push(id),
    random: () => 0,
  });
  const answers = [];
  cpu.schedule({ question: { choices: ['A', 'B'], answerIndex: 0 }, difficulty: 'easy', onAnswer: answer => answers.push(answer) });
  now = 2500;
  cpu.pause();
  assert.equal(cpu.remainingMs(), 2500);
  cpu.resume();
  assert.equal(scheduled.at(-1).delay, 2500);
  scheduled[0].callback();
  assert.deepEqual(answers, []);
  scheduled.at(-1).callback();
  assert.deepEqual(answers, [0]);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/cpu-player.test.mjs`

Expected: FAIL because `pause`, `resume`, and `remainingMs` do not exist.

- [ ] **Step 3: Refactor the controller around one stored task**

Replace `createCpuController` with the following implementation. It chooses the answer and delay once, stores remaining time, and invalidates every cleared callback by generation.

```js
export function createCpuController({
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = Math.random,
  now = Date.now,
} = {}) {
  let timerId = null;
  let generation = 0;
  let paused = false;
  let task = null;

  function invalidateTimer() {
    generation += 1;
    if (timerId !== null) clearTimer(timerId);
    timerId = null;
  }

  function arm() {
    if (!task || paused || timerId !== null) return false;
    const currentGeneration = generation;
    task.startedAt = now();
    timerId = setTimer(() => {
      if (!task || currentGeneration !== generation) return;
      const { answerIndex, onAnswer } = task;
      task = null;
      timerId = null;
      onAnswer(answerIndex);
    }, task.remaining);
    return true;
  }

  function cancel() {
    invalidateTimer();
    task = null;
    paused = false;
  }

  function schedule({ question, difficulty, onAnswer }) {
    cancel();
    task = {
      answerIndex: chooseCpuAnswer(question, difficulty, random),
      onAnswer,
      remaining: getCpuDelay(difficulty, random),
      startedAt: now(),
    };
    arm();
  }

  function pause() {
    if (paused) return false;
    paused = true;
    if (task && timerId !== null) {
      task.remaining = Math.max(0, task.remaining - (now() - task.startedAt));
      invalidateTimer();
    }
    return true;
  }

  function resume() {
    if (!paused) return false;
    paused = false;
    return arm();
  }

  return {
    schedule,
    cancel,
    pause,
    resume,
    remainingMs: () => task?.remaining ?? null,
  };
}
```

- [ ] **Step 4: Run CPU and lifecycle regression tests**

Run: `node --test tests/cpu-player.test.mjs tests/battle-lifecycle.test.mjs`

Expected: PASS, including the original stale-callback cancellation test.

- [ ] **Step 5: Commit**

```powershell
git add web/js/cpu-player.mjs tests/cpu-player.test.mjs
git commit -m "feat: pause and resume cpu answers"
```

### Task 4: Render mobile controls and portrait blocker

**Files:**
- Modify: `web/js/battle-renderer.mjs`
- Modify: `tests/battle-renderer.test.mjs`
- Modify: `web/assets/app.css`

- [ ] **Step 1: Add failing renderer assertions**

Extend the standard view model with:

```js
gameMode: 'local',
eligiblePlayers: ['right'],
mobileInputLocked: false,
orientationPaused: true,
```

Assert the generated HTML contains `mobile-answer-pad-left`, `mobile-answer-pad-right`, four buttons per side for a four-choice question, right-side enabled buttons, left-side disabled buttons, `orientation-blocker`, `請將裝置轉成橫向`, and `data-return-main-menu`.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL because the mobile markup is absent.

- [ ] **Step 3: Add the renderer contract**

Import `buildMobileAnswerControls`, append its output after `.battle-console`, and append this blocker only when paused:

```js
const orientationBlocker = viewModel.orientationPaused
  ? `<div class="orientation-blocker" role="dialog" aria-modal="true"><div class="orientation-card"><span class="rotate-device" aria-hidden="true">↻</span><strong>請將裝置轉成橫向</strong><p>轉為橫向後會繼續目前對戰。</p><button type="button" data-return-main-menu>返回主選單</button></div></div>`
  : '';
```

Pass `choiceCount`, `gameMode`, `eligiblePlayers`, and `mobileInputLocked || orientationPaused` to the control builder.

- [ ] **Step 4: Add landscape and coarse-pointer CSS**

Add readable, non-minified blocks at the end of `web/assets/app.css`:

```css
.mobile-answer-controls { display:none; }
.orientation-blocker { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:calc(20px + env(safe-area-inset-top)) calc(20px + env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom)) calc(20px + env(safe-area-inset-left)); background:#07101aee; }
.orientation-card { max-width:440px; padding:24px; border:3px solid #ffd54e; background:#132033; color:#fff; text-align:center; box-shadow:0 0 28px #ffd54e66; }
.rotate-device { display:block; font-size:48px; }
@media (hover:none) and (pointer:coarse) and (orientation:landscape) {
  .battle-shell { padding-left:calc(64px + env(safe-area-inset-left)); padding-right:calc(64px + env(safe-area-inset-right)); }
  .mobile-answer-controls { display:block; }
  .mobile-answer-pad { position:fixed; z-index:40; display:grid; gap:6px; }
  .mode-local .mobile-answer-pad { top:max(74px,env(safe-area-inset-top)); bottom:max(12px,env(safe-area-inset-bottom)); width:58px; grid-template-rows:repeat(4,minmax(48px,1fr)); }
  .mode-local .mobile-answer-pad-left { left:max(4px,env(safe-area-inset-left)); }
  .mode-local .mobile-answer-pad-right { right:max(4px,env(safe-area-inset-right)); }
  .mode-solo .mobile-answer-pad-left { position:static; grid-template-columns:repeat(4,minmax(56px,1fr)); margin:8px auto 0; max-width:720px; }
  .mobile-answer { min-width:48px; min-height:48px; touch-action:none; user-select:none; -webkit-user-select:none; }
  .mobile-answer-pad-left .mobile-answer { background:#ad2641; }
  .mobile-answer-pad-right .mobile-answer { background:#205dcc; }
  .mobile-answer:disabled { opacity:.34; filter:grayscale(.55); }
}
@media (orientation:portrait) and (hover:none) and (pointer:coarse) { body:has(.battle-shell) { overflow:hidden; } }
```

- [ ] **Step 5: Run renderer tests and CSS assertions**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: PASS and assertions confirm safe-area use, 48 px minimum targets, landscape controls, and portrait blocker.

- [ ] **Step 6: Commit**

```powershell
git add web/js/battle-renderer.mjs tests/battle-renderer.test.mjs web/assets/app.css
git commit -m "feat: render landscape touch battle ui"
```

### Task 5: Integrate orientation pause and shared answer submission

**Files:**
- Modify: `web/js/async-navigation.mjs`
- Modify: `tests/async-navigation.test.mjs`
- Modify: `web/js/app.mjs`
- Modify: `tests/app-integration.test.mjs`

- [ ] **Step 1: Write a failing async input-gate test**

```js
test('輸入閘門回傳 action 的 promise 讓呼叫端處理錯誤', async () => {
  const gate = createBattleInputGate();
  gate.enable();
  assert.equal(await gate.run(async () => 7), 7);
  await assert.rejects(gate.run(async () => { throw new Error('boom'); }), /boom/);
});
```

- [ ] **Step 2: Make the input gate return the action result**

Change `action(); return true;` to `return action();`. Keep disabled execution returning `false`.

Run: `node --test tests/async-navigation.test.mjs`

Expected: PASS.

- [ ] **Step 3: Add failing integration wiring assertions**

Assert `app.mjs` imports and calls `createBattleOrientationController`, `bindMobileAnswerControls`, and `setMobileAnswerControlsLocked`; checks `orientationPaused` before CPU scheduling and timer start; calls `cpuController.pause()` and `resume()`; and still contains the existing `keydown`, `getAnswerInput`, and `PLAYER_KEYS` paths.

- [ ] **Step 4: Wire shared submission and recoverable errors**

Use one async function for keyboard and touch:

```js
async function processAnswer(input) {
  try {
    return await battleInputGate.run(() => battleLifecycle.submit(input));
  } catch (error) {
    console.error('battle answer failed', { error, phase: combatState?.phase, questionIndex: quizState?.questionIndex });
    battleLifecycle.cancel();
    if (quizState && combatState && !combatState.ended) {
      renderGame();
      if (!orientationPaused) battleInputGate.enable();
    }
    return false;
  }
}
```

In `renderGame()`, pass the mobile view-model properties, bind mobile controls with `onAnswer: input => void processAnswer(input)`, and bind `[data-return-main-menu]` to the same main-menu cleanup used by the result screen. At the start of `animateBattleAnswer`, call `setMobileAnswerControlsLocked(app, true)`.

- [ ] **Step 5: Wire orientation pause/resume and lifecycle cleanup**

Add `orientationPaused`, a duplicate-safe `startBattleTimer()`, and controller callbacks:

```js
function pauseBattleForPortrait() {
  if (orientationPaused || !battleSettings || combatState?.ended) return;
  orientationPaused = true;
  battleInputGate.disable();
  cpuController.pause();
  clearBattleTimer();
  renderGame({ allowEnded: true });
}

function resumeBattleFromPortrait() {
  if (!orientationPaused || !battleSettings || combatState?.ended) return;
  orientationPaused = false;
  renderGame({ allowEnded: true });
  cpuController.resume();
  battleInputGate.enable();
  startBattleTimer();
}
```

Guard `scheduleCpuForCurrentQuestion()` with `if (orientationPaused) return false`. In `startGame()`, call `void orientationController.enterBattle()` synchronously from the start-button path. Replace direct timer creation with `startBattleTimer()`. Call `orientationController.exitBattle()` and reset `orientationPaused` in result, catalog, main-menu, error, and stop-activity paths.

- [ ] **Step 6: Run focused integration and concurrency tests**

Run: `node --test tests/app-integration.test.mjs tests/async-navigation.test.mjs tests/battle-lifecycle.test.mjs tests/battle-session-coordinator.test.mjs tests/cpu-player.test.mjs`

Expected: PASS with no duplicate CPU schedule, no stale callback, and existing keyboard assertions unchanged.

- [ ] **Step 7: Commit**

```powershell
git add web/js/app.mjs web/js/async-navigation.mjs tests/app-integration.test.mjs tests/async-navigation.test.mjs
git commit -m "feat: integrate mobile battle pause and touch input"
```

### Task 6: Documentation and full regression verification

**Files:**
- Modify: `README.md`
- Test: `tests/*.test.mjs`

- [ ] **Step 1: Document mobile and keyboard controls**

Add a `行動載具` section explaining: start battle in landscape, portrait blocker behavior, solo bottom controls, local left/right controls, and retained keyboard mappings `1–4` and `0 / - / = / \`.

- [ ] **Step 2: Run all automated checks**

Run:

```powershell
npm test
Get-ChildItem web/js -Filter *.mjs | ForEach-Object { node --check $_.FullName }
git diff --check
```

Expected: all existing 160 tests plus the new mobile tests pass; every module syntax check exits 0; `git diff --check` prints nothing.

- [ ] **Step 3: Start the site and test representative landscape viewports**

Run: `npm start`

Verify at `667×375`, `844×390`, `1024×768`, and `1366×768`:

- portrait blocks input and offers main-menu return;
- landscape restores the same score, health, and question;
- solo shows one four-button pad;
- local shows left and right pads;
- wrong answers enable only the opponent;
- touch and physical keyboard both work;
- image and long-text quizzes do not overlap controls;
- no console error appears during rotation, background/resume, or rapid multi-touch.

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md
git commit -m "docs: explain mobile landscape play"
```

### Task 7: Publish and verify GitHub Pages

**Files:**
- Verify: `.github/workflows/pages.yml`
- Publish: committed `web/` output through the existing workflow

- [ ] **Step 1: Confirm the release commit is clean and complete**

Run:

```powershell
git status --short
git log -7 --oneline
npm test
```

Expected: clean worktree and all tests pass.

- [ ] **Step 2: Push the approved release**

Run: `git push origin main`

Expected: the push succeeds and triggers `Deploy GitHub Pages`.

- [ ] **Step 3: Wait for the Pages workflow**

Run: `gh run list --workflow pages.yml --limit 1` followed by `gh run watch <run-id> --exit-status`.

Expected: workflow conclusion `success`.

- [ ] **Step 4: Verify the public URL with a cache-busting query**

Open `https://coolokey.github.io/dd2p-quiz-web/?v=<short-commit>` and repeat the representative solo/local, portrait/landscape, touch/keyboard checks. Confirm public `app.mjs`, `mobile-controls.mjs`, `battle-orientation.mjs`, and `app.css` return HTTP 200 and the browser console has no error.

- [ ] **Step 5: Record final evidence**

Report the release commit, Pages workflow result, final public URL, automated test count, viewports checked, and any browser-specific orientation-lock fallback observed.
