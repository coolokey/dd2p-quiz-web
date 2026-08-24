# 隨機平均答案、電競起始畫面與單人模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加入「DDP 知識對決」電競起始畫面、玩家 VS 電腦及本機雙人模式，並讓每一組答案位置隨機且平均。

**Architecture:** 保留既有 `game-state`、`battle-state`、角色、音訊及渲染模組，新增起始畫面、模式規則及電腦玩家三個小型模組。`question-randomizer` 以可注入亂數的位置袋準備整輪題目；`app.mjs` 只協調畫面流程、電腦計時器與既有狀態機，不自行重做計分規則。

**Tech Stack:** 原生 HTML／CSS／ES modules、Node.js `node:test`、Google Fonts 官方 OFL 字型來源、GitHub Pages。

---

## 檔案結構

- `web/js/question-randomizer.mjs`：題目洗牌、答案位置袋及指定位置重排。
- `web/js/start-screen.mjs`：起始畫面 HTML 與按鈕事件綁定。
- `web/js/game-mode.mjs`：單人／本機雙人的選角、按鍵測試與模式判斷純函式。
- `web/js/cpu-player.mjs`：難度、等待時間、答題選擇及可取消計時器。
- `web/js/app.mjs`：串接起始畫面、模式流程、CPU 作答生命週期與答案揭示。
- `web/js/battle-renderer.mjs`：顯示雙方皆錯時的正確答案樣式。
- `web/assets/app.css`：本地字型、電競控制台、單人流程、答案揭示與響應式樣式。
- `web/assets/fonts/`：本地 `Noto Sans TC`、`Orbitron` 及 OFL 授權。
- `tests/question-randomizer.test.mjs`：答案位置袋與正確答案追蹤。
- `tests/start-screen.test.mjs`：起始畫面標記、事件與本地字型契約。
- `tests/game-mode.test.mjs`：模式所需玩家、CPU 選角及按鍵集合。
- `tests/cpu-player.test.mjs`：難度、答案決策及計時器取消。
- `tests/battle-renderer.test.mjs`：正確答案揭示標記。
- `tests/app-integration.test.mjs`：`app.mjs` 的模式與 CPU 生命週期整合契約。

### Task 1: 將答案位置改為隨機平均袋

**Files:**
- Modify: `tests/question-randomizer.test.mjs`
- Modify: `web/js/question-randomizer.mjs`

- [ ] **Step 1: 先寫位置袋、袋邊界及原題不變的失敗測試**

在 `tests/question-randomizer.test.mjs` 匯入新 API，並加入：

```js
import {
  createAnswerPositionState,
  prepareQuestionRound,
  randomizeQuestionToPosition,
} from '../web/js/question-randomizer.mjs';

test('四選一每四題正確答案位置一至四各一次', () => {
  const questions = Array.from({ length: 8 }, (_, index) => ({
    id: `q${index}`,
    prompt: `Q${index}`,
    choices: ['正確', '乙', '丙', '丁'],
    answerIndex: 0,
  }));
  const result = prepareQuestionRound(questions, () => 0);
  for (const group of [result.slice(0, 4), result.slice(4, 8)]) {
    assert.deepEqual(group.map(item => item.answerIndex).sort(), [0, 1, 2, 3]);
  }
  assert.notEqual(result[3].answerIndex, result[4].answerIndex);
});

test('二選一與三選一依各自選項數建立平均位置袋', () => {
  for (const count of [2, 3]) {
    const questions = Array.from({ length: count }, (_, index) => ({
      id: `${count}-${index}`,
      prompt: 'Q',
      choices: Array.from({ length: count }, (__, choice) => choice === 0 ? '正確' : `錯${choice}`),
      answerIndex: 0,
    }));
    const result = prepareQuestionRound(questions, () => 0);
    assert.deepEqual(result.map(item => item.answerIndex).sort(), Array.from({ length: count }, (_, index) => index));
  }
});

test('指定正確答案位置時更新索引且不修改原題', () => {
  const original = { id: 'q', prompt: 'Q', choices: ['正確', '乙', '丙', '丁'], answerIndex: 0 };
  const result = randomizeQuestionToPosition(original, 2, () => 0.5);
  assert.equal(result.answerIndex, 2);
  assert.equal(result.choices[2], '正確');
  assert.deepEqual(original.choices, ['正確', '乙', '丙', '丁']);
  assert.equal(original.answerIndex, 0);
});

test('跨輪沿用位置狀態並避免邊界重複', () => {
  const state = createAnswerPositionState();
  const first = prepareQuestionRound([
    { prompt: 'Q1', choices: ['正確', '乙'], answerIndex: 0 },
    { prompt: 'Q2', choices: ['正確', '乙'], answerIndex: 0 },
  ], () => 0, state);
  const second = prepareQuestionRound([
    { prompt: 'Q3', choices: ['正確', '乙'], answerIndex: 0 },
  ], () => 0, state);
  assert.notEqual(first.at(-1).answerIndex, second[0].answerIndex);
});
```

- [ ] **Step 2: 執行測試並確認因新 API 尚不存在而失敗**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: FAIL，指出 `createAnswerPositionState` 或 `randomizeQuestionToPosition` 未匯出。

- [ ] **Step 3: 實作最小位置袋與指定位置重排**

