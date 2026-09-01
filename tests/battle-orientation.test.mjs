import test from 'node:test';
import assert from 'node:assert/strict';
import * as orientationModule from '../web/js/battle-orientation.mjs';
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

function fakeBrowser({
  width = 390,
  height = 844,
  requestFullscreen = async () => {},
  lock = async () => {},
  unlock = () => {},
  navigatorRef = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)', platform: 'Linux armv8l', maxTouchPoints: 5 },
} = {}) {
  const windowRef = Object.assign(eventTarget(), { innerWidth: width, innerHeight: height });
  const orientation = Object.assign(eventTarget(), { lock, unlock });
  const screenRef = { orientation, width, height };
  const documentElement = { requestFullscreen };
  const documentRef = Object.assign(eventTarget(), { documentElement, visibilityState: 'visible' });
  return { windowRef, documentRef, screenRef, navigatorRef };
}

test('判斷數字視窗尺寸中的直向狀態', () => {
  assert.equal(isPortraitViewport({ width: 390, height: 844 }), true);
  assert.equal(isPortraitViewport({ width: 844, height: 390 }), false);
  assert.equal(isPortraitViewport({ width: 500, height: 500 }), false);
  assert.equal(isPortraitViewport({ width: '390', height: 844 }), false);
});

test('僅將手機與平板判定為需要橫式全螢幕的行動載具', () => {
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)', platform: 'Linux armv8l', maxTouchPoints: 5 }), true);
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), true);
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 }), true);
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 }), false);
});

test('未知識別字串的窄觸控螢幕仍判定為行動載具，Windows 觸控筆電維持桌機', () => {
  const phone = { userAgent: 'Mozilla/5.0 CustomWebView', platform: 'Linux', maxTouchPoints: 5 };
  const laptop = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 };
  assert.equal(orientationModule.isMobileBattleDevice(phone, { width: 412, height: 915 }), true);
  assert.equal(orientationModule.isMobileBattleDevice(laptop, { width: 1920, height: 1080 }), false);
});

test('1366×768 的 Windows 觸控筆電維持桌機判定', () => {
  const laptop = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 };
  assert.equal(orientationModule.isMobileBattleDevice(laptop, { width: 1366, height: 768 }), false);
});

test('只有短邊不超過 600 的行動載具會套用手機戰場高度', () => {
  const androidPhone = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)', platform: 'Linux armv8l', maxTouchPoints: 5 };
  const androidTablet = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Tablet)', platform: 'Linux armv8l', maxTouchPoints: 5 };

  assert.equal(orientationModule.isPhoneBattleDevice(androidPhone, { width: 844, height: 390 }), true);
  assert.equal(orientationModule.isPhoneBattleDevice(androidTablet, { width: 1180, height: 820 }), false);

  const phoneController = createBattleOrientationController({ ...fakeBrowser({ width: 844, height: 390, navigatorRef: androidPhone }) });
  const tabletController = createBattleOrientationController({ ...fakeBrowser({ width: 1180, height: 820, navigatorRef: androidTablet }) });
  assert.equal(phoneController.isPhoneDevice(), true);
  assert.equal(tabletController.isPhoneDevice(), false);
});

test('未知識別字串的窄觸控螢幕進入對戰會全螢幕並鎖定橫向，離場時解除鎖定', async () => {
  let fullscreenCalls = 0;
  let lockCalls = 0;
  let unlockCalls = 0;
  const browser = fakeBrowser({
    width: 412,
    height: 915,
    requestFullscreen: async () => { fullscreenCalls += 1; },
    lock: async () => { lockCalls += 1; },
    unlock: () => { unlockCalls += 1; },
    navigatorRef: { userAgent: 'Mozilla/5.0 CustomWebView', platform: 'Linux', maxTouchPoints: 5 },
  });
  const controller = createBattleOrientationController({ ...browser, onPortraitChange: () => {} });

  await controller.enterBattle();
  controller.exitBattle();

  assert.equal(fullscreenCalls, 1);
  assert.equal(lockCalls, 1);
  assert.equal(unlockCalls, 1);
});

