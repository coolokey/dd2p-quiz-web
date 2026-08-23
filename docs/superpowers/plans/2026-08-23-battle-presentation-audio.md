# Battle Presentation and Audio Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore three selectable arenas, mutually exclusive character selection, health-based combat animation, original background music, event sound effects, KO, and sudden death in the published two-player web quiz.

**Architecture:** Preserve the existing quiz converter and isolate the new work into asset preparation, battle state, selection state, rendering, and audio modules. JPEXS FFDec extracts usable media from the original SWFs; a generated manifest lets the web app disable incomplete characters and fall back safely when individual media files are unavailable.

**Tech Stack:** Node.js 22, Node built-in test runner, JPEXS Free Flash Decompiler 26.2.1, HTML, CSS, ES Modules, Web Audio/HTMLAudioElement, GitHub Pages.

---

## File Structure

- `scripts/prepare-battle-assets.mjs`: copy original scenes/music, invoke FFDec, normalize exports, and generate the battle asset manifest.
- `scripts/lib/battle-asset-manifest.mjs`: validate scenes, characters, animation states, music, and sound effects.
- `web/assets/battle/manifest.json`: generated runtime asset catalog.
- `web/assets/battle/scenes/`: three original PNG arenas.
- `web/assets/battle/music/`: three original MP3 background tracks.
- `web/assets/battle/characters/`: extracted character and weapon frames grouped by character ID.
- `web/assets/battle/sfx/`: extracted or recreated event effects.
- `web/js/battle-config.mjs`: centralized health, damage, timing, scene, and character constants.
- `web/js/battle-state.mjs`: immutable combat, KO, score-ending, and sudden-death rules.
- `web/js/character-select.mjs`: player selections and duplicate-character prevention.
- `web/js/audio-manager.mjs`: music/effect playback, volume, mute, and persistence.
- `web/js/battle-renderer.mjs`: arena DOM, health HUD, animation classes, and result presentation.
- `web/js/app.mjs`: route the existing catalog/rules/key-test flow through arena and character selection.
- `web/assets/app.css`: battle layout, responsive HUD, characters, attacks, impacts, and reduced-motion behavior.
- `tests/battle-asset-manifest.test.mjs`: generated asset validation.
- `tests/battle-state.test.mjs`: health, damage, KO, score end, and sudden death.
- `tests/character-select.test.mjs`: two-player character constraints.
- `tests/audio-manager.test.mjs`: volume, mute, track replacement, and event routing.

### Task 1: Prepare Original Arena and Music Assets

**Files:**
- Create: `scripts/lib/battle-asset-manifest.mjs`
- Create: `scripts/prepare-battle-assets.mjs`
- Create: `tests/battle-asset-manifest.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing scene/music manifest test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseBattleManifest } from '../scripts/lib/battle-asset-manifest.mjs';

test('maps all three arenas to original scenes and music', () => {
  const manifest = createBaseBattleManifest();
  assert.deepEqual(manifest.scenes.map(({ id, image, music }) => ({ id, image, music })), [
    { id: 'palace', image: './assets/battle/scenes/palace.png', music: './assets/battle/music/palace.mp3' },
    { id: 'school', image: './assets/battle/scenes/school.png', music: './assets/battle/music/school.mp3' },
    { id: 'ship', image: './assets/battle/scenes/ship.png', music: './assets/battle/music/ship.mp3' },
  ]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/battle-asset-manifest.test.mjs`

Expected: FAIL because `battle-asset-manifest.mjs` does not exist.

- [ ] **Step 3: Implement the base manifest and asset copier**

```js
export function createBaseBattleManifest() {
  return {
    version: 1,
    scenes: [
      { id: 'palace', label: '神殿決鬥', image: './assets/battle/scenes/palace.png', music: './assets/battle/music/palace.mp3' },
      { id: 'school', label: '校園真人擂台', image: './assets/battle/scenes/school.png', music: './assets/battle/music/school.mp3' },
      { id: 'ship', label: '冒險船艦戰', image: './assets/battle/scenes/ship.png', music: './assets/battle/music/ship.mp3' },
    ],
    characters: [],
    sfx: {},
  };
}
```

`prepare-battle-assets.mjs` must copy `scene_1.png`, `scene_4.png`, `scene_5.png` and `BK_1.mp3`, `BK_2.mp3`, `BK_3.mp3` from `D_Unit/Game_03` into the exact paths above, then write `web/assets/battle/manifest.json`.

