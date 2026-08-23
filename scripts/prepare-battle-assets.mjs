import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBaseBattleManifest } from './lib/battle-asset-manifest.mjs';

const ASSET_COPIES = [
  ['scene_1.png', 'scenes/palace.png'],
  ['scene_4.png', 'scenes/school.png'],
  ['scene_5.png', 'scenes/ship.png'],
  ['BK_1.mp3', 'music/palace.mp3'],
  ['BK_2.mp3', 'music/school.mp3'],
  ['BK_3.mp3', 'music/ship.mp3'],
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

export async function prepareBattleAssets({
  sourceDir = path.join(projectRoot, 'D_Unit', 'Game_03'),
  outputDir = path.join(projectRoot, 'web', 'assets', 'battle'),
} = {}) {
  await Promise.all([
    mkdir(path.join(outputDir, 'scenes'), { recursive: true }),
    mkdir(path.join(outputDir, 'music'), { recursive: true }),
  ]);

  await Promise.all(
    ASSET_COPIES.map(([sourceName, destinationPath]) =>
      copyFile(
        path.join(sourceDir, sourceName),
        path.join(outputDir, destinationPath),
      ),
    ),
  );

  const manifest = createBaseBattleManifest();
  await writeFile(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  await prepareBattleAssets();
}
