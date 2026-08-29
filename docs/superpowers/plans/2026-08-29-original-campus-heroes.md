# Original Campus Heroes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 12 legacy battle sprites and 3 legacy arenas with original, consistently scaled Q-version human campus heroes and 4 cartoon Daxi Junior High-inspired arenas without changing quiz-battle rules or any input method.

**Architecture:** Keep the existing battle loop, scoring, answer input, pause system, audio manager, keyboard mapping, touch controls, and Gamepad API bridge intact. Introduce a data-only hero roster containing each human character's common sprite paths and attack visual profile; pass that profile through the existing renderer so the already-random `energy`／`punch`／`kick` types gain character-specific colour, symbol, and callout text without changing timing or damage. Replace the manifest's scene and character asset references with generated static PNG assets and add a fourth arena.

**Tech Stack:** Static ES modules, Node.js built-in test runner, CSS custom properties, transparent PNG assets generated with the image generation tool, GitHub Pages.

---

## File structure

- Create: `web/js/campus-heroes.mjs` — immutable roster for the 12 original human heroes, common canvas constants, and four campus-scene definitions.
- Create: `tests/campus-heroes.test.mjs` — roster, originality constraints, attack profile, 4-scene, and asset-dimension regression tests.
- Create: `web/assets/battle/campus-heroes/<hero-id>/idle.png` and `attack.png` — 12 normalised transparent sprite pairs.
- Create: `web/assets/battle/scenes/daxi-gate.png`, `track.png`, `basketball-court.png`, `classroom.png` — four 16:9 cartoon arenas.
- Modify: `web/assets/battle/manifest.json` — use the campus hero and campus-scene paths, names, music paths, and visual profiles.
- Modify: `web/js/app.mjs` — pass the winning character's attack profile to the existing renderer; do not alter input, scoring, timer, pause, CPU, or Gamepad calls.
- Modify: `web/js/battle-renderer.mjs` — consume optional attack profile values while retaining the existing default effects for safety.
- Modify: `web/assets/app.css` — convert the optional profile values into CSS variables for character-specific effects while retaining existing `energy`／`punch`／`kick` motion classes and touch layout.
- Modify: `scripts/lib/battle-asset-manifest.mjs` and `scripts/prepare-battle-assets.mjs` — preserve/rebuild the campus manifest rather than reintroducing legacy sprites when `npm run prepare:battle` is run.
- Modify: `tests/battle-asset-manifest.test.mjs`, `tests/battle-renderer.test.mjs`, `tests/app-integration.test.mjs`, and `README.md` — update expected assets and prove all existing control paths still run.

### Task 1: Establish the original roster contract

**Files:**
- Create: `web/js/campus-heroes.mjs`
- Create: `tests/campus-heroes.test.mjs`

- [ ] **Step 1: Write the failing roster tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPUS_HEROES, CAMPUS_SCENES, HERO_CANVAS } from '../web/js/campus-heroes.mjs';

test('campus roster has twelve original human heroes with three distinct attack profiles', () => {
  assert.equal(CAMPUS_HEROES.length, 12);
  assert.equal(new Set(CAMPUS_HEROES.map(hero => hero.id)).size, 12);
  for (const hero of CAMPUS_HEROES) {
    assert.equal(hero.kind, 'human');
    assert.match(hero.name, /.+/);
    assert.deepEqual(Object.keys(hero.attacks), ['energy', 'punch', 'kick']);
    assert.equal(new Set(Object.values(hero.attacks).map(attack => attack.callout)).size, 3);
    assert.doesNotMatch(JSON.stringify(hero), /七龍珠|火影|航海王|灌籃高手|動物|怪獸|獸人/);
  }
});

