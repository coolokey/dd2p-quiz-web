import { createGameState, endGame, submitBuzzerAnswer } from './game-state.mjs';
import { getAnswerInput, isGameKey, PLAYER_KEYS } from './input.mjs';

const app = document.querySelector('#app');
let catalog = [];
let currentQuiz = null;
let state = null;
let timerId = null;
let timeLeft = 0;
let keyHits = new Set();

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[char]);
const shuffle = values => [...values].sort(() => Math.random() - .5);
const header = subtitle => `<div class="masthead"><div><p class="eyebrow">DD2P WEB EDITION</p><h1 class="title">雙人知識對決</h1></div><div class="round">2P</div></div>${subtitle ? `<p class="lead">${subtitle}</p>` : ''}`;
const shell = body => `<div class="shell">${header()}<section class="panel">${body}</section></div>`;

function renderCatalog() {
  app.innerHTML = shell(`<p class="lead">選一個題庫，把教室變成真正的搶答擂台。</p><div class="quiz-grid">${catalog.map(quiz => `<button class="quiz-card" data-quiz="${esc(quiz.id)}"><strong>${esc(quiz.name)}</strong><span>${quiz.questions} 題可用</span></button>`).join('')}</div><p class="hint">共 ${catalog.length} 份題庫。空白或不完整題庫已自動排除。</p>`);
  app.querySelectorAll('[data-quiz]').forEach(button => button.addEventListener('click', () => selectQuiz(button.dataset.quiz)));
}

async function selectQuiz(id) {
  const item = catalog.find(quiz => quiz.id === id);
  currentQuiz = await fetch(item.file).then(response => response.json());
  renderRules();
}

function renderRules() {
  app.innerHTML = shell(`<p class="lead"><b>${esc(currentQuiz.name)}</b>　${currentQuiz.questions.length} 題可用</p><div class="form-row"><label class="mode"><input type="radio" name="mode" value="questions" checked><b>固定題數制</b><small>答完指定題數後結算。</small></label><label class="mode"><input type="radio" name="mode" value="time"><b>限時制</b><small>時間到立刻結算。</small></label></div><label><span id="limit-label">題數</span><input id="limit" class="number" type="number" min="1" max="${currentQuiz.questions.length}" value="10"></label><div class="actions"><button class="secondary" id="back">返回題庫</button><button class="primary" id="next">前往按鍵測試</button></div>`);
  const limit = app.querySelector('#limit');
  app.querySelectorAll('[name=mode]').forEach(input => input.addEventListener('change', () => { const timed = input.value === 'time' && input.checked; app.querySelector('#limit-label').textContent = timed ? '秒數' : '題數'; limit.value = timed ? 60 : Math.min(10, currentQuiz.questions.length); limit.max = timed ? 600 : currentQuiz.questions.length; }));
  app.querySelector('#back').onclick = renderCatalog;
  app.querySelector('#next').onclick = () => { const mode = app.querySelector('[name=mode]:checked').value; const maximum = mode === 'time' ? 600 : currentQuiz.questions.length; const value = Math.min(maximum, Math.max(1, Number(limit.value) || (mode === 'time' ? 60 : 10))); renderKeyTest({ mode, limit: value }); };
}

function keysFor(player) { return [...PLAYER_KEYS[player].navigation, ...PLAYER_KEYS[player].answers]; }
function renderKeyTest(settings) {
  keyHits = new Set();
  app.innerHTML = shell(`<p class="lead">請兩位玩家各按一次自己的全部按鍵。亮起黃色即表示已偵測。</p><div class="keytest">${['left','right'].map(player => `<div class="player ${player}"><b>${player === 'left' ? '左方玩家　紅隊' : '右方玩家　藍隊'}</b><div class="keys">${keysFor(player).map(code => `<span class="key" data-key="${code}">${esc(code.replace('Key','').replace('Digit',''))}</span>`).join('')}</div></div>`).join('')}</div><p id="key-hint" class="hint">請開始測試按鍵。</p><div class="actions"><button class="secondary" id="back">返回設定</button><button class="primary" id="start" disabled>開始對戰</button></div>`);
  app.querySelector('#back').onclick = renderRules;
  app.querySelector('#start').onclick = () => startGame(settings);
}