- [ ] **Step 4: Add the asset command and verify GREEN**

```json
"prepare:battle": "node scripts/prepare-battle-assets.mjs"
```

Run: `npm test && npm run prepare:battle`

Expected: PASS; six copied files and `manifest.json` exist.

- [ ] **Step 5: Commit**

Run: `git add package.json scripts tests web/assets/battle && git commit -m "feat: prepare original battle scenes and music"`

### Task 2: Extract and Validate Original Character, Weapon, and Sound Assets

**Files:**
- Modify: `scripts/prepare-battle-assets.mjs`
- Modify: `scripts/lib/battle-asset-manifest.mjs`
- Modify: `tests/battle-asset-manifest.test.mjs`
- Create: `web/assets/battle/sfx/README.md`

- [ ] **Step 1: Install and inspect the required extractor**

Run: `winget install --id JPEXS.FFDec --version 26.2.1 --accept-package-agreements --accept-source-agreements`

Expected: JPEXS Free Flash Decompiler 26.2.1 is installed. Locate `ffdec.bat` with `Get-ChildItem "$env:ProgramFiles","$env:LOCALAPPDATA" -Recurse -Filter ffdec.bat -ErrorAction SilentlyContinue | Select-Object -First 1` and run `ffdec.bat -help` once before scripting extraction.

- [ ] **Step 2: Write the failing character validation tests**

```js
test('disables a character that has no idle and attack frames', () => {
  const result = validateCharacter({ id: '1', states: { idle: [], attack: [] } });
  assert.deepEqual(result, { playable: false, missing: ['idle', 'attack'] });
});

test('publishes twelve distinct character ids', () => {
  assert.deepEqual(characterIds(), ['1','2','3','4','5','6','7','8','9','10','11','12']);
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run: `node --test tests/battle-asset-manifest.test.mjs`

Expected: FAIL because `validateCharacter` and `characterIds` are not exported.

- [ ] **Step 4: Implement extraction and deterministic fallbacks**

Use FFDec CLI for each `N_Role.swf` and `N_FlyWeapon.swf`:

```powershell
& $ffdecPath -export image,sprite,sound "web/assets/battle/raw/$id" "D_Unit/Game_03/${id}_Role.swf"
& $ffdecPath -export image,sprite,sound "web/assets/battle/raw/$id/weapon" "D_Unit/Game_03/${id}_FlyWeapon.swf"
```

Normalize exported PNG/SVG frames into `characters/<id>/<state>/`; use CSS motion with the first valid extracted frame for any missing `hurt`, `miss`, `win`, or `lose` state. Mark a character unplayable only when both idle and attack source images are absent. Extracted sounds are renamed by mapped event; missing effects are listed in `sfx/README.md` and use the bundled fallback WAV/MP3 assigned by the manifest.

- [ ] **Step 5: Verify assets and commit**

Run: `npm run prepare:battle && npm test`

Expected: manifest contains 12 unique character entries; each entry has `playable`, `states`, and `weapon`; every referenced file exists.

Run: `git add scripts tests web/assets/battle && git commit -m "feat: extract original battle characters and effects"`

### Task 3: Add Health, Damage, KO, and Sudden-Death Rules

**Files:**
- Create: `web/js/battle-config.mjs`
- Create: `web/js/battle-state.mjs`
- Create: `tests/battle-state.test.mjs`
- Modify: `web/js/game-state.mjs`

- [ ] **Step 1: Write failing combat rules tests**

```js
test('correct answer scores and damages the opponent', () => {
  const next = applyCorrectAnswer(createBattleState(), 'left');
  assert.equal(next.scores.left, 1);
  assert.equal(next.health.right, 90);
  assert.equal(next.animation.type, 'attack');
});

test('zero health ends the battle by KO', () => {
  const state = { ...createBattleState(), health: { left: 100, right: 10 } };
  const next = applyCorrectAnswer(state, 'left');
  assert.deepEqual({ ended: next.ended, reason: next.endReason, winner: next.winner }, { ended: true, reason: 'ko', winner: 'left' });
});