將 `web/js/question-randomizer.mjs` 改為下列介面：

```js
export function createAnswerPositionState() {
  return { bags: new Map(), lastPositions: new Map() };
}

function refillPositionBag(count, random, lastPosition) {
  const bag = shuffleWithRandom(Array.from({ length: count }, (_, index) => index), random);
  if (bag.length > 1 && bag[0] === lastPosition) {
    const swapIndex = bag.findIndex(position => position !== lastPosition);
    [bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]];
  }
  return bag;
}

function drawAnswerPosition(state, count, random) {
  let bag = state.bags.get(count) ?? [];
  if (bag.length === 0) bag = refillPositionBag(count, random, state.lastPositions.get(count));
  const position = bag.shift();
  state.bags.set(count, bag);
  state.lastPositions.set(count, position);
  return position;
}

export function randomizeQuestionToPosition(question, targetPosition, random = Math.random) {
  if (!Number.isInteger(targetPosition) || targetPosition < 0 || targetPosition >= question.choices.length) {
    throw new RangeError('正確答案目標位置超出選項範圍');
  }
  const correct = question.choices[question.answerIndex];
  const wrong = shuffleWithRandom(question.choices.filter((_, index) => index !== question.answerIndex), random);
  const choices = [...wrong];
  choices.splice(targetPosition, 0, correct);
  return { ...question, choices, answerIndex: targetPosition };
}

export function prepareQuestionRound(questions, random = Math.random, state = createAnswerPositionState()) {
  return shuffleWithRandom(questions, random).map(question => {
    const position = drawAnswerPosition(state, question.choices.length, random);
    return randomizeQuestionToPosition(question, position, random);
  });
}
```

保留 `shuffleWithRandom` 與既有 `randomizeQuestion` 的純 Fisher-Yates 行為，維持目前單題 API 及舊測試相容；只有 `prepareQuestionRound` 改用位置袋。

- [ ] **Step 4: 執行題目隨機測試**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: PASS，2、3、4 個選項的袋均涵蓋所有位置，袋邊界不重複。

- [ ] **Step 5: 提交答案位置袋**

```bash
git add tests/question-randomizer.test.mjs web/js/question-randomizer.mjs
git commit -m "fix: balance randomized answer positions"
```

### Task 2: 建立遊戲模式純函式

**Files:**
- Create: `tests/game-mode.test.mjs`
- Create: `web/js/game-mode.mjs`

- [ ] **Step 1: 寫單人／本機雙人規則的失敗測試**

建立 `tests/game-mode.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_MODES,
  playersForKeyTest,
  requiredCharacterPlayers,
  selectCpuCharacter,
} from '../web/js/game-mode.mjs';

test('單人只要求左方角色與左方按鍵', () => {
  assert.deepEqual(requiredCharacterPlayers(GAME_MODES.solo), ['left']);
  assert.deepEqual(playersForKeyTest(GAME_MODES.solo), ['left']);
});

test('本機雙人要求左右角色與雙方按鍵', () => {
  assert.deepEqual(requiredCharacterPlayers(GAME_MODES.local), ['left', 'right']);
  assert.deepEqual(playersForKeyTest(GAME_MODES.local), ['left', 'right']);
});

test('CPU 從玩家未選的可玩角色中依亂數選角', () => {
  const characters = [
    { id: '1', playable: true },
    { id: '2', playable: true },
    { id: '3', playable: false },
  ];
  assert.equal(selectCpuCharacter(characters, '1', () => 0).id, '2');
  assert.throws(() => selectCpuCharacter([{ id: '1', playable: true }], '1'), /沒有可供電腦選擇/);
});
```

- [ ] **Step 2: 執行測試並確認模組不存在**

Run: `node --test tests/game-mode.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 實作模式與 CPU 選角**

建立 `web/js/game-mode.mjs`：

```js
export const GAME_MODES = Object.freeze({ solo: 'solo', local: 'local' });

export function requiredCharacterPlayers(mode) {
  return mode === GAME_MODES.solo ? ['left'] : ['left', 'right'];
}

export function playersForKeyTest(mode) {
  return requiredCharacterPlayers(mode);
}

export function selectCpuCharacter(characters, playerCharacterId, random = Math.random) {
  const available = characters.filter(character =>
    character.playable !== false && String(character.id) !== String(playerCharacterId));
  if (available.length === 0) throw new Error('沒有可供電腦選擇的角色，請重新選角');
  return available[Math.floor(random() * available.length)];
}
```

- [ ] **Step 4: 執行模式測試**

Run: `node --test tests/game-mode.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交模式純函式**

```bash
git add tests/game-mode.test.mjs web/js/game-mode.mjs
git commit -m "feat: define solo and local game modes"
```

### Task 3: 建立可取消的電腦玩家

**Files:**
- Create: `tests/cpu-player.test.mjs`
- Create: `web/js/cpu-player.mjs`

- [ ] **Step 1: 寫難度、答案選擇與計時器取消的失敗測試**

建立 `tests/cpu-player.test.mjs`，以假計時器驗證真實控制器介面：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CPU_DIFFICULTIES,
  chooseCpuAnswer,
  createCpuController,
  getCpuDelay,
} from '../web/js/cpu-player.mjs';

