import { createGameState, submitBuzzerAnswer } from './game-state.mjs';
import { getAnswerInput, isGameKey, PLAYER_KEYS } from './input.mjs';
import { applyCorrectAnswer, applyWrongAnswer, createBattleState, finishRegulation } from './battle-state.mjs';
import { createCharacterSelection, selectCharacter } from './character-select.mjs';
import { createAudioManager } from './audio-manager.mjs';
import { playBattleAnimation, renderBattle } from './battle-renderer.mjs';
import { collectBattleAssetPaths, preloadBattleAssets } from './battle-preload.mjs';
import { createAnswerPositionState, prepareQuestionRound } from './question-randomizer.mjs';
import { attackTiming, createAttackState, drawAttack } from './attack-randomizer.mjs';
import { attemptBattleSetup, bindCharacterActions, buildCharacterActions, isKeyTestComplete, recordKeyTestKey } from './prebattle-flow.mjs';
import { buildSubjectButtons, buildSubjectFilters, filterCatalog } from './catalog-filter.mjs';
import { bindStartScreen, buildStartScreen, resolveStartSceneUrl } from './start-screen.mjs';
import { battleStatus, GAME_MODES, getCharacterSelectionReadiness, playersForKeyTest, selectCpuCharacter } from './game-mode.mjs';
import { createCpuController } from './cpu-player.mjs';
import { createBattleLifecycle } from './battle-lifecycle.mjs';
import { createBattleSessionCoordinator } from './battle-session-coordinator.mjs';
import { fetchJson, loadBootstrapResources, versionedAssetUrl } from './resource-loader.mjs?v=a552f6d';
import { createBattleInputGate, createLatestSessionGate, markQuizRequestLoading, runLatestRequest, runStartSession } from './async-navigation.mjs';
import { createBattleOrientationController, createBattlePauseCoordinator } from './battle-orientation.mjs';
import { createBattleStageScaleController } from './battle-stage-scale.mjs';
import { bindMobileAnswerControls, setMobileAnswerControlsLocked, syncTouchCapabilityClass } from './mobile-controls.mjs';
import { PAUSE_ACTIONS, trapDialogTab } from './battle-pause-menu.mjs';
import { createGamepadState, pollGamepadEvents } from './gamepad-input.mjs';
import { createSeededQuestionDeck, isValidRoomCode, normalizeRoomCode } from './online/room-code.mjs';
import { buildInviteUrl, ONLINE_NAME_STORAGE_KEY, readInviteParams, resolveOnlineApiUrl, saveOnlineApiUrl } from './online/online-config.mjs';
import { clearOnlineSession, createOnlineTransport, loadOnlineSession, saveOnlineSession } from './online/online-transport.mjs';
import { createOnlineController } from './online/online-controller.mjs';
import { buildOnlineHubView, buildOnlineResultView, buildOnlineWaitingRoomView } from './online/online-views.mjs';

const app = document.querySelector('#app');
syncTouchCapabilityClass(document.documentElement, navigator);
const gamepadState = createGamepadState();
let catalog = [], battleManifest = { scenes: [], characters: [], sfx: {} }, currentQuiz = null;
let quizState = null, combatState = null, audioManager = null, timerId = null;
let timeLeft = 0, regulationLimit = 0, battleSettings = null;
let characterSelection = createCharacterSelection(), keyHits = new Set();
let activeQuestionIndex = null;
let attackState = createAttackState();
let activeSubject = '全部';
let gameMode = null;
let answerPositionState = createAnswerPositionState();
let keyTestPlayers = [];
let muted = localStorage.getItem('dd2p-muted') === 'true';
let pauseConfirmAction = null;
let pauseReturnFocus = null;
let onlineApiUrl = resolveOnlineApiUrl({ search: location?.search ?? '', storage: localStorage });
let onlinePlayerName = localStorage.getItem(ONLINE_NAME_STORAGE_KEY) || '';
let onlineHealth = { state: 'idle', message: '' };
let onlineController = null;
let onlineView = null;
let onlineQuiz = null;
let onlineQuizId = null;
let onlineDeck = null;
let onlineQuestionSeed = null;
let onlineAnimating = false;
let onlineSubmitting = false;
let onlineLeaveConfirm = false;
let onlineTimeTimer = null;
let onlineRevealTimer = null;
let onlineHubFeedback = { status: '', error: '', busy: false };
let onlineWaitingFeedback = { copy: '', error: '', busy: false };
let onlineInviteRoomCode = '';
let onlineInviteConsumed = false;
const battleSoundTimers = new Set();
const cpuController = createCpuController();
const battlePause = createBattlePauseCoordinator({
  isLiveBattle: hasLiveBattle,
  disableInput: () => battleInputGate.disable(),
  pauseCpu: pauseBattleCpu,
  clearTimer: clearBattleTimer,
  renderBattle: () => renderGame(),
  resumeCpu: () => battleLifecycle.resumeCpu(),
  enableInput: () => battleInputGate.enable(),
  startTimer: startBattleTimer,
  pauseMusic: () => audioManager?.pauseMusic(),
  resumeMusic: () => { void audioManager?.resumeMusic(); },
});
const orientationController = createBattleOrientationController({
  onPortraitChange: handleBattleOrientationChange,
  onVisibilityChange: battlePause.setBackgroundPaused,
});
const battleStageScale = createBattleStageScaleController({
  isMobileDevice: () => orientationController.isMobileDevice(),
  isPortrait: () => orientationController.isPortrait(),
});
const battleLifecycle = createBattleLifecycle({
  cpuController,
  getSnapshot: battleLifecycleSnapshot,
  resolveAnswer: resolveBattleAnswer,
  animateAnswer: animateBattleAnswer,
  revealAnswer: renderCorrectAnswerReveal,
  afterAnswer: afterBattleAnswer,
  onSettled: settleBattleAnswer,
  submitCpuAnswer: input => processAnswer(input),
  onQuestionAdvanced: () => battleSession.questionAdvanced(),
});
const battleSession = createBattleSessionCoordinator({
  lifecycle: battleLifecycle,
  clearTimer: clearBattleTimer,
  closeRegulation: closeRegulationState,
  stopAudio: () => audioManager?.stop(),
});
let startAvailability = { ready: false, message: '正在載入遊戲資料……' };
const bootstrapRequestGate = createLatestSessionGate();
const quizRequestGate = createLatestSessionGate();
const startSessionGate = createLatestSessionGate();
const battleInputGate = createBattleInputGate();
const startGameOnce = settings => {
  requestBattleOrientation();
  prewarmBattleAssets(settings, ['idle']);
  const start = startGame(settings);
  void start.then(started => { if (started) scheduleAttackAssetPreload(settings); });
  return start;
};
const storedVolume = (key, fallback) => {
  const stored = localStorage.getItem(key);
  const value = Number(stored);
  return stored === null || !Number.isFinite(value) ? fallback : Math.max(0, Math.min(1, value));
};
const audioVolumes = { master: storedVolume('dd2p-volume-master', 0.8), music: storedVolume('dd2p-volume-music', 0.65), effects: storedVolume('dd2p-volume-effects', 0.9) };

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[char]);
const header = () => '<div class="masthead"><div><p class="eyebrow">DDP BATTLE EDITION</p><h1 class="title">DDP 知識對決</h1></div><div class="round">DDP</div></div>';
const shell = body => `<div class="shell">${header()}<section class="panel">${body}</section></div>`;
const playerName = player => player === 'left' ? '左方紅隊' : '右方藍隊';

function characterImage(character, state = 'idle') {
  const frames = character?.states?.[state] ?? character?.states?.idle ?? character?.image;
  return Array.isArray(frames) ? frames[0] : frames;
}
function characterById(id) { return battleManifest.characters.find(character => String(character.id) === String(id)); }
function prewarmBattleAssets(settings, states) {
  const scene = battleManifest.scenes.find(item => item.id === settings?.arenaId);
  const fighters = ['left', 'right'].map(player => characterById(settings?.characters?.[player]));
  preloadBattleAssets(collectBattleAssetPaths(scene, fighters, states).map(path => versionedAssetUrl(path)));
}
function scheduleAttackAssetPreload(settings) {
  const preload = () => prewarmBattleAssets(settings, ['attack']);
  const browser = typeof window === 'undefined' ? null : window;
  if (!browser) return;
  if (typeof browser.requestIdleCallback === 'function') browser.requestIdleCallback(preload, { timeout: 2000 });
  else browser.setTimeout(preload, 0);
}
function playUiSound(name = 'menu') { audioManager?.unlock(); audioManager?.playSfx(name); }
function clearBattleTimer() {
  if (timerId !== null) clearInterval(timerId);
  timerId = null;
}

function hasLiveBattle() {
  return Boolean(
    currentQuiz
    && quizState
    && Number.isInteger(quizState.questionIndex)
    && combatState
    && battleSettings
    && !quizState.ended
    && !combatState.ended
  );
}

function resetManualPauseState() {
  pauseConfirmAction = null;
  pauseReturnFocus = null;
}

