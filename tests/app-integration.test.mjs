import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBattleAppHarness, flushMicrotasks } from './helpers/battle-app-harness.mjs';

const readAppSource = () => readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8');
const readReadme = () => readFile(new URL('../README.md', import.meta.url), 'utf8');

test('動畫失敗仍將 pending pause 轉為可繼續及安全離場的手動暫停', async t => {
  const diagnostic = t.mock.method(console, 'error', () => {});
  const h = await createBattleAppHarness({ gameMode: 'local' });
  t.after(() => h.api.stopBattleActivity());
  const answer = h.api.processAnswer({ player: 'left', answerIndex: 1 - h.api.question.answerIndex });
  const quizAfterAnswer = structuredClone(h.api.quizState);
  const combatAfterAnswer = structuredClone(h.api.combatState);
  assert.equal(h.api.requestManualPause(), true);
  const failure = new Error('animation failed');
  h.animations[0].resolve(Promise.reject(failure));
  assert.equal(await answer, false, '保留既有作答錯誤回傳');
  assert.equal(diagnostic.mock.calls.length, 1);
  assert.equal(diagnostic.mock.calls[0].arguments[1].error, failure);
  assert.equal(h.api.pausePending, false);
  assert.equal(h.api.manualPaused, true);
  assert.equal(h.api.animating, false);
  assert.equal(h.api.inputEnabled, false);
  assert.ok(h.app.querySelector('[data-pause-continue]'));
  assert.equal(h.clock.timers.filter(timer => timer.active).length, 0);
  assert.deepEqual(h.api.quizState, quizAfterAnswer);
  assert.deepEqual(h.api.combatState, combatAfterAnswer);

  assert.equal(h.api.continueBattle(), true);
  assert.equal(h.api.continueBattle(), false);
  assert.equal(h.api.inputEnabled, true);
  assert.equal(h.clock.timers.filter(timer => timer.active && timer.interval).length, 1);
  const nextAnswer = h.api.processAnswer({ player: 'right', answerIndex: h.api.question.answerIndex });
  await h.clock.tick(1000);
  h.animations[1].resolve();
  assert.equal(await nextAnswer, true);
  assert.equal(h.api.combatState.scores.right, 1);
  assert.equal(h.api.quizState.questionIndex, quizAfterAnswer.questionIndex + 1);
  h.api.requestManualPause();
  assert.equal(h.api.requestPauseAction('home'), true);
  assert.equal(h.api.confirmPauseAction(), true);
  assert.equal(h.api.combatState, null);
  assert.equal(h.clock.timers.filter(timer => timer.active).length, 0);
});

test('動畫失敗後繼續仍保留直向與背景暫停，全部解除才恢復單一 CPU 與 timer', async t => {
  t.mock.method(console, 'error', () => {});
  const h = await createBattleAppHarness();
  t.after(() => h.api.stopBattleActivity());
  const answer = h.api.processAnswer({ player: 'left', answerIndex: 1 - h.api.question.answerIndex });
  await h.clock.tick(2500); // The CPU answer is queued behind this animation.
  h.api.requestManualPause();
  h.api.orientation(true);
  h.api.background(true);
  h.animations[0].resolve(Promise.reject(new Error('animation failed')));
  assert.equal(await answer, false);
  assert.equal(h.api.pausePending, false);
  assert.equal(h.api.manualPaused, true);
  assert.equal(h.api.continueBattle(), true);
  h.api.orientation(false);
  assert.equal(h.api.paused, true);
  assert.equal(h.api.inputEnabled, false);
  assert.equal(h.audios[0].paused, true);
  assert.equal(h.clock.timers.filter(timer => timer.active).length, 0);
  await h.clock.tick(5000);
  assert.equal(h.api.combatState.scores.right, 0);

  h.api.background(false);
  assert.equal(h.api.inputEnabled, true);
  assert.equal(h.clock.timers.filter(timer => timer.active && timer.interval).length, 1);
  assert.equal(h.clock.timers.filter(timer => timer.active && !timer.interval).length, 1);
  await h.clock.tick(2500);
  assert.equal(h.api.combatState.scores.right, 1, '錯誤復原取消舊 CPU，僅接受新排程一次');
  assert.equal(h.animations.length, 2);
  await h.clock.tick(1000);
  h.animations[1].resolve();
  await flushMicrotasks();
  assert.equal(h.api.quizState.questionIndex, 1);
  assert.equal(h.api.combatState.scores.right, 1);
  assert.deepEqual(h.settlements, ['after', 'settled']);
});

