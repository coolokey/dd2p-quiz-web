import test from 'node:test';
import assert from 'node:assert/strict';
import { getAnswerInput } from '../web/js/input.mjs';

test('辨識左右玩家的答題鍵', () => {
  assert.deepEqual(getAnswerInput('Digit3'), { player: 'left', answerIndex: 2 });
  assert.deepEqual(getAnswerInput('Equal'), { player: 'right', answerIndex: 2 });
});