function requestManualPause() {
  if (!hasLiveBattle() || battlePause.isManualPaused() || battlePause.isPausePending()) return false;
  pauseReturnFocus = document.activeElement;
  if (battleLifecycle.isAnimating()) {
    battlePause.setPausePending(true);
    const pauseButton = app.querySelector('[data-pause-battle]');
    if (pauseButton) {
      pauseButton.disabled = true;
      pauseButton.textContent = '等待本次攻擊結束……';
    }
    return true;
  }
  return openManualPause();
}

function openManualPause() {
  if (!hasLiveBattle() || battlePause.isManualPaused()) return false;
  pauseConfirmAction = null;
  if (!battlePause.setManualPaused(true)) return false;
  return true;
}

function continueBattle() {
  if (!hasLiveBattle() || !battlePause.isManualPaused() || pauseConfirmAction) return false;
  pauseConfirmAction = null;
  if (!battlePause.setManualPaused(false)) return false;
  if (!syncTopBattleDialog()) app.querySelector('[data-pause-battle]')?.focus();
  pauseReturnFocus = null;
  return true;
}

function requestPauseAction(action) {
  if (!hasLiveBattle() || !battlePause.isManualPaused() || pauseConfirmAction || !Object.values(PAUSE_ACTIONS).includes(action)) return false;
  pauseConfirmAction = action;
  renderGame();
  return true;
}

function cancelPauseConfirmation() {
  if (!hasLiveBattle() || !battlePause.isManualPaused() || !pauseConfirmAction) return false;
  pauseConfirmAction = null;
  renderGame();
  return true;
}

function confirmPauseAction() {
  if (!hasLiveBattle() || !battlePause.isManualPaused() || !Object.values(PAUSE_ACTIONS).includes(pauseConfirmAction)) return false;
  const action = pauseConfirmAction;
  const savedSettings = battleSettings;
  const savedGameMode = gameMode;
  pauseConfirmAction = null;

  switch (action) {
    case PAUSE_ACTIONS.restart:
      stopBattleActivity();
      void startGameOnce(savedSettings);
      return true;
    case PAUSE_ACTIONS.catalog:
      clearBattleState({ keepGameMode: true });
      gameMode = savedGameMode;
      renderCatalog();
      return true;
    case PAUSE_ACTIONS.home:
      clearBattleState();
      renderStartScreen();
      return true;
  }
  return false;
}

function requestBattleHomeExit() {
  if (!hasLiveBattle()) {
    returnToMainMenu();
    return true;
  }
  pauseConfirmAction = PAUSE_ACTIONS.home;
  if (battlePause.isManualPaused()) renderGame();
  else if (!battlePause.setManualPaused(true)) {
    pauseConfirmAction = null;
    return false;
  }
  return true;
}

function handleBattleOrientationChange(portrait) {
  return battlePause.setOrientationPaused(portrait);
}

function pauseBattleCpu() {
  cpuController.pause();
}

function startBattleTimer() {
  if (timerId !== null || battlePause.isPaused() || battleSettings?.mode !== 'time' || !combatState || combatState?.ended) return false;
  timerId = setInterval(handleTimer, 1000);
  return true;
}

function exitBattleOrientation() {
  resetManualPauseState();
  battleStageScale.destroy();
  orientationController.exitBattle();
  document.documentElement.classList.remove('phone-battle-device');
  battlePause.reset();
}

function stopBattleActivity() {
  battleInputGate.disable();
  cancelScheduledBattleSounds();
  exitBattleOrientation();
  battleSession.stopBattleActivity();
  audioManager?.stopEffects?.();
}

function clearBattleState({ keepGameMode = false } = {}) {
  cleanupOnlineSession();
  stopBattleActivity();
  currentQuiz = null;
  quizState = null;
  combatState = null;
  battleSettings = null;
  characterSelection = createCharacterSelection();
  activeQuestionIndex = null;
  attackState = createAttackState();
  answerPositionState = createAnswerPositionState();
  keyHits = new Set();
  keyTestPlayers = [];
  timeLeft = 0;
  regulationLimit = 0;
  if (!keepGameMode) gameMode = null;
}

function cancelPendingStart() {
  battleInputGate.disable();
  startSessionGate.invalidate();
}

function markStartLoading() {
  const startButton = app.querySelector('#start') ?? app.querySelector('#skip-key-test');
  for (const button of [startButton, app.querySelector('#test-keys')]) {
    if (button) button.disabled = true;
  }
  if (startButton) {
    startButton.dataset.loading = 'true';
    startButton.textContent = '正在進入對戰……';
  }
}

function requestBattleOrientation() {
  void orientationController.enterBattle().catch(error => console.warn('無法啟用對戰螢幕方向控制。', error));
}

function returnToMainMenu() {
  clearBattleState();
  renderStartScreen();
}

function renderStartScreen() {
  cancelPendingStart();
  quizRequestGate.invalidate();
  exitBattleOrientation();
  battleSession.mainMenuOpened();
  const playable = battleManifest.characters.filter(character => character.playable !== false);
  app.innerHTML = buildStartScreen({
    quizCount: catalog.length,
    muted,
    scene: resolveStartSceneUrl(battleManifest.scenes[0]?.image, location.href),
    fighters: [characterImage(playable[0]), characterImage(playable[1])],
    modesEnabled: startAvailability.ready,
    loadMessage: startAvailability.message,
    escape: esc,
  });
  bindStartScreen(app, {
    onMode: mode => {
      if (!startAvailability.ready || !Object.values(GAME_MODES).includes(mode)) return;
      gameMode = mode; playUiSound('confirm');
      if (mode === GAME_MODES.online) { openOnlineHub(); return; }
      renderCatalog();
    },
    onHelp: renderStartHelp,
    onAudio: renderStartAudioSettings,
    onRetry: bootstrap,
    onNavigate: () => playUiSound('menu'),
  });
}

function renderStartHelp() {
  cancelPendingStart();
  app.innerHTML = shell(`<h2 class="selection-title">操作說明</h2>
    <div class="help-content">
      <section><h3>左方玩家　紅隊</h3><p>移動與選擇：W、X、A、D；作答：1、2、3、4。</p></section>
      <section><h3>右方玩家　藍隊</h3><p>移動與選擇：↑、↓、←、→；作答：0、−、＝、反斜線（\\）。</p></section>
      <section><h3>單人／雙人模式</h3><p>單人模式由玩家對戰電腦；本機雙人對戰由兩位玩家使用同一台鍵盤同場搶答。</p></section>
      <section><h3>網路雙人對戰</h3><p>由 Cloudflare × Supabase 即時同步房間。建立房間取得 6 碼房號或邀請連結，兩位玩家在各自裝置用 1～4 鍵、觸控按鈕或手把同場搶答。</p></section>
    </div>
    <div class="actions"><button class="primary" id="back-start">返回主選單</button></div>`);
  app.querySelector('#back-start').onclick = renderStartScreen;
}

function renderStartAudioSettings() {
  cancelPendingStart();
  app.innerHTML = shell(`<h2 class="selection-title">音效設定</h2>
    <label class="volume-setting">主音量<input data-start-volume="master" type="range" min="0" max="1" step="0.05" value="${audioVolumes.master}"></label>
    <label class="volume-setting">背景音樂<input data-start-volume="music" type="range" min="0" max="1" step="0.05" value="${audioVolumes.music}"></label>
    <label class="volume-setting">音效<input data-start-volume="effects" type="range" min="0" max="1" step="0.05" value="${audioVolumes.effects}"></label>
    <div class="actions"><button class="secondary" id="toggle-start-muted">${muted ? '解除靜音' : '全部靜音'}</button><button class="primary" id="back-start">返回主選單</button></div>`);
  const methods = { master: 'setVolume', music: 'setMusicVolume', effects: 'setEffectsVolume' };
  const keys = { master: 'dd2p-volume-master', music: 'dd2p-volume-music', effects: 'dd2p-volume-effects' };
  app.querySelectorAll('[data-start-volume]').forEach(slider => slider.oninput = () => {
    const kind = slider.dataset.startVolume;
    audioVolumes[kind] = Number(slider.value);
    localStorage.setItem(keys[kind], slider.value);
    audioManager?.[methods[kind]](audioVolumes[kind]);
  });
  app.querySelector('#toggle-start-muted').onclick = () => {
    muted = !muted;
    localStorage.setItem('dd2p-muted', String(muted));
    audioManager?.setMuted(muted);
    renderStartAudioSettings();
  };
  app.querySelector('#back-start').onclick = renderStartScreen;
}

