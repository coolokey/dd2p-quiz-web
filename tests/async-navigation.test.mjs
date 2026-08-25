import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleInputGate,
  createLatestSessionGate,
  markQuizRequestLoading,
  runLatestRequest,
  runStartSession,
} from '../web/js/async-navigation.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test('較舊 bootstrap 最後成功也不能覆蓋較新的成功結果', async () => {
  const gate = createLatestSessionGate();
  const older = deferred();
  const newer = deferred();
  const committed = [];
  const errors = [];
  const startRequest = source => runLatestRequest({
    gate,
    load: () => source.promise,
    onSuccess: value => committed.push(value),
    onError: error => errors.push(error.message),
  });

  const olderRequest = startRequest(older);
  const newerRequest = startRequest(newer);
  newer.resolve('new bootstrap');
  assert.equal(await newerRequest, true);
  older.resolve('old bootstrap');
  assert.equal(await olderRequest, false);

  assert.deepEqual(committed, ['new bootstrap']);
  assert.deepEqual(errors, []);
});

test('較舊 bootstrap 最後失敗也不能覆蓋較新的成功結果', async () => {
  const gate = createLatestSessionGate();
  const older = deferred();
  const newer = deferred();
  const committed = [];
  const errors = [];
  const startRequest = source => runLatestRequest({
    gate,
    load: () => source.promise,
    onSuccess: value => committed.push(value),
    onError: error => errors.push(error.message),
  });

  const olderRequest = startRequest(older);
  const newerRequest = startRequest(newer);
  newer.resolve('new bootstrap');
  assert.equal(await newerRequest, true);
  older.reject(new Error('old bootstrap failed'));
  assert.equal(await olderRequest, false);

  assert.deepEqual(committed, ['new bootstrap']);
  assert.deepEqual(errors, []);
});

test('較慢的舊題庫不能覆蓋最後選取的題庫', async () => {
  const gate = createLatestSessionGate();
  const math = deferred();
  const science = deferred();
  let currentQuiz = null;
  const selectQuiz = source => runLatestRequest({
    gate,
    load: () => source.promise,
    onSuccess: quiz => { currentQuiz = quiz; },
  });

  const mathRequest = selectQuiz(math);
  const scienceRequest = selectQuiz(science);
  science.resolve({ id: 'science' });
  assert.equal(await scienceRequest, true);
  math.resolve({ id: 'math' });
  assert.equal(await mathRequest, false);

  assert.deepEqual(currentQuiz, { id: 'science' });
});

test('開始後立刻返回會取消舊流程且不開 timer、不渲染戰鬥', async () => {
  const gate = createLatestSessionGate();
  const sceneAudio = deferred();
  const events = [];
  const start = runStartSession({
    gate,
    onCancel: () => events.push('cleanup'),
    onLoading: () => events.push('loading'),
    prepare: () => events.push('prepare'),
    stages: [() => sceneAudio.promise],
    startTimer: () => events.push('timer'),
    renderBattle: () => events.push('battle'),
  });

  gate.invalidate();
  sceneAudio.resolve();

  assert.equal(await start, false);
  assert.deepEqual(events, ['loading', 'prepare', 'cleanup']);
});

test('舊 start 慢完成時只有已開始的新 start 能開 timer 與渲染戰鬥', async () => {
  const gate = createLatestSessionGate();
  const oldAudio = deferred();
  const newAudio = deferred();
  const events = [];
  const beginStart = (label, audio) => runStartSession({
    gate,
    onCancel: () => events.push(`${label}:cleanup`),
    prepare: () => events.push(`${label}:prepare`),
    stages: [() => audio.promise],
    startTimer: () => events.push(`${label}:timer`),
    renderBattle: () => events.push(`${label}:battle`),
  });

  const oldStart = beginStart('old', oldAudio);
  const newStart = beginStart('new', newAudio);
  newAudio.resolve();
  assert.equal(await newStart, true);
  oldAudio.resolve();
  assert.equal(await oldStart, false);

  assert.deepEqual(events, [
    'old:prepare',
    'old:cleanup',
    'new:prepare',
    'new:timer',
    'new:battle',
  ]);
});

test('開局音訊等待與取消返回後，答案輸入都不能計分或渲染戰鬥', async () => {
  const gate = createLatestSessionGate();
  const inputGate = createBattleInputGate();
  const audio = deferred();
  let score = 0;
  let battleRenders = 0;
  const submitAnswer = () => inputGate.run(() => {
    score += 1;
    battleRenders += 1;
  });
  const start = runStartSession({
    gate,
    disableInput: inputGate.disable,
    enableInput: inputGate.enable,
    stages: [() => audio.promise],
    renderBattle: () => { battleRenders += 1; },
  });

  assert.equal(submitAnswer(), false);
  gate.invalidate();
  assert.equal(submitAnswer(), false);
  audio.resolve();

  assert.equal(await start, false);
  assert.equal(score, 0);
  assert.equal(battleRenders, 0);
});

test('只有 start 成功 commit 後才開放答案輸入', async () => {
  const gate = createLatestSessionGate();
  const inputGate = createBattleInputGate();
  const audio = deferred();
  let score = 0;
  const start = runStartSession({
    gate,
    disableInput: inputGate.disable,
    enableInput: inputGate.enable,
    stages: [() => audio.promise],
  });

  assert.equal(inputGate.run(() => { score += 1; }), false);
  audio.resolve();
  assert.equal(await start, true);
  assert.equal(inputGate.run(() => { score += 1; return score; }), 1);
  assert.equal(score, 1);
});

test('對戰輸入門會原樣回傳同步動作的值', () => {
  const inputGate = createBattleInputGate();
  inputGate.enable();

  assert.equal(inputGate.run(() => 'submitted'), 'submitted');
});

test('對戰輸入門會原樣回傳非同步動作的 Promise 與結果', async () => {
  const inputGate = createBattleInputGate();
  inputGate.enable();

  const result = inputGate.run(async () => 'settled');

  assert.ok(result instanceof Promise);
  assert.equal(await result, 'settled');
});

test('對戰輸入門不會吞掉非同步動作的拒絕', async () => {
  const inputGate = createBattleInputGate();
  inputGate.enable();
  const failure = new Error('animation failed');

  await assert.rejects(inputGate.run(async () => { throw failure; }), failure);
});

test('停用的對戰輸入門回傳 false 且不執行動作', () => {
  const inputGate = createBattleInputGate();
  let calls = 0;

  assert.equal(inputGate.run(() => { calls += 1; }), false);
  assert.equal(calls, 0);
});

test('題庫重試載入時停用重試按鈕並顯示 loading', () => {
  const retry = {
    disabled: false,
    textContent: '重試',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const root = {
    querySelector: selector => selector === '#retry-quiz' ? retry : null,
    querySelectorAll: () => [],
  };

  markQuizRequestLoading(root, 'math');

  assert.equal(retry.disabled, true);
  assert.equal(retry.textContent, '載入中……');
  assert.equal(retry.attributes['aria-busy'], 'true');
});