test('桌機進入與離開對戰不請求全螢幕或鎖定方向', async () => {
  let fullscreenCalls = 0;
  let lockCalls = 0;
  let unlockCalls = 0;
  const browser = fakeBrowser({
    width: 1920,
    height: 1080,
    requestFullscreen: async () => { fullscreenCalls += 1; },
    lock: async () => { lockCalls += 1; },
    unlock: () => { unlockCalls += 1; },
    navigatorRef: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 },
  });
  const states = [];
  const controller = createBattleOrientationController({ ...browser, onPortraitChange: state => states.push(state) });

  await controller.enterBattle();
  controller.exitBattle();

  assert.deepEqual(states, [false]);
  assert.equal(fullscreenCalls, 0);
  assert.equal(lockCalls, 0);
  assert.equal(unlockCalls, 0);
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

test('全螢幕請求等待期間離場，不得在離場後鎖定方向', async () => {
  let resolveFullscreen;
  let lockCalls = 0;
  let unlockCalls = 0;
  const browser = fakeBrowser({
    requestFullscreen: () => new Promise(resolve => { resolveFullscreen = resolve; }),
    lock: async () => { lockCalls += 1; },
    unlock: () => { unlockCalls += 1; },
  });
  const controller = createBattleOrientationController({ ...browser, onPortraitChange: () => {} });
  const entering = controller.enterBattle();
  await Promise.resolve();
  controller.exitBattle();
  assert.equal(controller.isActive(), false);
  assert.equal(unlockCalls, 1);
  resolveFullscreen();
  await entering;
  assert.equal(lockCalls, 0);
});

test('visibility 與 viewport 分開通知，重複狀態不重複發布', async () => {
  const browser = fakeBrowser({ width: 844, height: 390 });
  const portraitStates = [];
  const hiddenStates = [];
  const controller = createBattleOrientationController({
    ...browser,
    onPortraitChange: state => portraitStates.push(state),
    onVisibilityChange: state => hiddenStates.push(state),
  });

  await controller.enterBattle();
  browser.documentRef.visibilityState = 'hidden';
  browser.documentRef.dispatch('visibilitychange');
  browser.documentRef.dispatch('visibilitychange');
  browser.documentRef.visibilityState = 'visible';
  browser.documentRef.dispatch('visibilitychange');

  assert.deepEqual(portraitStates, [false]);
  assert.deepEqual(hiddenStates, [false, true, false]);
});

test('背景中旋轉後回到前景會先同步方向，只有橫向才恢復對戰一次', async () => {
  const browser = fakeBrowser({ width: 844, height: 390 });
  const events = [];
  const coordinator = orientationModule.createBattlePauseCoordinator({
    isLiveBattle: () => true,
    disableInput: () => events.push('disable-input'),
    pauseCpu: () => events.push('pause-cpu'),
    clearTimer: () => events.push('clear-timer'),
    renderBattle: () => events.push('render'),
    resumeCpu: () => events.push('resume-cpu'),
    enableInput: () => events.push('enable-input'),
    startTimer: () => events.push('start-timer'),
  });
  const controller = createBattleOrientationController({
    ...browser,
    onPortraitChange: state => {
      events.push(`portrait:${state}`);
      coordinator.setOrientationPaused(state);
    },
    onVisibilityChange: state => {
      events.push(`hidden:${state}`);
      coordinator.setBackgroundPaused(state);
    },
  });

  await controller.enterBattle();
  browser.documentRef.visibilityState = 'hidden';
  browser.documentRef.dispatch('visibilitychange');
  browser.windowRef.innerWidth = 390;
  browser.windowRef.innerHeight = 844;
  events.length = 0;
  browser.documentRef.visibilityState = 'visible';
  browser.documentRef.dispatch('visibilitychange');

  assert.deepEqual(events, [
    'portrait:true',
    'disable-input',
    'pause-cpu',
    'clear-timer',
    'render',
    'hidden:false',
    'render',
  ]);
  assert.equal(coordinator.isOrientationPaused(), true);
  assert.equal(coordinator.isBackgroundPaused(), false);
  assert.equal(coordinator.isPaused(), true);

  events.length = 0;
  browser.documentRef.dispatch('visibilitychange');
  assert.deepEqual(events, []);

  browser.documentRef.visibilityState = 'hidden';
  browser.documentRef.dispatch('visibilitychange');
  browser.windowRef.innerWidth = 844;
  browser.windowRef.innerHeight = 390;
  events.length = 0;
  browser.documentRef.visibilityState = 'visible';
  browser.documentRef.dispatch('visibilitychange');

  assert.deepEqual(events, [
    'portrait:false',
    'render',
    'hidden:false',
    'render',
    'enable-input',
    'resume-cpu',
    'start-timer',
  ]);
  assert.equal(coordinator.isPaused(), false);

  controller.exitBattle();
  events.length = 0;
  browser.documentRef.visibilityState = 'hidden';
  browser.documentRef.dispatch('visibilitychange');
  assert.deepEqual(events, []);
  assert.equal(browser.documentRef.count('visibilitychange'), 0);
});

test('refresh 會強制重新發布目前方向與背景狀態', async () => {
  const browser = fakeBrowser({ width: 844, height: 390 });
  const states = [];
  const controller = createBattleOrientationController({
    ...browser,
    onPortraitChange: state => states.push(`portrait:${state}`),
    onVisibilityChange: state => states.push(`hidden:${state}`),
  });

  await controller.enterBattle();
  assert.equal(typeof controller.refresh, 'function');
  controller.refresh();

  assert.deepEqual(states, [
    'portrait:false',
    'hidden:false',
    'portrait:false',
    'hidden:false',
  ]);
});

test('背景暫停與直向暫停分離，只在兩者都解除後恢復對戰', () => {
  assert.equal(typeof orientationModule.createBattlePauseCoordinator, 'function');
  const events = [];
  let live = true;
  const coordinator = orientationModule.createBattlePauseCoordinator({
    isLiveBattle: () => live,
    disableInput: () => events.push('disable-input'),
    pauseCpu: () => events.push('pause-cpu'),
    clearTimer: () => events.push('clear-timer'),
    renderBattle: () => events.push('render'),
    resumeCpu: () => events.push('resume-cpu'),
    enableInput: () => events.push('enable-input'),
    startTimer: () => events.push('start-timer'),
  });

  assert.equal(coordinator.setBackgroundPaused(true), true);
  assert.equal(coordinator.setBackgroundPaused(true), false);
  assert.deepEqual(events, ['disable-input', 'pause-cpu', 'clear-timer', 'render']);
  assert.equal(coordinator.isBackgroundPaused(), true);
  assert.equal(coordinator.isOrientationPaused(), false);

  coordinator.setOrientationPaused(true);
  events.length = 0;
  assert.equal(coordinator.setBackgroundPaused(false), true);
  assert.deepEqual(events, ['render']);
  assert.equal(coordinator.isPaused(), true);

  assert.equal(coordinator.setOrientationPaused(false), true);
  assert.deepEqual(events, ['render', 'render', 'enable-input', 'resume-cpu', 'start-timer']);
  assert.equal(coordinator.isPaused(), false);

  coordinator.setBackgroundPaused(true);
  live = false;
  events.length = 0;
  assert.equal(coordinator.setBackgroundPaused(false), false);
  assert.deepEqual(events, []);
  coordinator.reset();
  assert.equal(coordinator.isPaused(), false);
});

test('手動、直向與背景暫停原因可疊加並遵守生命週期規則', () => {
  const events = [];
  let live = true;
  const coordinator = orientationModule.createBattlePauseCoordinator({
    isLiveBattle: () => live,
    disableInput: () => events.push('disable-input'),
    pauseCpu: () => events.push('pause-cpu'),
    clearTimer: () => events.push('clear-timer'),
    renderBattle: () => events.push('render'),
    resumeCpu: () => events.push('resume-cpu'),
    enableInput: () => events.push('enable-input'),
    startTimer: () => events.push('start-timer'),
  });

  assert.equal(coordinator.setManualPaused(true), true);
  assert.equal(coordinator.isManualPaused(), true);
  assert.deepEqual(events, ['disable-input', 'pause-cpu', 'clear-timer', 'render']);
  assert.equal(coordinator.setManualPaused(true), false);
  assert.deepEqual(events, ['disable-input', 'pause-cpu', 'clear-timer', 'render']);

  coordinator.setOrientationPaused(true);
  assert.equal(coordinator.setOrientationPaused(true), false);
  coordinator.setManualPaused(false);
  assert.equal(coordinator.isPaused(), true);
  assert.deepEqual(events.slice(-1), ['render']);
  coordinator.setOrientationPaused(false);
  assert.equal(coordinator.isPaused(), false);
  assert.deepEqual(events.slice(-4), ['render', 'enable-input', 'resume-cpu', 'start-timer']);

  coordinator.setManualPaused(true);
  coordinator.setOrientationPaused(true);
  coordinator.setBackgroundPaused(true);
  assert.equal(coordinator.setBackgroundPaused(true), false);
  events.length = 0;
  assert.equal(coordinator.setManualPaused(false), true);
  assert.deepEqual(events, ['render']);
  assert.equal(coordinator.isPaused(), true);
  assert.equal(coordinator.setOrientationPaused(false), true);
  assert.deepEqual(events, ['render', 'render']);
  assert.equal(coordinator.isPaused(), true);
  assert.equal(coordinator.setBackgroundPaused(false), true);
  assert.deepEqual(events, ['render', 'render', 'render', 'enable-input', 'resume-cpu', 'start-timer']);
  assert.equal(coordinator.isPaused(), false);

  coordinator.setManualPaused(true);
  coordinator.setOrientationPaused(true);
  coordinator.setBackgroundPaused(true);
  events.length = 0;
  coordinator.reset();
  assert.equal(coordinator.isManualPaused(), false);
  assert.equal(coordinator.isOrientationPaused(), false);
  assert.equal(coordinator.isBackgroundPaused(), false);
  assert.equal(coordinator.isPaused(), false);
  assert.deepEqual(events, []);

  live = false;
  assert.equal(coordinator.setManualPaused(true), false);
  assert.equal(coordinator.setOrientationPaused(true), false);
  assert.equal(coordinator.setBackgroundPaused(true), false);
  assert.equal(coordinator.isManualPaused(), false);
  assert.equal(coordinator.isOrientationPaused(), false);
  assert.equal(coordinator.isBackgroundPaused(), false);
  assert.deepEqual(events, []);
});