function renderCatalog() {
  cancelPendingStart();
  quizRequestGate.invalidate();
  exitBattleOrientation();
  battleSession.catalogOpened();
  const filters = buildSubjectFilters(catalog);
  const visibleCatalog = filterCatalog(catalog, activeSubject);
  app.innerHTML = shell(`<p class="lead">選一個題庫，把教室變成真正的搶答擂台。</p><nav class="subject-filters" aria-label="依科目篩選題庫">${buildSubjectButtons(filters, activeSubject)}</nav><div class="quiz-grid">${visibleCatalog.map(quiz => `<button class="quiz-card" data-quiz="${esc(quiz.id)}"><strong>${esc(quiz.name)}</strong><span>${quiz.questions} 題可用</span></button>`).join('')}</div><p class="hint">目前顯示 ${visibleCatalog.length} 份，共 ${catalog.length} 份題庫。空白或不完整題庫已自動排除。</p>`);
  app.querySelectorAll('[data-subject]').forEach(button => button.onclick = () => {
    activeSubject = button.dataset.subject;
    playUiSound();
    renderCatalog();
    const activeButton = [...app.querySelectorAll('[data-subject]')].find(item => item.dataset.subject === activeSubject);
    activeButton?.focus();
  });
  app.querySelectorAll('[data-quiz]').forEach(button => button.onclick = () => { playUiSound(); selectQuiz(button.dataset.quiz); });
}
async function selectQuiz(id) {
  const item = catalog.find(quiz => quiz.id === id);
  if (!item) return false;
  return runLatestRequest({
    gate: quizRequestGate,
    load: () => fetchJson(versionedAssetUrl(item.file), fetch),
    onLoading: () => markQuizRequestLoading(app, id),
    onSuccess: quiz => {
      currentQuiz = quiz;
      renderRules();
    },
    onError: error => renderQuizLoadFailure(item, error),
  });
}

function renderQuizLoadFailure(item, error) {
  app.innerHTML = shell(`<h2 class="selection-title">題庫載入失敗</h2><p class="error">無法載入「${esc(item.name)}」：${esc(error.message)}</p><div class="actions"><button class="secondary" id="back-catalog">返回題庫</button><button class="primary" id="retry-quiz">重試</button></div>`);
  app.querySelector('#back-catalog').onclick = renderCatalog;
  app.querySelector('#retry-quiz').onclick = () => { void selectQuiz(item.id); };
}

function renderRules() {
  cancelPendingStart();
  const cpuDifficulty = gameMode === GAME_MODES.solo
    ? `<fieldset class="cpu-difficulty"><legend>CPU 難度</legend><label><input type="radio" name="cpu-difficulty" value="easy">簡單</label><label><input type="radio" name="cpu-difficulty" value="normal" checked>普通</label><label><input type="radio" name="cpu-difficulty" value="hard">困難</label></fieldset>`
    : '';
  app.innerHTML = shell(`<p class="lead"><b>${esc(currentQuiz.name)}</b>　${currentQuiz.questions.length} 題可用</p><div class="form-row"><label class="mode"><input type="radio" name="mode" value="questions" checked><b>固定題數制</b><small>答完指定題數後結算；平手進入驟死題。</small></label><label class="mode"><input type="radio" name="mode" value="time"><b>限時制</b><small>時間到結算；平手進入驟死題。</small></label></div><label><span id="limit-label">題數</span><input id="limit" class="number" type="number" min="1" max="${currentQuiz.questions.length}" value="${Math.min(10,currentQuiz.questions.length)}"></label>${cpuDifficulty}<div class="actions"><button class="secondary" id="back">返回題庫</button><button class="primary" id="next">選擇戰場</button></div>`);
  const limit = app.querySelector('#limit');
  app.querySelectorAll('[name=mode]').forEach(input => input.onchange = () => {
    const timed = input.value === 'time' && input.checked;
    app.querySelector('#limit-label').textContent = timed ? '秒數' : '題數';
    limit.value = timed ? 60 : Math.min(10, currentQuiz.questions.length);
    limit.max = timed ? 600 : currentQuiz.questions.length;
  });
  app.querySelector('#back').onclick = renderCatalog;
  app.querySelector('#next').onclick = () => {
    playUiSound('confirm');
    const mode = app.querySelector('[name=mode]:checked').value;
    const maximum = mode === 'time' ? 600 : currentQuiz.questions.length;
    const value = Math.min(maximum, Math.max(1, Number(limit.value) || (mode === 'time' ? 60 : 10)));
    const cpuDifficulty = app.querySelector('[name="cpu-difficulty"]:checked')?.value;
    renderArenaSelect({ mode, limit: value, gameMode, cpuDifficulty });
  };
}

function renderArenaSelect(settings, selectedId = battleManifest.scenes[0]?.id) {
  cancelPendingStart();
  const cards = battleManifest.scenes.map(scene => `<button class="arena-card ${scene.id === selectedId ? 'is-selected' : ''}" data-arena-id="${esc(scene.id)}"><img src="${esc(scene.thumbnail || scene.image)}" alt="${esc(scene.label)}" loading="lazy" decoding="async"><span>${esc(scene.label)}</span></button>`).join('');
  const nextLabel = gameMode === GAME_MODES.online ? '建立網路房間' : '選擇角色';
  app.innerHTML = shell(`<h2 class="selection-title">選擇本局戰場</h2><p class="lead">四個校園場景都能使用，並各自搭配原版背景音樂。</p><div class="arena-grid">${cards}</div><div class="actions"><button class="secondary" id="back">返回規則</button><button class="primary" id="next">${nextLabel}</button></div>`);
  let arenaId = selectedId;
  app.querySelectorAll('[data-arena-id]').forEach(button => button.onclick = () => {
    arenaId = button.dataset.arenaId;
    app.querySelectorAll('.arena-card').forEach(card => card.classList.toggle('is-selected', card === button));
    playUiSound();
  });
  app.querySelector('#back').onclick = renderRules;
  app.querySelector('#next').onclick = () => {
    playUiSound('confirm');
    if (gameMode === GAME_MODES.online) {
      void createOnlineRoomFromSetup({ ...settings, arenaId });
      return;
    }
    renderCharacterSelect({ ...settings, arenaId });
  };
}

function characterCards(player) {
  const opponent = player === 'left' ? 'right' : 'left';
  return battleManifest.characters.map(character => {
    const id = String(character.id), selected = characterSelection[player] === id;
    const unavailable = character.playable === false || characterSelection[opponent] === id;
    return `<button class="character-card ${selected ? 'is-selected' : ''}" data-character="${esc(id)}" data-player="${player}" ${unavailable ? 'disabled' : ''}><img src="${esc(character.thumbnail || characterImage(character))}" alt="" loading="lazy" decoding="async"><b>${esc(character.label || character.name || `角色 ${id}`)}</b></button>`;
  }).join('');
}
function selectedPreview(player) {
  const character = characterById(characterSelection[player]);
  return character ? `<div class="selected-fighter"><img src="${esc(characterImage(character))}" alt="${esc(character.label || character.name || `角色 ${character.id}`)}"></div>` : '<div class="selected-fighter"><b>尚未選擇</b></div>';
}
function renderCharacterSelect(settings) {
  cancelPendingStart();
  const solo = gameMode === GAME_MODES.solo;
  const readiness = getCharacterSelectionReadiness(gameMode, characterSelection, battleManifest.characters);
  const rightSelection = solo
    ? '<section class="select-side right cpu-preview"><h3>CPU　藍隊</h3><div class="selected-fighter"><b>CPU 將隨機選角</b></div><p class="hint">開局時會從尚未選取的可用角色中隨機選擇。</p></section>'
    : `<section class="select-side right"><h3>右方玩家　藍隊</h3>${selectedPreview('right')}<div class="character-grid">${characterCards('right')}</div></section>`;
  const title = solo ? '選擇你的角色' : '雙方選擇角色';
  const lead = solo ? '選擇紅隊角色後，CPU 會在開局時隨機選擇另一名可用角色。' : '同一名角色不能重複選擇。請先選紅方，再選藍方。';
  app.innerHTML = shell(`<h2 class="selection-title">${title}</h2><p class="lead">${lead}</p><div class="versus-select"><section class="select-side left"><h3>左方玩家　紅隊</h3>${selectedPreview('left')}<div class="character-grid">${characterCards('left')}</div></section><div class="select-vs">VS</div>${rightSelection}</div>${battleManifest.characters.length ? '' : '<p class="error">角色素材尚未完成，請重新執行素材準備程序。</p>'}${buildCharacterActions(readiness.ready, readiness.message)}`);
  app.querySelectorAll('[data-character]').forEach(button => button.onclick = () => {
    try {
      characterSelection = selectCharacter(characterSelection, button.dataset.player, characterById(button.dataset.character));
      playUiSound(); renderCharacterSelect(settings);
    } catch (error) { app.querySelector('.lead').textContent = error.message; }
  });
  const selectedSettings = () => {
    const selections = { ...characterSelection };
    if (gameMode === GAME_MODES.solo) {
      selections.right = String(selectCpuCharacter(battleManifest.characters, selections.left).id);
    }
    return { ...settings, gameMode, characters: selections };
  };
  const showSetupError = error => {
    const output = app.querySelector('.prebattle-error') ?? app.querySelector('.lead');
    output.textContent = error.message;
  };
  bindCharacterActions(app, {
    onBack: () => renderArenaSelect(settings, settings.arenaId),
    onTest: () => attemptBattleSetup(selectedSettings, selected => { prewarmBattleAssets(selected, ['idle']); playUiSound('start'); renderKeyTest(selected); }, showSetupError),
    onSkip: () => attemptBattleSetup(selectedSettings, selected => { startGameOnce(selected); }, showSetupError),
  });
}

