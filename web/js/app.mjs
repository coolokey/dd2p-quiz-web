import { createGameState, submitBuzzerAnswer } from './game-state.mjs';
import { getAnswerInput, isGameKey, PLAYER_KEYS } from './input.mjs';
import { applyCorrectAnswer, applyWrongAnswer, createBattleState, finishRegulation } from './battle-state.mjs';
import { createCharacterSelection, selectCharacter } from './character-select.mjs';
import { createAudioManager } from './audio-manager.mjs';
import { playBattleAnimation, renderBattle } from './battle-renderer.mjs';
import { createAnswerPositionState, prepareQuestionRound } from './question-randomizer.mjs';
import { attackTiming, createAttackState, drawAttack } from './attack-randomizer.mjs';
import { attemptBattleSetup, bindCharacterActions, buildCharacterActions, isKeyTestComplete, recordKeyTestKey } from './prebattle-flow.mjs';
import { buildSubjectButtons, buildSubjectFilters, filterCatalog } from './catalog-filter.mjs';
import { bindStartScreen, buildStartScreen, resolveStartSceneUrl } from './start-screen.mjs';
import { battleStatus, GAME_MODES, getCharacterSelectionReadiness, playersForKeyTest, selectCpuCharacter } from './game-mode.mjs';
import { createCpuController } from './cpu-player.mjs';
import { createBattleLifecycle } from './battle-lifecycle.mjs';
import { createBattleSessionCoordinator } from './battle-session-coordinator.mjs';
import { fetchJson, loadBootstrapResources } from './resource-loader.mjs';
import { createBattleInputGate, createLatestSessionGate, markQuizRequestLoading, runLatestRequest, runStartSession } from './async-navigation.mjs';
import { createBattleOrientationController, createBattlePauseCoordinator } from './battle-orientation.mjs';
import { bindMobileAnswerControls, setMobileAnswerControlsLocked, syncTouchCapabilityClass } from './mobile-controls.mjs';