test('tied regulation enters sudden death', () => {
  const next = finishRegulation(createBattleState());
  assert.equal(next.phase, 'sudden-death');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/battle-state.test.mjs`

Expected: FAIL because battle state exports do not exist.

- [ ] **Step 3: Implement battle config and immutable transitions**

```js
export const BATTLE_CONFIG = { maxHealth: 100, damage: 10, impactMs: 650, nextQuestionMs: 900 };

export function createBattleState() {
  return { health: { left: 100, right: 100 }, scores: { left: 0, right: 0 }, phase: 'regulation', animation: null, ended: false, endReason: null, winner: null };
}

export function applyCorrectAnswer(state, player) {
  const opponent = player === 'left' ? 'right' : 'left';
  const health = Math.max(0, state.health[opponent] - BATTLE_CONFIG.damage);
  return { ...state, health: { ...state.health, [opponent]: health }, scores: { ...state.scores, [player]: state.scores[player] + 1 }, animation: { type: 'attack', player, opponent }, ended: health === 0, endReason: health === 0 ? 'ko' : null, winner: health === 0 ? player : null };
}
```

- [ ] **Step 4: Integrate with existing answer flow and verify GREEN**

`game-state.mjs` calls `applyCorrectAnswer` after the first answer key submits a correct choice, retains no-point/no-health-change wrong-answer transfer, and calls `finishRegulation` when question/time limits end.

Run: `npm test`

Expected: all previous and new tests PASS.

- [ ] **Step 5: Commit**

Run: `git add web/js tests && git commit -m "feat: add health combat KO and sudden death"`

### Task 4: Add Arena and Exclusive Character Selection

**Files:**
- Create: `web/js/character-select.mjs`
- Create: `tests/character-select.test.mjs`
- Modify: `web/js/app.mjs`

- [ ] **Step 1: Write failing exclusive-selection tests**

```js
test('prevents both players from selecting the same character', () => {
  let selection = createCharacterSelection();
  selection = selectCharacter(selection, 'left', '3');
  assert.throws(() => selectCharacter(selection, 'right', '3'), /角色已被選擇/);
});

test('allows players to choose two different playable characters', () => {
  let selection = selectCharacter(createCharacterSelection(), 'left', '3');
  selection = selectCharacter(selection, 'right', '8');
  assert.deepEqual(selection, { left: '3', right: '8' });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/character-select.test.mjs`

Expected: FAIL because selection functions do not exist.

- [ ] **Step 3: Implement selection state and screens**

```js
export function createCharacterSelection() { return { left: null, right: null }; }
export function selectCharacter(state, player, characterId) {
  const opponent = player === 'left' ? 'right' : 'left';
  if (state[opponent] === characterId) throw new Error('角色已被選擇');
  return { ...state, [player]: characterId };
}
```

Add `renderArenaSelect()` after rules, then `renderCharacterSelect()` before key testing. Disable unavailable characters and the character selected by the opposing player; require both players to select before continuing.

- [ ] **Step 4: Verify and commit**

Run: `npm test`

Expected: exclusive selection tests and all prior tests PASS.

Run: `git add web/js tests && git commit -m "feat: add arena and two-player character selection"`

### Task 5: Add Audio Manager and Complete Event Sound Routing

**Files:**
- Create: `web/js/audio-manager.mjs`
- Create: `tests/audio-manager.test.mjs`
- Modify: `web/js/app.mjs`

- [ ] **Step 1: Write failing audio behavior tests**

```js
test('starting a new scene stops the prior music before playback', async () => {
  const calls = [];
  const manager = createAudioManager({ makeAudio: source => ({ source, play: async () => calls.push(`play:${source}`), pause: () => calls.push(`pause:${source}`), currentTime: 4 }) });
  await manager.playMusic('palace.mp3');
  await manager.playMusic('ship.mp3');
  assert.deepEqual(calls, ['play:palace.mp3', 'pause:palace.mp3', 'play:ship.mp3']);
});

test('mute suppresses effects and stores the setting', async () => {
  const manager = createAudioManager({ makeAudio: () => ({ play: async () => { throw new Error('must not play'); } }), storage: new Map() });
  manager.setMuted(true);
  await manager.playEffect('hit.mp3');
  assert.equal(manager.getSettings().muted, true);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/audio-manager.test.mjs`

Expected: FAIL because audio manager does not exist.

- [ ] **Step 3: Implement audio ownership and settings**

```js
export function createAudioManager({ makeAudio = source => new Audio(source), storage = localStorage } = {}) {
  let music = null;
  let settings = { master: 1, music: .65, effects: .9, muted: false };
  return {
    async playMusic(source) { if (music) { music.pause(); music.currentTime = 0; } music = makeAudio(source); if (!settings.muted) await music.play(); },
    async playEffect(source) { if (!settings.muted) await makeAudio(source).play(); },
    setMuted(muted) { settings = { ...settings, muted }; },
    getSettings() { return { ...settings }; },
    stopMusic() { if (music) { music.pause(); music.currentTime = 0; music = null; } },
  };
}
```

Route `menu`, `confirm`, `start`, `buzz`, `correct`, `wrong`, `attack`, `weapon`, `hit`, `hurt`, `ko`, `win`, and `lose` events from the manifest. Begin music only after a click/key event and expose master/music/effects sliders plus mute.

- [ ] **Step 4: Verify and commit**

Run: `npm test`

Expected: audio ownership, mute, persistence, and prior tests PASS.

Run: `git add web/js tests && git commit -m "feat: restore battle music and event sounds"`

### Task 6: Build the Animated Battle Renderer

**Files:**
- Create: `web/js/battle-renderer.mjs`
- Modify: `web/js/app.mjs`
- Modify: `web/assets/app.css`
- Modify: `web/index.html`

- [ ] **Step 1: Add renderer contract assertions to `tests/battle-state.test.mjs`**

```js
test('attack event identifies actor target and damage', () => {
  const next = applyCorrectAnswer(createBattleState(), 'right');
  assert.deepEqual(next.animation, { type: 'attack', player: 'right', opponent: 'left', damage: 10 });
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/battle-state.test.mjs`

Expected: FAIL because the animation object does not include `damage`.

- [ ] **Step 3: Implement renderer and battle layout**

`battle-renderer.mjs` must export `renderBattle(root, viewModel)` and `playBattleAnimation(root, animation)`. The DOM includes two health bars, scores, timer/question counter, scene background, left/right character layers, weapon layer, impact layer, question, four answers, status, volume controls, and live result announcement. CSS classes `is-attacking`, `is-hit`, `is-missing`, `is-winning`, and `is-losing` drive animations; `prefers-reduced-motion` disables large movement while retaining state visibility.

- [ ] **Step 4: Perform local visual and interaction verification**

Run: `npm start`

Expected: all three arenas render; two distinct characters appear; one answer key immediately triggers score, damage number, attack/hit animation, and sound; wrong answer transfers without damage; KO and sudden death each display the correct outcome.

- [ ] **Step 5: Commit**

Run: `git add web tests && git commit -m "feat: render animated character battles"`

### Task 7: Full Verification and GitHub Pages Publication

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/pages.yml`

- [ ] **Step 1: Document battle assets and regeneration**

Add exact commands to README:

```powershell
npm run prepare:battle
npm run convert
npm test
npm start
```

Document the three arenas, exclusive character selection, 100 health, 10 damage, KO, sudden death, volume controls, and the need to rerun asset preparation after replacing original SWFs.

- [ ] **Step 2: Validate generated assets in deployment**

Add CI checks:

```yaml
- run: npm test
- run: test -f web/data/catalog.json
- run: test -f web/assets/battle/manifest.json
- run: test $(find web/assets/battle/characters -mindepth 1 -maxdepth 1 -type d | wc -l) -ge 2
```

- [ ] **Step 3: Run the complete local gate**

Run: `npm run prepare:battle && npm run convert && npm test && git diff --check`

Expected: all commands succeed; 31 quizzes, three scenes, three music tracks, and 12 manifest character entries are present.

- [ ] **Step 4: Browser verification**

Verify one full fixed-question game and one full timed game. Cover all three arenas across the two games, two different character pairs, wrong-answer transfer, correct attack/damage, audio mute/unmute, KO, and a forced tied sudden-death result. Confirm no console errors and all referenced images/audio return HTTP 200.

- [ ] **Step 5: Review, commit, and publish**

Run: `git add README.md .github web scripts tests package.json && git commit -m "feat: restore full audiovisual battle experience"`

Push `main`, publish the `web` subtree to `gh-pages`, wait for GitHub Pages status `built`, and verify `https://coolokey.github.io/dd2p-quiz-web/` returns HTTP 200 with title `雙人知識對決`.

## Self-Review

- The plan covers selectable arenas, fixed original music pairings, exclusive 12-character selection, health/damage/KO, score ending, sudden death, battle animation, full sound routing, volume/mute controls, fallbacks, automated tests, browser tests, and GitHub Pages publication.
- The existing quiz converter and answer-key behavior remain intact.
- All named functions are introduced in the task where first used, and later tasks use the same names.
- Asset extraction failure has an explicit playable fallback rather than blocking unrelated characters or gameplay.