function keysFor(player) { return [...PLAYER_KEYS[player].navigation, ...PLAYER_KEYS[player].answers]; }
function renderKeyTest(settings) {
  cancelPendingStart();
  keyHits = new Set();
  keyTestPlayers = playersForKeyTest(settings.gameMode);
  const instruction = keyTestPlayers.length === 1 ? '請按一次自己的全部按鍵（支援鍵盤與 USB 搖桿）。亮起黃色即表示已偵測。' : '請兩位玩家各按一次自己的全部按鍵（支援鍵盤與 USB 搖桿）。亮起黃色即表示已偵測。';
  app.innerHTML = shell(`<p class="lead">${instruction}</p><div class="keytest">${keyTestPlayers.map(player => `<div class="player ${player}"><b>${playerName(player)}</b><div class="keys">${keysFor(player).map(code => `<span class="key" data-key="${code}">${esc(code.replace('Key','').replace('Digit',''))}</span>`).join('')}</div></div>`).join('')}</div><p id="key-hint" class="hint">請開始測試按鍵。</p><div class="actions"><button class="secondary" id="back">返回選角</button><button class="primary" id="start" disabled>開始對戰</button></div>`);
  app.querySelector('#back').onclick = () => renderCharacterSelect(settings);
  app.querySelector('#start').onclick = () => startGameOnce(settings);
}

async function startGame(settings) {
  return runStartSession({
    gate: startSessionGate,
    onCancel: stopBattleActivity,
    onLoading: markStartLoading,
    disableInput: battleInputGate.disable,
    enableInput: () => { if (!battlePause.isPaused()) battleInputGate.enable(); },
    prepare: () => {
      prepareBattleStart(settings);
      orientationController.refresh();
      battleStageScale.sync();
    },
    stages: [
      () => audioManager?.setScene(settings.arenaId),
      () => audioManager?.unlock(),
      () => audioManager?.playSfx('start'),
    ],
    startTimer: startBattleTimer,
    renderBattle: renderGame,
    onError: renderQuizError,
  });
}

function prepareBattleStart(settings) {
  resetManualPauseState();
  battlePause.reset();
  cancelScheduledBattleSounds();
  battleLifecycle.reset();
  battleSession.reset();
  battleSettings = settings;
  answerPositionState = createAnswerPositionState();
  currentQuiz = { ...currentQuiz, activeQuestions: prepareQuestionRound(currentQuiz.questions, Math.random, answerPositionState, currentQuiz.questionOrder) };
  quizState = createGameState({ mode: 'time', limit: Number.MAX_SAFE_INTEGER });
  combatState = createBattleState();
  regulationLimit = settings.mode === 'questions' ? Math.min(settings.limit, currentQuiz.questions.length) : Infinity;
  timeLeft = settings.mode === 'time' ? settings.limit : null;
  activeQuestionIndex = null;
  attackState = createAttackState();
  clearBattleTimer();
}

function renderQuizError(error) {
  clearBattleState({ keepGameMode: true });
  app.innerHTML = shell(`<h2 class="selection-title">題庫錯誤</h2><p class="error">無法開始此題庫：${esc(error.message)}</p><p class="hint">請更換題庫，或檢查每題是否有 2 至 4 個選項與有效正確答案。</p><div class="actions"><button class="primary" id="back-catalog">返回題庫</button></div>`);
  app.querySelector('#back-catalog').onclick = renderCatalog;
}
function handleTimer() {
  if (battlePause.isPaused() || !hasLiveBattle() || combatState?.phase === 'sudden-death') return;
  timeLeft = Math.max(0, timeLeft - 1);
  if (timeLeft <= 0) {
    battleSession.timerExpired();
  }
  if (!combatState.ended && !battleLifecycle.isAnimating()) renderGame();
}
function ensureQuestion() {
  if (quizState.questionIndex >= currentQuiz.activeQuestions.length) {
    currentQuiz.activeQuestions.push(...prepareQuestionRound(currentQuiz.questions, Math.random, answerPositionState, currentQuiz.questionOrder));
  }
}
function closeRegulationState({ advanceQuestion = false } = {}) {
  combatState = finishRegulation(combatState);
  if (combatState.ended) renderResult();
  else {
    if (advanceQuestion) quizState = { ...quizState, questionIndex: quizState.questionIndex + 1, phase: 'open', eligiblePlayers: ['left','right'], lockedPlayer: null, ended: false };
    else quizState = { ...quizState, phase: 'open', eligiblePlayers: ['left','right'], lockedPlayer: null, ended: false };
    audioManager?.playSfx('start'); ensureQuestion();
  }
}
function currentStatus() {
  return battleStatus(battleSettings?.gameMode, quizState.eligiblePlayers, combatState.phase);
}
function bindAudioToggle() {
  const button = app.querySelector('[data-audio-toggle]');
  if (!button) return;
  button.textContent = muted ? '靜音中' : '聲音開啟';
  button.onclick = () => {
    muted = !muted; localStorage.setItem('dd2p-muted', String(muted));
    audioManager?.setMuted(muted); button.textContent = muted ? '靜音中' : '聲音開啟';
  };
  const volumeBindings = [
    ['master', '[data-master-volume]', 'setVolume', 'dd2p-volume-master'],
    ['music', '[data-music-volume]', 'setMusicVolume', 'dd2p-volume-music'],
    ['effects', '[data-effects-volume]', 'setEffectsVolume', 'dd2p-volume-effects'],
  ];
  for (const [kind, selector, method, storageKey] of volumeBindings) {
    const slider = app.querySelector(selector);
    slider.oninput = () => {
      audioVolumes[kind] = Number(slider.value);
      localStorage.setItem(storageKey, slider.value);
      audioManager?.[method](audioVolumes[kind]);
    };
  }
}

function syncTopBattleDialog() {
  const orientationDialog = app.querySelector('.orientation-blocker');
  const pauseDialog = app.querySelector('.battle-pause-overlay');
  const dialog = orientationDialog ?? pauseDialog;
  if (!dialog) return false;
  dialog.onkeydown = event => trapDialogTab(dialog, event);
  const focusTarget = orientationDialog
    ? orientationDialog.querySelector('[data-return-main-menu]')
    : pauseConfirmAction
      ? pauseDialog.querySelector('[data-pause-cancel]')
      : pauseDialog.querySelector('[data-pause-continue]');
  focusTarget?.focus();
  return true;
}

function renderGame({
  allowEnded = false,
  questionOverride = null,
  progressOverride = null,
  statusOverride = null,
  revealAnswerIndex = null,
} = {}) {
  if (combatState.ended && !allowEnded) return renderResult();
  ensureQuestion();
  const question = questionOverride ?? currentQuiz.activeQuestions[quizState.questionIndex];
  const scene = battleManifest.scenes.find(item => item.id === battleSettings.arenaId) ?? battleManifest.scenes[0];
  const left = characterById(battleSettings.characters.left), right = characterById(battleSettings.characters.right);
  renderBattle(app, {
    scene,
    baseUrl: location.href,
    audio: audioVolumes,
    gameMode: battleSettings.gameMode,
    eligiblePlayers: quizState.eligiblePlayers,
    mobileInputLocked: battleLifecycle.isAnimating(),
    orientationPaused: battlePause.isOrientationPaused() && !pauseConfirmAction,
    manualPaused: battlePause.isManualPaused(),
    pauseConfirmAction,
    pausePending: battlePause.isPausePending(),
    players: {
      left: { name: left.label || left.name || `角色 ${left.id}`, health: combatState.health.left, score: combatState.scores.left, image: characterImage(left) },
      right: { name: right.label || right.name || `角色 ${right.id}`, health: combatState.health.right, score: combatState.scores.right, image: characterImage(right) },
    },
    progress: progressOverride ?? (combatState.phase === 'sudden-death' ? 'SUDDEN' : timeLeft === null ? `${Math.min(quizState.questionIndex + 1, regulationLimit)}／${regulationLimit}` : `${timeLeft}s`),
    prompt: question.prompt, questionImage: question.image, choices: question.choices,
    status: statusOverride ?? currentStatus(), phase: combatState.phase, revealAnswerIndex,
  });
  document.documentElement.classList.toggle('phone-battle-device', orientationController.isPhoneDevice());
  battleStageScale.bind(app);
  bindAudioToggle();
  bindMobileAnswerControls(app, { onAnswer: input => void processAnswer(input) });
  const returnButton = app.querySelector('[data-return-main-menu]');
  if (returnButton) returnButton.onclick = requestBattleHomeExit;
  const pauseButton = app.querySelector('[data-pause-battle]');
  if (pauseButton) pauseButton.onclick = requestManualPause;
  const continueButton = app.querySelector('[data-pause-continue]');
  if (continueButton) continueButton.onclick = continueBattle;
  for (const button of app.querySelectorAll('[data-pause-action]')) {
    button.onclick = () => requestPauseAction(button.dataset.pauseAction);
  }
  const cancelButton = app.querySelector('[data-pause-cancel]');
  if (cancelButton) cancelButton.onclick = cancelPauseConfirmation;
  const confirmButton = app.querySelector('[data-pause-confirm]');
  if (confirmButton) confirmButton.onclick = confirmPauseAction;
  syncTopBattleDialog();
  if (!questionOverride) scheduleCpuForCurrentQuestion(question);
}

