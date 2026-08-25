import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCorrectAnswer, applyWrongAnswer, createBattleState, finishRegulation } from '../web/js/battle-state.mjs';
import { createBattleLifecycle } from '../web/js/battle-lifecycle.mjs';
import { createGameState, submitBuzzerAnswer } from '../web/js/game-state.mjs';

const QUESTIONS = [
  { prompt: '第一題', choices: ['A', 'B'], answerIndex: 0 },
  { prompt: '第二題', choices: ['C', 'D'], answerIndex: 1 },
  { prompt: '第三題', choices: ['E', 'F'], answerIndex: 0 },
];

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createHarness({ gameMode = 'solo' } = {}) {
  let quizState = createGameState({ mode: 'time', limit: Number.MAX_SAFE_INTEGER });
  let combatState = createBattleState();
  let animationWait = null;
  let revealWait = null;
  const schedules = [];
  const events = [];
  const reveals = [];
  const waits = [];
  let cancelCount = 0;
  let lifecycle;

  const questionKey = (phase = combatState.phase, index = quizState.questionIndex) => `${phase}:${index}`;
  const currentQuestion = () => QUESTIONS[quizState.questionIndex % QUESTIONS.length];
  const snapshot = () => ({
    gameMode,
    questionKey: questionKey(),
    phase: quizState.phase,
    eligiblePlayers: [...quizState.eligiblePlayers],
    ended: combatState.ended,
  });

  function resolveAnswer(input) {
    const before = quizState;
    const question = currentQuestion();
    const next = submitBuzzerAnswer(before, input.player, input.answerIndex, question.answerIndex);
    if (next === before) return null;
    const correct = input.answerIndex === question.answerIndex;
    quizState = next;
    combatState = correct
      ? applyCorrectAnswer(combatState, input.player)
      : applyWrongAnswer(combatState, input.player);
    events.push({ type: 'answer', player: input.player, correct, prompt: question.prompt });
    return {
      questionKey: questionKey(combatState.phase, before.questionIndex),
      question,
      answerIndex: question.answerIndex,
      correct,
      questionAdvanced: next.questionIndex > before.questionIndex,
    };
  }

  lifecycle = createBattleLifecycle({
    cpuController: {
      schedule(request) { schedules.push(request); },
      cancel() { cancelCount += 1; },
    },
    getSnapshot: snapshot,
    resolveAnswer,
    animateAnswer: async () => { if (animationWait) await animationWait.promise; },
    revealAnswer: payload => reveals.push(payload),
    wait: async milliseconds => {
      waits.push(milliseconds);
      if (revealWait) await revealWait.promise;
    },
    afterAnswer: outcome => events.push({ type: 'after', prompt: outcome.question.prompt }),
    submitCpuAnswer: input => lifecycle.submit(input),
  });

  return {
    lifecycle,
    schedules,
    events,
    reveals,
    waits,
    get cancelCount() { return cancelCount; },
    get quizState() { return quizState; },
    get combatState() { return combatState; },
    currentQuestion,
    schedule() {
      return lifecycle.scheduleCpu({
        questionKey: questionKey(),
        question: currentQuestion(),
        difficulty: 'normal',
      });
    },
    setGameMode(value) { gameMode = value; },
    setAnimationWait(value) { animationWait = value; },
    setRevealWait(value) { revealWait = value; },
    advanceQuestion() {
      quizState = { ...quizState, questionIndex: quizState.questionIndex + 1 };
    },
    endBattle() { combatState = { ...combatState, ended: true, phase: 'ended' }; },
    enterSuddenDeath() {
      combatState = finishRegulation(combatState);
      quizState = { ...quizState, phase: 'open', eligiblePlayers: ['left', 'right'], lockedPlayer: null, ended: false };
    },
  };
}

test('單人開放題且右方可作答時每題只排程一次，本機雙人不排程', () => {
  const solo = createHarness();
  assert.equal(solo.schedule(), true);
  assert.equal(solo.schedule(), false);
  assert.equal(solo.schedules.length, 1);

  const local = createHarness({ gameMode: 'local' });
  assert.equal(local.schedule(), false);
  assert.equal(local.schedules.length, 0);
});

test('玩家先答對會立即取消 CPU，舊 callback 不得作答或攻擊', async () => {
  const harness = createHarness();
  harness.schedule();
  const staleCallback = harness.schedules[0].onAnswer;

  await harness.lifecycle.submit({ player: 'left', answerIndex: 0 });
  await staleCallback(0);

  assert.equal(harness.cancelCount, 1);
  assert.equal(harness.combatState.scores.left, 1);
  assert.equal(harness.combatState.scores.right, 0);
  assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['left']);
});

