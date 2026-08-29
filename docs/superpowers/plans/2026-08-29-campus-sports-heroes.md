# Campus Sports Heroes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary vector roster with twelve polished original Q-version campus sports heroes while preserving every existing game mechanic.

**Architecture:** Keep the battle manifest contract unchanged: each hero supplies one transparent idle sprite and one transparent attack sprite through `states`. Extend the roster metadata only with a gender field and artistic brief. Generate original high-quality raster sprites at a shared canvas size, validate their alpha channels and dimensions, then regenerate the manifest and run the full input and battle regression suite.

**Tech Stack:** JavaScript ES modules, Node test runner, PNG validation with Node buffers, ImageGen, static GitHub Pages.

---

### Task 1: Define the final roster contract

**Files:**
- Modify: `web/js/campus-heroes.mjs`
- Modify: `tests/campus-heroes.test.mjs`

- [ ] **Step 1: Write the failing roster balance test**

```js
assert.deepEqual(
  CAMPUS_HEROES.map(hero => hero.gender).sort(),
  ['female', 'female', 'female', 'female', 'female', 'female', 'male', 'male', 'male', 'male', 'male', 'male'],
);
assert.equal(new Set(CAMPUS_HEROES.map(hero => hero.artBrief)).size, 12);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/campus-heroes.test.mjs`

Expected: FAIL because `gender` and `artBrief` are not yet defined.

- [ ] **Step 3: Add roster metadata**

Update the roster helper so each entry stores `gender` and `artBrief`; assign exactly six `female` and six `male` entries. Each brief must name the role, sports-school outfit, hair silhouette, accessory, and non-copyrighted accent colour.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test tests/campus-heroes.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/js/campus-heroes.mjs tests/campus-heroes.test.mjs
git commit -m "feat: define balanced campus sports hero roster"
```

### Task 2: Generate and validate transparent Q-version sprites

**Files:**
- Create: `web/assets/battle/campus-heroes/<hero-id>/idle.png`
- Create: `web/assets/battle/campus-heroes/<hero-id>/attack.png`
- Modify: `tests/campus-heroes.test.mjs`
- Modify: `scripts/generate-campus-hero-sprites.mjs`

- [ ] **Step 1: Write the failing PNG quality test**

```js
const sprite = await readFile(filePath);
assert.equal(sprite.subarray(1, 4).toString('ascii'), 'PNG');
assert.deepEqual(readPngSize(sprite), { width: 1024, height: 1024, colorType: 6 });
assert.ok(hasTransparentPixel(sprite), `${hero.id}/${pose} must retain transparency`);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/campus-heroes.test.mjs`

Expected: FAIL because current sprites are SVG rather than validated transparent 1024 by 1024 PNG files.

- [ ] **Step 3: Generate each original character pair**

For each of the twelve `artBrief` entries, generate one transparent-background idle and one transparent-background attack PNG. Use a shared prompt suffix:

```text
original Q-version human junior-high hero, 2.5-head chibi proportion, polished mobile-game illustration, thick clean outline, full body, transparent background, no text, no logo, no copyrighted character, canvas 1024 by 1024, feet aligned at y=900
```

Attack prompts add: `large readable forward attack pose with extended arm or leg; character remains entirely inside canvas`.

- [ ] **Step 4: Normalize and validate files**

Write `scripts/generate-campus-hero-sprites.mjs` to only validate the checked-in PNG pairs and reject SVG-only output. Do not regenerate or overwrite approved art. Verify RGBA colour type, dimensions and transparent pixels with the focused test.

- [ ] **Step 5: Visually inspect the roster**

Render a contact sheet of all twenty-four generated sprites over a checkerboard background. Confirm no animal, monster, text, cropped limb, duplicated character, recognizable anime costume, or mismatched baseline is present.

- [ ] **Step 6: Commit**

```bash
git add web/assets/battle/campus-heroes scripts/generate-campus-hero-sprites.mjs tests/campus-heroes.test.mjs
git commit -m "feat: add polished original campus hero sprites"
```

### Task 3: Wire the final PNG roster into the battle manifest

**Files:**
- Modify: `scripts/generate-campus-manifest.mjs`
- Modify: `web/assets/battle/manifest.json`
- Modify: `tests/battle-asset-manifest.test.mjs`

- [ ] **Step 1: Write the failing manifest reference test**

```js
for (const character of manifest.characters) {
  assert.match(character.states.idle[0], /\/idle\.png$/);
  assert.match(character.states.attack[0], /\/attack\.png$/);
  assert.equal(character.playable, true);
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/battle-asset-manifest.test.mjs`

Expected: FAIL because the manifest points at the temporary SVG sprites.

- [ ] **Step 3: Change the manifest generator**

Set each state reference to `./assets/battle/campus-heroes/${hero.id}/idle.png` and `attack.png`; retain the current `scenes`, `sfx`, `attacks`, `weapon: null`, and fallback state aliases. Run `node scripts/generate-campus-manifest.mjs` to update `web/assets/battle/manifest.json`.

- [ ] **Step 4: Run manifest tests and verify they pass**

Run: `node --test tests/battle-asset-manifest.test.mjs tests/campus-heroes.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-campus-manifest.mjs web/assets/battle/manifest.json tests/battle-asset-manifest.test.mjs
git commit -m "feat: publish PNG campus heroes in manifest"
```

### Task 4: Preserve battle mechanics and complete release verification

**Files:**
- Modify only when a regression test demonstrates a required fix: `web/js/app.mjs`, `web/js/battle-renderer.mjs`, `web/assets/app.css`
- Test: `tests/*.test.mjs`

- [ ] **Step 1: Run syntax and full regression checks**

```bash
node --check web/js/app.mjs
node --check web/js/battle-renderer.mjs
node --test
git diff --check
```

Expected: all tests pass, including keyboard, mobile touch, USB Gamepad, audio, pause, question randomization and attack tests.

- [ ] **Step 2: Perform local browser acceptance check**

Run `npx --yes serve web -l 54180`, then verify a 200 response for `/` and `/assets/battle/manifest.json`. Open local play mode to inspect selection cards, each attack sprite, a punch, a kick, an energy attack, pause/restart/home, desktop keyboard and touch layout.

- [ ] **Step 3: Commit any regression-only fixes**

```bash
git add web/js/app.mjs web/js/battle-renderer.mjs web/assets/app.css tests
git commit -m "fix: preserve battle controls with campus hero art"
```

- [ ] **Step 4: Prepare release handoff**

Report the exact test count, visual checks and changed assets. Ask for explicit authorization before merging or publishing to GitHub Pages.