function scheduleCpuForCurrentQuestion(question) {
  if (battlePause.isPaused()) return false;
  return battleLifecycle.scheduleCpu({
    questionKey: battleQuestionKey(),
    question,
    difficulty: battleSettings.cpuDifficulty,
  });
}

function battleQuestionKey(phase = combatState?.phase, index = quizState?.questionIndex) {
  return `${phase}:${index}`;
}

function battleLifecycleSnapshot() {
  return {
    gameMode: battleSettings?.gameMode,
    questionKey: battleQuestionKey(),
    phase: quizState?.phase,
    eligiblePlayers: quizState?.eligiblePlayers ?? [],
    ended: !quizState || !combatState || combatState.ended,
    paused: battlePause.isPaused(),
  };
}

function resolveBattleAnswer(input) {
  ensureQuestion();
  activeQuestionIndex = quizState.questionIndex;
  const questionKey = battleQuestionKey(combatState.phase, activeQuestionIndex);
  const question = currentQuiz.activeQuestions[quizState.questionIndex];
  const nextQuizState = submitBuzzerAnswer(quizState, input.player, input.answerIndex, question.answerIndex);
  if (nextQuizState === quizState) return null;
  const correct = input.answerIndex === question.answerIndex;
  quizState = nextQuizState;
  const questionAdvanced = quizState.questionIndex > activeQuestionIndex;
  const answerProgress = combatState.phase === 'sudden-death' ? 'SUDDEN' : timeLeft === null ? `${Math.min(activeQuestionIndex + 1, regulationLimit)}／${regulationLimit}` : `${timeLeft}s`;
  const actor = characterById(battleSettings.characters[input.player]);
  if (correct) {
    combatState = applyCorrectAnswer(combatState, input.player); renderGame({ allowEnded: true, questionOverride: question, progressOverride: answerProgress });
    audioManager?.playSfx('buzz'); audioManager?.playSfx('correct'); audioManager?.playSfx('attack');
    const attack = drawAttack(attackState, input.player);
    attackState = attack.state;
    const timing = attackTiming(attack.attackType);
    return { questionKey, question, answerIndex: question.answerIndex, progress: answerProgress, correct, questionAdvanced, actor, attack, timing };
  }

  combatState = applyWrongAnswer(combatState, input.player); renderGame({ questionOverride: question, progressOverride: answerProgress });
  audioManager?.playSfx('buzz'); audioManager?.playSfx('wrong');
  return { questionKey, question, answerIndex: question.answerIndex, progress: answerProgress, correct, questionAdvanced, actor };
}

function cancelScheduledBattleSounds() {
  for (const timer of battleSoundTimers) {
    if (typeof clearTimeout === 'function') clearTimeout(timer);
  }
  battleSoundTimers.clear();
}

async function animateBattleAnswer(outcome, isCurrent) {
  const playSound = name => { if (isCurrent()) audioManager?.playSfx(name); };
  setMobileAnswerControlsLocked(app, true);
  if (outcome.correct) {
    const animation = playBattleAnimation(app, combatState.animation, {
      attackType: outcome.attack.attackType,
      weapon: outcome.actor?.weapon,
      profile: outcome.actor?.attacks?.[outcome.attack.attackType],
      attackFrames: outcome.actor?.states?.attack,
      duration: 650,
      impactDelay: outcome.timing.impactDelay,
    });
    if (outcome.timing.swingDelay === 0) playSound('weapon');
    else if (typeof setTimeout === 'function') {
      const timer = setTimeout(() => {
        battleSoundTimers.delete(timer);
        playSound('weapon');
      }, outcome.timing.swingDelay);
      battleSoundTimers.add(timer);
    }
    await new Promise(resolve => setTimeout(resolve, outcome.timing.impactDelay));
    playSound('hit'); playSound('hurt');
    await animation;
    return;
  }
  await playBattleAnimation(app, combatState.animation, { attackFrames: outcome.actor?.states?.miss, duration: 500 });
}

function renderCorrectAnswerReveal({ question, answerIndex, progress }) {
  renderGame({
    questionOverride: question,
    progressOverride: progress,
    statusOverride: `正確答案：${question.choices[answerIndex]}`,
    revealAnswerIndex: answerIndex,
  });
}

function afterBattleAnswer() {
  if (combatState.ended) {
    renderResult();
    return { renderBattle: false };
  }
  if (battleSession.finishAnswer({ questionIndex: quizState.questionIndex, activeQuestionIndex })) {
    activeQuestionIndex = null;
    return { renderBattle: !combatState.ended };
  }
  activeQuestionIndex = null;
  if (battleSettings.mode === 'questions' && combatState.phase === 'regulation' && quizState.questionIndex >= regulationLimit) battleSession.regulationEnded();
  return { renderBattle: !combatState.ended };
}

function settleBattleAnswer(_outcome, settlement) {
  if (combatState?.ended) {
    battlePause.reset();
    return;
  }
  if (battlePause.isPausePending()) {
    openManualPause();
    return;
  }
  if (settlement?.renderBattle) renderGame();
}

async function processAnswer(input) {
  try {
    return await battleInputGate.run(() => battleLifecycle.submit(input));
  } catch (error) {
    console.error('對戰作答流程失敗。', {
      error,
      phase: combatState?.phase,
      questionIndex: quizState?.questionIndex,
    });
    battleInputGate.disable();
    battleLifecycle.cancel();
    cpuController.cancel();
    if (!combatState?.ended && quizState && battleSettings) {
      if (battlePause.isPausePending()) openManualPause();
      else renderGame();
      if (!battlePause.isPaused()) battleInputGate.enable();
    }
    return false;
  }
}

function renderResult() {
  battleInputGate.disable();
  exitBattleOrientation();
  battleSession.resultShown();
  if (app.querySelector('.result')) return;
  const winner = combatState.winner ? playerName(combatState.winner) : '平手';
  const reason = combatState.endReason === 'ko' ? 'KO！' : combatState.endReason === 'sudden-death' ? '驟死決勝！' : '分數勝利！';
  if (combatState.endReason === 'ko') audioManager?.playSfx('ko');
  audioManager?.playSfx('win'); audioManager?.playSfx('lose');
  app.innerHTML = shell(`<article class="result"><p class="lead">本局結算　${esc(reason)}</p><div class="winner">${esc(winner)}獲勝！</div><p class="prompt">紅隊 ${combatState.scores.left} 分　：　藍隊 ${combatState.scores.right} 分</p><div class="actions"><button class="secondary" id="catalog">更換題庫</button><button class="secondary" id="main-menu">返回主選單</button><button class="primary" id="again">再玩一次</button></div></article>`);
  app.querySelector('#catalog').onclick = () => { clearBattleState({ keepGameMode: true }); renderCatalog(); };
  app.querySelector('#main-menu').onclick = returnToMainMenu;
  app.querySelector('#again').onclick = () => { audioManager?.stop(); characterSelection = createCharacterSelection(); renderRules(); };
}

function clearOnlineTimers() {
  if (onlineTimeTimer !== null) {
    clearInterval(onlineTimeTimer);
    onlineTimeTimer = null;
  }
  if (onlineRevealTimer !== null) {
    clearTimeout(onlineRevealTimer);
    onlineRevealTimer = null;
  }
}

function cleanupOnlineSession({ clearStorage = false } = {}) {
  clearOnlineTimers();
  onlineController?.reset?.();
  onlineController = null;
  onlineView = null;
  onlineAnimating = false;
  onlineSubmitting = false;
  onlineLeaveConfirm = false;
  onlineDeck = null;
  onlineQuestionSeed = null;
  onlineQuiz = null;
  onlineQuizId = null;
  if (clearStorage) clearOnlineSession();
}

function getOnlineTransport() {
  return createOnlineTransport({ apiUrl: onlineApiUrl, fetchImpl: fetch });
}

async function checkOnlineHealth() {
  if (!onlineApiUrl) {
    onlineHealth = { state: 'idle', message: '' };
    if (onlineView === 'hub') renderOnlineHub();
    return false;
  }
  onlineHealth = { state: 'checking', message: '正在連線至 Cloudflare × Supabase……' };
  if (onlineView === 'hub') renderOnlineHub();
  const result = await getOnlineTransport().checkHealth();
  if (result.ok) {
    onlineHealth = {
      state: 'connected',
      message: `資料庫連線正常（回應 ${result.elapsed_ms ?? 0} ms，目前活躍房間 ${result.active_rooms ?? 0}）。`,
    };
  } else {
    onlineHealth = {
      state: 'error',
      message: result.message || '無法連線至網路對戰伺服器。',
    };
  }
  if (onlineView === 'hub') renderOnlineHub();
  return result.ok;
}