test('玩家先答錯不取消 CPU，CPU 之後仍能回答同題', async () => {
  const harness = createHarness();
  harness.schedule();

  await harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  assert.equal(harness.cancelCount, 0);
  assert.equal(harness.quizState.questionIndex, 0);
  await harness.schedules[0].onAnswer(0);

  assert.equal(harness.combatState.scores.right, 1);
  assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['left', 'right']);
});

test('CPU 先答錯後，左方玩家仍可回答同題', async () => {
  const harness = createHarness();
  harness.schedule();

  await harness.schedules[0].onAnswer(1);
  assert.deepEqual(harness.quizState.eligiblePlayers, ['left']);
  assert.equal(harness.quizState.questionIndex, 0);
  await harness.lifecycle.submit({ player: 'left', answerIndex: 0 });

  assert.equal(harness.combatState.scores.left, 1);
  assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['right', 'left']);
});

test('雙方皆錯只揭示原題正解一次，等待 900ms 完成後才前進', async () => {
  const harness = createHarness();
  const revealGate = deferred();
  harness.setRevealWait(revealGate);
  harness.schedule();
  const originalQuestion = harness.currentQuestion();

  await harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  const secondAnswer = harness.schedules[0].onAnswer(1);
  await Promise.resolve();

  assert.equal(harness.lifecycle.isAnimating(), true);
  assert.equal(harness.schedule(), false);
  assert.equal(harness.quizState.questionIndex, 1);
  assert.equal(harness.reveals.length, 1);
  assert.strictEqual(harness.reveals[0].question, originalQuestion);
  assert.equal(harness.reveals[0].answerIndex, originalQuestion.answerIndex);
  assert.deepEqual(harness.waits, [900]);
  assert.equal(harness.events.filter(event => event.type === 'after').length, 1);

  revealGate.resolve();
  await secondAnswer;
  assert.equal(harness.lifecycle.isAnimating(), false);
  assert.equal(harness.events.filter(event => event.type === 'after').length, 2);
  assert.equal(harness.reveals.length, 1);
});

test('CPU callback 落在玩家動畫期間只暫存一次，動畫完成才提交', async () => {
  const harness = createHarness();
  const animationGate = deferred();
  harness.setAnimationWait(animationGate);
  harness.schedule();

  const playerAnswer = harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  await Promise.resolve();
  await harness.schedules[0].onAnswer(0);
  await harness.schedules[0].onAnswer(0);
  assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['left']);

  harness.setAnimationWait(null);
  animationGate.resolve();
  await playerAnswer;
  await Promise.resolve();

  assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['left', 'right']);
  assert.equal(harness.combatState.scores.right, 1);
});

test('CPU callback 在玩家動畫後若已換題或結算就丟棄', async t => {
  for (const route of ['question-change', 'battle-ended']) {
    await t.test(route, async () => {
      const harness = createHarness();
      const animationGate = deferred();
      harness.setAnimationWait(animationGate);
      harness.schedule();
      const playerAnswer = harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
      await Promise.resolve();
      await harness.schedules[0].onAnswer(0);
      if (route === 'question-change') harness.advanceQuestion();
      else harness.endBattle();
      harness.setAnimationWait(null);
      animationGate.resolve();
      await playerAnswer;
      await Promise.resolve();
      assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['left']);
    });
  }
});

test('題目前進與各種離開戰鬥路徑都取消，stale callback 不得影響新題', async t => {
  const routes = ['question-advance', 'timer-ended', 'regulation-ended', 'result', 'catalog', 'main-menu'];
  for (const route of routes) {
    await t.test(route, async () => {
      const harness = createHarness();
      harness.schedule();
      const staleCallback = harness.schedules[0].onAnswer;
      harness.lifecycle.cancel(route);
      harness.advanceQuestion();
      await staleCallback(0);
      assert.equal(harness.cancelCount, 1);
      assert.equal(harness.combatState.scores.right, 0);
      assert.equal(harness.quizState.questionIndex, 1);
    });
  }
});

test('正規賽平手進驟死時取消舊排程，新題只排程一次', async () => {
  const harness = createHarness();
  harness.schedule();
  const regulationCallback = harness.schedules[0].onAnswer;

  harness.lifecycle.cancel('regulation-ended');
  harness.enterSuddenDeath();
  assert.equal(harness.schedule(), true);
  assert.equal(harness.schedule(), false);
  assert.equal(harness.schedules.length, 2);

  await regulationCallback(0);
  await harness.schedules[1].onAnswer(0);

  assert.equal(harness.combatState.scores.right, 1);
  assert.equal(harness.combatState.ended, true);
  assert.equal(harness.combatState.endReason, 'sudden-death');
  assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['right']);
});
