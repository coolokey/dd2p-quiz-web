import test from 'node:test';
import assert from 'node:assert/strict';
import { claimAnswer, createGameState, submitAnswer, submitBuzzerAnswer } from '../web/js/game-state.mjs';

test('搶答者答錯後讓另一位玩家作答', () => {
  let state = createGameState({ mode: 'questions', limit: 2 });
  state = claimAnswer(state, 'left');
  state = submitAnswer(state, 'left', 2, 0);
  assert.equal(state.phase, 'open');
  assert.deepEqual(state.eligiblePlayers, ['right']);
});

test('答對加一分並前往下一題', () => {
  let state = createGameState({ mode: 'questions', limit: 2 });
  state = claimAnswer(state, 'right');
  state = submitAnswer(state, 'right', 1, 1);
  assert.equal(state.scores.right, 1);
  assert.equal(state.questionIndex, 1);
});

test('第一次按下選項鍵即搶答並判定答案', () => {
  const state = submitBuzzerAnswer(createGameState({ mode: 'questions', limit: 2 }), 'left', 0, 0);
  assert.equal(state.scores.left, 1);
  assert.equal(state.questionIndex, 1);
  assert.equal(state.phase, 'open');
});