test('三種難度具有核准的等待範圍與答對率', () => {
  assert.deepEqual(CPU_DIFFICULTIES.easy, { minDelay: 4000, maxDelay: 7000, accuracy: 0.5 });
  assert.deepEqual(CPU_DIFFICULTIES.normal, { minDelay: 2500, maxDelay: 5000, accuracy: 0.7 });
  assert.deepEqual(CPU_DIFFICULTIES.hard, { minDelay: 1500, maxDelay: 3500, accuracy: 0.9 });
  assert.equal(getCpuDelay('normal', () => 0), 2500);
  assert.equal(getCpuDelay('normal', () => 1), 5000);
});

test('命中答對率時選正解，否則從錯誤選項隨機選擇', () => {
  const question = { choices: ['A', 'B', 'C', 'D'], answerIndex: 2 };
  assert.equal(chooseCpuAnswer(question, 'normal', () => 0.1), 2);
  const values = [0.99, 0.5];
  assert.notEqual(chooseCpuAnswer(question, 'normal', () => values.shift()), 2);
});

test('取消後舊計時器不得提交答案', () => {
  const scheduled = [];
  const cleared = [];
  const cpu = createCpuController({
    setTimer: (callback, delay) => (scheduled.push({ callback, delay }), scheduled.length),
    clearTimer: id => cleared.push(id),
    random: () => 0,
  });
  const answers = [];
  cpu.schedule({ question: { choices: ['A', 'B'], answerIndex: 0 }, difficulty: 'easy', onAnswer: answer => answers.push(answer) });
  cpu.cancel();
  scheduled[0].callback();
  assert.deepEqual(answers, []);
  assert.deepEqual(cleared, [1]);
});
```

- [ ] **Step 2: 執行測試並確認模組不存在**

Run: `node --test tests/cpu-player.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 實作純決策與帶世代編號的計時控制器**

建立 `web/js/cpu-player.mjs`：

```js
export const CPU_DIFFICULTIES = Object.freeze({
  easy: { minDelay: 4000, maxDelay: 7000, accuracy: 0.5 },
  normal: { minDelay: 2500, maxDelay: 5000, accuracy: 0.7 },
  hard: { minDelay: 1500, maxDelay: 3500, accuracy: 0.9 },
});

export function getCpuDelay(difficulty, random = Math.random) {
  const setting = CPU_DIFFICULTIES[difficulty] ?? CPU_DIFFICULTIES.normal;
  return Math.round(setting.minDelay + Math.min(1, random()) * (setting.maxDelay - setting.minDelay));
}

export function chooseCpuAnswer(question, difficulty, random = Math.random) {
  const setting = CPU_DIFFICULTIES[difficulty] ?? CPU_DIFFICULTIES.normal;
  if (random() < setting.accuracy) return question.answerIndex;
  const wrong = question.choices.map((_, index) => index).filter(index => index !== question.answerIndex);
  return wrong[Math.min(wrong.length - 1, Math.floor(random() * wrong.length))];
}

export function createCpuController({
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = Math.random,
} = {}) {
  let timerId = null;
  let generation = 0;
  function cancel() {
    generation += 1;
    if (timerId !== null) clearTimer(timerId);
    timerId = null;
  }
  function schedule({ question, difficulty, onAnswer }) {
    cancel();
    const currentGeneration = generation;
    const answerIndex = chooseCpuAnswer(question, difficulty, random);
    timerId = setTimer(() => {
      if (currentGeneration !== generation) return;
      timerId = null;
      onAnswer(answerIndex);
    }, getCpuDelay(difficulty, random));
  }
  return { schedule, cancel };
}
```

- [ ] **Step 4: 執行電腦玩家測試**

Run: `node --test tests/cpu-player.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交電腦玩家**

```bash
git add tests/cpu-player.test.mjs web/js/cpu-player.mjs
git commit -m "feat: add cancellable cpu opponent"
```

### Task 4: 建立電競控制台起始畫面

**Files:**
- Create: `tests/start-screen.test.mjs`
- Create: `web/js/start-screen.mjs`
- Modify: `web/js/app.mjs`

- [ ] **Step 1: 寫起始畫面與事件綁定的失敗測試**

建立 `tests/start-screen.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindStartScreen, buildStartScreen } from '../web/js/start-screen.mjs';

test('控制台包含兩種主要模式與兩個次要入口', () => {
  const html = buildStartScreen({ quizCount: 31, muted: false, scene: './scene.png', fighters: ['./left.png', './right.png'] });
  assert.match(html, /class="start-screen"/);
  assert.match(html, /data-game-mode="solo"[^>]*>[^<]*玩家 VS 電腦/s);
  assert.match(html, /data-game-mode="local"[^>]*>[^<]*本機雙人對戰/s);
  assert.match(html, /id="start-help"/);
  assert.match(html, /id="start-audio"/);
  assert.match(html, /31 QUIZ PACKS/);
});

