# Touch Capability Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show on-screen answer controls only on touch-capable devices while preserving keyboard input everywhere.

**Architecture:** Add a small, testable touch-capability detector to the existing mobile-control module and apply its result as a root CSS class during application startup. Scope every touch-control and touch-layout media rule to that class so non-touch computers neither show controls nor reserve their space.

**Tech Stack:** Native ES modules, CSS media queries, Node.js built-in test runner, GitHub Actions, GitHub Pages.

---

### Task 1: Add tested touch-capability detection

**Files:**
- Modify: `tests/mobile-controls.test.mjs`
- Modify: `web/js/mobile-controls.mjs`

- [ ] **Step 1: Write a failing test**

```js
test('只將具有觸控點數的裝置標記為可觸控', () => {
  assert.equal(hasTouchCapability({ maxTouchPoints: 5 }), true);
  assert.equal(hasTouchCapability({ maxTouchPoints: 0 }), false);
  assert.equal(hasTouchCapability({}), false);
  assert.equal(hasTouchCapability({ msMaxTouchPoints: 2 }), true);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `node --test tests/mobile-controls.test.mjs`

Expected: FAIL because `hasTouchCapability` is not exported.

- [ ] **Step 3: Implement the minimum detector and root-class synchronizer**

```js
export function hasTouchCapability(navigatorRef = {}) {
  return Math.max(Number(navigatorRef.maxTouchPoints) || 0, Number(navigatorRef.msMaxTouchPoints) || 0) > 0;
}

export function syncTouchCapabilityClass(root, navigatorRef = {}) {
  const touchCapable = hasTouchCapability(navigatorRef);
  root?.classList?.toggle('touch-capable', touchCapable);
  return touchCapable;
}
```

- [ ] **Step 4: Add synchronizer tests and verify green**

Run: `node --test tests/mobile-controls.test.mjs`

Expected: all mobile-control tests PASS.

### Task 2: Apply the capability class and scope touch layout

**Files:**
- Modify: `tests/app-integration.test.mjs`
- Modify: `tests/battle-renderer.test.mjs`
- Modify: `web/js/app.mjs`
- Modify: `web/assets/app.css`

- [ ] **Step 1: Write failing integration and CSS contract tests**

Assert that `app.mjs` imports and invokes `syncTouchCapabilityClass(document.documentElement, navigator)`. Assert that touch controls and touch-specific battle spacing require `.touch-capable`, and no unscoped `@media (any-pointer: coarse)` control rule remains.

- [ ] **Step 2: Verify focused tests fail**

Run: `node --test tests/app-integration.test.mjs tests/battle-renderer.test.mjs`

Expected: FAIL because the capability class is not applied or required.

- [ ] **Step 3: Wire startup detection and update CSS selectors**

Import `syncTouchCapabilityClass` in `app.mjs`, invoke it once after locating `#app`, and change touch media blocks to `@media (orientation: landscape)` with selectors rooted at `.touch-capable`. Keep `.mobile-answer-controls { display:none; }` as the default.

- [ ] **Step 4: Verify focused and complete tests**

Run:

```powershell
node --test tests/mobile-controls.test.mjs tests/app-integration.test.mjs tests/battle-renderer.test.mjs
npm test
Get-ChildItem web/js -Filter *.mjs | ForEach-Object { node --check $_.FullName }
git diff --check
```

Expected: all tests and syntax checks PASS; `git diff --check` prints nothing.

### Task 3: Browser verification and release

**Files:**
- Verify: `web/`
- Publish: `main` through `.github/workflows/pages.yml`

- [ ] **Step 1: Verify non-touch and touch emulation in the browser**

Confirm a normal desktop context has no `touch-capable` class and no visible buttons. Confirm touch emulation produces the class and displays controls in landscape. Verify keyboard answers still work in both contexts.

- [ ] **Step 2: Commit and push**

Commit the tested source, tests, design, and plan; push `main` to trigger Pages.

- [ ] **Step 3: Wait for deployment and verify the public URL**

Wait for the GitHub Pages workflow to succeed, then open the cache-busted public URL and repeat desktop and touch checks.

