export function isPortraitViewport({ width, height } = {}) {
  return typeof width === 'number'
    && Number.isFinite(width)
    && typeof height === 'number'
    && Number.isFinite(height)
    && height > width;
}

export function createBattlePauseCoordinator({
  isLiveBattle = () => false,
  disableInput = () => {},
  pauseCpu = () => {},
  clearTimer = () => {},
  renderBattle = () => {},
  resumeCpu = () => {},
  enableInput = () => {},
  startTimer = () => {},
} = {}) {
  let orientationPaused = false;
  let backgroundPaused = false;

  function isPaused() {
    return orientationPaused || backgroundPaused;
  }

  function pauseBattle() {
    disableInput();
    pauseCpu();
    clearTimer();
    renderBattle();
  }

  function resumeBattle() {
    renderBattle();
    if (isPaused()) return;
    resumeCpu();
    enableInput();
    startTimer();
  }

  function setOrientationPaused(paused) {
    const next = Boolean(paused);
    if (next === orientationPaused || !isLiveBattle()) return false;
    orientationPaused = next;
    if (next) pauseBattle();
    else resumeBattle();
    return true;
  }

  function setBackgroundPaused(paused) {
    const next = Boolean(paused);
    if (next === backgroundPaused || !isLiveBattle()) return false;
    backgroundPaused = next;
    if (next) pauseBattle();
    else resumeBattle();
    return true;
  }

  function reset() {
    orientationPaused = false;
    backgroundPaused = false;
  }

  return {
    isBackgroundPaused: () => backgroundPaused,
    isOrientationPaused: () => orientationPaused,
    isPaused,
    reset,
    setBackgroundPaused,
    setOrientationPaused,
  };
}

function browserDefaults() {
  const root = globalThis;
  return {
    windowRef: root.window,
    documentRef: root.document,
    screenRef: root.screen,
  };
}

export function createBattleOrientationController({
  windowRef,
  documentRef,
  screenRef,
  onPortraitChange = () => {},
  onVisibilityChange = () => {},
} = {}) {
  const defaults = browserDefaults();
  const viewport = windowRef ?? defaults.windowRef;
  const document = documentRef ?? defaults.documentRef;
  const screen = screenRef ?? defaults.screenRef;
  const orientation = screen?.orientation;
  let active = false;
  let lastPortrait;
  let lastHidden;
  let session = 0;
  const registrations = [];

  function sync({ force = false } = {}) {
    if (!active || !viewport) return;
    const portrait = isPortraitViewport({ width: viewport.innerWidth, height: viewport.innerHeight });
    if (!force && portrait === lastPortrait) return;
    lastPortrait = portrait;
    onPortraitChange(portrait);
  }

  function syncVisibility({ force = false } = {}) {
    if (!active || !document) return;
    const hidden = document.visibilityState === 'hidden';
    if (!force && hidden === lastHidden) return;
    lastHidden = hidden;
    onVisibilityChange(hidden);
  }

  function refresh() {
    sync({ force: true });
    syncVisibility({ force: true });
  }

  function addListener(target, type, listener = sync) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    registrations.push({ target, type, listener });
  }

  async function enterBattle() {
    if (active) return;
    const currentSession = ++session;
    active = true;
    sync();
    syncVisibility();
    addListener(viewport, 'resize');
    addListener(orientation, 'change');
    addListener(document, 'fullscreenchange');
    addListener(document, 'visibilitychange', syncVisibility);

    try {
      await document?.documentElement?.requestFullscreen?.();
    } catch {
      // Fullscreen is an enhancement; viewport fallback remains available.
    }
    if (!active || currentSession !== session) return;
    try {
      await orientation?.lock?.('landscape');
    } catch {
      // Orientation lock is an enhancement; viewport fallback remains available.
    }
    if (!active || currentSession !== session) return;
    sync();
    syncVisibility();
  }

  function exitBattle() {
    if (!active) return;
    active = false;
    session += 1;
    for (const { target, type, listener } of registrations.splice(0)) {
      target.removeEventListener(type, listener);
    }
    lastPortrait = undefined;
    lastHidden = undefined;
    try {
      const result = orientation?.unlock?.();
      result?.catch?.(() => {});
    } catch {
      // Unlock is optional and may be unsupported.
    }
  }

  return {
    enterBattle,
    exitBattle,
    isActive: () => active,
    refresh,
    sync,
  };
}