test('pending pause 會在已排隊 CPU 被輸入閘門阻擋後完成一次結算', async () => {
  const h = await createBattleAppHarness();
  const answer = h.api.processAnswer({ player: 'left', answerIndex: 1 - h.api.question.answerIndex });
  await h.clock.tick(2500); // CPU has already reached the lifecycle queue.
  const rolls = h.cpuRandomCalls.length;
  assert.equal(h.animations.length, 1);
  h.api.requestManualPause();
  assert.equal(h.api.manualPaused, false);
  assert.equal(h.api.animating, true);
  h.animations[0].resolve();
  await answer;
  assert.equal(h.api.manualPaused, true);
  assert.equal(h.api.pausePending, false);
  assert.deepEqual(h.settlements, ['after', 'settled']);
  assert.equal(h.api.combatState.scores.right, 0);
  h.api.continueBattle();
  await flushMicrotasks();
  assert.equal(h.api.combatState.scores.right, 1);
  assert.equal(h.cpuRandomCalls.length, rolls, '已到期答案須以原答案、零剩餘等待恢復');
  assert.equal(h.animations.length, 2);
  h.api.continueBattle();
  assert.equal(h.api.combatState.scores.right, 1);
  h.api.stopBattleActivity();
  await h.clock.tick(1000);
  h.animations[1].resolve();
  await flushMicrotasks();
});

test('pending pause 立即封鎖所有恢復路徑且保留 CPU 原剩餘等待', async () => {
  const h = await createBattleAppHarness();
  const answer = h.api.processAnswer({ player: 'left', answerIndex: 1 - h.api.question.answerIndex });
  await h.clock.tick(400);
  const originalMarkup = h.app.innerHTML;
  const staleCpuTimer = h.clock.timers.find(timer => timer.active && !timer.interval);
  h.api.requestManualPause();
  staleCpuTimer.callback();
  assert.equal(h.api.paused, true);
  assert.equal(h.api.remainingCpu, 2100);
  assert.equal(h.app.innerHTML, originalMarkup, 'pending 不重繪或取消目前動畫');
  assert.equal(h.api.manualPaused, false);
  h.api.orientation(true);
  h.api.background(true);
  h.api.orientation(false);
  h.api.background(false);
  assert.equal(h.api.inputEnabled, false);
  assert.equal(h.api.startBattleTimer(), false);
  assert.equal(h.clock.timers.filter(timer => timer.active).length, 0);
  const time = h.api.timeLeft;
  h.api.handleTimer(); // An interval task already queued by the browser.
  assert.equal(h.api.timeLeft, time);
  h.animations[0].resolve();
  await answer;
  assert.equal(h.api.manualPaused, true);
  h.api.orientation(true);
  h.api.continueBattle();
  await h.clock.tick(5000);
  assert.equal(h.api.combatState.scores.right, 0);
  h.api.orientation(false);
  const cpuTimer = h.clock.timers.filter(timer => timer.active && !timer.interval);
  assert.equal(cpuTimer.length, 1);
  assert.equal(h.clock.timers.filter(timer => timer.active && timer.interval).length, 1);
  assert.equal(cpuTimer[0].delay, 2100);
  await h.clock.tick(2099);
  assert.equal(h.api.combatState.scores.right, 0);
  await h.clock.tick(1);
  assert.equal(h.api.combatState.scores.right, 1);
  h.api.stopBattleActivity();
  await h.clock.tick(1000);
  h.animations[1].resolve();
  await flushMicrotasks();
});