test('兩個模式按鈕回傳正確模式', () => {
  const elements = { solo: {}, local: {}, '#start-help': {}, '#start-audio': {} };
  const modes = [];
  bindStartScreen({
    querySelector: selector => selector === '[data-game-mode="solo"]' ? elements.solo
      : selector === '[data-game-mode="local"]' ? elements.local : elements[selector],
  }, { onMode: mode => modes.push(mode), onHelp() {}, onAudio() {} });
  elements.solo.onclick();
  elements.local.onclick();
  assert.deepEqual(modes, ['solo', 'local']);
});
```

- [ ] **Step 2: 執行測試並確認模組不存在**

Run: `node --test tests/start-screen.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 建立純 HTML 產生器與事件綁定**

建立 `web/js/start-screen.mjs`：

```js
const fallbackEscape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);

export function buildStartScreen({ quizCount, muted, scene, fighters, escape = fallbackEscape }) {
  const [leftImage = '', rightImage = ''] = fighters ?? [];
  return `<div class="start-screen">
    <header class="start-topbar">
      <div><small>DDP BATTLE CONTROL</small><h1>DDP 知識對決</h1></div>
      <b>CLASSROOM EDITION</b>
    </header>
    <div class="start-grid">
      <section class="start-control" aria-label="選擇遊戲模式">
        <p>SELECT GAME MODE</p>
        <button class="start-mode start-mode-solo" data-game-mode="solo"><span>01</span>玩家 VS 電腦<b>›</b></button>
        <button class="start-mode start-mode-local" data-game-mode="local"><span>02</span>本機雙人對戰<b>›</b></button>
        <div class="start-minor-actions">
          <button id="start-help">操作說明</button><button id="start-audio">音效設定</button>
        </div>
        <div class="start-stats"><span>${escape(quizCount)} QUIZ PACKS</span><span>${muted ? 'SOUND OFF' : 'SOUND ON'}</span></div>
      </section>
      <section class="start-arena" style="--start-scene:url('${escape(scene)}')">
        <img class="start-fighter start-fighter-left" src="${escape(leftImage)}" alt="紅方角色">
        <div class="start-versus">VS</div>
        <img class="start-fighter start-fighter-right" src="${escape(rightImage)}" alt="藍方角色">
        <p><b>READY</b>選擇模式，進入知識擂台</p>
      </section>
    </div>
  </div>`;
}

export function bindStartScreen(root, { onMode, onHelp, onAudio }) {
  root.querySelector('[data-game-mode="solo"]').onclick = () => onMode('solo');
  root.querySelector('[data-game-mode="local"]').onclick = () => onMode('local');
  root.querySelector('#start-help').onclick = onHelp;
  root.querySelector('#start-audio').onclick = onAudio;
}
```

- [ ] **Step 4: 讓 `app.mjs` 載入完成後先顯示起始畫面**

在 `web/js/app.mjs`：

```js
import { bindStartScreen, buildStartScreen } from './start-screen.mjs';
import { GAME_MODES } from './game-mode.mjs';

let gameMode = null;

function renderStartScreen() {
  const playable = battleManifest.characters.filter(character => character.playable !== false);
  app.innerHTML = buildStartScreen({
    quizCount: catalog.length,
    muted,
    scene: battleManifest.scenes[0]?.image,
    fighters: [characterImage(playable[0]), characterImage(playable[1])],
    escape: esc,
  });
  bindStartScreen(app, {
    onMode: mode => { gameMode = mode; playUiSound('confirm'); renderCatalog(); },
    onHelp: renderStartHelp,
    onAudio: renderStartAudioSettings,
  });
}
```

新增 `renderStartHelp()`，列出左方按鍵、右方按鍵、單人／雙人差異與返回按鈕。新增下列音效設定畫面，滑桿沿用 `audioVolumes`、`audioManager` 與目前 localStorage keys：

```js
function renderStartAudioSettings() {
  app.innerHTML = shell(`<h2 class="selection-title">音效設定</h2>
    <label class="volume-setting">主音量<input data-start-volume="master" type="range" min="0" max="1" step="0.05" value="${audioVolumes.master}"></label>
    <label class="volume-setting">背景音樂<input data-start-volume="music" type="range" min="0" max="1" step="0.05" value="${audioVolumes.music}"></label>
    <label class="volume-setting">音效<input data-start-volume="effects" type="range" min="0" max="1" step="0.05" value="${audioVolumes.effects}"></label>
    <div class="actions"><button class="secondary" id="toggle-start-muted">${muted ? '解除靜音' : '全部靜音'}</button><button class="primary" id="back-start">返回主選單</button></div>`);
  const methods = { master: 'setVolume', music: 'setMusicVolume', effects: 'setEffectsVolume' };
  const keys = { master: 'dd2p-volume-master', music: 'dd2p-volume-music', effects: 'dd2p-volume-effects' };
  app.querySelectorAll('[data-start-volume]').forEach(slider => slider.oninput = () => {
    const kind = slider.dataset.startVolume;
    audioVolumes[kind] = Number(slider.value);
    localStorage.setItem(keys[kind], slider.value);
    audioManager?.[methods[kind]](audioVolumes[kind]);
  });
  app.querySelector('#toggle-start-muted').onclick = () => {
    muted = !muted;
    localStorage.setItem('dd2p-muted', String(muted));
    audioManager?.setMuted(muted);
    renderStartAudioSettings();
  };
  app.querySelector('#back-start').onclick = renderStartScreen;
}
```

