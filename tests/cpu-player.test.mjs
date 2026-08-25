import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CPU_DIFFICULTIES,
  chooseCpuAnswer,
  createCpuController,
  getCpuDelay,
} from '../web/js/cpu-player.mjs';

test('三種難度具有核准的等待範圍與答對率', () => {
  assert.deepEqual(CPU_DIFFICULTIES.easy, { minDelay: 4000, maxDelay: 7000, accuracy: 0.5 });
  assert.deepEqual(CPU_DIFFICULTIES.normal, { minDelay: 2500, maxDelay: 5000, accuracy: 0.7 });
  assert.deepEqual(CPU_DIFFICULTIES.hard, { minDelay: 1500, maxDelay: 3500, accuracy: 0.9 });
  assert.equal(getCpuDelay('normal', () => 0), 2500);
  assert.equal(getCpuDelay('normal', () => 1), 5000);
});

test('命中答對率時選正解，否則從錯誤選項隨機選擇', () => {
  const question = { choices: ['A', 'B', 'C', 'D'], answerIndex: 2 };
  assert.equal(chooseCpuAnswer(question, 'normal', () => 0.1), 2);
  const values = [0.99, 0.5];
  assert.notEqual(chooseCpuAnswer(question, 'normal', () => values.shift()), 2);
});

test('取消後舊計時器不得提交答案', () => {
  const scheduled = [];
  const cleared = [];
  const cpu = createCpuController({
    setTimer: (callback, delay) => (scheduled.push({ callback, delay }), scheduled.length),
    clearTimer: id => cleared.push(id),
    random: () => 0,
  });
  const answers = [];
  cpu.schedule({ question: { choices: ['A', 'B'], answerIndex: 0 }, difficulty: 'easy', onAnswer: answer => answers.push(answer) });
  cpu.cancel();
  scheduled[0].callback();
  assert.deepEqual(answers, []);
  assert.deepEqual(cleared, [1]);
});