const app = document.querySelector('#app');
syncTouchCapabilityClass(document.documentElement, navigator);
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
const cpuController = createCpuController();
const battlePause = createBattlePauseCoordinator({
  isLiveBattle: hasLiveBattle,
  disableInput: () => battleInputGate.disable(),
  pauseCpu: pauseBattleCpu,
  clearTimer: clearBattleTimer,
  renderBattle: () => renderGame(),
  resumeCpu: () => cpuController.resume(),
  enableInput: () => battleInputGate.enable(),
  startTimer: startBattleTimer,
});
const orientationController = createBattleOrientationController({
  onPortraitChange: handleBattleOrientationChange,
  onVisibilityChange: battlePause.setBackgroundPaused,
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
  return startGame(settings);
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

function handleBattleOrientationChange(portrait) {
  return battlePause.setOrientationPaused(portrait);
}

function pauseBattleCpu() {
  cpuController.pause();
  if (battleLifecycle.isAnimating() && cpuController.remainingMs() === null) battleLifecycle.cancel();
}

function startBattleTimer() {
  if (timerId !== null || battlePause.isPaused() || battleSettings?.mode !== 'time' || !combatState || combatState?.ended) return false;
  timerId = setInterval(handleTimer, 1000);
  return true;
}

function exitBattleOrientation() {
  orientationController.exitBattle();
  battlePause.reset();
}

function stopBattleActivity() {
  battleInputGate.disable();
  exitBattleOrientation();
  battleSession.stopBattleActivity();
  audioManager?.stopEffects?.();
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
  characterSelection = createCharacterSelection();
  gameMode = null;
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
      gameMode = mode; playUiSound('confirm'); renderCatalog();
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
    load: () => fetchJson(item.file, fetch),
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
  const cards = battleManifest.scenes.map(scene => `<button class="arena-card ${scene.id === selectedId ? 'is-selected' : ''}" data-arena-id="${esc(scene.id)}"><img src="${esc(scene.image)}" alt="${esc(scene.label)}"><span>${esc(scene.label)}</span></button>`).join('');
  app.innerHTML = shell(`<h2 class="selection-title">選擇本局戰場</h2><p class="lead">三個原版場景都能使用，並各自搭配原版背景音樂。</p><div class="arena-grid">${cards}</div><div class="actions"><button class="secondary" id="back">返回規則</button><button class="primary" id="next">選擇角色</button></div>`);
  let arenaId = selectedId;
  app.querySelectorAll('[data-arena-id]').forEach(button => button.onclick = () => {
    arenaId = button.dataset.arenaId;
    app.querySelectorAll('.arena-card').forEach(card => card.classList.toggle('is-selected', card === button));
    playUiSound();
  });
  app.querySelector('#back').onclick = renderRules;
  app.querySelector('#next').onclick = () => { playUiSound('confirm'); renderCharacterSelect({ ...settings, arenaId }); };
}

function characterCards(player) {
  const opponent = player === 'left' ? 'right' : 'left';
  return battleManifest.characters.map(character => {
    const id = String(character.id), selected = characterSelection[player] === id;
    const unavailable = character.playable === false || characterSelection[opponent] === id;
    return `<button class="character-card ${selected ? 'is-selected' : ''}" data-character="${esc(id)}" data-player="${player}" ${unavailable ? 'disabled' : ''}><img src="${esc(characterImage(character))}" alt=""><b>${esc(character.name || `角色 ${id}`)}</b></button>`;
  }).join('');
}
function selectedPreview(player) {
  const character = characterById(characterSelection[player]);
  return character ? `<div class="selected-fighter"><img src="${esc(characterImage(character))}" alt="${esc(character.name || `角色 ${character.id}`)}"></div>` : '<div class="selected-fighter"><b>尚未選擇</b></div>';
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
    onTest: () => attemptBattleSetup(selectedSettings, selected => { playUiSound('start'); renderKeyTest(selected); }, showSetupError),
    onSkip: () => attemptBattleSetup(selectedSettings, selected => startGameOnce(selected), showSetupError),
  });
}

function keysFor(player) { return [...PLAYER_KEYS[player].navigation, ...PLAYER_KEYS[player].answers]; }
function renderKeyTest(settings) {
  cancelPendingStart();
  keyHits = new Set();
  keyTestPlayers = playersForKeyTest(settings.gameMode);
  const instruction = keyTestPlayers.length === 1 ? '請按一次自己的全部按鍵。亮起黃色即表示已偵測。' : '請兩位玩家各按一次自己的全部按鍵。亮起黃色即表示已偵測。';
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
  battleLifecycle.reset();
  battleSession.reset();
  battleSettings = settings;
  answerPositionState = createAnswerPositionState();
  currentQuiz = { ...currentQuiz, activeQuestions: prepareQuestionRound(currentQuiz.questions, Math.random, answerPositionState) };
  quizState = createGameState({ mode: 'time', limit: Number.MAX_SAFE_INTEGER });
  combatState = createBattleState();
  regulationLimit = settings.mode === 'questions' ? Math.min(settings.limit, currentQuiz.questions.length) : Infinity;
  timeLeft = settings.mode === 'time' ? settings.limit : null;
  activeQuestionIndex = null;
  attackState = createAttackState();
  clearBattleTimer();
}

