# Battle Asset Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce cold-start battle loading without changing any game rule or input method.

**Architecture:** Preserve selection thumbnails. Add a pure selected-battle preload module and start it as soon as setup succeeds. Serve full battle scenes as WebP while retaining PNG source files.

**Tech Stack:** Browser ES modules, Node test runner, WebP image assets.

---

### Task 1: Selected-battle preload

**Files:**
- Create: `web/js/battle-preload.mjs`
- Create: `tests/battle-preload.test.mjs`
- Modify: `web/js/app.mjs`

- [ ] Write a failing test that expects one deduplicated list containing the selected scene plus each selected fighter's idle and attack image.
- [ ] Run `node --test tests/battle-preload.test.mjs` and confirm it fails because the module is absent.
- [ ] Implement `collectBattleAssetPaths(scene, characters)` and `preloadBattleAssets(paths, createImage)`; the latter only sets asynchronous `Image` sources and never blocks the game.
- [ ] In `app.mjs`, call the module immediately after successful setup and also from the direct-start path as a safe fallback. Pass each path through `versionedAssetUrl`.
- [ ] Run the focused test, then commit the module, test and app integration as `perf: preload selected battle assets`.

### Task 2: Compact backgrounds

**Files:**
- Create: `web/assets/battle/scenes/{daxi-gate,track,basketball-court,classroom}.webp`
- Modify: `web/js/campus-heroes.mjs`
- Modify: `tests/battle-asset-manifest.test.mjs`

- [ ] Write a failing assertion that every current campus scene uses a `.webp` full image.
- [ ] Run `node --test tests/battle-asset-manifest.test.mjs` and confirm it fails because scene URLs end in `.png`.
- [ ] Convert the four full PNG backgrounds using `ffmpeg` WebP quality `82`; retain all PNGs and thumbnails.
- [ ] Change only `CAMPUS_SCENES` full image values to their matching `.webp` paths.
- [ ] Run focused tests, `npm test`, inspect file sizes and browser-test the local game. Commit as `perf: compress campus battle backgrounds`.
