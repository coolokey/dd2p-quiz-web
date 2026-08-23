import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestionRecord } from '../scripts/lib/question-parser.mjs';

test('解析 A_QuizBase 的四選一文字題', () => {
  const question = parseQuestionRecord('Type=0&Q=1x1=?&A1=1&A2=2&A3=3&A4=4&A=1&okflag=1');
  assert.deepEqual(question, {
    type: 0,
    prompt: '1x1=?',
    choices: ['1', '2', '3', '4'],
    answerIndex: 0,
  });
});