function renderQuizError(error) {
  stopBattleActivity();
  app.innerHTML = shell(`<h2 class="selection-title">題庫錯誤</h2><p class="error">無法開始此題庫：${esc(error.message)}</p><p class="hint">請更換題庫，或檢查每題是否有 2 至 4 個選項與有效正確答案。</p><div class="actions"><button class="primary" id="back-catalog">返回題庫</button></div>`);
  app.querySelector('#back-catalog').onclick = renderCatalog;
}
function handleTimer() {
  if (combatState?.ended || combatState?.phase === 'sudden-death') return;
  timeLeft = Math.max(0, timeLeft - 1);
  if (timeLeft <= 0) {
    battleSession.timerExpired();
  }
  if (!combatState.ended && !battleLifecycle.isAnimating()) renderGame();
}
function ensureQuestion() {
  if (quizState.questionIndex >= currentQuiz.activeQuestions.length) {
    currentQuiz.activeQuestions.push(...prepareQuestionRound(currentQuiz.questions, Math.random, answerPositionState));
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
    orientationPaused: battlePause.isOrientationPaused(),
    players: {
      left: { name: left.name || `角色 ${left.id}`, health: combatState.health.left, score: combatState.scores.left, image: characterImage(left) },
      right: { name: right.name || `角色 ${right.id}`, health: combatState.health.right, score: combatState.scores.right, image: characterImage(right) },
    },
    progress: progressOverride ?? (combatState.phase === 'sudden-death' ? 'SUDDEN' : timeLeft === null ? `${Math.min(quizState.questionIndex + 1, regulationLimit)}／${regulationLimit}` : `${timeLeft}s`),
    prompt: question.prompt, questionImage: question.image, choices: question.choices,
    status: statusOverride ?? currentStatus(), phase: combatState.phase, revealAnswerIndex,
  });
  bindAudioToggle();
  bindMobileAnswerControls(app, { onAnswer: input => void processAnswer(input) });
  const returnButton = app.querySelector('[data-return-main-menu]');
  if (returnButton) returnButton.onclick = returnToMainMenu;
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

async function animateBattleAnswer(outcome) {
  setMobileAnswerControlsLocked(app, true);
  if (outcome.correct) {
    const animation = playBattleAnimation(app, combatState.animation, {
      attackType: outcome.attack.attackType,
      weapon: outcome.actor?.weapon,
      attackFrames: outcome.actor?.states?.attack,
      duration: 650,
      impactDelay: outcome.timing.impactDelay,
    });
    if (outcome.timing.swingDelay === 0) audioManager?.playSfx('weapon');
    else setTimeout(() => audioManager?.playSfx('weapon'), outcome.timing.swingDelay);
    await new Promise(resolve => setTimeout(resolve, outcome.timing.impactDelay));
    audioManager?.playSfx('hit'); audioManager?.playSfx('hurt');
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
      renderGame();
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
  app.querySelector('#catalog').onclick = () => { characterSelection = createCharacterSelection(); renderCatalog(); };
  app.querySelector('#main-menu').onclick = returnToMainMenu;
  app.querySelector('#again').onclick = () => { audioManager?.stop(); characterSelection = createCharacterSelection(); renderRules(); };
}

document.addEventListener('pointerdown', () => audioManager?.unlock(), { once: true });
document.addEventListener('keydown', event => {
  audioManager?.unlock();
  if (!isGameKey(event.code)) return;
  event.preventDefault();
  if (event.repeat) return;
  if (app.querySelector('#key-hint')) {
    const needed = keyTestPlayers.flatMap(keysFor);
    keyHits = recordKeyTestKey(keyHits, needed, event.code);
    if (needed.includes(event.code)) app.querySelector(`[data-key="${event.code}"]`)?.classList.add('hit');
    app.querySelector('#key-hint').textContent = `已偵測 ${keyHits.size}／${needed.length} 個按鍵。`;
    if (isKeyTestComplete(keyHits, needed)) app.querySelector('#start').disabled = false;
    return;
  }
  const input = getAnswerInput(event.code);
  if (input && battleInputGate.isEnabled() && (battleSettings?.gameMode !== GAME_MODES.solo || input.player !== 'right')) void processAnswer(input);
});

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
      renderStartScreen();
    },
    onError: error => {
      startAvailability = { ready: false, message: `遊戲資料載入失敗：${error.message}，請重試。` };
      renderStartScreen();
    },
  });
}

void bootstrap();
