export function getBattleStageScale({ stageWidth, stageHeight, availableWidth, availableHeight } = {}) {
  const value = Math.min(1, Number(availableWidth) / Number(stageWidth), Number(availableHeight) / Number(stageHeight));
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(4)) : 1;
}

export function createBattleStageScaleController(options = {}) {
  const windowRef = options.windowRef ?? globalThis.window;
  const documentRef = options.documentRef ?? globalThis.document;
  const isMobileDevice = options.isMobileDevice ?? (() => false);
  const isPortrait = options.isPortrait ?? (() => false);
  const ResizeObserverRef = options.ResizeObserverRef ?? globalThis.ResizeObserver;
  let root = null;
  let viewport = null;
  let stage = null;
  let resizeListener = null;
  let observer = null;

  function clearCustomProperties() {
    viewport?.style?.removeProperty?.('--battle-stage-scale');
    viewport?.style?.removeProperty?.('--battle-stage-height');
  }

  function sync() {
    if (!root || typeof root.querySelector !== 'function') return;
    viewport = root.querySelector('.battle-viewport');
    stage = root.querySelector('.battle-stage');
    clearCustomProperties();
    if (!viewport || !stage || !windowRef) return;
    const scale = getBattleStageScale({
      stageWidth: stage.scrollWidth,
      stageHeight: stage.scrollHeight,
      availableWidth: windowRef.innerWidth,
      availableHeight: windowRef.innerHeight,
    });
    if (isMobileDevice() && !isPortrait()) {
      viewport.style?.setProperty?.('--battle-stage-scale', String(scale));
      viewport.style?.setProperty?.('--battle-stage-height', `${Number((Number(stage.scrollHeight) * scale).toFixed(4))}px`);
    }
  }

  function reset() {
    clearCustomProperties();
  }

  function destroy() {
    if (windowRef && resizeListener && typeof windowRef.removeEventListener === 'function') {
      windowRef.removeEventListener('resize', resizeListener);
    }
    resizeListener = null;
    observer?.disconnect?.();
    observer = null;
    clearCustomProperties();
    root = null;
    viewport = null;
    stage = null;
  }

  function bind(nextRoot) {
    destroy();
    root = nextRoot ?? documentRef?.querySelector?.('.battle') ?? null;
    if (!root || typeof root.querySelector !== 'function') return;
    resizeListener = sync;
    windowRef?.addEventListener?.('resize', resizeListener);
    stage = root.querySelector('.battle-stage');
    if (typeof ResizeObserverRef === 'function' && stage) {
      observer = new ResizeObserverRef(sync);
      observer.observe(stage);
    }
    sync();
  }

  return { bind, sync, reset, destroy };
}
