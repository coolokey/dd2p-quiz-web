import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBaseBattleManifest } from '../scripts/lib/battle-asset-manifest.mjs';
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

  assert.deepEqual(
    JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8')),
    createBaseBattleManifest(),
  );
});
