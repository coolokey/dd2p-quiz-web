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
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function createHarness({ gameMode = 'solo', quizMode = 'time', limit = Number.MAX_SAFE_INTEGER } = {}) {
  let quizState = createGameState({ mode: quizMode, limit });
  let combatState = createBattleState();
  let animationWait = null;
  let revealWait = null;
  const schedules = [];
  const scheduleAttempts = [];
  const events = [];
  const reveals = [];
  const waits = [];
  let cancelCount = 0;
  let afterAction = null;
  let settledAction = null;
  let cpuSubmitAllowed = true;
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
    const activeQuestionKey = questionKey(combatState.phase, before.questionIndex);
    const next = submitBuzzerAnswer(before, input.player, input.answerIndex, question.answerIndex);
    if (next === before) return null;
    const correct = input.answerIndex === question.answerIndex;
    quizState = next;
    combatState = correct
      ? applyCorrectAnswer(combatState, input.player)
      : applyWrongAnswer(combatState, input.player);
    events.push({ type: 'answer', player: input.player, correct, prompt: question.prompt, questionKey: activeQuestionKey });
    return {
      questionKey: activeQuestionKey,
      question,
      answerIndex: question.answerIndex,
      correct,
      questionAdvanced: next.questionIndex > before.questionIndex,
    };
  }

  function scheduleCurrentQuestion() {
    const activeQuestionKey = questionKey();
    const accepted = lifecycle.scheduleCpu({
      questionKey: activeQuestionKey,
      question: currentQuestion(),
      difficulty: 'normal',
    });
    scheduleAttempts.push({ questionKey: activeQuestionKey, accepted });
    return accepted;
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
    afterAnswer: outcome => {
      events.push({ type: 'after', prompt: outcome.question.prompt });
      return afterAction?.(outcome);
    },
    onSettled: outcome => {
      events.push({ type: 'settled', prompt: outcome.question.prompt });
      settledAction?.(outcome);
    },
    submitCpuAnswer: input => cpuSubmitAllowed ? lifecycle.submit(input) : false,
  });

  return {
    lifecycle,
    schedules,
    scheduleAttempts,
    events,
    reveals,
    waits,
    get cancelCount() { return cancelCount; },
    get quizState() { return quizState; },
    get combatState() { return combatState; },
    currentQuestion,
    schedule() {
      return scheduleCurrentQuestion();
    },
    setGameMode(value) { gameMode = value; },
    setAnimationWait(value) { animationWait = value; },
    setRevealWait(value) { revealWait = value; },
    setAfterAction(value) { afterAction = value; },
    setSettledAction(value) { settledAction = value; },
    setCpuSubmitAllowed(value) { cpuSubmitAllowed = value; },
    advanceQuestion() {
      quizState = { ...quizState, questionIndex: quizState.questionIndex + 1 };
    },
    endBattle() { combatState = { ...combatState, ended: true, phase: 'ended' }; },
    resetBattleState() {
      quizState = createGameState({ mode: quizMode, limit });
      combatState = createBattleState();
    },
    enterSuddenDeath() {
      combatState = finishRegulation(combatState);
      quizState = { ...quizState, phase: 'open', eligiblePlayers: ['left', 'right'], lockedPlayer: null, ended: false };
    },
  };
}

test('固定題數答對換題後只排程一個新 CPU，且 CPU 能回答新題', async () => {
  const harness = createHarness({ quizMode: 'questions', limit: 3 });
  harness.setSettledAction(() => harness.schedule());
  harness.schedule();

  await harness.lifecycle.submit({ player: 'left', answerIndex: 0 });
  assert.deepEqual(harness.scheduleAttempts, [
    { questionKey: 'regulation:0', accepted: true },
    { questionKey: 'regulation:1', accepted: true },
  ]);
  assert.equal(harness.schedules.length, 2);

  await harness.schedules[1].onAnswer(1);
  assert.equal(harness.combatState.scores.right, 1);
});

test('雙方皆錯揭示完換題後只排程一個新 CPU', async () => {
  const harness = createHarness({ quizMode: 'questions', limit: 3 });
  harness.setSettledAction(() => harness.schedule());
  harness.schedule();

  await harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  await harness.schedules[0].onAnswer(1);
  assert.deepEqual(harness.scheduleAttempts.slice(-1), [{ questionKey: 'regulation:1', accepted: true }]);
  assert.equal(harness.schedules.length, 2);

  await harness.schedules[1].onAnswer(1);
  assert.equal(harness.combatState.scores.right, 1);
});

test('正規賽平手進驟死後以新 questionKey 只排程一個 CPU', async () => {
  const harness = createHarness({ quizMode: 'questions', limit: 3 });
  harness.setAfterAction(outcome => {
    if (outcome.questionAdvanced && harness.combatState.phase === 'regulation') harness.enterSuddenDeath();
  });
  harness.setSettledAction(() => harness.schedule());
  harness.schedule();

  await harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  await harness.schedules[0].onAnswer(1);
  assert.deepEqual(
    harness.scheduleAttempts.filter(attempt => attempt.questionKey === 'sudden-death:1'),
    [{ questionKey: 'sudden-death:1', accepted: true }],
  );
  assert.equal(harness.schedules.length, 2);

  await harness.schedules[1].onAnswer(1);
  assert.equal(harness.combatState.endReason, 'sudden-death');
  assert.equal(harness.combatState.scores.right, 1);
});

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

test('CPU callback 落在玩家動畫期間只暫存一次，整條連續答題只收尾一次', async () => {
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
  assert.equal(harness.events.filter(event => event.type === 'after').length, 1);
});

