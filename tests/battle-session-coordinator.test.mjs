import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleSessionCoordinator } from '../web/js/battle-session-coordinator.mjs';

function createHarness({ animating = false } = {}) {
  const events = [];
  const lifecycle = {
    cancel: options => events.push(options ? { type: 'cancel', options } : { type: 'cancel' }),
    isAnimating: () => animating,
  };
  const coordinator = createBattleSessionCoordinator({
    lifecycle,
    clearTimer: () => events.push({ type: 'clear-timer' }),
    closeRegulation: options => events.push({ type: 'close-regulation', options }),
    stopAudio: () => events.push({ type: 'stop-audio' }),
  });
  return {
    coordinator,
    events,
    setAnimating(value) { animating = value; },
  };
}

test('題目前進、正規賽結束與各離開路徑執行各自真實的清理事件', async t => {
  const cases = [
    {
      name: 'question-advance',
      invoke: coordinator => coordinator.questionAdvanced(),
      expected: [{ type: 'cancel' }],
    },
    {
      name: 'regulation-ended',
      invoke: coordinator => coordinator.regulationEnded({ advanceQuestion: false }),
      expected: [{ type: 'cancel' }, { type: 'close-regulation', options: { advanceQuestion: false } }],
    },
    {
      name: 'result',
      invoke: coordinator => coordinator.resultShown(),
      expected: [{ type: 'cancel', options: { invalidateSubmission: true } }, { type: 'clear-timer' }],
    },
    {
      name: 'catalog',
      invoke: coordinator => coordinator.catalogOpened(),
      expected: [{ type: 'cancel', options: { invalidateSubmission: true } }, { type: 'clear-timer' }, { type: 'stop-audio' }],
    },
    {
      name: 'main-menu',
      invoke: coordinator => coordinator.mainMenuOpened(),
      expected: [{ type: 'cancel', options: { invalidateSubmission: true } }, { type: 'clear-timer' }, { type: 'stop-audio' }],
    },
    {
      name: 'battle-start-failure',
      invoke: coordinator => coordinator.stopBattleActivity(),
      expected: [{ type: 'cancel', options: { invalidateSubmission: true } }, { type: 'clear-timer' }, { type: 'stop-audio' }],
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const harness = createHarness();
      scenario.invoke(harness.coordinator);
      assert.deepEqual(harness.events, scenario.expected);
    });
  }
});

test('限時結束且無動畫時立即取消、清計時器並前進題目結算', () => {
  const harness = createHarness();
  assert.equal(harness.coordinator.timerExpired(), true);
  assert.deepEqual(harness.events, [
    { type: 'clear-timer' },
    { type: 'cancel' },
    { type: 'close-regulation', options: { advanceQuestion: true } },
  ]);
});

test('限時在動畫中歸零會暫存，答題動畫完成後只結算一次', () => {
  const harness = createHarness({ animating: true });
  assert.equal(harness.coordinator.timerExpired(), false);
  assert.deepEqual(harness.events, [{ type: 'clear-timer' }, { type: 'cancel' }]);

  harness.setAnimating(false);
  assert.equal(harness.coordinator.finishAnswer({ questionIndex: 4, activeQuestionIndex: 4 }), true);
  assert.equal(harness.coordinator.finishAnswer({ questionIndex: 4, activeQuestionIndex: 4 }), false);
  assert.deepEqual(harness.events.filter(event => event.type === 'close-regulation'), [
    { type: 'close-regulation', options: { advanceQuestion: true } },
  ]);
});

test('動畫期間題目已前進時，延後結算不再多前進一題', () => {
  const harness = createHarness({ animating: true });
  harness.coordinator.timerExpired();
  harness.setAnimating(false);

  assert.equal(harness.coordinator.finishAnswer({ questionIndex: 5, activeQuestionIndex: 4 }), true);
  assert.deepEqual(harness.events.at(-1), { type: 'close-regulation', options: { advanceQuestion: false } });
});

test('新賽局 reset 會丟棄舊賽局尚未收尾的限時結算', () => {
  const harness = createHarness({ animating: true });
  harness.coordinator.timerExpired();
  harness.coordinator.reset();
  harness.setAnimating(false);

  assert.equal(harness.coordinator.finishAnswer({ questionIndex: 0, activeQuestionIndex: 0 }), false);
  assert.equal(harness.events.filter(event => event.type === 'close-regulation').length, 0);
});

test('結果頁與離開對戰路徑會丟棄尚未收尾的限時結算', async t => {
  for (const route of ['resultShown', 'catalogOpened', 'mainMenuOpened', 'stopBattleActivity']) {
    await t.test(route, () => {
      const harness = createHarness({ animating: true });
      harness.coordinator.timerExpired();
      harness.coordinator[route]();
      harness.setAnimating(false);

      assert.equal(harness.coordinator.finishAnswer({ questionIndex: 0, activeQuestionIndex: 0 }), false);
      assert.equal(harness.events.filter(event => event.type === 'close-regulation').length, 0);
    });
  }
});
