import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleOrientationController, isPortraitViewport } from '../web/js/battle-orientation.mjs';

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    count(type) { return listeners.get(type)?.size ?? 0; },
  };
}

function fakeBrowser({ width = 390, height = 844, requestFullscreen = async () => {}, lock = async () => {}, unlock = () => {} } = {}) {
  const windowRef = Object.assign(eventTarget(), { innerWidth: width, innerHeight: height });
  const orientation = Object.assign(eventTarget(), { lock, unlock });
  const screenRef = { orientation };
  const documentElement = { requestFullscreen };
  const documentRef = Object.assign(eventTarget(), { documentElement, visibilityState: 'visible' });
  return { windowRef, documentRef, screenRef };
}

test('判斷數字視窗尺寸中的直向狀態', () => {
  assert.equal(isPortraitViewport({ width: 390, height: 844 }), true);
  assert.equal(isPortraitViewport({ width: 844, height: 390 }), false);
  assert.equal(isPortraitViewport({ width: 500, height: 500 }), false);
  assert.equal(isPortraitViewport({ width: '390', height: 844 }), false);
});

test('全螢幕與方向鎖定拒絕時仍完成進入並發布直向狀態', async () => {
  const browser = fakeBrowser({ requestFullscreen: async () => { throw new Error('fullscreen denied'); }, lock: async () => { throw new Error('lock denied'); } });
  const states = [];
  const controller = createBattleOrientationController({ ...browser, onPortraitChange: state => states.push(state) });
  await controller.enterBattle();
  assert.equal(controller.isActive(), true);
  assert.deepEqual(states, [true]);
});

test('重複進入只註冊一次各事件監聽器', async () => {
  const browser = fakeBrowser();
  const controller = createBattleOrientationController({ ...browser, onPortraitChange: () => {} });
  await controller.enterBattle();
  await controller.enterBattle();
  for (const target of [browser.windowRef, browser.screenRef.orientation, browser.documentRef]) {
    for (const type of ['resize', 'change', 'fullscreenchange', 'visibilitychange']) {
      assert.ok(target.count(type) <= 1);
    }
  }
  assert.equal(browser.windowRef.count('resize'), 1);
  assert.equal(browser.screenRef.orientation.count('change'), 1);
  assert.equal(browser.documentRef.count('fullscreenchange'), 1);
  assert.equal(browser.documentRef.count('visibilitychange'), 1);
});

test('尺寸未改變的重複事件不重複通知，改成橫向時通知 false', async () => {
  const browser = fakeBrowser();
  const states = [];
  const controller = createBattleOrientationController({ ...browser, onPortraitChange: state => states.push(state) });
  await controller.enterBattle();
  browser.windowRef.dispatch('resize');
  browser.screenRef.orientation.dispatch('change');
  browser.documentRef.dispatch('fullscreenchange');
  browser.windowRef.innerWidth = 844;
  browser.windowRef.innerHeight = 390;
  browser.windowRef.dispatch('resize');
  assert.deepEqual(states, [true, false]);
});

test('離開移除所有監聽器一次且後續事件不通知，重複離開安全', async () => {
  const browser = fakeBrowser();
  const states = [];
  const controller = createBattleOrientationController({ ...browser, onPortraitChange: state => states.push(state) });
  await controller.enterBattle();
  assert.equal(controller.exitBattle(), undefined);
  assert.equal(controller.exitBattle(), undefined);
  assert.equal(controller.isActive(), false);
  assert.equal(browser.windowRef.count('resize'), 0);
  assert.equal(browser.screenRef.orientation.count('change'), 0);
  assert.equal(browser.documentRef.count('fullscreenchange'), 0);
  assert.equal(browser.documentRef.count('visibilitychange'), 0);
  browser.windowRef.innerWidth = 844;
  browser.windowRef.innerHeight = 390;
  browser.windowRef.dispatch('resize');
  assert.deepEqual(states, [true]);
});
