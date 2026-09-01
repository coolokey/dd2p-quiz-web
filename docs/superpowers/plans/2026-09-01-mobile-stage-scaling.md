# 行動載具完整戰鬥舞台縮放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手機與平板橫向時完整、等比例呈現戰場、角色、題目、答案與觸控按鈕，恢復全螢幕、橫式鎖定與直向暫停；桌機版面不變。

**Architecture:** 在 `battle-orientation.mjs` 以使用者代理、觸控點數及螢幕短邊共同判斷行動載具。新增純函式的舞台縮放控制器；它量測未縮放的完整戰鬥舞台與可用視窗，將唯一縮放係數寫入 CSS 變數。桌機與直向一律清除縮放變數。

**Tech Stack:** 原生 ES Modules、DOM `ResizeObserver`、CSS custom properties／`transform`、Node.js `node:test`。

---

## File Structure

- `web/js/battle-orientation.mjs`：行動裝置備援判斷及公開的裝置／直向狀態。
- `web/js/battle-stage-scale.mjs`：純縮放係數和 DOM 控制器。
- `web/js/battle-renderer.mjs`：將完整戰鬥與觸控鍵包成可縮放舞台；遮罩留在舞台外。
- `web/js/app.mjs`：掛接、同步與清理縮放控制器。
- `web/assets/app.css`：行動橫向縮放、置中及安全區；桌機規則不變。
- `tests/battle-orientation.test.mjs`、`tests/battle-stage-scale.test.mjs`、`tests/battle-renderer.test.mjs`、`tests/app-integration.test.mjs`：對應單元與整合驗收。

### Task 1：裝置辨識備援

**Files:**
- Modify: `tests/battle-orientation.test.mjs:22-70`
- Modify: `web/js/battle-orientation.mjs:67-102`

- [ ] **Step 1：寫入會失敗的辨識測試**

```js
test('未知識別字串的窄觸控螢幕仍判定為行動載具，Windows 觸控筆電維持桌機', () => {
  const phone = { userAgent: 'Mozilla/5.0 CustomWebView', platform: 'Linux', maxTouchPoints: 5 };
  const laptop = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 };
  assert.equal(orientationModule.isMobileBattleDevice(phone, { width: 412, height: 915 }), true);
  assert.equal(orientationModule.isMobileBattleDevice(laptop, { width: 1920, height: 1080 }), false);
});
```

Extend `fakeBrowser` so `screenRef` includes `width` and `height`. Add a controller test for the unknown phone: `enterBattle()` must call full screen and `lock('landscape')` once; `exitBattle()` must unlock once.

- [ ] **Step 2：執行測試確認失敗**

Run: `node --test tests/battle-orientation.test.mjs`

Expected: FAIL because `isMobileBattleDevice` currently ignores screen dimensions.

- [ ] **Step 3：實作最小備援判斷**

```js
export function isMobileBattleDevice(navigatorRef = {}, screenRef = {}) {
  const userAgent = String(navigatorRef.userAgent ?? '');
  const platform = String(navigatorRef.platform ?? '');
  const maxTouchPoints = Number(navigatorRef.maxTouchPoints ?? 0);
  const knownMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1);
  const width = Number(screenRef.width ?? 0);
  const height = Number(screenRef.height ?? 0);
  const shortSide = width > 0 && height > 0 ? Math.min(width, height) : 0;
  return knownMobile || (maxTouchPoints > 0 && shortSide > 0 && shortSide <= 1024);
}
```

Use `const mobileDevice = isMobileBattleDevice(navigatorDevice, screen);` in the orientation controller.

- [ ] **Step 4：執行測試確認通過**

Run: `node --test tests/battle-orientation.test.mjs`

Expected: PASS with existing orientation, visibility and desktop tests.

- [ ] **Step 5：提交**

```bash
git add web/js/battle-orientation.mjs tests/battle-orientation.test.mjs
git commit -m "fix: detect mobile battle browsers with touch fallback"
```

