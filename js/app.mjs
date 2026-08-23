import { createGameState, submitBuzzerAnswer } from './game-state.mjs';
import { getAnswerInput, isGameKey, PLAYER_KEYS } from './input.mjs';
import { applyCorrectAnswer, applyWrongAnswer, createBattleState, finishRegulation } from './battle-state.mjs';
import { createCharacterSelection, selectCharacter } from './character-select.mjs';
import { createAudioManager } from './audio-manager.mjs';
import { playBattleAnimation, renderBattle } from './battle-renderer.mjs';

const app = document.querySelector('#app');
let catalog = [], battleManifest = { scenes: [], characters: [], sfx: {} }, currentQuiz = null;
let quizState = null, combatState = null, audioManager = null, timerId = null;
let timeLeft = 0, regulationLimit = 0, battleSettings = null;
let characterSelection = createCharacterSelection(), keyHits = new Set(), animating = false;
let pendingRegulationEnd = false, activeQuestionIndex = null;
let muted = localStorage.getItem('dd2p-muted') === 'true';
const storedVolume = (key, fallback) => {
  const stored = localStorage.getItem(key);
  const value = Number(stored);
  return stored === null || !Number.isFinite(value) ? fallback : Math.max(0, Math.min(1, value));
};
const audioVolumes = { master: storedVolume('dd2p-volume-master', 0.8), music: storedVolume('dd2p-volume-music', 0.65), effects: storedVolume('dd2p-volume-effects', 0.9) };

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[char]);
const shuffle = values => [...values].sort(() => Math.random() - .5);
const header = () => '<div class="masthead"><div><p class="eyebrow">DD2P BATTLE EDITION</p><h1 class="title">雙人知識對決</h1></div><div class="round">2P</div></div>';
const shell = body => `<div class="shell">${header()}<section class="panel">${body}</section></div>`;
const playerName = player => player === 'left' ? '左方紅隊' : '右方藍隊';

function characterImage(character, state = 'idle') {
  const frames = character?.states?.[state] ?? character?.states?.idle ?? character?.image;
  return Array.isArray(frames) ? frames[0] : frames;
}
function characterById(id) { return battleManifest.characters.find(character => String(character.id) === String(id)); }
function playUiSound(name = 'menu') { audioManager?.unlock(); audioManager?.playSfx(name); }

function renderCatalog() {
  audioManager?.stop();
  app.innerHTML = shell(`<p class="lead">選一個題庫，把教室變成真正的搶答擂台。</p><div class="quiz-grid">${catalog.map(quiz => `<button class="quiz-card" data-quiz="${esc(quiz.id)}"><strong>${esc(quiz.name)}</strong><span>${quiz.questions} 題可用</span></button>`).join('')}</div><p class="hint">共 ${catalog.length} 份題庫。空白或不完整題庫已自動排除。</p>`);
  app.querySelectorAll('[data-quiz]').forEach(button => button.onclick = () => { playUiSound(); selectQuiz(button.dataset.quiz); });
}
async function selectQuiz(id) {
  const item = catalog.find(quiz => quiz.id === id);
  currentQuiz = await fetch(item.file).then(response => response.json());
  renderRules();
}

function renderRules() {
  app.innerHTML = shell(`<p class="lead"><b>${esc(currentQuiz.name)}</b>　${currentQuiz.questions.length} 題可用</p><div class="form-row"><label class="mode"><input type="radio" name="mode" value="questions" checked><b>固定題數制</b><small>答完指定題數後結算；平手進入驟死題。</small></label><label class="mode"><input type="radio" name="mode" value="time"><b>限時制</b><small>時間到結算；平手進入驟死題。</small></label></div><label><span id="limit-label">題數</span><input id="limit" class="number" type="number" min="1" max="${currentQuiz.questions.length}" value="${Math.min(10,currentQuiz.questions.length)}"></label><div class="actions"><button class="secondary" id="back">返回題庫</button><button class="primary" id="next">選擇戰場</button></div>`);
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
    renderArenaSelect({ mode, limit: value });
  };
}

function renderArenaSelect(settings, selectedId = battleManifest.scenes[0]?.id) {
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
  app.innerHTML = shell(`<h2 class="selection-title">雙方選擇角色</h2><p class="lead">同一名角色不能重複選擇。請先選紅方，再選藍方。</p><div class="versus-select"><section class="select-side left"><h3>左方玩家　紅隊</h3>${selectedPreview('left')}<div class="character-grid">${characterCards('left')}</div></section><div class="select-vs">VS</div><section class="select-side right"><h3>右方玩家　藍隊</h3>${selectedPreview('right')}<div class="character-grid">${characterCards('right')}</div></section></div>${battleManifest.characters.length ? '' : '<p class="error">角色素材尚未完成，請重新執行素材準備程序。</p>'}<div class="actions"><button class="secondary" id="back">返回戰場</button><button class="primary" id="next" ${characterSelection.left && characterSelection.right ? '' : 'disabled'}>前往按鍵測試</button></div>`);
  app.querySelectorAll('[data-character]').forEach(button => button.onclick = () => {
    try {
      characterSelection = selectCharacter(characterSelection, button.dataset.player, characterById(button.dataset.character));
      playUiSound(); renderCharacterSelect(settings);
    } catch (error) { app.querySelector('.lead').textContent = error.message; }
  });
  app.querySelector('#back').onclick = () => renderArenaSelect(settings, settings.arenaId);
  app.querySelector('#next').onclick = () => { playUiSound('start'); renderKeyTest({ ...settings, characters: { ...characterSelection } }); };
}

