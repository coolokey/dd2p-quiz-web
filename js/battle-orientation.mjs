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
  pauseMusic = () => {},
  resumeMusic = () => {},
} = {}) {
  let pausePending = false;
  let manualPaused = false;
  let orientationPaused = false;
  let backgroundPaused = false;

  function isPaused() {
    return pausePending || manualPaused || orientationPaused || backgroundPaused;
  }

  function pauseBattle(render) {
    disableInput();
    pauseCpu();
    clearTimer();
    pauseMusic();
    if (render) renderBattle();
  }

  function resumeBattle(render) {
    if (render) renderBattle();
    if (isPaused() || !isLiveBattle()) return;
    enableInput();
    resumeCpu();
    startTimer();
    resumeMusic();
  }

  function setPauseReason(current, next, assign, { render = true } = {}) {
    if (next === current || !isLiveBattle()) return false;
    assign(next);
    if (next) pauseBattle(render);
    else resumeBattle(render);
    return true;
  }

  function setManualPaused(paused) {
    const next = Boolean(paused);
    return setPauseReason(manualPaused, next, value => {
      manualPaused = value;
      if (value) pausePending = false;
    });
  }

  function setPausePending(paused) {
    const next = Boolean(paused);
    return setPauseReason(pausePending, next, value => { pausePending = value; }, { render: false });
  }

  function setOrientationPaused(paused) {
    const next = Boolean(paused);
    return setPauseReason(orientationPaused, next, value => { orientationPaused = value; });
  }

  function setBackgroundPaused(paused) {
    const next = Boolean(paused);
    return setPauseReason(backgroundPaused, next, value => { backgroundPaused = value; });
  }

  function reset() {
    pausePending = false;
    manualPaused = false;
    orientationPaused = false;
    backgroundPaused = false;
  }

  return {
    isBackgroundPaused: () => backgroundPaused,
    isManualPaused: () => manualPaused,
    isOrientationPaused: () => orientationPaused,
    isPausePending: () => pausePending,
    isPaused,
    reset,
    setBackgroundPaused,
    setManualPaused,
    setOrientationPaused,
    setPausePending,
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

  function handleVisibilityChange() {
    if (document?.visibilityState !== 'hidden') sync();
    syncVisibility();
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
    addListener(document, 'visibilitychange', handleVisibilityChange);

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