test('手動繼續不會越過直向暫停恢復 BGM，背景切換也共用音樂狀態', async () => {
  const h = await createBattleAppHarness({ gameMode: 'local' });
  const music = h.audios[0];
  h.api.requestManualPause();
  h.api.orientation(true);
  h.api.continueBattle();
  assert.equal(music.paused, true);
  assert.equal(music.playCount, 1);
  assert.equal(music.currentTime, 37);
  h.api.background(true);
  h.api.orientation(false);
  assert.equal(music.playCount, 1);
  h.api.background(false);
  assert.equal(music.playCount, 2);
  h.api.background(true);
  assert.equal(music.paused, true);
  h.api.setMuted(true);
  h.api.background(false);
  assert.equal(music.playCount, 2);
  h.api.orientation(true);
  h.api.setMuted(false);
  assert.equal(music.playCount, 2, '解除靜音不得越過新暫停');
  h.api.orientation(false);
  assert.equal(music.playCount, 3);
  h.api.stopBattleActivity();
});

test('開局音樂在已存在直向暫停時仍受 aggregate pause 控制', async () => {
  const h = await createBattleAppHarness({ gameMode: 'local' });
  h.api.stopBattleActivity();
  h.viewport.innerWidth = 390;
  h.viewport.innerHeight = 844;
  await h.api.startGameOnce(h.api.settings);
  const music = h.audios.filter(audio => audio.src === 'music.mp3').at(-1);
  assert.equal(h.api.paused, true);
  assert.equal(music.paused, true);
  assert.equal(music.playCount, 0, '暫停已成立時，新 BGM 不應先播放再暫停');
  h.api.orientation(false);
  assert.equal(music.playCount, 1);
  h.api.stopBattleActivity();
});

test('Esc 繼續後若直向遮罩仍在，焦點與 Tab 圈留在可見最上層', async () => {
  const h = await createBattleAppHarness({ gameMode: 'local' });
  h.api.requestManualPause();
  h.api.orientation(true);
  h.document.dispatch('keydown', { code: 'Escape', preventDefault() {} });
  const dialog = h.app.querySelector('.orientation-blocker');
  const home = dialog.querySelector('[data-return-main-menu]');
  assert.equal(h.document.activeElement, home);
  let prevented = 0;
  for (const shiftKey of [false, true]) {
    dialog.onkeydown({ key: 'Tab', shiftKey, preventDefault() { prevented += 1; } });
    assert.equal(h.document.activeElement, home);
  }
  assert.equal(prevented, 2);
  h.api.orientation(false);
  h.api.requestManualPause();
  h.api.continueBattle();
  assert.equal(h.document.activeElement, h.app.querySelector('[data-pause-battle]'));
  h.api.stopBattleActivity();
});

for (const exit of ['stop', 'restart', 'catalog', 'home']) {
  test(`${exit} 離場後取消延遲 weapon 並封鎖 post-await hit／hurt`, async () => {
    const h = await createBattleAppHarness({ gameMode: 'local' });
    const answer = h.api.processAnswer({ player: 'left', answerIndex: h.api.question.answerIndex });
    const delayed = h.clock.timers.filter(timer => timer.active && !timer.interval);
    assert.equal(delayed.length, 2, 'weapon 與 impact 各有一個排程');
    if (exit !== 'stop') {
      h.api.orientation(true);
      h.api.requestBattleHomeExit();
      if (exit !== 'home') {
        h.api.cancelPauseConfirmation();
        h.api.requestPauseAction(exit);
      }
      h.api.confirmPauseAction();
    } else {
      h.api.stopBattleActivity();
    }
    const combatSounds = () => h.audios.filter(audio => ['weapon.mp3', 'hit.mp3', 'hurt.mp3'].includes(audio.src));
    const soundsAfterExit = combatSounds().length;
    for (const timer of delayed) timer.callback(); // Also simulate an already queued stale browser callback.
    await h.clock.tick(1000);
    h.animations[0].resolve();
    await answer;
    assert.equal(combatSounds().length, soundsAfterExit);
    assert.ok(delayed.some(timer => !timer.active), '離場必須實際取消待播音效 timer');
    assert.deepEqual(h.settlements, []);
    h.api.stopBattleActivity();
  });
}