初始化成功改呼叫 `renderStartScreen()`；題庫載入失敗畫面加入 `onclick="location.reload()"` 的「重新載入」按鈕。

- [ ] **Step 5: 執行起始畫面測試與語法檢查**

Run: `node --test tests/start-screen.test.mjs && node --check web/js/app.mjs`

Expected: PASS，且 `app.mjs` 無語法錯誤。

- [ ] **Step 6: 提交起始畫面流程**

```bash
git add tests/start-screen.test.mjs web/js/start-screen.mjs web/js/app.mjs
git commit -m "feat: add esports game mode start screen"
```

### Task 5: 將單人模式接入規則、選角與鍵盤測試

**Files:**
- Modify: `tests/prebattle-flow.test.mjs`
- Create: `tests/app-integration.test.mjs`
- Modify: `web/js/prebattle-flow.mjs`
- Modify: `web/js/app.mjs`

- [ ] **Step 1: 寫模式整合與單人按鍵測試的失敗測試**

在 `tests/prebattle-flow.test.mjs` 新增：

```js
test('單人選角只要求玩家角色完成', () => {
  assert.doesNotMatch(buildCharacterActions(true), /disabled/);
});
```

建立 `tests/app-integration.test.mjs`，讀取 `app.mjs` 驗證必要整合點：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('應用程式依模式決定選角、按鍵測試與 CPU 角色', async () => {
  const source = await readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /requiredCharacterPlayers\(gameMode\)/);
  assert.match(source, /playersForKeyTest\(gameMode\)/);
  assert.match(source, /selectCpuCharacter\(/);
  assert.match(source, /cpuDifficulty/);
  assert.match(source, /createAnswerPositionState\(\)/);
  assert.match(source, /prepareQuestionRound\(currentQuiz\.questions, Math\.random, answerPositionState\)/);
});
```

- [ ] **Step 2: 執行測試並確認整合點尚未存在**

Run: `node --test tests/prebattle-flow.test.mjs tests/app-integration.test.mjs`

Expected: FAIL，指出 `app.mjs` 尚未使用模式函式。

- [ ] **Step 3: 在規則畫面加入 CPU 難度**

`renderRules()` 只在 `gameMode === GAME_MODES.solo` 時顯示 `name="cpu-difficulty"` 的簡單、普通、困難選項，普通預設勾選；按下一步時把 `cpuDifficulty` 放入 settings。本機雙人不顯示難度欄。

同時讓 `app.mjs` 保留跨輪答案位置狀態：

```js
import { createAnswerPositionState, prepareQuestionRound } from './question-randomizer.mjs';

let answerPositionState = createAnswerPositionState();

// startGame() 內，每一局重設一次
answerPositionState = createAnswerPositionState();
currentQuiz = {
  ...currentQuiz,
  activeQuestions: prepareQuestionRound(currentQuiz.questions, Math.random, answerPositionState),
};

