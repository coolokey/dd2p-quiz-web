# Mobile Full-Frame Battle Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the touch-device landscape battle UI fit as one complete, proportionally scaled game frame without cropping or distorting scenes, fighters, questions, or controls.

**Architecture:** Keep the existing DOM and input handlers. Add a touch-landscape CSS frame that bounds `.battle-shell` by both viewport dimensions, uses a row grid for top bar, arena, and console, and applies `contain` rules to scene and fighter artwork. Desktop CSS and all keyboard, gamepad, pause, and answer behavior remain untouched.

**Tech Stack:** CSS media queries, CSS grid, `dvh`, Node.js built-in test runner.

---

### Task 1: Lock the full-frame touch layout contract with failing tests

**Files:**
- Modify: `tests/battle-renderer.test.mjs:360-407`
- Test: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: Replace the short-landscape compression expectation with full-frame expectations**

```js
test('觸控橫向版把完整戰鬥畫面等比例縮放，不裁切戰場或人物', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const touchLandscape = css.slice(css.indexOf('@media (orientation: landscape) {'));

  assert.match(touchLandscape, /\.touch-capable \.battle-shell\s*\{[^}]*width:\s*min\(100vw,calc\(100dvh \* 16 \/ 9\)\)/);
  assert.match(touchLandscape, /\.touch-capable \.battle-shell\s*\{[^}]*height:\s*min\(100dvh,calc\(100vw \* 9 \/ 16\)\)/);
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

### Task 2: Implement proportional touch-landscape framing

**Files:**
- Modify: `web/assets/app.css:167-277`
- Test: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: Add a complete touch-landscape frame before the existing mobile-control rules**

```css
@media (orientation: landscape) {
  .touch-capable body:has(.battle-shell) {
    display:grid;
    min-height:100dvh;
    place-items:center;
  }
  .touch-capable .battle-shell {
    width:min(100vw,calc(100dvh * 16 / 9));
    height:min(100dvh,calc(100vw * 9 / 16));
    min-height:0;
    display:grid;
    grid-template-rows:auto minmax(0,1fr) minmax(0,.82fr);
    overflow:hidden;
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

- [ ] **Step 2: Remove conflicting short-landscape touch rules that set `height:clamp(104px,32vh,180px)` and `height:62%`**

```css
/* Delete only these short-landscape declarations; retain the two-column answers,
   compact typography, side pads, pause controls, and safe-area spacing. */
.touch-capable .arena { height:clamp(104px,32vh,180px); }
.touch-capable .fighter-sprite { height:62%; }
```

- [ ] **Step 3: Run the focused test and confirm it passes**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: all renderer tests pass, including the new full-frame test.

- [ ] **Step 4: Commit the CSS implementation**

```powershell
git add web/assets/app.css tests/battle-renderer.test.mjs
git commit -m "fix: scale mobile battle as a complete frame"
```

### Task 3: Verify interactions and rendered layout regressions

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