### Task 2：可測試的完整舞台縮放控制器

**Files:**
- Create: `web/js/battle-stage-scale.mjs`
- Create: `tests/battle-stage-scale.test.mjs`

- [ ] **Step 1：寫入會失敗的縮放係數測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBattleStageScale } from '../web/js/battle-stage-scale.mjs';

test('完整舞台以可用寬高中的較小比例縮小，且不放大', () => {
  assert.equal(getBattleStageScale({ stageWidth: 1280, stageHeight: 720, availableWidth: 960, availableHeight: 540 }), 0.75);
  assert.equal(getBattleStageScale({ stageWidth: 1280, stageHeight: 720, availableWidth: 1800, availableHeight: 1000 }), 1);
  assert.equal(getBattleStageScale({ stageWidth: 1280, stageHeight: 720, availableWidth: 1280, availableHeight: 400 }), 0.5556);
});
```

Add controller tests with fake `window`、viewport、stage and `ResizeObserver`: mobile landscape sets `--battle-stage-scale` and `--battle-stage-height`; desktop and portrait remove both; resize recalculates them.

- [ ] **Step 2：執行測試確認失敗**

Run: `node --test tests/battle-stage-scale.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3：實作縮放模組**

```js
export function getBattleStageScale({ stageWidth, stageHeight, availableWidth, availableHeight } = {}) {
  const value = Math.min(1, Number(availableWidth) / Number(stageWidth), Number(availableHeight) / Number(stageHeight));
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(4)) : 1;
}

Export `createBattleStageScaleController(options)` with the optional `windowRef`、`documentRef`、`isMobileDevice`、`isPortrait` and `ResizeObserverRef` dependencies. Its returned public methods are `bind(root)`、`sync()`、`reset()` and `destroy()`.
```

`sync()` temporarily clears its custom properties, measures `.battle-stage` with `scrollWidth`／`scrollHeight`, then sets the two custom properties only for mobile landscape. `destroy()` unregisters the window listener and observer.

- [ ] **Step 4：執行測試確認通過**

Run: `node --test tests/battle-stage-scale.test.mjs`

Expected: PASS for scale calculation, resize, portrait reset and desktop reset.

- [ ] **Step 5：提交**

```bash
git add web/js/battle-stage-scale.mjs tests/battle-stage-scale.test.mjs
git commit -m "feat: add responsive battle stage scale controller"
```

### Task 3：完整戰鬥舞台的標記結構

**Files:**
- Modify: `web/js/battle-renderer.mjs:57-111`
- Modify: `tests/battle-renderer.test.mjs:45-115`

- [ ] **Step 1：寫入會失敗的結構測試**

```js
const html = buildBattleMarkup({ ...viewModel, gameMode: 'local', eligiblePlayers: ['left', 'right'] });
assert.match(html, /class="battle-viewport"/);
assert.match(html, /class="battle-stage"/);
assert.ok(html.indexOf('class="battle-stage"') < html.indexOf('class="mobile-answer-controls'));
assert.ok(html.indexOf('class="mobile-answer-controls') < html.indexOf('class="orientation-blocker"'));
```

- [ ] **Step 2：執行測試確認失敗**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL because no viewport or stage wrapper exists.

- [ ] **Step 3：新增兩層包裝但保持互動標記**

```html
<div class="battle-viewport">
  <div class="battle-stage">
    <div class="battle-shell">header、arena、題目答案區與狀態列</div>
    mobile answer controls
  </div>
  orientation blocker
  pause menu
</div>
```

Keep all existing `data-touch-answer`、`data-pause-battle`、`data-return-main-menu`、`aria-live` and pause-menu markup unchanged.

- [ ] **Step 4：執行測試確認通過**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: PASS including touch-answer lock, orientation blocker and pause-menu tests.

- [ ] **Step 5：提交**

