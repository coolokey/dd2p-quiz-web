import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestion } from '../scripts/lib/question-validator.mjs';

test('拒絕答案不在選項範圍內的題目', () => {
  assert.deepEqual(validateQuestion({ prompt: 'Q', choices: ['A', 'B'], answerIndex: 3 }), {
    valid: false,
    reason: '答案索引不在選項範圍內',
  });
});
