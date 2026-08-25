import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('應用程式依模式決定選角、按鍵測試與 CPU 角色', async () => {
  const source = await readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /getCharacterSelectionReadiness\(gameMode, characterSelection, battleManifest\.characters\)/);
  assert.match(source, /playersForKeyTest\(settings\.gameMode\)/);
  assert.match(source, /selectCpuCharacter\(/);
  assert.match(source, /cpuDifficulty/);
  assert.match(source, /createAnswerPositionState\(\)/);
  assert.match(source, /prepareQuestionRound\(currentQuiz\.questions, Math\.random, answerPositionState\)/);
});

test('單人模式在每題排程 CPU 並於換題及結束時取消', async () => {
  const source = await readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /createCpuController\(/);
  assert.match(source, /createBattleLifecycle\(/);
  assert.match(source, /createBattleSessionCoordinator\(/);
  assert.match(source, /battleLifecycle\.scheduleCpu\(/);
  assert.match(source, /lifecycle: battleLifecycle/);
  assert.match(source, /battleLifecycle\.submit\(/);
  assert.match(source, /battleLifecycle\.reset\(/);
  assert.match(source, /onSettled: settleBattleAnswer/);
  assert.match(source, /battleSession\.timerExpired\(/);
  assert.match(source, /battleSession\.questionAdvanced\(/);
  assert.match(source, /battleSession\.finishAnswer\(/);
  assert.match(source, /battleSession\.regulationEnded\(/);
  assert.match(source, /battleSession\.resultShown\(/);
  assert.match(source, /battleSession\.catalogOpened\(/);
  assert.match(source, /battleSession\.mainMenuOpened\(/);
  const timerHandler = source.slice(source.indexOf('function handleTimer'), source.indexOf('function ensureQuestion'));
  assert.match(timerHandler, /timeLeft <= 0[\s\S]*?battleSession\.timerExpired\(\)/);
});

test('開局題庫驗證失敗會停止對戰活動並顯示返回題庫入口', async () => {
  const source = await readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /function stopBattleActivity\(\)[\s\S]*battleSession\.stopBattleActivity\(\)/);
  assert.match(source, /runStartSession\(\{[\s\S]*onCancel: stopBattleActivity[\s\S]*onError: renderQuizError/);
  assert.match(source, /function renderQuizError\([\s\S]*題庫錯誤[\s\S]*返回題庫/);
});

test('初始資料與個別題庫均使用可降級、會檢查 HTTP 的載入器', async () => {
  const source = await readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /loadBootstrapResources\(fetch\)/);
  assert.match(source, /load: \(\) => fetchJson\(item\.file, fetch\)/);
  assert.match(source, /renderQuizLoadFailure\(item, error\)/);
  assert.match(source, /onRetry: bootstrap/);
});

test('應用程式實際共用 latest session gate 保護資料載入與開局', async () => {
  const source = await readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
  assert.match(source, /createLatestSessionGate/);
  assert.match(source, /runLatestRequest\(/);
  assert.match(source, /runStartSession\(/);
  assert.match(source, /bootstrapRequestGate/);
  assert.match(source, /quizRequestGate/);
  assert.match(source, /startSessionGate/);
});
