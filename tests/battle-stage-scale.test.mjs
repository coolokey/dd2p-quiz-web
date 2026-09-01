import test from 'node:test';
import assert from 'node:assert/strict';
import { getBattleStageScale, createBattleStageScaleController } from '../web/js/battle-stage-scale.mjs';

test('完整舞台以可用寬高中的較小比例縮小，且不放大', () => {
  assert.equal(getBattleStageScale({ stageWidth: 1280, stageHeight: 720, availableWidth: 960, availableHeight: 540 }), 0.75);
  assert.equal(getBattleStageScale({ stageWidth: 1280, stageHeight: 720, availableWidth: 1800, availableHeight: 1000 }), 1);
  assert.equal(getBattleStageScale({ stageWidth: 1280, stageHeight: 720, availableWidth: 1280, availableHeight: 400 }), 0.5556);
});

function createFakeDom({ width = 960, height = 540, stageWidth = 1280, stageHeight = 720 } = {}) {
  const values = new Map();
  const viewport = {
    style: {
      setProperty(name, value) { values.set(name, value); },
      removeProperty(name) { values.delete(name); },
    },
  };
  const stage = { scrollWidth: stageWidth, scrollHeight: stageHeight };
  const root = {
    querySelector(selector) {
      if (selector === '.battle-viewport') return viewport;
      if (selector === '.battle-stage') return stage;
      return null;
    },
  };
  const listeners = new Map();
  const windowRef = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const observers = [];
  class ResizeObserverRef {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; this.targets = []; }
    trigger() { this.callback(); }
  }
  return { values, viewport, stage, root, windowRef, observers, ResizeObserverRef, listeners };
}

test('行動橫向設定縮放與未縮放舞台高度', () => {
  const dom = createFakeDom();
  const controller = createBattleStageScaleController({
    windowRef: dom.windowRef,
    isMobileDevice: () => true,
    isPortrait: () => false,
    ResizeObserverRef: dom.ResizeObserverRef,
  });

  controller.bind(dom.root);

  assert.equal(dom.values.get('--battle-stage-scale'), '0.75');
  assert.equal(dom.values.get('--battle-stage-height'), '540px');
  assert.equal(dom.observers.length, 1);
  assert.equal(dom.observers[0].targets[0], dom.stage);
});

test('桌機與直向狀態移除控制器寫入的變數', () => {
  for (const state of [
    { isMobileDevice: false, isPortrait: false },
    { isMobileDevice: true, isPortrait: true },
  ]) {
    const dom = createFakeDom();
    const controller = createBattleStageScaleController({
      windowRef: dom.windowRef,
      isMobileDevice: () => state.isMobileDevice,
      isPortrait: () => state.isPortrait,
      ResizeObserverRef: dom.ResizeObserverRef,
    });
    controller.bind(dom.root);
    assert.equal(dom.values.size, 0);
  }
});

test('viewport resize 後重新計算舞台縮放', () => {
  const dom = createFakeDom();
  const controller = createBattleStageScaleController({
    windowRef: dom.windowRef,
    isMobileDevice: () => true,
    isPortrait: () => false,
    ResizeObserverRef: dom.ResizeObserverRef,
  });
  controller.bind(dom.root);

  dom.windowRef.innerWidth = 640;
  dom.windowRef.innerHeight = 540;
  dom.listeners.get('resize')();

  assert.equal(dom.values.get('--battle-stage-scale'), '0.5');
  assert.equal(dom.values.get('--battle-stage-height'), '360px');
});

test('控制器可重新綁定並在 destroy 後清除資源與變數', () => {
  const dom = createFakeDom();
  const controller = createBattleStageScaleController({
    windowRef: dom.windowRef,
    isMobileDevice: () => true,
    isPortrait: () => false,
    ResizeObserverRef: dom.ResizeObserverRef,
  });
  controller.bind(dom.root);
  controller.bind(dom.root);

  assert.equal(dom.observers.length, 2);
  assert.equal(dom.observers[0].disconnected, true);
  assert.equal(dom.observers[1].disconnected, false);
  assert.equal(dom.listeners.size, 1);

  controller.destroy();
  assert.equal(dom.values.size, 0);
  assert.equal(dom.observers[1].disconnected, true);
  assert.equal(dom.listeners.size, 0);
});
