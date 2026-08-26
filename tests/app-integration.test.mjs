import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readAppSource = () => readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should exist after ${name}`);
  return source.slice(start, end);
}

test('應用程式依模式決定選角、按鍵測試與 CPU 角色', async () => {
  const source = await readAppSource();
  assert.match(source, /getCharacterSelectionReadiness\(gameMode, characterSelection, battleManifest\.characters\)/);
  assert.match(source, /playersForKeyTest\(settings\.gameMode\)/);
  assert.match(source, /selectCpuCharacter\(/);
  assert.match(source, /cpuDifficulty/);
  assert.match(source, /createAnswerPositionState\(\)/);
  assert.match(source, /prepareQuestionRound\(currentQuiz\.questions, Math\.random, answerPositionState\)/);
});

test('單人模式在每題排程 CPU 並於換題及結束時取消', async () => {
  const source = await readAppSource();
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
  const source = await readAppSource();
  assert.match(source, /function stopBattleActivity\(\)[\s\S]*battleSession\.stopBattleActivity\(\)/);
  assert.match(source, /runStartSession\(\{[\s\S]*onCancel: stopBattleActivity[\s\S]*onError: renderQuizError/);
  assert.match(source, /function renderQuizError\([\s\S]*題庫錯誤[\s\S]*返回題庫/);
});

test('初始資料與個別題庫均使用可降級、會檢查 HTTP 的載入器', async () => {
  const source = await readAppSource();
  assert.match(source, /loadBootstrapResources\(fetch\)/);
  assert.match(source, /load: \(\) => fetchJson\(item\.file, fetch\)/);
  assert.match(source, /renderQuizLoadFailure\(item, error\)/);
  assert.match(source, /onRetry: bootstrap/);
});

test('應用程式實際共用 latest session gate 保護資料載入與開局', async () => {
  const source = await readAppSource();
  assert.match(source, /createLatestSessionGate/);
  assert.match(source, /runLatestRequest\(/);
  assert.match(source, /runStartSession\(/);
  assert.match(source, /bootstrapRequestGate/);
  assert.match(source, /quizRequestGate/);
  assert.match(source, /startSessionGate/);
});

test('開局完成前與所有離場路徑會關閉答案輸入', async () => {
  const source = await readAppSource();
  assert.match(source, /createBattleInputGate/);
  assert.match(source, /disableInput: battleInputGate\.disable/);
  assert.match(source, /enableInput: \(\) => \{ if \(!battlePause\.isPaused\(\)\) battleInputGate\.enable\(\); \}/);
  assert.match(source, /function processAnswer\(input\) \{[\s\S]*battleInputGate\.run/);
  assert.match(source, /if \(input && battleInputGate\.isEnabled\(\)/);
});

test('應用程式匯入並建立螢幕方向與觸控作答整合', async () => {
  const source = await readAppSource();

  assert.match(source, /import \{ createBattleOrientationController, createBattlePauseCoordinator \} from '\.\/battle-orientation\.mjs';/);
  assert.match(source, /import \{ bindMobileAnswerControls, setMobileAnswerControlsLocked \} from '\.\/mobile-controls\.mjs';/);
  assert.match(source, /createBattlePauseCoordinator\(/);
  assert.match(source, /createBattleOrientationController\(\{[\s\S]*onPortraitChange: handleBattleOrientationChange[\s\S]*\}\)/);
  assert.match(source, /orientationController\.enterBattle\(\)\.catch\(/);
});

test('原有鍵盤映射、按鍵測試與單人右方防護仍保留', async () => {
  const source = await readAppSource();
  const keydown = source.slice(source.indexOf("document.addEventListener('keydown'"), source.indexOf('async function bootstrap'));

  assert.match(source, /document\.addEventListener\('keydown', event => \{/);
  assert.match(keydown, /recordKeyTestKey\(/);
  assert.match(keydown, /isKeyTestComplete\(/);
  assert.match(keydown, /const input = getAnswerInput\(event\.code\);/);
  assert.match(keydown, /battleSettings\?\.gameMode !== GAME_MODES\.solo \|\| input\.player !== 'right'/);
  assert.match(keydown, /void processAnswer\(input\)/);
});

test('對戰 timer 只會在橫向、計時且未結束時建立一次', async () => {
  const source = await readAppSource();
  const timer = functionSource(source, 'startBattleTimer', 'stopBattleActivity');

  assert.match(timer, /timerId !== null/);
  assert.match(timer, /battlePause\.isPaused\(\)/);
  assert.match(timer, /battleSettings\?\.mode !== 'time'/);
  assert.match(timer, /combatState\?\.ended/);
  assert.match(timer, /timerId = setInterval\(handleTimer, 1000\)/);
});

test('直向暫停與橫向恢復依序管理輸入、CPU、timer 與畫面', async () => {
  const source = await readAppSource();
  const orientation = functionSource(source, 'handleBattleOrientationChange', 'startBattleTimer');

  assert.match(orientation, /return battlePause\.setOrientationPaused\(portrait\)/);
  assert.match(source, /disableInput: \(\) => battleInputGate\.disable\(\)[\s\S]*pauseCpu: pauseBattleCpu[\s\S]*clearTimer: clearBattleTimer[\s\S]*renderBattle: \(\) => renderGame\(\)[\s\S]*resumeCpu: \(\) => cpuController\.resume\(\)[\s\S]*enableInput: \(\) => battleInputGate\.enable\(\)[\s\S]*startTimer: startBattleTimer/);
});

test('直向時不排程 CPU 作答', async () => {
  const source = await readAppSource();
  const scheduler = functionSource(source, 'scheduleCpuForCurrentQuestion', 'battleQuestionKey');

  assert.match(scheduler, /if \(battlePause\.isPaused\(\)\) return false;/);
  assert.match(scheduler, /return battleLifecycle\.scheduleCpu\(/);
});

test('對戰結果、題庫、主選單、開局失敗與停止活動都會清理方向狀態', async () => {
  const source = await readAppSource();
  const cleanup = functionSource(source, 'exitBattleOrientation', 'stopBattleActivity');
  const stop = functionSource(source, 'stopBattleActivity', 'cancelPendingStart');
  const mainMenu = functionSource(source, 'renderStartScreen', 'renderStartHelp');
  const catalog = functionSource(source, 'renderCatalog', 'selectQuiz');
  const startError = functionSource(source, 'renderQuizError', 'handleTimer');
  const result = functionSource(source, 'renderResult');

  assert.match(cleanup, /orientationController\.exitBattle\(\);[\s\S]*battlePause\.reset\(\);/);
  for (const block of [stop, mainMenu, catalog, result]) {
    assert.match(block, /exitBattleOrientation\(\)/);
  }
  assert.match(startError, /stopBattleActivity\(\)/);
  assert.match(stop, /battleInputGate\.disable\(\);[\s\S]*battleSession\.stopBattleActivity\(\)/);
  assert.match(source, /onCancel: stopBattleActivity/);
});

test('每次對戰渲染都傳入行動狀態、綁定觸控並共用 processAnswer', async () => {
  const source = await readAppSource();
  const render = functionSource(source, 'renderGame', 'scheduleCpuForCurrentQuestion');

  assert.match(render, /gameMode: battleSettings\.gameMode/);
  assert.match(render, /eligiblePlayers: quizState\.eligiblePlayers/);
  assert.match(render, /mobileInputLocked: battleLifecycle\.isAnimating\(\)/);
  assert.match(render, /orientationPaused/);
  assert.match(render, /bindMobileAnswerControls\(app, \{ onAnswer: input => void processAnswer\(input\) \}\)/);
  assert.match(render, /\[data-return-main-menu\]/);
  assert.match(source, /function returnToMainMenu\(\)[\s\S]*renderStartScreen\(\)/);
});

test('作答動畫會鎖定觸控，處理失敗會 await 並復原最新戰鬥', async () => {
  const source = await readAppSource();
  const animation = functionSource(source, 'animateBattleAnswer', 'renderCorrectAnswerReveal');
  const answer = functionSource(source, 'processAnswer', 'renderResult');

  assert.match(animation, /setMobileAnswerControlsLocked\(app, true\)/);
  assert.match(source, /async function processAnswer\(input\)/);
  assert.match(answer, /return await battleInputGate\.run\(\(\) => battleLifecycle\.submit\(input\)\)/);
  assert.match(answer, /catch \(error\)/);
  assert.match(answer, /console\.error\([\s\S]*error[\s\S]*phase:[\s\S]*questionIndex:/);
  assert.match(answer, /battleLifecycle\.cancel\(\)/);
  assert.match(answer, /cpuController\.cancel\(\)/);
  assert.match(answer, /if \(!combatState\?\.ended[\s\S]*renderGame\(\);[\s\S]*if \(!battlePause\.isPaused\(\)\) battleInputGate\.enable\(\);/);
  assert.match(answer, /return false;/);
});

test('CPU 作答也共用會捕捉 lifecycle 拒絕的 processAnswer', async () => {
  const source = await readAppSource();

  assert.match(source, /submitCpuAnswer: input => processAnswer\(input\)/);
  assert.doesNotMatch(source, /submitCpuAnswer: input => battleLifecycle\.submit\(input\)/);
});

test('使用者開局入口在任何非同步載入前立即請求對戰方向', async () => {
  const source = await readAppSource();
  const startEntry = source.slice(source.indexOf('const startGameOnce'), source.indexOf('const storedVolume'));
  const start = functionSource(source, 'startGame', 'prepareBattleStart');

  assert.match(startEntry, /requestBattleOrientation\(\);[\s\S]*return startGame\(settings\)/);
  assert.match(source, /function requestBattleOrientation\(\)[\s\S]*orientationController\.enterBattle\(\)\.catch\(/);
  assert.match(start, /prepare: \(\) => \{[\s\S]*prepareBattleStart\(settings\);[\s\S]*orientationController\.refresh\(\);[\s\S]*\}[\s\S]*stages:/);
  assert.doesNotMatch(start, /if \(started\)[\s\S]*orientationController\.enterBattle/);
});

test('背景暫停與直向遮罩分離，並同時防止 timer、CPU 與錯誤復原過早開放', async () => {
  const source = await readAppSource();
  const timer = functionSource(source, 'startBattleTimer', 'exitBattleOrientation');
  const scheduler = functionSource(source, 'scheduleCpuForCurrentQuestion', 'battleQuestionKey');
  const answer = functionSource(source, 'processAnswer', 'renderResult');
  const cleanup = functionSource(source, 'exitBattleOrientation', 'stopBattleActivity');

  assert.match(source, /createBattlePauseCoordinator\(/);
  assert.match(source, /onVisibilityChange: battlePause\.setBackgroundPaused/);
  assert.match(timer, /battlePause\.isPaused\(\)/);
  assert.match(scheduler, /if \(battlePause\.isPaused\(\)\) return false;/);
  assert.match(answer, /if \(!battlePause\.isPaused\(\)\) battleInputGate\.enable\(\);/);
  assert.match(cleanup, /battlePause\.reset\(\)/);
  assert.match(source, /orientationPaused: battlePause\.isOrientationPaused\(\)/);
});

test('visibility 恢復先重新核對方向，再由背景狀態決定是否恢復', async () => {
  const source = await readAppSource();
  const controllerSource = await readFile(new URL('../web/js/battle-orientation.mjs', import.meta.url), 'utf8');

  assert.match(source, /onPortraitChange: handleBattleOrientationChange/);
  assert.match(source, /onVisibilityChange: battlePause\.setBackgroundPaused/);
  assert.match(controllerSource, /function handleVisibilityChange\(\)[\s\S]*sync\(\);[\s\S]*syncVisibility\(\);/);
  assert.match(controllerSource, /addListener\(document, 'visibilitychange', handleVisibilityChange\)/);
});