function openOnlineHub({ status = '', error = '' } = {}) {
  cancelPendingStart();
  quizRequestGate.invalidate();
  stopBattleActivity();
  cleanupOnlineSession();
  gameMode = GAME_MODES.online;
  onlineView = 'hub';
  onlineHubFeedback = { status, error, busy: false };
  renderOnlineHub();
  if (onlineApiUrl && onlineHealth.state === 'idle') {
    void checkOnlineHealth();
  }
}

function renderOnlineHub() {
  if (onlineView !== 'hub') return;
  const savedSession = loadOnlineSession();
  app.innerHTML = shell(buildOnlineHubView({
    apiUrl: onlineApiUrl,
    healthState: onlineHealth.state,
    healthMessage: onlineHealth.message,
    playerName: onlinePlayerName,
    inviteRoomCode: onlineInviteRoomCode,
    savedSession,
    statusMessage: onlineHubFeedback.status,
    errorMessage: onlineHubFeedback.error,
    busy: onlineHubFeedback.busy,
    escape: esc,
  }));

  const nameInput = app.querySelector('#online-player-name');
  if (nameInput) {
    nameInput.oninput = () => {
      onlinePlayerName = nameInput.value.trim().slice(0, 20);
      localStorage.setItem(ONLINE_NAME_STORAGE_KEY, onlinePlayerName);
    };
  }

  const createBtn = app.querySelector('#online-create-flow');
  if (createBtn) {
    createBtn.onclick = () => {
      if (!onlineApiUrl) return;
      playUiSound('confirm');
      onlineView = null;
      gameMode = GAME_MODES.online;
      renderCatalog();
    };
  }

  const roomInput = app.querySelector('#online-room-code');
  const joinBtn = app.querySelector('#online-join-btn');
  if (joinBtn && roomInput) {
    const submitJoin = () => {
      const code = normalizeRoomCode(roomInput.value);
      onlineInviteRoomCode = code;
      if (!isValidRoomCode(code)) {
        onlineHubFeedback = { status: '', error: '請輸入正確的 6 位英數房間碼。', busy: false };
        renderOnlineHub();
        return;
      }
      playUiSound('confirm');
      void joinOnlineRoom(code);
    };
    joinBtn.onclick = submitJoin;
    roomInput.onkeydown = event => { if (event.key === 'Enter') submitJoin(); };
  }

  const resumeBtn = app.querySelector('#online-resume-btn');
  if (resumeBtn && savedSession) {
    resumeBtn.onclick = () => {
      playUiSound('confirm');
      void joinOnlineRoom(savedSession.roomCode, { resume: savedSession });
    };
  }

  const saveApiBtn = app.querySelector('#online-save-api');
  const apiInput = app.querySelector('#online-api-url');
  if (saveApiBtn && apiInput) {
    saveApiBtn.onclick = () => {
      const saved = saveOnlineApiUrl(apiInput.value, localStorage);
      if (apiInput.value.trim() && !saved) {
        onlineHubFeedback = { status: '', error: '伺服器網址格式無效，請使用 https://（或本機 http://localhost）。', busy: false };
        renderOnlineHub();
        return;
      }
      onlineApiUrl = saved;
      onlineHealth = { state: 'idle', message: '' };
      onlineHubFeedback = { status: saved ? '已儲存伺服器網址，正在測試連線……' : '已清除伺服器網址。', error: '', busy: false };
      renderOnlineHub();
      if (saved) void checkOnlineHealth();
    };
  }

  const backBtn = app.querySelector('#online-back-home');
  if (backBtn) backBtn.onclick = returnToMainMenu;
}

async function createOnlineRoomFromSetup(settings) {
  if (!onlineApiUrl) {
    openOnlineHub({ error: '請先設定 Cloudflare Worker 伺服器網址再建立房間。' });
    return;
  }
  const nextBtn = app.querySelector('#next');
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = '正在建立房間……';
  }
  const result = await getOnlineTransport().createRoom({
    quizId: currentQuiz.id,
    quizName: currentQuiz.name,
    arenaId: settings.arenaId,
    ruleMode: settings.mode,
    ruleLimit: settings.limit,
    questionCount: currentQuiz.questions.length,
    playerName: onlinePlayerName || '紅隊玩家',
  });
  if (!result.ok) {
    openOnlineHub({ error: result.message || '建立房間失敗，請稍後再試。' });
    return;
  }
  onlineQuiz = currentQuiz;
  onlineQuizId = currentQuiz.id;
  enterOnlineRoom(result.session, result.room);
}

async function joinOnlineRoom(code, { resume = null } = {}) {
  onlineHubFeedback = { status: '正在連線加入房間……', error: '', busy: true };
  renderOnlineHub();
  const payload = resume
    ? { playerId: resume.playerId, resumeToken: resume.resumeToken, playerName: onlinePlayerName || '藍隊玩家' }
    : { playerName: onlinePlayerName || '藍隊玩家' };
  const result = await getOnlineTransport().joinRoom(code, payload);
  if (!result.ok) {
    if (resume && (result.code === 'ROOM_NOT_FOUND' || result.code === 'UNAUTHORIZED')) {
      clearOnlineSession();
    }
    onlineHubFeedback = { status: '', error: result.message || '加入房間失敗。', busy: false };
    renderOnlineHub();
    return;
  }
  enterOnlineRoom(result.session, result.room);
}

async function ensureOnlineQuizLoaded(room) {
  if (onlineQuiz && onlineQuizId === room.quizId) return onlineQuiz;
  const item = catalog.find(quiz => quiz.id === room.quizId);
  if (!item) throw new Error(`找不到題庫 ${room.quizId}`);
  const quiz = await fetchJson(versionedAssetUrl(item.file), fetch);
  onlineQuiz = quiz;
  onlineQuizId = room.quizId;
  return quiz;
}

async function ensureOnlineDeck(room) {
  const quiz = await ensureOnlineQuizLoaded(room);
  if (!onlineDeck || onlineQuestionSeed !== room.questionSeed || onlineQuizId !== room.quizId) {
    onlineDeck = createSeededQuestionDeck(quiz.questions, room.questionSeed || 1, quiz.questionOrder);
    onlineQuestionSeed = room.questionSeed;
  }
  return onlineDeck;
}

function enterOnlineRoom(session, initialRoom) {
  cleanupOnlineSession();
  gameMode = GAME_MODES.online;
  saveOnlineSession({ ...session, apiUrl: onlineApiUrl });
  onlineWaitingFeedback = { copy: '', error: '', busy: false };
  const transport = getOnlineTransport();
  onlineController = createOnlineController({
    transport,
    onRoomUpdate: (room, meta) => { void handleOnlineRoomUpdate(room, meta); },
    onBattleEvent: (event, room) => { void handleOnlineBattleEvent(event, room); },
    onConnectionChange: () => {
      const currentRoom = onlineController?.getRoom();
      if (!currentRoom) return;
      if (onlineView === 'waiting') renderOnlineWaitingRoom(currentRoom);
      else if (onlineView === 'battle' && !onlineAnimating) void renderOnlineBattle(currentRoom);
    },
    onRoomLost: error => {
      cleanupOnlineSession({ clearStorage: true });
      openOnlineHub({ error: error?.message || '房間已結束或連線已失效。' });
    },
  });
  onlineController.start(session, initialRoom, { emitInitialEvent: false });
}

async function handleOnlineRoomUpdate(room, { previousRoom } = {}) {
  if (!onlineController) return;
  if (room.status === 'waiting') {
    clearOnlineTimers();
    exitBattleOrientation();
    onlineView = 'waiting';
    renderOnlineWaitingRoom(room);
    return;
  }
  if (room.status === 'playing') {
    const enteringBattle = onlineView !== 'battle' || previousRoom?.status !== 'playing' || onlineQuestionSeed !== room.questionSeed;
    try {
      await ensureOnlineDeck(room);
    } catch (error) {
      cleanupOnlineSession({ clearStorage: true });
      openOnlineHub({ error: `無法載入本房間題庫：${error.message}` });
      return;
    }
    if (!onlineController) return;
    if (enteringBattle) {
      onlineLeaveConfirm = false;
      onlineAnimating = false;
      onlineSubmitting = false;
      attackState = createAttackState();
      const battleConf = {
        arenaId: room.arenaId,
        characters: {
          left: room.players?.left?.characterId,
          right: room.players?.right?.characterId,
        },
      };
      prewarmBattleAssets(battleConf, ['idle']);
      scheduleAttackAssetPreload(battleConf);
      requestBattleOrientation();
      orientationController.refresh();
      battleStageScale.sync();
      void audioManager?.setScene(room.arenaId);
      audioManager?.unlock();
      audioManager?.playSfx('start');
      startOnlineClockTicker();
    }
    onlineView = 'battle';
    if (!onlineAnimating) renderOnlineBattle(room);
    return;
  }
  if (room.status === 'ended') {
    clearOnlineTimers();
    if (!onlineAnimating) renderOnlineResult(room);
  }
}

