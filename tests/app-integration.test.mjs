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
  assert.match(source, /import \{ bindMobileAnswerControls, setMobileAnswerControlsLocked, syncTouchCapabilityClass \} from '\.\/mobile-controls\.mjs';/);
  assert.match(source, /syncTouchCapabilityClass\(document\.documentElement, navigator\);/);
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

test('應用程式匯入暫停對話框焦點圈並將完整暫停狀態交給 renderer', async () => {
  const source = await readAppSource();
  const render = functionSource(source, 'renderGame', 'scheduleCpuForCurrentQuestion');

  assert.match(source, /import \{ PAUSE_ACTIONS, trapDialogTab \} from '\.\/battle-pause-menu\.mjs';/);
  assert.match(source, /let pauseRequested = false;/);
  assert.match(source, /let pauseConfirmAction = null;/);
  assert.match(source, /let pauseReturnFocus = null;/);
  assert.match(render, /manualPaused: battlePause\.isManualPaused\(\)/);
  assert.match(render, /pauseConfirmAction/);
  assert.match(render, /pausePending: pauseRequested/);
});

test('暫停請求在動畫中只鎖定輸入並就地顯示等待，不重繪或取消 lifecycle', async () => {
  const source = await readAppSource();
  const request = functionSource(source, 'requestManualPause', 'openManualPause');
  const animating = request.slice(request.indexOf('battleLifecycle.isAnimating()'));

  assert.match(request, /!hasLiveBattle\(\)[\s\S]*battlePause\.isManualPaused\(\)[\s\S]*pauseRequested/);
  assert.match(request, /pauseReturnFocus = document\.activeElement/);
  assert.match(animating, /pauseRequested = true/);
  assert.match(animating, /battleInputGate\.disable\(\)/);
  assert.match(animating, /querySelector\('\[data-pause-battle\]'\)/);
  assert.match(animating, /\.disabled = true/);
  assert.match(animating, /\.textContent = '等待本次攻擊結束……'/);
  assert.doesNotMatch(animating, /renderGame\(|battleLifecycle\.cancel\(|battlePause\.setManualPaused/);
  assert.match(request, /return openManualPause\(\)/);
});

test('開啟與繼續暫停依序控制 coordinator、音樂及重繪後焦點', async () => {
  const source = await readAppSource();
  const open = functionSource(source, 'openManualPause', 'continueBattle');
  const resume = functionSource(source, 'continueBattle', 'requestPauseAction');

  assert.match(open, /if \(!hasLiveBattle\(\)/);
  assert.match(open, /pauseRequested = false/);
  assert.match(open, /pauseConfirmAction = null/);
  assert.match(open, /audioManager\?\.pauseMusic\(\)[\s\S]*battlePause\.setManualPaused\(true\)/);
  assert.doesNotMatch(open, /querySelector\('\[data-pause-continue\]'\)\?\.focus\(\)/);
  assert.match(resume, /if \(!hasLiveBattle\(\)[\s\S]*!battlePause\.isManualPaused\(\)[\s\S]*pauseConfirmAction/);
  assert.match(resume, /battlePause\.setManualPaused\(false\)[\s\S]*void audioManager\?\.resumeMusic\(\)[\s\S]*querySelector\('\[data-pause-battle\]'\)\?\.focus\(\)/);
});

test('settlement 優先保留結束結果，未結束才兌現一次 pending pause', async () => {
  const source = await readAppSource();
  const settle = functionSource(source, 'settleBattleAnswer', 'processAnswer');
  const endedIndex = settle.indexOf('combatState?.ended');
  const pendingIndex = settle.indexOf('pauseRequested', endedIndex + 1);

  assert.notEqual(endedIndex, -1);
  assert.notEqual(pendingIndex, -1);
  assert.ok(endedIndex < pendingIndex, 'KO／結果狀態必須優先於 pending pause');
  assert.match(settle, /if \(combatState\?\.ended\) \{[\s\S]*pauseRequested = false;[\s\S]*return;/);
  assert.match(settle, /if \(pauseRequested\) \{[\s\S]*openManualPause\(\);[\s\S]*return;/);
  assert.match(settle, /if \(settlement\?\.renderBattle\) renderGame\(\)/);
});

test('暫停選單動作只開啟或取消確認且取消後仍維持 manual pause', async () => {
  const source = await readAppSource();
  const requestAction = functionSource(source, 'requestPauseAction', 'cancelPauseConfirmation');
  const cancel = functionSource(source, 'cancelPauseConfirmation', 'renderGame');

  assert.match(requestAction, /if \(!hasLiveBattle\(\)[\s\S]*!battlePause\.isManualPaused\(\)[\s\S]*pauseConfirmAction/);
  assert.match(requestAction, /pauseConfirmAction = action;[\s\S]*renderGame\(\)/);
  assert.match(cancel, /if \(!hasLiveBattle\(\)[\s\S]*!battlePause\.isManualPaused\(\)[\s\S]*!pauseConfirmAction/);
  assert.match(cancel, /pauseConfirmAction = null;[\s\S]*renderGame\(\)/);
  assert.doesNotMatch(cancel, /setManualPaused\(false\)/);
});

test('每次 render 只接一組暫停 handlers、三個 action、取消、確認與 dialog focus trap', async () => {
  const source = await readAppSource();
  const render = functionSource(source, 'renderGame', 'scheduleCpuForCurrentQuestion');

  assert.match(render, /querySelector\('\[data-pause-battle\]'\)[\s\S]*\.onclick = requestManualPause/);
  assert.match(render, /querySelector\('\[data-pause-continue\]'\)[\s\S]*\.onclick = continueBattle/);
  assert.match(render, /querySelectorAll\('\[data-pause-action\]'\)[\s\S]*requestPauseAction\(button\.dataset\.pauseAction\)/);
  assert.match(render, /querySelector\('\[data-pause-cancel\]'\)[\s\S]*\.onclick = cancelPauseConfirmation/);
  assert.match(render, /querySelector\('\[data-pause-confirm\]'\)[\s\S]*\.onclick = confirmPauseAction/);
  assert.equal((render.match(/\[data-pause-confirm\]/g) ?? []).length, 1);
  assert.match(render, /syncTopBattleDialog\(\)/);
});

test('暫停離場只接受固定 action，未知或缺少 action 不得執行', async () => {
  const source = await readAppSource();
  const requestAction = functionSource(source, 'requestPauseAction', 'cancelPauseConfirmation');
  const confirm = functionSource(source, 'confirmPauseAction', 'handleBattleOrientationChange');

  assert.match(requestAction, /Object\.values\(PAUSE_ACTIONS\)\.includes\(action\)/);
  assert.match(confirm, /Object\.values\(PAUSE_ACTIONS\)\.includes\(pauseConfirmAction\)/);
  assert.match(confirm, /const action = pauseConfirmAction;/);
  assert.match(confirm, /pauseConfirmAction = null;/);
  assert.ok(confirm.indexOf('pauseConfirmAction = null;') < confirm.indexOf('stopBattleActivity()'));
  assert.doesNotMatch(confirm, /location\.reload/);
});

test('clearBattleState 集中停止舊局並依需求保留 gameMode', async () => {
  const source = await readAppSource();
  const clear = functionSource(source, 'clearBattleState', 'cancelPendingStart');

  assert.match(clear, /\{ keepGameMode = false \} = \{\}/);
  assert.match(clear, /stopBattleActivity\(\)/);
  for (const assignment of [
    /currentQuiz = null/,
    /quizState = null/,
    /combatState = null/,
    /battleSettings = null/,
    /characterSelection = createCharacterSelection\(\)/,
    /activeQuestionIndex = null/,
    /attackState = createAttackState\(\)/,
    /answerPositionState = createAnswerPositionState\(\)/,
    /keyHits = new Set\(\)/,
    /keyTestPlayers = \[\]/,
    /timeLeft = 0/,
    /regulationLimit = 0/,
  ]) assert.match(clear, assignment);
  assert.match(clear, /if \(!keepGameMode\) gameMode = null/);
  assert.doesNotMatch(clear, /catalog =|battleManifest =|activeSubject =|muted =|audioVolumes/);
});

test('確認重新開始保留原題庫與完整設定，並透過既有 preparation 建立全新局', async () => {
  const source = await readAppSource();
  const confirm = functionSource(source, 'confirmPauseAction', 'handleBattleOrientationChange');
  const prepare = functionSource(source, 'prepareBattleStart', 'renderQuizError');
  const restart = confirm.slice(confirm.indexOf('case PAUSE_ACTIONS.restart'), confirm.indexOf('case PAUSE_ACTIONS.catalog'));

  assert.match(confirm, /const savedSettings = battleSettings;/);
  assert.match(restart, /stopBattleActivity\(\);[\s\S]*startGameOnce\(savedSettings\)/);
  assert.doesNotMatch(restart, /clearBattleState|currentQuiz = null|characterSelection = createCharacterSelection/);
  assert.match(prepare, /battleSettings = settings/);
  assert.match(prepare, /answerPositionState = createAnswerPositionState\(\)/);
  assert.match(prepare, /currentQuiz = \{ \.\.\.currentQuiz, activeQuestions: prepareQuestionRound\(currentQuiz\.questions, Math\.random, answerPositionState\) \}/);
  assert.match(prepare, /quizState = createGameState/);
  assert.match(prepare, /combatState = createBattleState\(\)/);
  assert.match(prepare, /activeQuestionIndex = null/);
  assert.match(prepare, /attackState = createAttackState\(\)/);
});

test('確認更換題庫保留模式但清空對戰，確認首頁則完整清空', async () => {
  const source = await readAppSource();
  const confirm = functionSource(source, 'confirmPauseAction', 'handleBattleOrientationChange');
  const catalog = confirm.slice(confirm.indexOf('case PAUSE_ACTIONS.catalog'), confirm.indexOf('case PAUSE_ACTIONS.home'));
  const home = confirm.slice(confirm.indexOf('case PAUSE_ACTIONS.home'));

  assert.match(confirm, /const savedGameMode = gameMode;/);
  assert.match(catalog, /clearBattleState\(\{ keepGameMode: true \}\);[\s\S]*gameMode = savedGameMode;[\s\S]*renderCatalog\(\)/);
  assert.match(home, /clearBattleState\(\);[\s\S]*renderStartScreen\(\)/);
  assert.match(source, /function returnToMainMenu\(\)[\s\S]*clearBattleState\(\);[\s\S]*renderStartScreen\(\)/);
});

test('直向返回按鈕先進入首頁確認，確認期間隱藏 blocker，取消後恢復直向暫停', async () => {
  const source = await readAppSource();
  const requestHome = functionSource(source, 'requestBattleHomeExit', 'handleBattleOrientationChange');
  const render = functionSource(source, 'renderGame', 'scheduleCpuForCurrentQuestion');
  const cancel = functionSource(source, 'cancelPauseConfirmation', 'requestBattleHomeExit');

  assert.match(requestHome, /if \(!hasLiveBattle\(\)\)[\s\S]*returnToMainMenu\(\)/);
  assert.match(requestHome, /audioManager\?\.pauseMusic\(\)/);
  assert.match(requestHome, /pauseConfirmAction = PAUSE_ACTIONS\.home/);
  assert.match(requestHome, /battlePause\.setManualPaused\(true\)/);
  assert.ok(requestHome.indexOf('pauseConfirmAction = PAUSE_ACTIONS.home') < requestHome.indexOf('battlePause.setManualPaused(true)'));
  assert.doesNotMatch(requestHome, /stopBattleActivity|clearBattleState/);
  assert.match(render, /orientationPaused: battlePause\.isOrientationPaused\(\) && !pauseConfirmAction/);
  assert.match(render, /\[data-return-main-menu\][\s\S]*\.onclick = requestBattleHomeExit/);
  assert.match(cancel, /pauseConfirmAction = null;[\s\S]*renderGame\(\)/);
  assert.doesNotMatch(cancel, /setManualPaused\(false\)/);
});

test('結果頁的題庫與首頁離場也會使用完整清理且不增加確認', async () => {
  const source = await readAppSource();
  const result = functionSource(source, 'renderResult');

  assert.match(result, /#catalog'[\s\S]*clearBattleState\(\{ keepGameMode: true \}\)[\s\S]*renderCatalog\(\)/);
  assert.match(result, /#main-menu'[\s\S]*returnToMainMenu/);
  assert.doesNotMatch(result, /requestPauseAction|confirmPauseAction/);
});

test('Escape 優先於遊戲鍵並依確認、暫停、live battle 順序處理', async () => {
  const source = await readAppSource();
  const keydown = source.slice(source.indexOf("document.addEventListener('keydown'"), source.indexOf('async function bootstrap'));
  const escapeIndex = keydown.indexOf("event.code === 'Escape'");
  const gameKeyIndex = keydown.indexOf('isGameKey(event.code)');

  assert.notEqual(escapeIndex, -1);
  assert.notEqual(gameKeyIndex, -1);
  assert.ok(escapeIndex < gameKeyIndex, 'Escape 必須在一般遊戲按鍵判斷前處理');
  assert.match(keydown, /event\.code === 'Escape'[\s\S]*hasLiveBattle\(\)[\s\S]*event\.preventDefault\(\)[\s\S]*event\.repeat/);
  assert.match(keydown, /pauseConfirmAction[\s\S]*cancelPauseConfirmation\(\)[\s\S]*battlePause\.isManualPaused\(\)[\s\S]*continueBattle\(\)[\s\S]*requestManualPause\(\)/);
});

test('pending pause 在離場與新局初始化都會清除，不會跨局污染', async () => {
  const source = await readAppSource();
  const reset = functionSource(source, 'resetManualPauseState', 'requestManualPause');
  const exit = functionSource(source, 'exitBattleOrientation', 'stopBattleActivity');
  const stop = functionSource(source, 'stopBattleActivity', 'cancelPendingStart');
  const prepare = functionSource(source, 'prepareBattleStart', 'renderQuizError');

  assert.match(reset, /pauseRequested = false/);
  assert.match(reset, /pauseConfirmAction = null/);
  assert.match(reset, /pauseReturnFocus = null/);
  assert.match(exit, /resetManualPauseState\(\)[\s\S]*orientationController\.exitBattle\(\)[\s\S]*battlePause\.reset\(\)/);
  assert.match(stop, /exitBattleOrientation\(\)/);
  assert.match(prepare, /resetManualPauseState\(\)[\s\S]*battleLifecycle\.reset\(\)[\s\S]*battleSession\.reset\(\)/);
});

test('交錯 pause reason 重繪後只同步最上層 dialog 的焦點與 Tab trap', async () => {
  const source = await readAppSource();
  const sync = functionSource(source, 'syncTopBattleDialog', 'renderGame');
  const render = functionSource(source, 'renderGame', 'scheduleCpuForCurrentQuestion');
  const requestAction = functionSource(source, 'requestPauseAction', 'cancelPauseConfirmation');
  const cancel = functionSource(source, 'cancelPauseConfirmation', 'handleBattleOrientationChange');
  const orientationIndex = sync.indexOf("querySelector('.orientation-blocker')");
  const pauseIndex = sync.indexOf("querySelector('.battle-pause-overlay')");

  assert.notEqual(orientationIndex, -1);
  assert.notEqual(pauseIndex, -1);
  assert.ok(orientationIndex < pauseIndex, 'orientation blocker 必須先於 manual pause dialog');
  assert.match(sync, /const dialog = orientationDialog \?\? pauseDialog/);
  assert.match(sync, /dialog\.onkeydown = event => trapDialogTab\(dialog, event\)/);
  assert.match(sync, /orientationDialog[\s\S]*\[data-return-main-menu\][\s\S]*pauseConfirmAction[\s\S]*\[data-pause-cancel\][\s\S]*\[data-pause-continue\]/);
  assert.match(sync, /focusTarget\?\.focus\(\)/);
  assert.match(render, /orientationPaused: battlePause\.isOrientationPaused\(\)[\s\S]*manualPaused: battlePause\.isManualPaused\(\)[\s\S]*pauseConfirmAction[\s\S]*syncTopBattleDialog\(\)/);
  assert.match(source, /renderBattle: \(\) => renderGame\(\)/);
  assert.match(source, /onVisibilityChange: battlePause\.setBackgroundPaused/);
  assert.doesNotMatch(requestAction, /querySelector\('\[data-pause-cancel\]'\)\?\.focus\(\)/);
  assert.doesNotMatch(cancel, /querySelector\(`\[data-pause-action=/);
});
