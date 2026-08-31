import { readFile } from 'node:fs/promises';

export async function flushMicrotasks() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function createClock() {
  let now = 0;
  const timers = [];
  function schedule(callback, delay, interval = false) {
    const timer = { callback, delay, at: now + delay, active: true, interval };
    timers.push(timer);
    return timer;
  }
  return {
    timers,
    now: () => now,
    setTimeout: (callback, delay) => schedule(callback, delay),
    setInterval: (callback, delay) => schedule(callback, delay, true),
    clear: timer => { if (timer) timer.active = false; },
    async tick(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const timer = timers.filter(item => item.active && item.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!timer) break;
        now = timer.at;
        if (timer.interval) timer.at += timer.delay;
        else timer.active = false;
        timer.callback();
        await flushMicrotasks();
      }
      now = target;
      await flushMicrotasks();
    },
  };
}

// A small DOM boundary double: production renderBattle supplies the markup,
// and production focus handlers operate on shared element identities.
function createDocument() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    visibilityState: 'visible',
    documentElement: { classList: { toggle() {} } },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    dispatch: (name, event) => listeners.get(name)?.(event),
  };
  let html = '';
  let elements = new Map();
  const matches = (attributes, selector, tag) => {
    if (selector === 'button') return tag === 'button';
    if (selector.startsWith('.')) return (attributes.class ?? '').split(' ').includes(selector.slice(1));
    if (selector.startsWith('#')) return attributes.id === selector.slice(1);
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return attribute && Object.hasOwn(attributes, attribute[1]) && (attribute[2] === undefined || attributes[attribute[1]] === attribute[2]);
  };
  function queryAll(selector, content = html) {
    const found = [];
    for (const match of content.matchAll(/<(button|input|aside|div|article)\b([^>]*)>/g)) {
      const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(item => [item[1], item[2] ?? '']));
      if (!matches(attributes, selector, match[1])) continue;
      const key = match[0];
      if (!elements.has(key)) {
        const element = {
          disabled: Object.hasOwn(attributes, 'disabled'),
          value: attributes.value,
          dataset: Object.fromEntries(Object.entries(attributes).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])),
          getAttribute: name => attributes[name],
          setAttribute: (name, value) => { attributes[name] = value; },
          addEventListener(name, callback) { this[`on${name}`] = callback; },
          ownerDocument: document,
          focus() { document.activeElement = this; },
        };
        if (match[1] === 'aside' || attributes.class === 'battle-pause-overlay') {
          const start = content.indexOf(match[0]);
          const dialogHtml = match[1] === 'aside' ? content.slice(start, content.indexOf('</aside>', start)) : content.slice(start);
          element.querySelector = target => queryAll(target, dialogHtml)[0] ?? null;
          element.querySelectorAll = () => queryAll('button', dialogHtml);
        }
        elements.set(key, element);
      }
      found.push(elements.get(key));
    }
    return found;
  }
  const app = {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; elements = new Map(); },
    querySelector: selector => queryAll(selector)[0] ?? null,
    querySelectorAll: selector => queryAll(selector),
  };
  document.querySelector = selector => selector === '#app' ? app : app.querySelector(selector);
  return { document, app };
}