function renderOnlineWaitingRoom(room) {
  const session = onlineController?.getSession();
  if (!session) return;
  const scene = battleManifest.scenes.find(item => item.id === room.arenaId);
  const inviteUrl = buildInviteUrl({ roomCode: room.roomCode, pageUrl: location.href, apiUrl: onlineApiUrl });
  app.innerHTML = shell(buildOnlineWaitingRoomView({
    room,
    seat: session.seat,
    characters: battleManifest.characters,
    arenaLabel: scene?.label ?? room.arenaId,
    inviteUrl,
    connectionStatus: onlineController.getConnectionStatus(),
    copyFeedback: onlineWaitingFeedback.copy,
    errorMessage: onlineWaitingFeedback.error,
    busy: onlineWaitingFeedback.busy,
    characterImage,
    escape: esc,
  }));

  const copyCodeBtn = app.querySelector('#online-copy-code');
  if (copyCodeBtn) {
    copyCodeBtn.onclick = async () => {
      try {
        await navigator?.clipboard?.writeText(room.roomCode);
        onlineWaitingFeedback = { ...onlineWaitingFeedback, copy: `已複製房間碼：${room.roomCode}`, error: '' };
      } catch {
        onlineWaitingFeedback = { ...onlineWaitingFeedback, copy: `房間碼為：${room.roomCode}（請手動複製）`, error: '' };
      }
      renderOnlineWaitingRoom(room);
    };
  }

  const copyLinkBtn = app.querySelector('#online-copy-link');
  if (copyLinkBtn) {
    copyLinkBtn.onclick = async () => {
      try {
        await navigator?.clipboard?.writeText(inviteUrl);
        onlineWaitingFeedback = { ...onlineWaitingFeedback, copy: '已複製邀請連結！直接傳給對手即可加入。', error: '' };
      } catch {
        onlineWaitingFeedback = { ...onlineWaitingFeedback, copy: `邀請連結：${inviteUrl}`, error: '' };
      }
      renderOnlineWaitingRoom(room);
    };
  }

  app.querySelectorAll('[data-online-character]').forEach(button => {
    button.onclick = async () => {
      playUiSound();
      onlineWaitingFeedback = { ...onlineWaitingFeedback, error: '', busy: true };
      renderOnlineWaitingRoom(room);
      const res = await onlineController?.selectCharacter(button.dataset.onlineCharacter);
      onlineWaitingFeedback = { ...onlineWaitingFeedback, error: res?.ok ? '' : (res?.message || '選角失敗'), busy: false };
      if (onlineView === 'waiting' && onlineController?.getRoom()) renderOnlineWaitingRoom(onlineController.getRoom());
    };
  });

  const readyBtn = app.querySelector('#online-toggle-ready');
  if (readyBtn) {
    readyBtn.onclick = async () => {
      const me = room.players?.[session.seat];
      playUiSound('confirm');
      onlineWaitingFeedback = { ...onlineWaitingFeedback, error: '', busy: true };
      renderOnlineWaitingRoom(room);
      const res = await onlineController?.setReady(!me?.ready);
      onlineWaitingFeedback = { ...onlineWaitingFeedback, error: res?.ok ? '' : (res?.message || '更新準備狀態失敗'), busy: false };
      if (onlineView === 'waiting' && onlineController?.getRoom()) renderOnlineWaitingRoom(onlineController.getRoom());
    };
  }

  const leaveBtn = app.querySelector('#online-leave-room');
  if (leaveBtn) {
    leaveBtn.onclick = async () => {
      playUiSound();
      await onlineController?.leaveRoom();
      clearOnlineSession();
      openOnlineHub({ status: '已離開房間。' });
    };
  }
}

function startOnlineClockTicker() {
  clearOnlineTimers();
  onlineTimeTimer = setInterval(() => {
    const room = onlineController?.getRoom();
    if (!room || room.status !== 'playing' || room.ruleMode !== 'time' || room.phase !== 'regulation') return;
    const remaining = onlineController.getRemainingSeconds();
    if (remaining === 0) {
      void onlineController.finishTime();
    }
    if (onlineView === 'battle' && !onlineAnimating) renderOnlineBattle(room);
  }, 1000);
}

function formatOnlineProgress(room, questionIndexOverride = null) {
  if (room.phase === 'sudden-death') return 'SUDDEN';
  if (room.ruleMode === 'time') {
    const remaining = onlineController?.getRemainingSeconds() ?? room.ruleLimit;
    return `${remaining}s`;
  }
  const index = questionIndexOverride ?? room.questionIndex;
  const limit = Math.min(room.ruleLimit, room.questionCount);
  return `${Math.min(index + 1, limit)}／${limit}`;
}

function renderOnlineBattle(room, {
  questionOverride = null,
  progressOverride = null,
  statusOverride = null,
  revealAnswerIndex = null,
  healthOverride = null,
  scoresOverride = null,
} = {}) {
  const session = onlineController?.getSession();
  if (!session || !onlineDeck) return;
  const seat = session.seat;
  const scene = battleManifest.scenes.find(item => item.id === room.arenaId) ?? battleManifest.scenes[0];
  const leftChar = characterById(room.players?.left?.characterId) ?? battleManifest.characters[0];
  const rightChar = characterById(room.players?.right?.characterId) ?? battleManifest.characters[1] ?? leftChar;
  const question = questionOverride ?? onlineDeck.getQuestion(room.questionIndex);
  const health = healthOverride ?? room.health ?? { left: 100, right: 100 };
  const scores = scoresOverride ?? room.scores ?? { left: 0, right: 0 };
  const leftName = room.players?.left?.name ? `${room.players.left.name}｜${leftChar.label || leftChar.name}` : (leftChar.label || leftChar.name);
  const rightName = room.players?.right?.name ? `${room.players.right.name}｜${rightChar.label || rightChar.name}` : (rightChar.label || rightChar.name);
  const connStatus = onlineController.getConnectionStatus();
  const badgePrefix = connStatus === 'reconnecting' ? '重連中' : connStatus === 'disconnected' ? '已斷線' : '線上';
  const onlineBadge = `${badgePrefix}｜${room.roomCode}`;

  renderBattle(app, {
    scene,
    baseUrl: location.href,
    audio: audioVolumes,
    gameMode: GAME_MODES.online,
    localPlayer: seat,
    onlineBadge,
    onlineLeaveConfirm,
    eligiblePlayers: room.eligiblePlayers ?? ['left', 'right'],
    mobileInputLocked: onlineAnimating || onlineSubmitting || onlineLeaveConfirm || room.status !== 'playing',
    orientationPaused: orientationController.isPortrait() && !onlineLeaveConfirm,
    manualPaused: false,
    pauseConfirmAction: null,
    pausePending: false,
    players: {
      left: { name: leftName, health: health.left, score: scores.left, image: characterImage(leftChar) },
      right: { name: rightName, health: health.right, score: scores.right, image: characterImage(rightChar) },
    },
    progress: progressOverride ?? formatOnlineProgress(room),
    prompt: question.prompt,
    questionImage: question.image,
    choices: question.choices,
    status: statusOverride ?? battleStatus(GAME_MODES.online, room.eligiblePlayers ?? ['left', 'right'], room.phase, {
      localSeat: seat,
      playerNames: { left: room.players?.left?.name, right: room.players?.right?.name },
    }),
    phase: room.phase,
    revealAnswerIndex,
  });
  document.documentElement.classList.toggle('phone-battle-device', orientationController.isPhoneDevice());
  battleStageScale.bind(app);
  bindAudioToggle();
  bindMobileAnswerControls(app, { onAnswer: input => void submitOnlineAnswer(input.answerIndex) });

  const leaveBtn = app.querySelector('[data-online-leave-battle]');
  if (leaveBtn) leaveBtn.onclick = () => { onlineLeaveConfirm = true; renderOnlineBattle(onlineController?.getRoom() ?? room); };
  const cancelLeave = app.querySelector('[data-online-leave-cancel]');
  if (cancelLeave) cancelLeave.onclick = () => { onlineLeaveConfirm = false; renderOnlineBattle(onlineController?.getRoom() ?? room); };
  const confirmLeave = app.querySelector('[data-online-leave-confirm]');
  if (confirmLeave) {
    confirmLeave.onclick = async () => {
      onlineLeaveConfirm = false;
      await onlineController?.leaveRoom();
      clearOnlineSession();
      openOnlineHub({ status: '已離開網路對戰。' });
    };
  }
  const returnHome = app.querySelector('[data-return-main-menu]');
  if (returnHome) {
    returnHome.onclick = () => { onlineLeaveConfirm = true; renderOnlineBattle(onlineController?.getRoom() ?? room); };
  }
}