function keysFor(player) { return [...PLAYER_KEYS[player].navigation, ...PLAYER_KEYS[player].answers]; }
function renderKeyTest(settings) {
  keyHits = new Set();
  app.innerHTML = shell(`<p class="lead">請兩位玩家各按一次自己的全部按鍵。亮起黃色即表示已偵測。</p><div class="keytest">${['left','right'].map(player => `<div class="player ${player}"><b>${playerName(player)}</b><div class="keys">${keysFor(player).map(code => `<span class="key" data-key="${code}">${esc(code.replace('Key','').replace('Digit',''))}</span>`).join('')}</div></div>`).join('')}</div><p id="key-hint" class="hint">請開始測試按鍵。</p><div class="actions"><button class="secondary" id="back">返回選角</button><button class="primary" id="start" disabled>開始對戰</button></div>`);
  app.querySelector('#back').onclick = () => renderCharacterSelect(settings);
  app.querySelector('#start').onclick = () => startGame(settings);
}

async function startGame(settings) {
  battleSettings = settings;
  currentQuiz = { ...currentQuiz, activeQuestions: shuffle(currentQuiz.questions) };
  quizState = createGameState({ mode: 'time', limit: Number.MAX_SAFE_INTEGER });
  combatState = createBattleState();
  regulationLimit = settings.mode === 'questions' ? Math.min(settings.limit, currentQuiz.questions.length) : Infinity;
  timeLeft = settings.mode === 'time' ? settings.limit : null;
  animating = false; pendingRegulationEnd = false; activeQuestionIndex = null;
  if (timerId) clearInterval(timerId);
  await audioManager?.setScene(settings.arenaId);
  await audioManager?.unlock();
  await audioManager?.playSfx('start');
  if (settings.mode === 'time') timerId = setInterval(handleTimer, 1000);
  renderGame();
}
function handleTimer() {
  if (combatState?.ended || combatState?.phase === 'sudden-death') return;
  timeLeft = Math.max(0, timeLeft - 1);
  if (timeLeft <= 0) {
    clearInterval(timerId); timerId = null;
    if (animating) pendingRegulationEnd = true;
    else closeRegulation({ advanceQuestion: true });
  }
  if (!combatState.ended && !animating) renderGame();
}
function ensureQuestion() {
  if (quizState.questionIndex >= currentQuiz.activeQuestions.length) currentQuiz.activeQuestions.push(...shuffle(currentQuiz.questions));
}
function closeRegulation({ advanceQuestion = false } = {}) {
  combatState = finishRegulation(combatState);
  if (combatState.ended) renderResult();
  else {
    if (advanceQuestion) quizState = { ...quizState, questionIndex: quizState.questionIndex + 1, phase: 'open', eligiblePlayers: ['left','right'], lockedPlayer: null, ended: false };
    else quizState = { ...quizState, phase: 'open', eligiblePlayers: ['left','right'], lockedPlayer: null, ended: false };
    audioManager?.playSfx('start'); ensureQuestion();
  }
}
function currentStatus() {
  if (combatState.phase === 'sudden-death') return '驟死決勝：第一位答對者立即獲勝！';
  if (quizState.eligiblePlayers.length === 1) return `${playerName(quizState.eligiblePlayers[0])}可作答`;
  return '兩位玩家請搶答　｜　答對攻擊 −10 HP，答錯交給對手';
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
function renderGame({ allowEnded = false, questionOverride = null, progressOverride = null } = {}) {
  if (combatState.ended && !allowEnded) return renderResult();
  ensureQuestion();
  const question = questionOverride ?? currentQuiz.activeQuestions[quizState.questionIndex];
  const scene = battleManifest.scenes.find(item => item.id === battleSettings.arenaId) ?? battleManifest.scenes[0];
  const left = characterById(battleSettings.characters.left), right = characterById(battleSettings.characters.right);
  renderBattle(app, {
    scene,
    baseUrl: location.href,
    audio: audioVolumes,
    players: {
      left: { name: left.name || `角色 ${left.id}`, health: combatState.health.left, score: combatState.scores.left, image: characterImage(left) },
      right: { name: right.name || `角色 ${right.id}`, health: combatState.health.right, score: combatState.scores.right, image: characterImage(right) },
    },
    progress: progressOverride ?? (combatState.phase === 'sudden-death' ? 'SUDDEN' : timeLeft === null ? `${Math.min(quizState.questionIndex + 1, regulationLimit)}／${regulationLimit}` : `${timeLeft}s`),
    prompt: question.prompt, questionImage: question.image, choices: question.choices,
    status: currentStatus(), phase: combatState.phase,
  });
  bindAudioToggle();
}

async function processAnswer(input) {
  if (animating || !quizState || combatState.ended) return;
  ensureQuestion();
  activeQuestionIndex = quizState.questionIndex;
  const question = currentQuiz.activeQuestions[quizState.questionIndex];
  const nextQuizState = submitBuzzerAnswer(quizState, input.player, input.answerIndex, question.answerIndex);
  if (nextQuizState === quizState) return;
  const correct = input.answerIndex === question.answerIndex;
  quizState = nextQuizState; animating = true;
  const answerProgress = combatState.phase === 'sudden-death' ? 'SUDDEN' : timeLeft === null ? `${Math.min(activeQuestionIndex + 1, regulationLimit)}／${regulationLimit}` : `${timeLeft}s`;
  if (correct) {
    combatState = applyCorrectAnswer(combatState, input.player); renderGame({ allowEnded: true, questionOverride: question, progressOverride: answerProgress });
    audioManager?.playSfx('buzz'); audioManager?.playSfx('correct'); audioManager?.playSfx('attack');
    audioManager?.playSfx('weapon');
    const actor = characterById(battleSettings.characters[input.player]);
    const animation = playBattleAnimation(app, combatState.animation, { weapon: actor?.weapon, duration: 650 });
    await new Promise(resolve => setTimeout(resolve, 420));
    audioManager?.playSfx('hit'); audioManager?.playSfx('hurt');
    await animation;
  } else {
    combatState = applyWrongAnswer(combatState, input.player); renderGame({ questionOverride: question, progressOverride: answerProgress });
    audioManager?.playSfx('buzz'); audioManager?.playSfx('wrong');
    await playBattleAnimation(app, combatState.animation, { duration: 500 });
  }
  animating = false;
  if (combatState.ended) return renderResult();
  if (pendingRegulationEnd) {
    pendingRegulationEnd = false;
    const needsFreshQuestion = quizState.questionIndex === activeQuestionIndex;
    activeQuestionIndex = null;
    closeRegulation({ advanceQuestion: needsFreshQuestion });
    if (!combatState.ended) renderGame();
    return;
  }
  activeQuestionIndex = null;
  if (battleSettings.mode === 'questions' && combatState.phase === 'regulation' && quizState.questionIndex >= regulationLimit) closeRegulation();
  if (!combatState.ended) renderGame();
}

function renderResult() {
  if (app.querySelector('.result')) return;
  if (timerId) clearInterval(timerId); timerId = null;
  const winner = combatState.winner ? playerName(combatState.winner) : '平手';
  const reason = combatState.endReason === 'ko' ? 'KO！' : combatState.endReason === 'sudden-death' ? '驟死決勝！' : '分數勝利！';
  if (combatState.endReason === 'ko') audioManager?.playSfx('ko');
  audioManager?.playSfx('win'); audioManager?.playSfx('lose');
  app.innerHTML = shell(`<article class="result"><p class="lead">本局結算　${esc(reason)}</p><div class="winner">${esc(winner)}獲勝！</div><p class="prompt">紅隊 ${combatState.scores.left} 分　：　藍隊 ${combatState.scores.right} 分</p><div class="actions"><button class="secondary" id="catalog">更換題庫</button><button class="primary" id="again">再玩一次</button></div></article>`);
  app.querySelector('#catalog').onclick = () => { characterSelection = createCharacterSelection(); renderCatalog(); };
  app.querySelector('#again').onclick = () => { audioManager?.stop(); characterSelection = createCharacterSelection(); renderRules(); };
}

document.addEventListener('pointerdown', () => audioManager?.unlock(), { once: true });
document.addEventListener('keydown', event => {
  audioManager?.unlock();
  if (!isGameKey(event.code)) return;
  event.preventDefault();
  if (event.repeat) return;
  if (app.querySelector('#key-hint')) {
    keyHits.add(event.code); app.querySelector(`[data-key="${event.code}"]`)?.classList.add('hit');
    const needed = Object.values(PLAYER_KEYS).flatMap(keys => [...keys.navigation, ...keys.answers]);
    app.querySelector('#key-hint').textContent = `已偵測 ${keyHits.size}／${needed.length} 個按鍵。`;
    if (needed.every(code => keyHits.has(code))) app.querySelector('#start').disabled = false;
    return;
  }
  const input = getAnswerInput(event.code); if (input) processAnswer(input);
});

Promise.all([
  fetch('./data/catalog.json').then(response => response.ok ? response.json() : Promise.reject(new Error('catalog'))),
  fetch('./assets/battle/manifest.json').then(response => response.ok ? response.json() : Promise.reject(new Error('battle manifest'))),
]).then(([data, manifest]) => {
  catalog = data.quizzes; battleManifest = manifest;
  audioManager = createAudioManager({ manifest, muted, volume: audioVolumes.master, musicVolume: audioVolumes.music, effectsVolume: audioVolumes.effects }); renderCatalog();
}).catch(() => { app.innerHTML = shell('<p class="error">題庫或對戰素材尚未產生。請先執行 npm run convert 與 npm run prepare:battle。</p>'); });