function startGame(settings) {
  const selected = shuffle(currentQuiz.questions).slice(0, settings.mode === 'questions' ? Math.min(settings.limit, currentQuiz.questions.length) : currentQuiz.questions.length);
  currentQuiz = { ...currentQuiz, activeQuestions: selected };
  state = createGameState(settings);
  timeLeft = settings.mode === 'time' ? settings.limit : null;
  if (timerId) clearInterval(timerId);
  if (settings.mode === 'time') timerId = setInterval(() => { timeLeft--; if (timeLeft <= 0) { clearInterval(timerId); state = endGame(state); } renderGame(); }, 1000);
  renderGame();
}

function renderGame() {
  if (state.ended || state.questionIndex >= currentQuiz.activeQuestions.length) { if (timerId) clearInterval(timerId); return renderResult(); }
  const question = currentQuiz.activeQuestions[state.questionIndex];
  const label = state.phase === 'locked' ? `${state.lockedPlayer === 'left' ? '左方紅隊' : '右方藍隊'}作答中` : state.eligiblePlayers.length === 1 ? `${state.eligiblePlayers[0] === 'left' ? '左方紅隊' : '右方藍隊'}可作答` : '兩位玩家請搶答';
  app.innerHTML = shell(`<div class="scorebar"><div class="score">紅隊　<b>${state.scores.left}</b></div><div class="clock">${timeLeft === null ? `${state.questionIndex + 1}／${currentQuiz.activeQuestions.length}` : `${timeLeft}s`}</div><div class="score right">藍隊　<b>${state.scores.right}</b></div></div><article class="question">${question.image ? `<img src="${esc(question.image)}" alt="題目圖片">` : ''}<h2 class="prompt">${esc(question.prompt)}</h2><div class="choices">${question.choices.map((choice,index) => `<div class="choice"><span class="badge">${index + 1}</span>${esc(choice)}</div>`).join('')}</div></article><p class="status">${label}　｜　答對 ＋1，答錯不扣分。</p>`);
}

function renderResult() {
  const { left, right } = state.scores;
  const winner = left === right ? '平手！再戰一局' : left > right ? '紅隊獲勝！' : '藍隊獲勝！';
  app.innerHTML = shell(`<article class="result"><p class="lead">本局結算</p><div class="winner">${winner}</div><p class="prompt">紅隊 ${left} 分　：　藍隊 ${right} 分</p><div class="actions"><button class="secondary" id="catalog">更換題庫</button><button class="primary" id="again">再玩一次</button></div></article>`);
  app.querySelector('#catalog').onclick = renderCatalog;
  app.querySelector('#again').onclick = renderRules;
}

document.addEventListener('keydown', event => {
  if (!isGameKey(event.code)) return;
  event.preventDefault();
  if (app.querySelector('#key-hint')) {
    keyHits.add(event.code); app.querySelector(`[data-key="${event.code}"]`)?.classList.add('hit');
    const needed = Object.values(PLAYER_KEYS).flatMap(keys => [...keys.navigation, ...keys.answers]);
    app.querySelector('#key-hint').textContent = `已偵測 ${keyHits.size}／${needed.length} 個按鍵。`;
    if (needed.every(code => keyHits.has(code))) app.querySelector('#start').disabled = false;
    return;
  }
  if (!state || state.ended) return;
  const input = getAnswerInput(event.code);
  if (!input) return;
  const question = currentQuiz.activeQuestions[state.questionIndex];
  state = state.phase === 'open' ? submitBuzzerAnswer(state, input.player, input.answerIndex, question.answerIndex) : state;
  renderGame();
});

fetch('./data/catalog.json').then(response => response.ok ? response.json() : Promise.reject()).then(data => { catalog = data.quizzes; renderCatalog(); }).catch(() => { app.innerHTML = shell('<p class="error">題庫尚未產生。請先執行 npm run convert。</p>'); });