async function submitOnlineAnswer(answerIndex) {
  const controller = onlineController;
  const session = controller?.getSession();
  const room = controller?.getRoom();
  if (!controller || !session || !room || onlineView !== 'battle') return false;
  if (onlineAnimating || onlineSubmitting || onlineLeaveConfirm || room.status !== 'playing') return false;
  if (!room.eligiblePlayers?.includes(session.seat)) return false;

  const question = onlineDeck?.getQuestion(room.questionIndex);
  if (!question || answerIndex < 0 || answerIndex >= question.choices.length) return false;

  onlineSubmitting = true;
  setMobileAnswerControlsLocked(app, true);
  try {
    const attack = drawAttack(attackState, session.seat);
    attackState = attack.state;
    await controller.submitAnswer({
      questionIndex: room.questionIndex,
      answerIndex,
      correctAnswerIndex: question.answerIndex,
      attackType: attack.attackType,
    });
    return true;
  } finally {
    onlineSubmitting = false;
  }
}

async function handleOnlineBattleEvent(event, room) {
  if (!onlineController || !onlineDeck) return;
  if (event.type === 'rematch') {
    await ensureOnlineDeck(room);
    onlineView = 'battle';
    onlineAnimating = false;
    onlineLeaveConfirm = false;
    requestBattleOrientation();
    startOnlineClockTicker();
    audioManager?.playSfx('start');
    renderOnlineBattle(room);
    return;
  }
  if (event.type === 'timeout') {
    if (event.ended || room.status === 'ended') renderOnlineResult(room);
    else {
      audioManager?.playSfx('start');
      renderOnlineBattle(room);
    }
    return;
  }
  if (event.type === 'forfeit') {
    renderOnlineResult(room);
    return;
  }
  if (event.type !== 'answer') return;

  onlineAnimating = true;
  try {
    const question = onlineDeck.getQuestion(event.questionIndex);
    const progress = formatOnlineProgress(room, event.questionIndex);
    const actorChar = characterById(room.players?.[event.player]?.characterId);
    renderOnlineBattle(room, { questionOverride: question, progressOverride: progress });

    audioManager?.playSfx('buzz');
    if (event.correct) {
      audioManager?.playSfx('correct');
      audioManager?.playSfx('attack');
      const timing = attackTiming(event.attackType || 'energy');
      const anim = playBattleAnimation(app, {
        type: 'attack',
        player: event.player,
        opponent: event.opponent,
        damage: event.damage ?? 10,
      }, {
        attackType: event.attackType || 'energy',
        weapon: actorChar?.weapon,
        profile: actorChar?.attacks?.[event.attackType || 'energy'],
        attackFrames: actorChar?.states?.attack,
        duration: 650,
        impactDelay: timing.impactDelay,
      });
      if (timing.swingDelay === 0) audioManager?.playSfx('weapon');
      else setTimeout(() => { if (onlineView === 'battle') audioManager?.playSfx('weapon'); }, timing.swingDelay);
      await new Promise(resolve => setTimeout(resolve, timing.impactDelay));
      if (onlineView === 'battle') {
        audioManager?.playSfx('hit');
        audioManager?.playSfx('hurt');
      }
      await anim;
    } else {
      audioManager?.playSfx('wrong');
      await playBattleAnimation(app, {
        type: 'miss',
        player: event.player,
        opponent: event.opponent,
      }, {
        attackFrames: actorChar?.states?.miss,
        duration: 500,
      });
      if (event.questionAdvanced && onlineController) {
        renderOnlineBattle(room, {
          questionOverride: question,
          progressOverride: progress,
          statusOverride: `正確答案：${question.choices[event.correctAnswerIndex]}`,
          revealAnswerIndex: event.correctAnswerIndex,
        });
        await new Promise(resolve => { onlineRevealTimer = setTimeout(resolve, 900); });
        onlineRevealTimer = null;
      }
    }
  } finally {
    onlineAnimating = false;
  }

  const latest = onlineController?.getRoom();
  if (!latest) return;
  if (latest.status === 'ended') renderOnlineResult(latest);
  else if (onlineView === 'battle') renderOnlineBattle(latest);
}

function renderOnlineResult(room) {
  const session = onlineController?.getSession();
  if (!session) return;
  const firstEntry = onlineView !== 'result';
  onlineView = 'result';
  clearOnlineTimers();
  exitBattleOrientation();
  if (firstEntry) {
    if (room.endReason === 'ko') audioManager?.playSfx('ko');
    audioManager?.playSfx(room.winner === session.seat ? 'win' : 'lose');
  }
  app.innerHTML = shell(buildOnlineResultView({ room, seat: session.seat, escape: esc }));
  const hubBtn = app.querySelector('#online-result-hub');
  if (hubBtn) {
    hubBtn.onclick = async () => {
      await onlineController?.leaveRoom();
      clearOnlineSession();
      openOnlineHub();
    };
  }
  const homeBtn = app.querySelector('#online-result-home');
  if (homeBtn) {
    homeBtn.onclick = async () => {
      await onlineController?.leaveRoom();
      clearOnlineSession();
      returnToMainMenu();
    };
  }
  const rematchBtn = app.querySelector('#online-rematch-btn');
  if (rematchBtn) {
    rematchBtn.onclick = async () => {
      playUiSound('confirm');
      rematchBtn.disabled = true;
      await onlineController?.requestRematch();
    };
  }
}

function handleGameCodeInput(code) {
  if (app.querySelector('#key-hint')) {
    const needed = keyTestPlayers.flatMap(keysFor);
    keyHits = recordKeyTestKey(keyHits, needed, code);
    if (needed.includes(code)) app.querySelector(`[data-key="${code}"]`)?.classList.add('hit');
    app.querySelector('#key-hint').textContent = `已偵測 ${keyHits.size}／${needed.length} 個按鍵。`;
    if (isKeyTestComplete(keyHits, needed)) app.querySelector('#start').disabled = false;
    return;
  }
  const input = getAnswerInput(code);
  if (input && onlineView === 'battle') { void submitOnlineAnswer(input.answerIndex); return; }
  if (input && battleInputGate.isEnabled() && (battleSettings?.gameMode !== GAME_MODES.solo || input.player !== 'right')) void processAnswer(input);
}

function startGamepadLoop() {
  if (typeof window === 'undefined') return;
  const tick = () => {
    const events = pollGamepadEvents(gamepadState);
    for (const evt of events) {
      audioManager?.unlock();
      if (evt.type === 'start') {
        if (hasLiveBattle()) {
          if (pauseConfirmAction) cancelPauseConfirmation();
          else if (battlePause.isManualPaused()) continueBattle();
          else requestManualPause();
        }
      } else if (evt.code) {
        handleGameCodeInput(evt.code);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

document.addEventListener('pointerdown', () => audioManager?.unlock(), { once: true });
document.addEventListener('keydown', event => {
  audioManager?.unlock();
  const targetTag = event.target?.tagName;
  if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;
  if (event.code === 'Escape') {
    if (onlineView === 'battle') {
      event.preventDefault();
      if (event.repeat) return;
      onlineLeaveConfirm = !onlineLeaveConfirm;
      if (onlineController?.getRoom()) renderOnlineBattle(onlineController.getRoom());
      return;
    }
    if (!hasLiveBattle()) return;
    event.preventDefault();
    if (event.repeat) return;
    if (pauseConfirmAction) cancelPauseConfirmation();
    else if (battlePause.isManualPaused()) continueBattle();
    else requestManualPause();
    return;
  }
  if (!isGameKey(event.code)) return;
  event.preventDefault();
  if (event.repeat) return;
  handleGameCodeInput(event.code);
});

startGamepadLoop();

async function bootstrap() {
  return runLatestRequest({
    gate: bootstrapRequestGate,
    load: () => loadBootstrapResources(fetch),
    onLoading: () => {
      startAvailability = { ready: false, message: '正在載入遊戲資料……' };
      renderStartScreen();
      const retry = app.querySelector('#retry-start-load');
      if (retry) {
        retry.disabled = true;
        retry.setAttribute('aria-busy', 'true');
        retry.textContent = '載入中……';
      }
    },
    onSuccess: resources => {
      catalog = resources.catalog;
      battleManifest = resources.manifest;
      startAvailability = { ready: resources.ready, message: resources.message };
      audioManager = createAudioManager({ manifest: battleManifest, muted, volume: audioVolumes.master, musicVolume: audioVolumes.music, effectsVolume: audioVolumes.effects });
      if (!onlineInviteConsumed) {
        onlineInviteConsumed = true;
        const invite = readInviteParams(location?.search ?? '');
        if (invite.apiUrl) {
          onlineApiUrl = saveOnlineApiUrl(invite.apiUrl, localStorage) || invite.apiUrl;
        }
        if (invite.roomCode && resources.ready) {
          onlineInviteRoomCode = invite.roomCode;
          openOnlineHub({ status: `已自動帶入邀請房間碼：${invite.roomCode}` });
          return;
        }
      }
      renderStartScreen();
    },
    onError: error => {
      startAvailability = { ready: false, message: `遊戲資料載入失敗：${error.message}，請重試。` };
      renderStartScreen();
    },
  });
}

void bootstrap();