export async function createBattleAppHarness({
  gameMode = 'solo',
  navigatorRef = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)', platform: 'Linux armv8l', maxTouchPoints: 0 },
} = {}) {
  const source = await readFile(new URL('../../web/js/app.mjs', import.meta.url), 'utf8');
  const imports = {};
  for (const match of source.matchAll(/^import \{ ([^}]+) \} from '(\.\/[^']+)';/gm)) {
    const module = await import(new URL(`../../web/js/${match[2].slice(2)}`, import.meta.url));
    for (const name of match[1].split(', ')) imports[name] = module[name];
  }
  const clock = createClock();
  const { app, document } = createDocument();
  const audios = [];
  const animations = [];
  const settlements = [];
  const cpuRandomCalls = [];
  const audioFactory = src => {
    const audio = {
      src, currentTime: 37, playCount: 0, pauseCount: 0, paused: true,
      play() { this.playCount += 1; this.paused = false; return Promise.resolve(); },
      pause() { this.pauseCount += 1; this.paused = true; },
    };
    audios.push(audio);
    return audio;
  };
  const realCpu = imports.createCpuController;
  const realLifecycle = imports.createBattleLifecycle;
  const realOrientation = imports.createBattleOrientationController;
  const viewport = { innerWidth: 844, innerHeight: 390 };
  const realAttackState = imports.createAttackState;
  imports.createAttackState = () => realAttackState(() => 0);
  imports.createCpuController = () => realCpu({ setTimer: clock.setTimeout, clearTimer: clock.clear, now: clock.now, random: () => { cpuRandomCalls.push(clock.now()); return 0; } });
  imports.createBattleLifecycle = options => realLifecycle({
    ...options,
    wait: milliseconds => new Promise(resolve => clock.setTimeout(resolve, milliseconds)),
    afterAnswer: outcome => { settlements.push('after'); return options.afterAnswer(outcome); },
    onSettled: (outcome, settlement) => { settlements.push('settled'); return options.onSettled(outcome, settlement); },
  });
  imports.createBattleOrientationController = options => realOrientation({ ...options, documentRef: document, windowRef: viewport, screenRef: {}, navigatorRef });
  imports.playBattleAnimation = () => new Promise(resolve => animations.push({ resolve }));
  const globals = {
    document,
    navigator: navigatorRef,
    location: { href: 'http://localhost/' },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clear,
    setInterval: clock.setInterval,
    clearInterval: clock.clear,
    audioFactory,
  };
  const body = source.replace(/^import .*;\r?\n/gm, '').replace(/void bootstrap\(\);\s*$/, '');
  const run = new Function(...Object.keys(imports), ...Object.keys(globals), `${body}
    return {
      async initialize(mode) {
        gameMode = mode;
        battleManifest = {
          scenes: [{ id: 'arena', label: 'Arena', image: 'arena.png', music: 'music.mp3' }],
          characters: [{ id: 'a', name: 'A', image: 'a.png' }, { id: 'b', name: 'B', image: 'b.png' }],
          sfx: Object.fromEntries(['buzz', 'correct', 'wrong', 'attack', 'weapon', 'hit', 'hurt', 'start', 'win', 'lose'].map(name => [name, name + '.mp3'])),
        };
        currentQuiz = { questions: Array.from({ length: 5 }, (_, index) => ({ prompt: 'Q' + index, choices: ['A', 'B'], answerIndex: 0 })) };
        prepareBattleStart({ gameMode: mode, mode: 'time', limit: 60, cpuDifficulty: 'normal', arenaId: 'arena', characters: { left: 'a', right: 'b' } });
        audioManager = createAudioManager({ manifest: battleManifest, audioFactory });
        await audioManager.setScene('arena');
        await audioManager.unlock();
        battleInputGate.enable();
        startBattleTimer();
        renderGame();
      },
      requestManualPause, continueBattle, processAnswer, requestBattleHomeExit,
      confirmPauseAction, requestPauseAction, cancelPauseConfirmation,
      stopBattleActivity, prepareBattleStart, startBattleTimer, handleTimer, startGameOnce,
      orientation: handleBattleOrientationChange,
      background: battlePause.setBackgroundPaused,
      setMuted: value => audioManager.setMuted(value),
      get pausePending() { return battlePause.isPausePending?.() ?? (typeof pauseRequested !== 'undefined' && pauseRequested); },
      get manualPaused() { return battlePause.isManualPaused(); },
      get paused() { return battlePause.isPaused(); },
      get inputEnabled() { return battleInputGate.isEnabled(); },
      get animating() { return battleLifecycle.isAnimating(); },
      get remainingCpu() { return cpuController.remainingMs(); },
      get timeLeft() { return timeLeft; },
      get quizState() { return quizState; },
      get combatState() { return combatState; },
      get settings() { return battleSettings; },
      get question() { return currentQuiz.activeQuestions[quizState.questionIndex]; },
      disposeAudio() { audioManager = null; },
      removeTimerApis() { setTimeout = undefined; clearTimeout = undefined; },
    };
  `);
  const api = run(...Object.values(imports), ...Object.values(globals));
  await api.initialize(gameMode);
  return { api, app, document, clock, audios, animations, settlements, cpuRandomCalls, viewport };
}
