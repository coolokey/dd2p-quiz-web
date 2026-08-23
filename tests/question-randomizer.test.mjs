import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareQuestionRound, randomizeQuestion } from '../web/js/question-randomizer.mjs';

test('洗牌選項後正確答案索引仍指向原正確答案', () => {
  const original = { id: 'q1', prompt: '1x2=?', choices: ['2', '3', '1', '4'], answerIndex: 0 };
  const randomized = randomizeQuestion(original, () => 0);

  assert.equal(randomized.choices[randomized.answerIndex], '2');
  assert.equal(randomized.answerIndex, 3);
});

test('不修改原題目與原 choices 陣列', () => {
  const original = { prompt: 'Q', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 };
  const originalChoices = [...original.choices];
  randomizeQuestion(original, () => 0);
  assert.deepEqual(original.choices, originalChoices);
  assert.equal(original.answerIndex, 0);
});

test('支援 2 至 4 個選項並保留其他題目欄位', () => {
  for (const choices of [['A', 'B'], ['A', 'B', 'C'], ['A', 'B', 'C', 'D']]) {
    const result = randomizeQuestion({ id: 'q', image: './q.jpg', prompt: 'Q', choices, answerIndex: 0 }, () => 0);
    assert.equal(result.choices[result.answerIndex], 'A');
    assert.equal(result.id, 'q');
    assert.equal(result.image, './q.jpg');
  }
});

test('每一輪同時隨機排列題目順序與各題選項', () => {
  const questions = [
    { id: 'q1', prompt: 'Q1', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 },
    { id: 'q2', prompt: 'Q2', choices: ['甲', '乙', '丙', '丁'], answerIndex: 0 },
  ];
  const round = prepareQuestionRound(questions, () => 0);

  assert.deepEqual(round.map(question => question.id), ['q2', 'q1']);
  assert.equal(round[0].choices[round[0].answerIndex], '甲');
  assert.equal(round[1].choices[round[1].answerIndex], 'A');
  assert.notStrictEqual(round[0], questions[1]);
});