```bash
git add web/js/battle-renderer.mjs tests/battle-renderer.test.mjs
git commit -m "feat: wrap complete mobile battle stage"
```

### Task 4：掛接控制器及 CSS 邊界

**Files:**
- Modify: `web/js/app.mjs:19-56, 232-242, 597-640`
- Modify: `web/assets/app.css:72-280`
- Modify: `tests/app-integration.test.mjs:399-525`
- Modify: `tests/battle-renderer.test.mjs:330-425`

- [ ] **Step 1：寫入會失敗的掛接與 CSS 測試**

```js
assert.match(source, /import \{ createBattleStageScaleController \} from '\.\/battle-stage-scale\.mjs';/);
assert.match(source, /battleStageScale\.bind\(app\)/);
assert.match(source, /battleStageScale\.sync\(\)/);
assert.match(source, /battleStageScale\.destroy\(\)/);
assert.match(css, /\.touch-capable \.battle-stage\s*\{[^}]*transform:\s*scale\(var\(--battle-stage-scale,\s*1\)\)/);
assert.doesNotMatch(desktopRule[0], /battle-stage-scale|transform/);
```

- [ ] **Step 2：執行測試確認失敗**

Run: `node --test tests/app-integration.test.mjs tests/battle-renderer.test.mjs`

Expected: FAIL because the app has no stage-scale import, lifecycle calls or matching CSS.

- [ ] **Step 3：掛接控制器與樣式**

In `app.mjs`, construct the controller with `isMobileDevice: () => orientationController.isMobileDevice()` and `isPortrait: () => orientationController.isPortrait()`; call `battleStageScale.bind(app)` after each battle render, `battleStageScale.sync()` after orientation refresh, and `battleStageScale.destroy()` in `exitBattleOrientation()`.

Expose from the orientation controller:

```js
isMobileDevice: () => mobileDevice,
isPortrait: () => mobileDevice && isPortraitViewport({ width: viewport?.innerWidth, height: viewport?.innerHeight }),
```

In CSS, center `.battle-stage` inside `.battle-viewport`; only in landscape `.touch-capable` rules apply `transform:scale(var(--battle-stage-scale,1))` with `transform-origin:top center` and use `--battle-stage-height` on the viewport. Keep the fixed orientation and pause overlays outside the stage, retain `48px` answer minimums and safe-area padding, and do not alter the wide-desktop media query.

- [ ] **Step 4：執行整合測試確認通過**

Run: `node --test tests/app-integration.test.mjs tests/battle-renderer.test.mjs tests/battle-orientation.test.mjs tests/battle-stage-scale.test.mjs`

Expected: PASS with keyboard, USB gamepad, touch, audio, pause and animation contracts intact.

- [ ] **Step 5：提交**

```bash
git add web/js/app.mjs web/js/battle-orientation.mjs web/assets/app.css tests/app-integration.test.mjs tests/battle-renderer.test.mjs
git commit -m "fix: scale complete battle stage on mobile landscape"
```

### Task 5：完整回歸與實機尺寸檢查

**Files:**
- Verify: `web/index.html`
- Verify: `web/assets/app.css`
- Verify: `web/js/app.mjs`

- [ ] **Step 1：執行完整自動測試與靜態檢查**

Run:

```bash
npm test
git diff --check HEAD~4..HEAD
```

Expected: all tests PASS and no whitespace errors.

- [ ] **Step 2：在三種視窗尺寸檢查**

Run local battle tests at `844 × 390`、`1280 × 720` and `1180 × 820`. Each must show both complete characters, scene, top bar, question, all four answers and both touch pads. At `390 × 844`, the orientation blocker must replace partial battle. At `1920 × 1080` desktop, no full-screen request or stage-scale variable may be present.

- [ ] **Step 3：回報，不自行發布**

Report all viewport results and commits. Do not push or publish; wait for the explicit user instruction 「發布」.
