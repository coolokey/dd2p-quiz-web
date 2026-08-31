# Mobile Full-Frame Battle Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the touch-device landscape battle UI fit as one complete, proportionally scaled game frame without cropping or distorting scenes, fighters, questions, or controls.

**Architecture:** Keep the existing DOM and input handlers. A small viewport module calculates `min(viewportWidth / 1280, viewportHeight / 720)` and writes the result as `--battle-scale`; touch-landscape CSS renders `.battle-shell` as a fixed `1280 × 720` canvas and transforms the whole canvas by that value. Desktop CSS and all keyboard, gamepad, pause, and answer behavior remain untouched.

**Tech Stack:** ES modules, CSS media queries, CSS grid, `dvh`, Node.js built-in test runner.

---

### Task 1: Add a tested viewport scale calculator

**Files:**
- Create: `web/js/battle-viewport.mjs`
- Create: `tests/battle-viewport.test.mjs`

- [ ] **Step 1: Write the failing calculator tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_CANVAS, calculateBattleScale } from '../web/js/battle-viewport.mjs';

test('以完整 16:9 畫布可放入範圍的較小比例縮放', () => {
  assert.deepEqual(BATTLE_CANVAS, { width: 1280, height: 720 });
  assert.equal(calculateBattleScale({ width: 844, height: 390 }), 390 / 720);
  assert.equal(calculateBattleScale({ width: 1024, height: 768 }), 1024 / 1280);
});
```

- [ ] **Step 2: Run the new test and confirm it fails because the module does not exist**

Run: `node --test tests/battle-viewport.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` for `web/js/battle-viewport.mjs`.

- [ ] **Step 3: Create the minimal calculator implementation**

```js
export const BATTLE_CANVAS = Object.freeze({ width: 1280, height: 720 });

export function calculateBattleScale({ width, height }, canvas = BATTLE_CANVAS) {
  return Math.min(width / canvas.width, height / canvas.height);
}
```

- [ ] **Step 4: Re-run the calculator test and commit**

Run: `node --test tests/battle-viewport.test.mjs`

Expected: PASS.

```powershell
git add web/js/battle-viewport.mjs tests/battle-viewport.test.mjs
git commit -m "feat: calculate full-frame battle viewport scale"
```

### Task 2: Lock the full-frame touch layout contract with failing tests

**Files:**
- Modify: `tests/battle-renderer.test.mjs:360-407`
- Test: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: Replace the short-landscape compression expectation with full-frame expectations**

```js
test('觸控橫向版把完整戰鬥畫面等比例縮放，不裁切戰場或人物', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const touchLandscape = css.slice(css.indexOf('@media (orientation: landscape) {'));

  assert.match(touchLandscape, /\.touch-capable \.battle-shell\s*\{[^}]*width:\s*1280px/);
  assert.match(touchLandscape, /\.touch-capable \.battle-shell\s*\{[^}]*height:\s*720px/);
  assert.match(touchLandscape, /\.touch-capable \.battle-shell\s*\{[^}]*transform:\s*scale\(var\(--battle-scale,1\)\)/);
  assert.match(touchLandscape, /\.touch-capable \.arena\s*\{[^}]*background-size:\s*contain/);
  assert.match(touchLandscape, /\.touch-capable \.fighter-sprite\s*\{[^}]*height:\s*88%/);
  assert.doesNotMatch(touchLandscape, /\.touch-capable \.arena\s*\{[^}]*height:\s*clamp\(104px,32vh,180px\)/);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the new full-frame rules do not exist**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: the new test fails at the missing `.touch-capable .battle-shell` sizing assertion.

- [ ] **Step 3: Commit the failing test**

```powershell
git add tests/battle-renderer.test.mjs
git commit -m "test: define full-frame mobile battle layout"
```

### Task 3: Implement proportional touch-landscape framing

**Files:**
- Modify: `web/assets/app.css:167-277`
- Modify: `web/js/app.mjs:1-30,800-830`
- Test: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: Apply the calculated scale whenever the viewport changes**

```js
import { calculateBattleScale } from './battle-viewport.mjs';

function syncBattleViewportScale() {
  const viewport = window.visualViewport ?? window;
  const scale = calculateBattleScale({ width: viewport.width, height: viewport.height });
  app.style.setProperty('--battle-scale', String(scale));
}

window.addEventListener('resize', syncBattleViewportScale);
window.visualViewport?.addEventListener('resize', syncBattleViewportScale);
syncBattleViewportScale();
```

- [ ] **Step 2: Add a complete touch-landscape canvas frame before the existing mobile-control rules**

```css
@media (orientation: landscape) {
  .touch-capable #app:has(.battle-shell) {
    display:grid;
    position:fixed;
    inset:0;
    place-items:center;
    overflow:hidden;
  }
  .touch-capable .battle-shell {
    width:1280px;
    height:720px;
    min-height:0;
    display:grid;
    grid-template-rows:auto minmax(0,1fr) minmax(0,.82fr);
    overflow:hidden;
    transform:scale(var(--battle-scale,1));
    transform-origin:center;
  }
  .touch-capable .arena {
    height:auto;
    min-height:0;
    background-size:contain;
    background-repeat:no-repeat;
    background-color:#080c14;
  }
  .touch-capable .fighter-sprite { max-width:96%; height:88%; }
  .touch-capable .battle-console { min-height:0; margin-top:0; }
}
```

- [ ] **Step 3: Remove conflicting short-landscape touch rules that set `height:clamp(104px,32vh,180px)` and `height:62%`**

```css
/* Delete only these short-landscape declarations; retain the two-column answers,
   compact typography, side pads, pause controls, and safe-area spacing. */
.touch-capable .arena { height:clamp(104px,32vh,180px); }
.touch-capable .fighter-sprite { height:62%; }
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: all renderer tests pass, including the new full-frame test.

- [ ] **Step 5: Commit the CSS and application integration**

```powershell
git add web/assets/app.css web/js/app.mjs tests/battle-renderer.test.mjs
git commit -m "fix: scale mobile battle as a complete frame"
```

### Task 4: Verify interactions and rendered layout regressions

**Files:**
- Verify: `tests/app-integration.test.mjs`
- Verify: `tests/mobile-controls.test.mjs`
- Verify: `tests/battle-renderer.test.mjs`
- Verify: `web/assets/app.css`

- [ ] **Step 1: Run interaction regression tests**

Run: `node --test tests/app-integration.test.mjs tests/mobile-controls.test.mjs tests/battle-renderer.test.mjs`

Expected: all tests pass, confirming touch controls, keyboard / USB gamepad integration, pause, and battle rendering contracts remain intact.

- [ ] **Step 2: Run the complete suite and static validation**

Run: `npm test; node --check web/js/app.mjs; git diff --check HEAD`

Expected: all tests pass, JavaScript syntax validation exits `0`, and Git reports no whitespace errors.

- [ ] **Step 3: Run a local static-server asset check**

Run: `npx --yes serve web -l 4174`

Expected: opening `http://localhost:4174/` returns the `DDP 知識對決` page; then stop the server after checking the page.
