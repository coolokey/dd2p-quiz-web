# Mobile-Only Fullscreen Orientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Request fullscreen and landscape lock only for phones and tablets while preserving desktop battle behavior in a normal browser window.

**Architecture:** Add a pure `isMobileBattleDevice(navigatorRef)` classifier to `battle-orientation.mjs`. The orientation controller will always keep resize and visibility coordination active, but it will only request fullscreen, lock landscape, unlock orientation, or report portrait pause when the classifier returns true. Tests use injected browser and navigator fakes, keeping platform detection deterministic.

**Tech Stack:** Vanilla JavaScript modules, Node.js built-in test runner, existing orientation controller tests.

---

### Task 1: Define mobile-device behavior with failing tests

**Files:**
- Modify: `tests/battle-orientation.test.mjs`
- Test: `tests/battle-orientation.test.mjs`

- [ ] **Step 1: Extend the fake browser with an injected navigator**

Change `fakeBrowser` to accept `navigatorRef`, defaulting to an Android phone signature so existing mobile-orientation tests keep their meaning:

```js
function fakeBrowser({
  width = 390,
  height = 844,
  requestFullscreen = async () => {},
  lock = async () => {},
  unlock = () => {},
  navigatorRef = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)', platform: 'Linux armv8l', maxTouchPoints: 5 },
} = {}) {
  // existing window, screen, and document setup
  return { windowRef, documentRef, screenRef, navigatorRef };
}
```

- [ ] **Step 2: Add failing classifier tests**

Append this test:

```js
test('僅將手機與平板判定為需要橫式全螢幕的行動載具', () => {
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)', platform: 'Linux armv8l', maxTouchPoints: 5 }), true);
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), true);
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 }), true);
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(orientationModule.isMobileBattleDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 }), false);
});
```

- [ ] **Step 3: Add failing desktop controller behavior test**

```js
test('桌機進入與離開對戰不請求全螢幕或鎖定方向', async () => {
  let fullscreenCalls = 0;
  let lockCalls = 0;
  let unlockCalls = 0;
  const browser = fakeBrowser({
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
```

- [ ] **Step 4: Run the focused tests and verify they fail**

Run:

```powershell
node --test --test-name-pattern="僅將手機與平板|桌機進入與離開" tests/battle-orientation.test.mjs
```

Expected: failure because `isMobileBattleDevice` is not exported and the controller currently requests fullscreen for the desktop fake.

### Task 2: Gate fullscreen and portrait pause behind the classifier

**Files:**
- Modify: `web/js/battle-orientation.mjs:100-202`
- Test: `tests/battle-orientation.test.mjs`

- [ ] **Step 1: Add the pure classifier before `browserDefaults`**

```js
export function isMobileBattleDevice(navigatorRef = {}) {
  const userAgent = String(navigatorRef.userAgent ?? '');
  const platform = String(navigatorRef.platform ?? '');
  const maxTouchPoints = Number(navigatorRef.maxTouchPoints ?? 0);
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1);
}
```

- [ ] **Step 2: Thread the navigator dependency into controller construction**

Update `browserDefaults()` to return `navigatorRef: root.navigator`. Add `navigatorRef` to `createBattleOrientationController` arguments and compute:

```js
const navigatorDevice = navigatorRef ?? defaults.navigatorRef;
const mobileDevice = isMobileBattleDevice(navigatorDevice);
```

- [ ] **Step 3: Preserve event coordination but restrict mobile-only actions**

Use the classifier in the controller:

```js
const portrait = mobileDevice && isPortraitViewport({ width: viewport.innerWidth, height: viewport.innerHeight });
```

Wrap `requestFullscreen()` and `orientation.lock('landscape')` in `if (mobileDevice) { ... }`. In `exitBattle()`, invoke `orientation.unlock()` only when `mobileDevice` is true. Do not alter listener registration, visibility handling, or lifecycle session checks.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
node --test --test-name-pattern="僅將手機與平板|桌機進入與離開" tests/battle-orientation.test.mjs
```

Expected: both tests pass.

- [ ] **Step 5: Run all orientation and full regression checks**

Run:

```powershell
node --test tests/battle-orientation.test.mjs
npm test
node --check web/js/battle-orientation.mjs
git diff --check HEAD
```

Expected: all tests pass, syntax check exits with code 0, and no whitespace errors are reported.

- [ ] **Step 6: Commit the isolated behavior change**

Run:

```powershell
git add -- web/js/battle-orientation.mjs tests/battle-orientation.test.mjs
git commit -m "fix: limit battle fullscreen to mobile devices"
```

Expected: one commit containing only the classifier, controller gating, and related tests. Do not push or publish in this task.
