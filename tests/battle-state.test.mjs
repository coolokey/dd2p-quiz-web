import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCorrectAnswer,
  applyWrongAnswer,
  createBattleState,
  finishRegulation,
} from '../web/js/battle-state.mjs';

test('答對時加一分並使對手受到傷害', () => {
  const state = createBattleState();
  const next = applyCorrectAnswer(state, 'left');

  assert.equal(next.scores.left, 1);
  assert.equal(next.health.right, 90);
  assert.deepEqual(next.animation, { type: 'attack', player: 'left', opponent: 'right' });
  assert.equal(state.scores.left, 0);
  assert.equal(state.health.right, 100);
});

test('生命值歸零時以 KO 結束對戰', () => {
  const state = { ...createBattleState(), health: { left: 100, right: 10 } };
  const next = applyCorrectAnswer(state, 'left');

  assert.deepEqual(
    { ended: next.ended, reason: next.endReason, winner: next.winner },
    { ended: true, reason: 'ko', winner: 'left' },
  );
});

test('正規賽分數較高的一方獲勝', () => {
  const state = { ...createBattleState(), scores: { left: 3, right: 2 } };
  const next = finishRegulation(state);

  assert.deepEqual(
    { phase: next.phase, ended: next.ended, reason: next.endReason, winner: next.winner },
    { phase: 'ended', ended: true, reason: 'score', winner: 'left' },
  );
});

test('正規賽平手時進入驟死賽', () => {
  const next = finishRegulation(createBattleState());

  assert.deepEqual(
    { phase: next.phase, ended: next.ended, reason: next.endReason, winner: next.winner },
    { phase: 'sudden-death', ended: false, reason: null, winner: null },
  );
});

test('驟死賽先答對者立即獲勝', () => {
  const suddenDeath = finishRegulation(createBattleState());
  const next = applyCorrectAnswer(suddenDeath, 'right');

  assert.deepEqual(
    { ended: next.ended, reason: next.endReason, winner: next.winner },
    { ended: true, reason: 'sudden-death', winner: 'right' },
  );
});

test('答錯時不計分也不扣除任何生命值', () => {
  const state = createBattleState();
  const next = applyWrongAnswer(state, 'left');

  assert.deepEqual(next.health, state.health);
  assert.deepEqual(next.scores, state.scores);
  assert.deepEqual(next.animation, { type: 'miss', player: 'left', opponent: 'right' });
  assert.notStrictEqual(next, state);
});