// ensureQuestion() 補充新輪時沿用同一個 state
currentQuiz.activeQuestions.push(...prepareQuestionRound(
  currentQuiz.questions,
  Math.random,
  answerPositionState,
));
```

- [ ] **Step 4: 依模式調整選角**

`renderCharacterSelect(settings)` 在單人時只顯示左方玩家選角區及右方「CPU 將隨機選角」預覽。準備開始時使用：

```js
const selectedSettings = () => {
  const selections = { ...characterSelection };
  if (gameMode === GAME_MODES.solo) {
    selections.right = String(selectCpuCharacter(
      battleManifest.characters,
      selections.left,
    ).id);
  }
  return { ...settings, gameMode, characters: selections };
};
```

`ready` 改為 `requiredCharacterPlayers(gameMode).every(player => characterSelection[player])`。

- [ ] **Step 5: 依模式調整鍵盤測試**

`renderKeyTest(settings)` 使用 `playersForKeyTest(settings.gameMode)` 建立玩家區塊及 `needed` 按鍵集合。`keydown` 的鍵盤測試分支也只計算目前模式所需玩家，不再固定要求左右全部按鍵。

- [ ] **Step 6: 保留模式狀態與返回路徑**

「更換題庫」返回 `renderCatalog()` 但保留 `gameMode`；結果頁新增「返回主選單」，該按鈕取消計時器、清除選角、將 `gameMode` 設為 `null` 後呼叫 `renderStartScreen()`。再玩一次保留同一模式。

- [ ] **Step 7: 執行整合測試**

Run: `node --test tests/prebattle-flow.test.mjs tests/game-mode.test.mjs tests/app-integration.test.mjs && node --check web/js/app.mjs`

Expected: PASS。

- [ ] **Step 8: 提交單人設定流程**

```bash
git add tests/prebattle-flow.test.mjs tests/app-integration.test.mjs web/js/prebattle-flow.mjs web/js/app.mjs
git commit -m "feat: route solo and local prebattle flows"
```

### Task 6: 串接 CPU 作答生命週期與雙方皆錯揭示

**Files:**
- Modify: `tests/app-integration.test.mjs`
- Modify: `tests/battle-renderer.test.mjs`
- Modify: `web/js/app.mjs`
- Modify: `web/js/battle-renderer.mjs`
- Modify: `web/assets/app.css`

- [ ] **Step 1: 寫 CPU 取消、待處理答案與正解揭示的失敗測試**

在 `tests/app-integration.test.mjs` 新增來源契約：

```js
test('單人模式在每題排程 CPU 並於換題及結束時取消', async () => {
  const source = await readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /createCpuController\(/);
  assert.match(source, /scheduleCpuForCurrentQuestion\(/);
  assert.match(source, /cpuController\.cancel\(\)/);
  assert.match(source, /pendingCpuAnswer/);
});
```

在 `tests/battle-renderer.test.mjs` 新增：

```js
test('雙方皆錯時標示正確答案', () => {
  const html = buildBattleMarkup({ ...viewModel, revealAnswerIndex: 2 });
  assert.match(html, /battle-choice is-correct-reveal/);
  assert.match(html, /答案揭示/);
});
```

使用目前已匯出的 `buildBattleMarkup(viewModel)`；不新增第二個標記組裝函式。

- [ ] **Step 2: 執行測試並確認缺少生命週期整合**

Run: `node --test tests/app-integration.test.mjs tests/battle-renderer.test.mjs`

Expected: FAIL，缺少 CPU controller 或 `.is-correct-reveal`。

- [ ] **Step 3: 在應用程式建立 CPU 控制狀態**

`web/js/app.mjs` 新增：

```js
import { createCpuController } from './cpu-player.mjs';

const cpuController = createCpuController();
let cpuQuestionIndex = null;
let pendingCpuAnswer = null;

function cancelCpuAnswer() {
  cpuController.cancel();
  cpuQuestionIndex = null;
  pendingCpuAnswer = null;
}
```

`startGame()`、`closeRegulation()`、`renderResult()`、返回主選單與換題前都呼叫 `cancelCpuAnswer()`。

- [ ] **Step 4: 每題只排程一次 CPU**

在 `renderGame()` 最後呼叫 `scheduleCpuForCurrentQuestion(question)`：

```js
function scheduleCpuForCurrentQuestion(question) {
  if (battleSettings.gameMode !== GAME_MODES.solo) return;
  if (!quizState.eligiblePlayers.includes('right')) return;
  if (cpuQuestionIndex === quizState.questionIndex) return;
  cpuQuestionIndex = quizState.questionIndex;
  cpuController.schedule({
    question,
    difficulty: battleSettings.cpuDifficulty,
    onAnswer(answerIndex) {
      if (cpuQuestionIndex !== quizState.questionIndex || combatState.ended) return;
      if (animating) pendingCpuAnswer = { questionIndex: cpuQuestionIndex, answerIndex };
      else void processAnswer({ player: 'right', answerIndex });
    },
  });
}
```

每次 `processAnswer()` 完成動畫後，若 `pendingCpuAnswer.questionIndex` 仍等於目前題號且右方仍可答，清空 pending 後呼叫 `processAnswer({ player:'right', answerIndex })`。

- [ ] **Step 5: 玩家答對與換題時取消 CPU，玩家答錯時保留剩餘計時**

`processAnswer()` 判定正確時立即 `cancelCpuAnswer()`；判定錯誤但題號未前進時不得取消，讓 CPU 保留剩餘時間。題號前進時取消舊排程，將 `cpuQuestionIndex` 清空，下一次 `renderGame()` 才建立新排程。

- [ ] **Step 6: 雙方皆錯時揭示正確答案**

擴充 `renderGame()` 的 options：

```js
function renderGame({
  allowEnded = false,
  questionOverride = null,
  progressOverride = null,
  statusOverride = null,
  revealAnswerIndex = null,
} = {}) { /* 將兩個新值傳給 renderBattle */ }
```

當錯誤答案使 `nextQuizState.questionIndex > activeQuestionIndex`，先以原題呼叫：

```js
renderGame({
  questionOverride: question,
  progressOverride: answerProgress,
  statusOverride: `正確答案：${question.choices[question.answerIndex]}`,
  revealAnswerIndex: question.answerIndex,
});
await new Promise(resolve => setTimeout(resolve, 900));
```

`battle-renderer.mjs` 對對應選項加入 `is-correct-reveal` 及 `aria-label="答案揭示"`。

- [ ] **Step 7: 執行 CPU 與渲染測試**

Run: `node --test tests/cpu-player.test.mjs tests/app-integration.test.mjs tests/battle-renderer.test.mjs && node --check web/js/app.mjs`

Expected: PASS。

- [ ] **Step 8: 提交 CPU 對戰整合**

```bash
git add tests/app-integration.test.mjs tests/battle-renderer.test.mjs web/js/app.mjs web/js/battle-renderer.mjs web/assets/app.css
git commit -m "feat: integrate cpu battle lifecycle"
```

### Task 7: 本地化字型並完成電競視覺

**Files:**
- Create: `web/assets/fonts/NotoSansTC-Variable.woff2`
- Create: `web/assets/fonts/Orbitron-Variable.woff2`
- Create: `web/assets/fonts/OFL-NotoSansTC.txt`
- Create: `web/assets/fonts/OFL-Orbitron.txt`
- Modify: `tests/start-screen.test.mjs`
- Modify: `web/assets/app.css`
- Modify: `web/index.html`

- [ ] **Step 1: 先寫本地字型及視覺契約的失敗測試**

在 `tests/start-screen.test.mjs` 新增：

```js
import { access, readFile } from 'node:fs/promises';

test('起始畫面只使用本地字型並提供響應式與減少動態樣式', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.match(css, /NotoSansTC-Variable\.woff2/);
  assert.match(css, /Orbitron-Variable\.woff2/);
  assert.match(css, /\.start-screen/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  await access(new URL('../web/assets/fonts/NotoSansTC-Variable.woff2', import.meta.url));
  await access(new URL('../web/assets/fonts/Orbitron-Variable.woff2', import.meta.url));
});
```

- [ ] **Step 2: 執行測試並確認本地字型尚不存在**

Run: `node --test tests/start-screen.test.mjs`

Expected: FAIL，指出 WOFF2 檔不存在或 CSS 仍匯入 Google Fonts。

- [ ] **Step 3: 下載官方 OFL 變動字型及授權**

在 PowerShell 執行：

```powershell
New-Item -ItemType Directory -Force web/assets/fonts, .tools/font-build | Out-Null
curl.exe -L "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf" -o .tools/font-build/NotoSansTC.ttf
curl.exe -L "https://raw.githubusercontent.com/google/fonts/main/ofl/orbitron/Orbitron%5Bwght%5D.ttf" -o .tools/font-build/Orbitron.ttf
curl.exe -L "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/OFL.txt" -o web/assets/fonts/OFL-NotoSansTC.txt
curl.exe -L "https://raw.githubusercontent.com/google/fonts/main/ofl/orbitron/OFL.txt" -o web/assets/fonts/OFL-Orbitron.txt
python -m pip install --target .tools/font-build brotli
$env:PYTHONPATH = (Resolve-Path .tools/font-build)
python -m fontTools.subset .tools/font-build/NotoSansTC.ttf --output-file=web/assets/fonts/NotoSansTC-Variable.woff2 --flavor=woff2 --layout-features='*' --glyphs='*' --no-hinting
python -m fontTools.subset .tools/font-build/Orbitron.ttf --output-file=web/assets/fonts/Orbitron-Variable.woff2 --flavor=woff2 --layout-features='*' --glyphs='*' --no-hinting
```

下載來源為 Google Fonts 官方倉庫；兩套字型皆為 OFL。`.tools/` 已由目前的 allow-list `.gitignore` 排除，不提交暫存 TTF 或 Python 套件。

- [ ] **Step 4: 將 CSS 改成本地字型與電競控制台**

移除外部 `@import`，在 `web/assets/app.css` 頂端加入：

```css
@font-face { font-family:'Noto Sans TC'; src:url('./fonts/NotoSansTC-Variable.woff2') format('woff2'); font-weight:100 900; font-style:normal; font-display:swap; }
@font-face { font-family:'Orbitron'; src:url('./fonts/Orbitron-Variable.woff2') format('woff2'); font-weight:400 900; font-style:normal; font-display:swap; }
```

加入以下核心樣式；顏色、間距及陰影使用核准草圖中的數值：

```css
body:has(.start-screen) { background:#060914; color:#fff; }
.start-screen { min-height:100vh; padding:26px 32px 30px; background:radial-gradient(circle at 84% 7%,#6c3dc75c,transparent 30%),linear-gradient(145deg,#050814,#11192e 58%,#220d24); font-family:'Noto Sans TC',sans-serif; }
.start-topbar { display:flex; justify-content:space-between; align-items:center; padding-bottom:18px; border-bottom:1px solid #58dfff33; }
.start-topbar small,.start-topbar b,.start-control>p,.start-stats { font-family:'Orbitron',sans-serif; letter-spacing:.2em; }
.start-topbar h1 { margin:8px 0 0; font-size:clamp(34px,5vw,64px); line-height:1; text-shadow:0 0 22px #2edfff66; }
.start-grid { display:grid; grid-template-columns:minmax(320px,.82fr) minmax(430px,1.18fr); gap:24px; margin-top:27px; }
.start-control { padding:22px; border:1px solid #42d7ff70; border-radius:16px; background:#071225dc; box-shadow:inset 0 0 32px #1bd8ff0d,0 0 28px #1bd8ff17; }
.start-mode { display:grid; grid-template-columns:44px 1fr 24px; align-items:center; width:100%; min-height:58px; margin:12px 0; padding:15px 16px; border:1px solid #8aefff88; border-radius:10px; color:#fff; background:linear-gradient(100deg,#0eaed5,#354fff); box-shadow:inset 0 -5px 0 #051a4f88,0 8px 20px #0c8fd344; font-size:19px; font-weight:900; text-align:left; }
.start-mode-local { border-color:#ff8ca0; background:linear-gradient(100deg,#f2375c,#a0195c); }
.start-mode:hover,.start-mode:focus-visible { transform:translateY(-2px); filter:brightness(1.16); outline:3px solid #ffe060; outline-offset:3px; }
.start-minor-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:18px; }
.start-minor-actions button { min-height:44px; border:1px solid #62749f66; border-radius:8px; background:#ffffff08; color:#d8e4ff; }
.start-stats { display:flex; justify-content:space-between; margin-top:18px; padding-top:15px; border-top:1px solid #60749c55; color:#788bad; font-size:10px; }
.start-arena { position:relative; min-height:365px; overflow:hidden; border:1px solid #ffcf5270; border-radius:16px; background:linear-gradient(#05091470,#050914d8),var(--start-scene) center/cover; }
.start-fighter { position:absolute; bottom:34px; z-index:2; height:72%; max-width:42%; object-fit:contain; filter:drop-shadow(0 12px 10px #0008); animation:startIdle 1.8s ease-in-out infinite; }
.start-fighter-left { left:3%; }.start-fighter-right { right:3%; transform:scaleX(-1); animation-direction:reverse; }
.start-versus { position:absolute; z-index:3; left:50%; top:42%; transform:translate(-50%,-50%) rotate(-8deg); color:#ffe060; font:900 clamp(48px,7vw,84px)/1 'Orbitron'; text-shadow:4px 5px 0 #b31f47,0 0 26px #ff9d2f; }
.start-arena>p { position:absolute; z-index:4; inset:auto 0 0; margin:0; padding:15px 18px; background:linear-gradient(90deg,#520f2be8,#08152de8); }
@keyframes startIdle { 50% { translate:0 -8px; } }
@media(max-width:900px) { .start-screen{padding:20px 14px}.start-grid{grid-template-columns:1fr}.start-control{order:1}.start-arena{order:2;min-height:320px}.start-topbar b{display:none} }
@media(prefers-reduced-motion:reduce) { .start-fighter{animation:none}.start-mode{transition:none} }
```

- [ ] **Step 5: 更新頁面標題與主題色**

`web/index.html` 將 `<title>` 改為 `DDP 知識對決`，`theme-color` 改成起始畫面的深藍黑色 `#060914`。

- [ ] **Step 6: 執行字型與起始畫面測試**

Run: `node --test tests/start-screen.test.mjs && git diff --check`

Expected: PASS，且無空白錯誤。

- [ ] **Step 7: 提交字型與視覺**

```bash
git add tests/start-screen.test.mjs web/assets/fonts web/assets/app.css web/index.html
git commit -m "feat: style esports start screen with local fonts"
```

### Task 8: 完整回歸、瀏覽器驗收與發布

**Files:**
- Modify: `README.md`
- Verify: `web/index.html`
- Verify: `web/js/*.mjs`
- Verify: `web/assets/app.css`

- [ ] **Step 1: 執行所有自動測試與語法檢查**

Run:

```powershell
npm test
Get-ChildItem web/js/*.mjs | ForEach-Object { node --check $_.FullName }
git diff --check
```

Expected: 所有測試 PASS、所有 ES modules 語法正確、`git diff --check` 無輸出。

- [ ] **Step 2: 啟動本機網站並驗證起始畫面**

Run: `npm start`

在瀏覽器確認：

- 桌面畫面顯示 `DDP 知識對決`、兩個主模式、操作說明、音效設定、31 份題庫與實際角色／戰場。
- Network 面板不請求 `fonts.googleapis.com` 或 `fonts.gstatic.com`；兩個 WOFF2 均 HTTP 200。
- 390×844 viewport 無水平捲動，模式按鈕在角色預覽之前。
- 鍵盤 Tab 可看見焦點；啟用 reduced motion 後角色停止浮動。

- [ ] **Step 3: 驗證隨機平均答案**

選四選一題庫連續作答至少 8 題，從原題資料比對正確答案，確認每 4 題的正確位置 1～4 各一次，且第 4／5 題位置不同。同一題答錯交棒時選項不得重排。

- [ ] **Step 4: 驗證單人與本機雙人**

- 單人：三種難度各開一局；確認玩家只需左方按鍵、CPU 自動選右方角色、玩家答對取消 CPU、玩家答錯後 CPU 繼續等待、CPU 答錯後玩家仍可答、雙方皆錯顯示正解。
- 本機雙人：確認左右選角不可重複、雙方鍵盤測試與直接開始均可用，既有攻擊及受擊流程不變。
- 結果頁：更換題庫保留模式，再玩一次保留模式，返回主選單清除模式及所有 CPU 計時器。

- [ ] **Step 5: 更新 README 模式說明**

在 `README.md` 加入「玩家 VS 電腦」三種難度、「本機雙人對戰」、答案位置平均袋及第二階段網路對戰未啟用的說明。

- [ ] **Step 6: 提交驗收文件更新**

```bash
git add README.md
git commit -m "docs: describe solo and local battle modes"
```

- [ ] **Step 7: 安全發布 GitHub Pages**

```powershell
git push origin main
$remoteLine = git ls-remote --heads origin gh-pages
$remoteGhPages = ($remoteLine -split '\s+')[0]
$publishCommit = git subtree split --prefix web main
git push --force-with-lease="gh-pages:$remoteGhPages" origin "${publishCommit}:gh-pages"
```

Expected: `main` 與 `gh-pages` 推送成功。以 `$publishCommit.Substring(0,7)` 建立版本網址：

`https://coolokey.github.io/dd2p-quiz-web/?v=<publish7>`

- [ ] **Step 8: 驗證公開版本**

等待 GitHub Pages 提供新版後，以版本網址實際確認起始畫面、題庫分類、單人、雙人、本地 WOFF2、答案位置袋與拳腳受擊動畫。只有公開網址 HTTP 200 且瀏覽器行為通過後，才回報發布完成。