test('CPU 轉交被閘門拒絕時原答案仍結算，恢復後待答只提交一次', async () => {
  const harness = createHarness();
  const animation = deferred();
  harness.setAnimationWait(animation);
  harness.schedule();
  const answer = harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  await harness.schedules[0].onAnswer(0);
  harness.setCpuSubmitAllowed(false);
  harness.setAnimationWait(null);
  animation.resolve();
  assert.equal(await answer, true);
  assert.equal(harness.events.filter(event => event.type === 'after').length, 1);
  assert.equal(harness.events.filter(event => event.type === 'settled').length, 1);
  assert.equal(harness.combatState.scores.right, 0);
  harness.setCpuSubmitAllowed(true);
  await harness.lifecycle.resumeCpu();
  await harness.lifecycle.resumeCpu();
  assert.equal(harness.combatState.scores.right, 1);
  assert.equal(harness.events.filter(event => event.type === 'after').length, 2);
});

test('動畫拋錯後會釋放作答鎖並允許合法玩家再作答', async () => {
  const harness = createHarness();
  const animationGate = deferred();
  harness.setAnimationWait(animationGate);
  const firstAnswer = harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  const rejected = assert.rejects(firstAnswer, /animation failed/);
  animationGate.reject(new Error('animation failed'));
  await rejected;

  assert.equal(harness.lifecycle.isAnimating(), false);
  harness.setAnimationWait(null);
  assert.equal(await harness.lifecycle.submit({ player: 'right', answerIndex: 0 }), true);
  assert.equal(harness.combatState.scores.right, 1);
});

test('離場取消會使執行中作答失效且不再觸發舊收尾', async () => {
  const harness = createHarness();
  const animationGate = deferred();
  harness.setAnimationWait(animationGate);
  const answer = harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  await Promise.resolve();

  harness.lifecycle.cancel({ invalidateSubmission: true });
  animationGate.resolve();

  assert.equal(await answer, false);
  assert.equal(harness.lifecycle.isAnimating(), false);
  assert.deepEqual(
    harness.events.filter(event => ['after', 'settled'].includes(event.type)),
    [],
  );
});

test('pending CPU 的嵌套動畫拋錯後也會釋放鎖與 pending', async () => {
  const harness = createHarness();
  const playerAnimation = deferred();
  const cpuAnimation = deferred();
  harness.setAnimationWait(playerAnimation);
  harness.schedule();
  const answerChain = harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  await Promise.resolve();
  await harness.schedules[0].onAnswer(0);

  harness.setAnimationWait(cpuAnimation);
  const rejected = assert.rejects(answerChain, /cpu animation failed/);
  playerAnimation.resolve();
  await Promise.resolve();
  cpuAnimation.reject(new Error('cpu animation failed'));
  await rejected;

  assert.equal(harness.lifecycle.isAnimating(), false);
  harness.setAnimationWait(null);
  assert.equal(await harness.lifecycle.submit({ player: 'left', answerIndex: 1 }), true);
});

test('正解揭示等待拋錯後會釋放作答鎖並能進行新題', async () => {
  const harness = createHarness();
  const revealGate = deferred();
  harness.schedule();
  await harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  harness.setRevealWait(revealGate);
  const secondAnswer = harness.schedules[0].onAnswer(1);
  const rejected = assert.rejects(secondAnswer, /reveal failed/);
  revealGate.reject(new Error('reveal failed'));
  await rejected;

  assert.equal(harness.lifecycle.isAnimating(), false);
  harness.setRevealWait(null);
  assert.equal(await harness.lifecycle.submit({ player: 'left', answerIndex: 1 }), true);
  assert.equal(harness.combatState.scores.left, 1);
});

test('reset 後舊動畫完成不得清掉新鎖、新 pending CPU 或觸發舊收尾', async () => {
  const harness = createHarness();
  const oldAnimation = deferred();
  harness.setAnimationWait(oldAnimation);
  const oldAnswer = harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  await Promise.resolve();

  harness.lifecycle.reset();
  harness.resetBattleState();
  const newAnimation = deferred();
  harness.setAnimationWait(newAnimation);
  harness.schedule();
  const newAnswer = harness.lifecycle.submit({ player: 'left', answerIndex: 1 });
  await Promise.resolve();
  await harness.schedules[0].onAnswer(0);

  harness.setAnimationWait(null);
  oldAnimation.resolve();
  await oldAnswer;
  assert.equal(harness.lifecycle.isAnimating(), true);
  assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['left', 'left']);
  assert.equal(harness.events.filter(event => event.type === 'after').length, 0);
  assert.equal(await harness.lifecycle.submit({ player: 'right', answerIndex: 0 }), false);

  newAnimation.resolve();
  await newAnswer;
  assert.deepEqual(harness.events.filter(event => event.type === 'answer').map(event => event.player), ['left', 'left', 'right']);
  assert.equal(harness.events.filter(event => event.type === 'after').length, 1);
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
      if (route === 'question-change') assert.equal(harness.schedule(), true, '過期的 pending 答案不可封鎖新題排程');
    });
  }
});

test('lifecycle 取消後手動觸發 stale callback 仍不得影響新題', async () => {
  const harness = createHarness();
  harness.schedule();
  const staleCallback = harness.schedules[0].onAnswer;
  harness.lifecycle.cancel();
  harness.advanceQuestion();
  await staleCallback(0);

  assert.equal(harness.cancelCount, 1);
  assert.equal(harness.combatState.scores.right, 0);
  assert.equal(harness.quizState.questionIndex, 1);
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
  assert.deepEqual(
    harness.events.filter(event => event.type === 'answer').map(event => [event.player, event.questionKey]),
    [['right', 'sudden-death:0']],
  );
});