test('仍在本局的完整攻擊於 swing／impact 時各播放一次音效', async () => {
  const h = await createBattleAppHarness({ gameMode: 'local' });
  const answer = h.api.processAnswer({ player: 'left', answerIndex: h.api.question.answerIndex });
  const timers = h.clock.timers.filter(timer => timer.active && !timer.interval).sort((a, b) => a.delay - b.delay);
  await h.clock.tick(timers[0].delay - 1);
  assert.equal(h.audios.filter(audio => audio.src === 'weapon.mp3').length, 0);
  await h.clock.tick(1);
  assert.equal(h.audios.filter(audio => audio.src === 'weapon.mp3').length, 1);
  await h.clock.tick(timers[1].delay - timers[0].delay);
  assert.equal(h.audios.filter(audio => audio.src === 'hit.mp3').length, 1);
  assert.equal(h.audios.filter(audio => audio.src === 'hurt.mp3').length, 1);
  h.animations[0].resolve();
  await answer;
  assert.deepEqual(h.settlements, ['after', 'settled']);
  h.api.stopBattleActivity();
});

test('清理待播音效時即使 Audio 或瀏覽器 timer API 不再可用也不拋錯', async () => {
  const h = await createBattleAppHarness({ gameMode: 'local' });
  const answer = h.api.processAnswer({ player: 'left', answerIndex: h.api.question.answerIndex });
  h.api.disposeAudio();
  h.api.removeTimerApis();
  assert.doesNotThrow(() => h.api.stopBattleActivity());
  await h.clock.tick(1000);
  h.animations[0].resolve();
  assert.equal(await answer, false);
});

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should exist after ${name}`);
  return source.slice(start, end);
}

test('README 說明完整暫停操作、確認需求與直向返回流程', async () => {
  const readme = await readReadme();
  assert.match(readme, /頂端「Ⅱ 暫停」[\s\S]*鍵盤 `Esc`/);
  assert.match(readme, /繼續[\s\S]*重新開始本局[\s\S]*更換題庫[\s\S]*返回首頁/);
  assert.match(readme, /重新開始本局、更換題庫與返回首頁[\s\S]*需要確認/);
  assert.match(readme, /直向[\s\S]*返回首頁[\s\S]*確認/);
  assert.doesNotMatch(readme, /轉回橫向以繼續，或按「返回主選單」離開本局/);
});

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

test('開局題庫驗證失敗會保留模式、清空部分初始化狀態並顯示返回題庫入口', async () => {
  const source = await readAppSource();
  const startError = functionSource(source, 'renderQuizError', 'handleTimer');
  assert.match(source, /function stopBattleActivity\(\)[\s\S]*battleSession\.stopBattleActivity\(\)/);
  assert.match(source, /runStartSession\(\{[\s\S]*onCancel: stopBattleActivity[\s\S]*onError: renderQuizError/);
  assert.match(startError, /clearBattleState\(\{ keepGameMode: true \}\)/);
  assert.ok(startError.indexOf('clearBattleState') < startError.indexOf('app.innerHTML'));
  assert.match(startError, /題庫錯誤[\s\S]*返回題庫[\s\S]*#back-catalog'[\s\S]*renderCatalog/);
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

test('原有鍵盤與新增手把映射、按鍵測試與單人右方防護仍保留', async () => {
  const source = await readAppSource();
  const inputHandler = source.slice(source.indexOf('function handleGameCodeInput'), source.indexOf('async function bootstrap'));

  assert.match(source, /import \{ createGamepadState, pollGamepadEvents \} from '\.\/gamepad-input\.mjs';/);
  assert.match(source, /document\.addEventListener\('keydown', event => \{/);
  assert.match(inputHandler, /recordKeyTestKey\(/);
  assert.match(inputHandler, /isKeyTestComplete\(/);
  assert.match(inputHandler, /const input = getAnswerInput\(code\);/);
  assert.match(inputHandler, /battleSettings\?\.gameMode !== GAME_MODES\.solo \|\| input\.player !== 'right'/);
  assert.match(inputHandler, /void processAnswer\(input\)/);
  assert.match(source, /startGamepadLoop\(\)/);
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
  assert.match(source, /disableInput: \(\) => battleInputGate\.disable\(\)[\s\S]*pauseCpu: pauseBattleCpu[\s\S]*clearTimer: clearBattleTimer[\s\S]*renderBattle: \(\) => renderGame\(\)[\s\S]*resumeCpu: \(\) => battleLifecycle\.resumeCpu\(\)[\s\S]*enableInput: \(\) => battleInputGate\.enable\(\)[\s\S]*startTimer: startBattleTimer/);
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
  assert.match(startError, /clearBattleState\(\{ keepGameMode: true \}\)/);
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
  assert.doesNotMatch(source, /let pauseRequested/);
  assert.match(source, /let pauseConfirmAction = null;/);
  assert.match(source, /let pauseReturnFocus = null;/);
  assert.match(render, /manualPaused: battlePause\.isManualPaused\(\)/);
  assert.match(render, /pauseConfirmAction/);
  assert.match(render, /pausePending: battlePause\.isPausePending\(\)/);
});

test('動畫中暫停交給協調器並就地顯示等待，不重繪或取消 lifecycle', async () => {
  const source = await readAppSource();
  const request = functionSource(source, 'requestManualPause', 'openManualPause');
  const animating = request.slice(request.indexOf('battleLifecycle.isAnimating()'));

  assert.match(request, /!hasLiveBattle\(\)[\s\S]*battlePause\.isManualPaused\(\)[\s\S]*battlePause\.isPausePending\(\)/);
  assert.match(request, /pauseReturnFocus = document\.activeElement/);
  assert.match(animating, /battlePause\.setPausePending\(true\)/);
  assert.match(animating, /querySelector\('\[data-pause-battle\]'\)/);
  assert.match(animating, /\.disabled = true/);
  assert.match(animating, /\.textContent = '等待本次攻擊結束……'/);
  assert.doesNotMatch(animating, /renderGame\(|battleLifecycle\.cancel\(|battlePause\.setManualPaused/);
  assert.match(request, /return openManualPause\(\)/);
});

test('開啟與繼續由 coordinator 控制 aggregate 音樂，焦點只返回無遮罩畫面', async () => {
  const source = await readAppSource();
  const open = functionSource(source, 'openManualPause', 'continueBattle');
  const resume = functionSource(source, 'continueBattle', 'requestPauseAction');

  assert.match(open, /if \(!hasLiveBattle\(\)/);
  assert.match(open, /pauseConfirmAction = null/);
  assert.match(open, /battlePause\.setManualPaused\(true\)/);
  assert.match(source, /pauseMusic: \(\) => audioManager\?\.pauseMusic\(\)/);
  assert.match(source, /resumeMusic: \(\) => \{ void audioManager\?\.resumeMusic\(\); \}/);
  assert.doesNotMatch(open, /querySelector\('\[data-pause-continue\]'\)\?\.focus\(\)/);
  assert.match(resume, /if \(!hasLiveBattle\(\)[\s\S]*!battlePause\.isManualPaused\(\)[\s\S]*pauseConfirmAction/);
  assert.match(resume, /battlePause\.setManualPaused\(false\)[\s\S]*if \(!syncTopBattleDialog\(\)\) app\.querySelector\('\[data-pause-battle\]'\)\?\.focus\(\)/);
  assert.doesNotMatch(open + resume, /audioManager/);
});

test('settlement 優先保留結束結果，未結束才兌現一次 pending pause', async () => {
  const source = await readAppSource();
  const settle = functionSource(source, 'settleBattleAnswer', 'processAnswer');
  const endedIndex = settle.indexOf('combatState?.ended');
  const pendingIndex = settle.indexOf('battlePause.isPausePending()', endedIndex + 1);

  assert.notEqual(endedIndex, -1);
  assert.notEqual(pendingIndex, -1);
  assert.ok(endedIndex < pendingIndex, 'KO／結果狀態必須優先於 pending pause');
  assert.match(settle, /if \(combatState\?\.ended\) \{[\s\S]*battlePause\.reset\(\);[\s\S]*return;/);
  assert.match(settle, /if \(battlePause\.isPausePending\(\)\) \{[\s\S]*openManualPause\(\);[\s\S]*return;/);
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
  assert.doesNotMatch(requestHome, /audioManager/);
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

  assert.match(reset, /pauseConfirmAction = null/);
  assert.match(reset, /pauseReturnFocus = null/);
  assert.match(exit, /resetManualPauseState\(\)[\s\S]*orientationController\.exitBattle\(\)[\s\S]*battlePause\.reset\(\)/);
  assert.match(stop, /exitBattleOrientation\(\)/);
  assert.match(prepare, /resetManualPauseState\(\)[\s\S]*battlePause\.reset\(\)[\s\S]*battleLifecycle\.reset\(\)[\s\S]*battleSession\.reset\(\)/);
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
