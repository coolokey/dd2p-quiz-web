import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  characterIds,
  createCharacterEntry,
  createBaseBattleManifest,
  validateCharacter,
} from '../scripts/lib/battle-asset-manifest.mjs';
import { chooseCharacterSpriteGroup } from '../scripts/lib/character-sprite-selector.mjs';
import { prepareBattleAssets } from '../scripts/prepare-battle-assets.mjs';

test('maps all three arenas to original scenes and music', () => {
  const manifest = createBaseBattleManifest();

  assert.deepEqual(
    manifest.scenes.map(({ id, image, music }) => ({ id, image, music })),
    [
      {
        id: 'palace',
        image: './assets/battle/scenes/palace.png',
        music: './assets/battle/music/palace.mp3',
      },
      {
        id: 'school',
        image: './assets/battle/scenes/school.png',
        music: './assets/battle/music/school.mp3',
      },
      {
        id: 'ship',
        image: './assets/battle/scenes/ship.png',
        music: './assets/battle/music/ship.mp3',
      },
    ],
  );
});

test('copies the six original arena assets and writes their manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dd2p-battle-assets-'));
  const sourceDir = path.join(root, 'source');
  const outputDir = path.join(root, 'output');
  await mkdir(sourceDir, { recursive: true });

  const sourceFiles = [
    'scene_1.png',
    'scene_4.png',
    'scene_5.png',
    'BK_1.mp3',
    'BK_2.mp3',
    'BK_3.mp3',
  ];
  await Promise.all(
    sourceFiles.map((fileName) =>
      writeFile(path.join(sourceDir, fileName), `original:${fileName}`),
    ),
  );

  await prepareBattleAssets({ sourceDir, outputDir });

  const expectedCopies = new Map([
    ['scenes/palace.png', 'original:scene_1.png'],
    ['scenes/school.png', 'original:scene_4.png'],
    ['scenes/ship.png', 'original:scene_5.png'],
    ['music/palace.mp3', 'original:BK_1.mp3'],
    ['music/school.mp3', 'original:BK_2.mp3'],
    ['music/ship.mp3', 'original:BK_3.mp3'],
  ]);

  for (const [relativePath, expectedContents] of expectedCopies) {
    assert.equal(
      await readFile(path.join(outputDir, relativePath), 'utf8'),
      expectedContents,
    );
  }

  const writtenManifest = JSON.parse(
    await readFile(path.join(outputDir, 'manifest.json'), 'utf8'),
  );
  assert.deepEqual(writtenManifest.scenes, createBaseBattleManifest().scenes);
  assert.equal(writtenManifest.characters.length, 12);
  assert.equal(writtenManifest.characters.every(({ playable }) => !playable), true);
});

test('disables a character that has no idle and attack frames', () => {
  const result = validateCharacter({
    id: '1',
    states: { idle: [], attack: [] },
  });

  assert.deepEqual(result, {
    playable: false,
    missing: ['idle', 'attack'],
  });
});

test('keeps a character playable when either required source state exists', () => {
  assert.deepEqual(
    validateCharacter({ id: '2', states: { idle: ['idle.png'], attack: [] } }),
    { playable: true, missing: ['attack'] },
  );
});

test('publishes twelve distinct character ids', () => {
  assert.deepEqual(
    characterIds(),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  );
});

test('fills optional animation states from extracted idle and attack frames', () => {
  const character = createCharacterEntry({
    id: '6',
    idle: ['./assets/battle/characters/6/idle/1.png'],
    attack: ['./assets/battle/characters/6/attack/1.png'],
    weapon: null,
  });

  assert.equal(character.playable, true);
  assert.deepEqual(character.states.hurt, character.states.idle);
  assert.deepEqual(character.states.miss, character.states.attack);
  assert.deepEqual(character.states.win, character.states.idle);
  assert.deepEqual(character.states.lose, character.states.idle);
  assert.equal(character.weapon, null);
});

test('marks fully missing character sources as an explicit fallback', () => {
  const character = createCharacterEntry({ id: '12' });

  assert.equal(character.playable, false);
  assert.deepEqual(character.missing, ['idle', 'attack', 'weapon']);
  assert.deepEqual(character.states.idle, []);
});

test('generated manifest publishes twelve unique characters and existing files', async () => {
  const webRoot = path.resolve('web');
  const manifest = JSON.parse(
    await readFile(path.join(webRoot, 'assets', 'battle', 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.characters.length, 12);
  assert.equal(new Set(manifest.characters.map(({ id }) => id)).size, 12);

  const references = [
    ...manifest.scenes.flatMap(({ image, music }) => [image, music]),
    ...manifest.characters.flatMap(({ states, weapon }) => [
      ...Object.values(states).flat(),
      ...(weapon ? [weapon] : []),
    ]),
    ...Object.values(manifest.sfx),
  ];
  for (const reference of new Set(references)) {
    await access(path.join(webRoot, reference.replace(/^\.\/assets\//, 'assets/')));
  }
});

test('完整角色精靈優先於尺寸過小的特效群組', () => {
  const selected = chooseCharacterSpriteGroup([
    { name: 'head-effect', frames: Array.from({ length: 17 }, () => ({ width: 73, height: 72, size: 8000 })) },
    { name: 'full-character', frames: [
      { width: 136, height: 212, size: 25000 },
      { width: 70, height: 70, size: 30000 },
    ] },
    { name: 'large-effect', frames: [{ width: 210, height: 205, size: 9000 }] },
  ]);

  assert.equal(selected.name, 'full-character');
  assert.equal(selected.frames.length, 1);
  assert.equal(selected.frames[0].width, 136);
});

test('沒有足夠高度的精靈時不冒充完整角色', () => {
  const selected = chooseCharacterSpriteGroup([
    { name: 'spark', frames: [{ width: 90, height: 80, size: 12000 }] },
  ]);

  assert.equal(selected, null);
});
