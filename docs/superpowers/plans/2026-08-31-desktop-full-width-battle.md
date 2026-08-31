# Desktop Full-Width Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the wide-screen desktop battle layout's 1280 px cap while leaving touch-device layouts and all game controls unchanged.

**Architecture:** Add a narrow desktop-only CSS override after the base `.battle-shell` rule. It will only apply when the viewport is wider than 1280 px and a precise pointer with hover is available; the existing touch-capable landscape rules remain unchanged. A static CSS contract test will protect the breakpoint, width override, and touch-layout isolation.

**Tech Stack:** Vanilla CSS, Node.js built-in test runner, existing `tests/battle-renderer.test.mjs`.

---

### Task 1: Protect the desktop layout contract

**Files:**
- Modify: `tests/battle-renderer.test.mjs`
- Test: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: Write the failing CSS contract test**

Append this test after the existing touch capability layout test:

```js
test('寬螢幕桌機戰場使用完整可用寬度而不改變觸控版面', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const desktopRule = css.match(/@media \(min-width: 1281px\) and \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.battle-shell\s*\{[^}]*\}\s*\}/);
  assert.ok(desktopRule);
  assert.match(desktopRule[0], /width:\s*100%;/);
  assert.match(desktopRule[0], /max-width:\s*none/);
  assert.doesNotMatch(desktopRule[0], /touch-capable/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails before CSS changes**

Run:

```powershell
node --test --test-name-pattern="寬螢幕桌機戰場使用完整可用寬度" tests/battle-renderer.test.mjs
```

Expected: the new test fails because the desktop-only media rule does not yet exist.

### Task 2: Add the smallest desktop-only CSS override

**Files:**
- Modify: `web/assets/app.css:74`
- Test: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: Add the desktop media rule immediately after the base `.battle-shell` rule**

```css
@media (min-width: 1281px) and (hover: hover) and (pointer: fine) {
  .battle-shell { width:100%; max-width:none; }
}
```

Do not change the base `width:min(1280px,100%)`, the arena height, background sizing, `.touch-capable` rules, keyboard handling, gamepad handling, or mobile controls.

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```powershell
node --test --test-name-pattern="寬螢幕桌機戰場使用完整可用寬度" tests/battle-renderer.test.mjs
```

Expected: 1 passing test and all other tests skipped by the name filter.

- [ ] **Step 3: Run the full regression suite and syntax/style checks**

Run:

```powershell
npm test
node --check web/js/app.mjs
git diff --check HEAD
```

Expected: all tests pass, JavaScript syntax check exits with code 0, and `git diff --check HEAD` reports no whitespace errors.

- [ ] **Step 4: Review the final diff and commit the isolated change**

Run:

```powershell
git diff -- web/assets/app.css tests/battle-renderer.test.mjs
git add -- web/assets/app.css tests/battle-renderer.test.mjs
git commit -m "fix: use full width for wide desktop battles"
```

Expected: one focused commit containing only the CSS override and its regression test. Do not push or publish in this task.
