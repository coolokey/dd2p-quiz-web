export function isPortraitViewport({ width, height } = {}) {
  return typeof width === 'number'
    && Number.isFinite(width)
    && typeof height === 'number'
    && Number.isFinite(height)
    && height > width;
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
} = {}) {
  const defaults = browserDefaults();
  const viewport = windowRef ?? defaults.windowRef;
  const document = documentRef ?? defaults.documentRef;
  const screen = screenRef ?? defaults.screenRef;
  const orientation = screen?.orientation;
  let active = false;
  let lastPortrait;
  let session = 0;
  const registrations = [];

  function sync() {
    if (!active || !viewport) return;
    const portrait = isPortraitViewport({ width: viewport.innerWidth, height: viewport.innerHeight });
    if (portrait === lastPortrait) return;
    lastPortrait = portrait;
    onPortraitChange(portrait);
  }

  function addListener(target, type) {
    if (!target?.addEventListener) return;
    const listener = sync;
    target.addEventListener(type, listener);
    registrations.push({ target, type, listener });
  }

  async function enterBattle() {
    if (active) return;
    const currentSession = ++session;
    active = true;
    sync();
    addListener(viewport, 'resize');
    addListener(orientation, 'change');
    addListener(document, 'fullscreenchange');
    addListener(document, 'visibilitychange');

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
  }

  function exitBattle() {
    if (!active) return;
    active = false;
    session += 1;
    for (const { target, type, listener } of registrations.splice(0)) {
      target.removeEventListener(type, listener);
    }
    lastPortrait = undefined;
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
    sync,
  };
}