test('campus arenas have four original Daxi-school scene definitions', () => {
  assert.deepEqual(CAMPUS_SCENES.map(scene => scene.id), ['daxi-gate', 'track', 'basketball-court', 'classroom']);
  assert.deepEqual(HERO_CANVAS, { width: 1024, height: 1024, baseline: 900 });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/campus-heroes.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `campus-heroes.mjs`.

- [ ] **Step 3: Define the roster and scene data with no gameplay fields**

```js
export const HERO_CANVAS = Object.freeze({ width: 1024, height: 1024, baseline: 900 });

export const CAMPUS_HEROES = Object.freeze([
  { id: 'basketball-ace', name: '籃球王牌', kind: 'human', color: '#ff8a2a', attacks: {
    energy: { callout: '灌籃光波', glyph: '球', color: '#ff9f1c' },
    punch: { callout: '禁區重拳', glyph: '拳', color: '#ff6b35' },
    kick: { callout: '滑步飛踢', glyph: '踢', color: '#f7d154' },
  } },
  { id: 'track-sprinter', name: '田徑快手', kind: 'human', color: '#25c4ff', attacks: { energy: { callout: '加速氣流', glyph: '風', color: '#62e5ff' }, punch: { callout: '衝刺直拳', glyph: '拳', color: '#1596ff' }, kick: { callout: '跨欄飛踢', glyph: '踢', color: '#b6f344' } } },
  { id: 'street-dancer', name: '街舞高手', kind: 'human', color: '#f43aa0', attacks: { energy: { callout: '節拍光彈', glyph: '♪', color: '#ff64cb' }, punch: { callout: '旋轉勾拳', glyph: '拳', color: '#ff3d89' }, kick: { callout: '倒立踢擊', glyph: '踢', color: '#9657ff' } } },
  { id: 'kendo-captain', name: '劍道社長', kind: 'human', color: '#4061d8', attacks: { energy: { callout: '竹劍光波', glyph: '剣', color: '#8ab8ff' }, punch: { callout: '突進拳', glyph: '拳', color: '#4b72ef' }, kick: { callout: '踏步飛踢', glyph: '踢', color: '#d5e4ff' } } },
  { id: 'science-maker', name: '科學發明家', kind: 'human', color: '#3cc88e', attacks: { energy: { callout: '電路光束', glyph: '⚡', color: '#5df2bb' }, punch: { callout: '磁力拳', glyph: '拳', color: '#2dbf91' }, kick: { callout: '噴射鞋踢', glyph: '踢', color: '#d9ff68' } } },
  { id: 'code-maker', name: '程式發明家', kind: 'human', color: '#9258ed', attacks: { energy: { callout: '程式光彈', glyph: '&lt;/&gt;', color: '#b38cff' }, punch: { callout: '除錯重拳', glyph: '拳', color: '#8a54dd' }, kick: { callout: '快捷鍵踢', glyph: '踢', color: '#7de5ff' } } },
  { id: 'math-strategist', name: '數學策略家', kind: 'human', color: '#e3b534', attacks: { energy: { callout: '幾何方陣', glyph: '△', color: '#ffe56d' }, punch: { callout: '座標重拳', glyph: '拳', color: '#e7b83e' }, kick: { callout: '拋物線踢', glyph: '踢', color: '#ff8d36' } } },
  { id: 'chess-tactician', name: '棋局軍師', kind: 'human', color: '#6e7f96', attacks: { energy: { callout: '棋盤衝擊', glyph: '棋', color: '#dae6f5' }, punch: { callout: '將軍拳', glyph: '拳', color: '#6f87a3' }, kick: { callout: '跳馬踢', glyph: '踢', color: '#b8d8fb' } } },
  { id: 'astronomy-observer', name: '天文觀測員', kind: 'human', color: '#293a9e', attacks: { energy: { callout: '星圖光彈', glyph: '★', color: '#718dff' }, punch: { callout: '流星拳', glyph: '拳', color: '#a9baff' }, kick: { callout: '行星環踢', glyph: '踢', color: '#d775ff' } } },
  { id: 'puzzle-detective', name: '解謎偵探', kind: 'human', color: '#b76a36', attacks: { energy: { callout: '線索光彈', glyph: '？', color: '#ffc15d' }, punch: { callout: '推理拳', glyph: '拳', color: '#bd6f3c' }, kick: { callout: '追蹤踢', glyph: '踢', color: '#ffdf7e' } } },
  { id: 'language-magician', name: '語言魔術師', kind: 'human', color: '#d947b1', attacks: { energy: { callout: '字母光波', glyph: '字', color: '#ff8ce3' }, punch: { callout: '書頁拳', glyph: '拳', color: '#df4bc0' }, kick: { callout: '詞語旋踢', glyph: '踢', color: '#ffd1f2' } } },
  { id: 'nature-researcher', name: '自然研究員', kind: 'human', color: '#4aa84d', attacks: { energy: { callout: '葉片光彈', glyph: '葉', color: '#8de064' }, punch: { callout: '藤蔓拳', glyph: '拳', color: '#4aa650' }, kick: { callout: '樹根踢', glyph: '踢', color: '#b4d962' } } },
]);

export const CAMPUS_SCENES = Object.freeze([
  { id: 'daxi-gate', label: '大溪校門對決', image: './assets/battle/scenes/daxi-gate.png', music: './assets/battle/music/school.mp3' },
  { id: 'track', label: '紅色跑道衝刺', image: './assets/battle/scenes/track.png', music: './assets/battle/music/school.mp3' },
  { id: 'basketball-court', label: '籃球場決勝', image: './assets/battle/scenes/basketball-court.png', music: './assets/battle/music/palace.mp3' },
  { id: 'classroom', label: '教室知識擂台', image: './assets/battle/scenes/classroom.png', music: './assets/battle/music/ship.mp3' },
]);
```

- [ ] **Step 4: Run focused tests to verify the roster passes**

Run: `node --test tests/campus-heroes.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```powershell
git add web/js/campus-heroes.mjs tests/campus-heroes.test.mjs
git commit -m "feat: define original campus hero roster"
```

### Task 2: Generate and verify the four cartoon campus arenas

**Files:**
- Create: `web/assets/battle/scenes/daxi-gate.png`
- Create: `web/assets/battle/scenes/track.png`
- Create: `web/assets/battle/scenes/basketball-court.png`
- Create: `web/assets/battle/scenes/classroom.png`
- Modify: `tests/campus-heroes.test.mjs`

- [ ] **Step 1: Add a failing scene-asset test**

```js
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

async function pngSize(file) {
  const buffer = await readFile(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('four campus arenas are 16 by 9 PNG assets', async () => {
  for (const scene of CAMPUS_SCENES) {
    const file = path.resolve('web', scene.image.replace(/^\.\//, ''));
    await access(file);
    const { width, height } = await pngSize(file);
    assert.equal(width * 9, height * 16);
    assert.ok(width >= 1280);
  }
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/campus-heroes.test.mjs`

Expected: FAIL because the four `daxi-*` scene files do not yet exist.

- [ ] **Step 3: Create the four original background images**

Use the image generation tool for one image at a time. Each prompt must include `original 2D Q-version school battle arena, no people, no copyrighted characters, no logos copied from other works, 16:9`. Use the supplied campus photos only as architectural references.

Use these scene-specific prompt additions:

```text
daxi-gate: Taiwanese junior high school double-pillar entrance, two tall pale gate towers,
subtropical palm trees, green hillside behind the gate, broad foreground pavement left open
for two fighters, bright daytime, original cartoon illustration.

track: red running track with large lane markings 1 to 4, green field, school stands and trees,
low camera angle toward the finish, clear empty center fighting lane, energetic afternoon light.

basketball-court: outdoor campus basketball court, two hoops, scoreboard, warm sunset and school buildings,
empty central court for fighters, original colourful cartoon illustration.

classroom: bright Taiwanese junior-high classroom, blackboard with abstract math symbols but no readable answers,
desks pushed to sides, sunlit windows, clear central floor for fighters, original cartoon illustration.
```

Save each output at its exact path above. Do not add character art or existing franchise marks to these scenes.

- [ ] **Step 4: Run the scene test and visually inspect each result**

Run: `node --test tests/campus-heroes.test.mjs`

Expected: PASS.

Visually inspect each PNG at full size: the floor must be readable behind fighters, no student faces may appear, and the centre 40 percent must remain uncluttered.

- [ ] **Step 5: Commit arena assets**

```powershell
git add web/assets/battle/scenes/daxi-gate.png web/assets/battle/scenes/track.png web/assets/battle/scenes/basketball-court.png web/assets/battle/scenes/classroom.png tests/campus-heroes.test.mjs
git commit -m "feat: add cartoon Daxi campus arenas"
```

### Task 3: Generate consistent original Q-version hero sprites

**Files:**
- Create: `web/assets/battle/campus-heroes/<hero-id>/idle.png` for every roster id
- Create: `web/assets/battle/campus-heroes/<hero-id>/attack.png` for every roster id
- Modify: `tests/campus-heroes.test.mjs`

- [ ] **Step 1: Add a failing common-canvas test**

```js
test('every hero has same-size transparent idle and attack sprites', async () => {
  for (const hero of CAMPUS_HEROES) {
    for (const state of ['idle', 'attack']) {
      const file = path.resolve('web/assets/battle/campus-heroes', hero.id, `${state}.png`);
      await access(file);
      assert.deepEqual(await pngSize(file), { width: HERO_CANVAS.width, height: HERO_CANVAS.height });
    }
  }
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/campus-heroes.test.mjs`

Expected: FAIL because no campus-hero sprite files exist.

- [ ] **Step 3: Generate the twelve idle sprites**

For each roster entry, generate a single original human Q-version junior-high hero. Every prompt must use this fixed layout contract:

```text
single original human Q-version junior-high hero, full body, 3-head-tall chibi proportion,
front three-quarter battle stance, centred on a 1024 by 1024 transparent canvas,
both shoes planted exactly on an invisible baseline at y=900, generous empty top margin,
bold clean cel-shading, thick dark outline, no background, no text, no animals, no monsters,
no existing anime character, no franchise costume or logo.
```

Append each hero's approved role, main colour, club prop, and silhouette feature. For example, the basketball hero uses orange-and-navy sportswear, a small original basketball emblem, and a shooting-guard stance; do not use an existing team uniform.

- [ ] **Step 4: Generate the twelve attack sprites using the same canvas contract**

For every matching hero, generate an attack-pose version with the same identity, colour, canvas, baseline, and full-body framing. The attack pose must use one of that hero's approved visual motifs, but must not include a readable franchise name or copied symbol.

- [ ] **Step 5: Verify PNG transparency and common dimensions**

Extend the test helper to inspect PNG colour type byte `buffer[25]` and require `4` or `6` (alpha-capable grayscale/RGBA PNG). Run:

```powershell
node --test tests/campus-heroes.test.mjs
```

Expected: PASS with 24 sprite assertions plus the scene assertions.

- [ ] **Step 6: Visual QA the sprite sheet**

Open all 24 images in a contact sheet or browser. Check: all feet meet the same baseline; no head, hand, or shoe is clipped; every hero is recognisably human; and no two heroes share the same silhouette, clothing palette, or prop.

- [ ] **Step 7: Commit hero assets**

```powershell
git add web/assets/battle/campus-heroes tests/campus-heroes.test.mjs
git commit -m "feat: add original Q-version campus heroes"
```

### Task 4: Publish campus assets through the battle manifest

**Files:**
- Modify: `scripts/lib/battle-asset-manifest.mjs`
- Modify: `scripts/prepare-battle-assets.mjs`
- Modify: `web/assets/battle/manifest.json`
- Modify: `tests/battle-asset-manifest.test.mjs`

- [ ] **Step 1: Write a failing manifest test for the new asset contract**

```js
test('published manifest exposes four campus scenes and twelve named campus heroes', async () => {
  const manifest = JSON.parse(await readFile(path.resolve('web/assets/battle/manifest.json'), 'utf8'));
  assert.deepEqual(manifest.scenes.map(({ id }) => id), ['daxi-gate', 'track', 'basketball-court', 'classroom']);
  assert.equal(manifest.characters.length, 12);
  for (const hero of manifest.characters) {
    assert.match(hero.name, /.+/);
    assert.match(hero.states.idle[0], /^\.\/assets\/battle\/campus-heroes\//);
    assert.match(hero.states.attack[0], /^\.\/assets\/battle\/campus-heroes\//);
    assert.deepEqual(Object.keys(hero.attacks), ['energy', 'punch', 'kick']);
  }
});
```

- [ ] **Step 2: Run the asset-manifest test to verify it fails**

Run: `node --test tests/battle-asset-manifest.test.mjs`

Expected: FAIL because the legacy `palace`／`school`／`ship` manifest is still published.

- [ ] **Step 3: Build manifest entries from the campus roster**

Update the manifest helper to import the roster and construct each entry as follows:

```js
{
  id: hero.id,
  name: hero.name,
  playable: true,
  attacks: hero.attacks,
  states: {
    idle: [`./assets/battle/campus-heroes/${hero.id}/idle.png`],
    attack: [`./assets/battle/campus-heroes/${hero.id}/attack.png`],
    hurt: [`./assets/battle/campus-heroes/${hero.id}/idle.png`],
    miss: [`./assets/battle/campus-heroes/${hero.id}/attack.png`],
    win: [`./assets/battle/campus-heroes/${hero.id}/idle.png`],
    lose: [`./assets/battle/campus-heroes/${hero.id}/idle.png`],
  },
  weapon: null,
}
```

Keep the existing SFX map unchanged. Update `prepareBattleAssets` so it writes this manifest and never deletes `web/assets/battle/campus-heroes` or the four campus scenes; it may continue to verify/copy existing SFX and music. Rebuild `web/assets/battle/manifest.json` from this helper.

- [ ] **Step 4: Run manifest and full asset-reference tests**

Run: `node --test tests/battle-asset-manifest.test.mjs tests/campus-heroes.test.mjs`

Expected: PASS; every manifest reference exists.

- [ ] **Step 5: Commit the manifest migration**

```powershell
git add scripts/lib/battle-asset-manifest.mjs scripts/prepare-battle-assets.mjs web/assets/battle/manifest.json tests/battle-asset-manifest.test.mjs
git commit -m "feat: publish campus hero battle manifest"
```

### Task 5: Apply per-hero attack visuals without changing battle mechanics

**Files:**
- Modify: `web/js/app.mjs`
- Modify: `web/js/battle-renderer.mjs`
- Modify: `web/assets/app.css`
- Modify: `tests/battle-renderer.test.mjs`
- Modify: `tests/app-integration.test.mjs`

- [ ] **Step 1: Write failing renderer tests for an optional profile**

```js
test('character attack profile changes only effect labels and CSS variables', () => {
  const effects = buildAttackEffectMarkup({
    attackType: 'energy', player: 'left', opponent: 'right', damage: 10,
    profile: { callout: '幾何方陣', glyph: '△', color: '#7755ff' },
  });
  assert.match(effects.weapon, /--attack-color:#7755ff/);
  assert.match(effects.weapon, /△/);
  assert.match(effects.impact, /幾何方陣/);
});
```

- [ ] **Step 2: Run the renderer test to verify it fails**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL because `buildAttackEffectMarkup` does not accept `profile`.

- [ ] **Step 3: Extend only the renderer data path**

Change the renderer function signature to:

```js
export function buildAttackEffectMarkup({ attackType = 'energy', player, opponent, damage, weapon = null, profile = null }) {
  const visual = profile ?? { callout: attackType === 'kick' ? '飛踢' : attackType === 'punch' ? '重拳' : '能量彈', glyph: attackType === 'kick' ? '腳' : attackType === 'punch' ? '拳' : '氣', color: '#55dfff' };
  const style = ` style="--attack-color:${escapeHtml(visual.color)}"`;
  // Add style, visual.glyph, and visual.callout to existing effect markup.
  // Preserve every `attackType` class and no damage/timing/input decision moves here.
}
```

In `app.mjs`, select `outcome.actor?.attacks?.[outcome.attack.attackType]` and pass it as `profile` to the existing `playBattleAnimation` call. Extend `playBattleAnimation` to forward this one optional value. Do not modify `drawAttack`, `attackTiming`, `processAnswer`, score logic, keyboard handlers, touch handlers, Gamepad loop, CPU controller, or pause coordinator.

In CSS, use `var(--attack-color, #55dfff)` in the new effect-specific glow/border rules while retaining the existing class names and keyframes:

```css
.energy-bolt,.melee-symbol,.attack-callout { --attack-color:#55dfff; }
.energy-bolt { box-shadow:0 0 18px var(--attack-color),0 0 38px var(--attack-color); }
.attack-callout { border-color:var(--attack-color); }
```

- [ ] **Step 4: Add invariant tests for unchanged game controls**

Add source and behaviour assertions that `PLAYER_KEYS`, `bindMobileAnswerControls`, `pollGamepadEvents`, `createCpuController`, and `createBattlePauseCoordinator` are still imported and exercised by `app.mjs`; then run:

```powershell
node --test tests/battle-renderer.test.mjs tests/app-integration.test.mjs tests/input.test.mjs tests/mobile-controls.test.mjs tests/gamepad-input.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the visual-profile implementation**

```powershell
git add web/js/app.mjs web/js/battle-renderer.mjs web/assets/app.css tests/battle-renderer.test.mjs tests/app-integration.test.mjs
git commit -m "feat: personalize campus hero attack effects"
```

### Task 6: Validate selection flow, responsive layout, and release readiness

**Files:**
- Modify: `README.md`
- Modify: `tests/start-screen.test.mjs`
- Modify: `tests/character-select.test.mjs`
- Modify: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: Write failing flow tests**

```js
import fs from 'node:fs';

test('published scene labels expose all four campus locations', async () => {
  const manifest = JSON.parse(await readFile('web/assets/battle/manifest.json', 'utf8'));
  assert.deepEqual(manifest.scenes.map(scene => scene.label), ['大溪校門對決', '紅色跑道衝刺', '籃球場決勝', '教室知識擂台']);
});

test('same canvas heroes remain fully visible in desktop and touch battle CSS', () => {
  const css = fs.readFileSync('web/assets/app.css', 'utf8');
  assert.match(css, /\.fighter-sprite[^}]*object-position:center bottom/);
  assert.match(css, /\.touch-capable \.fighter-sprite[^}]*height:62%/);
});
```

- [ ] **Step 2: Run focused tests to verify any missing coverage fails**

Run: `node --test tests/start-screen.test.mjs tests/character-select.test.mjs tests/battle-renderer.test.mjs`

Expected: FAIL because the legacy manifest has three labels and the CSS assertion has not yet been added.

- [ ] **Step 3: Update user-facing documentation only**

In `README.md`, replace legacy arena wording with the four Daxi campus locations, describe original human campus heroes, and explicitly state that keyboard, touch, and USB Gamepad controls retain their current mappings. Do not claim new controls or rules.

- [ ] **Step 4: Run complete automated verification**

Run:

```powershell
npm test
Get-ChildItem web\js -Filter *.mjs | ForEach-Object { node --check $_.FullName }
git diff --check
```

Expected: all tests pass, every browser module parses, and no whitespace errors are reported.

- [ ] **Step 5: Perform browser visual verification before publishing**

Start the local site and verify all of the following using the in-app browser:

1. All 4 arena cards display and select correctly.
2. All 12 hero cards have a human character, distinct label, equal visual height, and no clipping.
3. A solo battle and local two-player battle preserve keyboard answers and show the new sprite/effect profile.
4. A touch-capable landscape viewport still shows touch answer pads; a desktop viewport does not.
5. A Gamepad API simulated test and the existing USB physical-key-test flow still map answer choices without changing keys.
6. Pause, restart, change quiz, and home confirmation still work in an active battle.

- [ ] **Step 6: Commit verification and documentation**

```powershell
git add README.md tests/start-screen.test.mjs tests/character-select.test.mjs tests/battle-renderer.test.mjs
git commit -m "docs: describe original campus battle visuals"
```

## Plan self-review

- Spec coverage: Tasks 1–3 replace all 12 original characters, enforce a common canvas/baseline, preserve all-human originality, and create distinct three-attack visuals. Tasks 2 and 4 replace and expand arenas to four campus locations. Task 5 is deliberately visual-only; Task 6 proves keyboard, touch, USB, pause, and game loop invariants are unchanged.
- Placeholder scan: no implementation placeholder remains; the roster comment in Task 1 is an enumerated data-entry instruction and must be expanded in the actual code to all 12 named entries before its test can pass.
- Type consistency: the same `attacks` profile is defined on a roster hero, copied to manifest character, selected by `app.mjs`, and consumed by the renderer; `energy`／`punch`／`kick` remain the existing attack-type names.
