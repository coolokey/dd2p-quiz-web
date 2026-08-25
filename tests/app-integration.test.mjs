import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('應用程式依模式決定選角、按鍵測試與 CPU 角色', async () => {
  const source = await readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /requiredCharacterPlayers\(gameMode\)/);
  assert.match(source, /playersForKeyTest\(gameMode\)/);
  assert.match(source, /selectCpuCharacter\(/);
  assert.match(source, /cpuDifficulty/);
  assert.match(source, /createAnswerPositionState\(\)/);
  assert.match(source, /prepareQuestionRound\(currentQuiz\.questions, Math\.random, answerPositionState\)/);
});
