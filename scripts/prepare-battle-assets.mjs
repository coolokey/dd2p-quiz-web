import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  characterIds,
  createBaseBattleManifest,
  createCharacterEntry,
} from './lib/battle-asset-manifest.mjs';
import {
  chooseCharacterSpriteGroup,
  selectAnimationFrames,
} from './lib/character-sprite-selector.mjs';

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
const SFX_EVENTS = [
  'menu',
  'confirm',
  'start',
  'buzz',
  'correct',
  'wrong',
  'attack',
  'weapon',
  'hit',
  'hurt',
  'ko',
  'win',
  'lose',
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findPortableJava() {
  const root = path.join(projectRoot, '.tools', 'temurin-jre21');
  if (!(await exists(root))) return null;
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      if (entry.isFile() && entry.name.toLowerCase() === 'java.exe') {
        return path.dirname(entryPath);
      }
    }
  }
  return null;
}

async function resolveFfdecPath(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.FFDEC_PATH,
    path.join(projectRoot, '.tools', 'ffdec-26.2.1', 'ffdec.bat'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'FFDec', 'ffdec.bat'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await exists(candidate)) return path.resolve(candidate);
  }
  return null;
}

async function runFfdec(ffdecPath, sourceFile, destination, javaBin) {
  await mkdir(destination, { recursive: true });
  const args = [
    '-ignorebackground',
    '-format',
    'image:png,sprite:png,frame:png,sound:mp3_wav',
    '-export',
    'image,sprite,frame,sound',
    destination,
    sourceFile,
  ];
  const environment = { ...process.env };
  if (javaBin) environment.PATH = `${javaBin}${path.delimiter}${environment.PATH ?? ''}`;

  await new Promise((resolve, reject) => {
    const child = spawn(ffdecPath, args, {
      cwd: projectRoot,
      env: environment,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFDec failed for ${path.basename(sourceFile)} (${code}): ${errors.trim()}`));
    });
  });
}

async function listFilesRecursive(directory, extensionPattern) {
  if (!(await exists(directory))) return [];
  const matches = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (extensionPattern.test(entry.name)) matches.push(entryPath);
    }
  }
  return matches;
}

async function selectRoleFrames(rawDirectory) {
  const spritesDirectory = path.join(rawDirectory, 'sprites');
  if (!(await exists(spritesDirectory))) return { idle: [], attack: [] };
  const groups = [];
  for (const entry of await readdir(spritesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(spritesDirectory, entry.name);
    const files = await listFilesRecursive(directory, /\.png$/i);
    const frames = await Promise.all(files.map(async (file) => {
      const contents = await readFile(file);
      return {
        file,
        number: Number.parseInt(path.basename(file, path.extname(file)), 10) || 0,
        size: contents.length,
        width: contents.readUInt32BE(16),
        height: contents.readUInt32BE(20),
      };
    }));
    groups.push({ name: entry.name, frames });
  }
  const selected = chooseCharacterSpriteGroup(groups);
  if (!selected) return { idle: [], attack: [] };
  const usable = selected.frames.filter(({ size }) => size >= 512).sort((a, b) => a.number - b.number);
  const idle = usable.slice(0, 4);
  const attack = selectAnimationFrames(usable, 6);
  return { idle, attack };
}

async function copyFrames(frames, destination, webPrefix) {
  await mkdir(destination, { recursive: true });
  const references = [];
  for (const [index, frame] of frames.entries()) {
    const fileName = `${String(index + 1).padStart(2, '0')}.png`;
    await copyFile(frame.file, path.join(destination, fileName));
    references.push(`${webPrefix}/${fileName}`);
  }
  return references;
}

async function copyLargestPng(rawDirectory, destination, webReference) {
  const images = await listFilesRecursive(rawDirectory, /\.png$/i);
  if (images.length === 0) return null;
  const described = await Promise.all(images.map(async (file) => ({
    file,
    size: (await stat(file)).size,
  })));
  described.sort((a, b) => b.size - a.size || a.file.localeCompare(b.file));
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(described[0].file, destination);
  return webReference;
}

async function prepareCharacters({ sourceDir, outputDir, ffdecPath, javaBin }) {
  const charactersDir = path.join(outputDir, 'characters');
  const rawRoot = path.join(outputDir, '.raw');
  await rm(charactersDir, { recursive: true, force: true });
  await rm(rawRoot, { recursive: true, force: true });
  await mkdir(charactersDir, { recursive: true });

  const characters = [];
  for (const id of characterIds()) {
    const roleSource = path.join(sourceDir, `${id}_Role.swf`);
    const weaponSource = path.join(sourceDir, `${id}_FlyWeapon.swf`);
    const roleRaw = path.join(rawRoot, id, 'role');
    const weaponRaw = path.join(rawRoot, id, 'weapon');
    let idle = [];
    let attack = [];
    let weapon = null;

    if (ffdecPath && await exists(roleSource)) {
      await runFfdec(ffdecPath, roleSource, roleRaw, javaBin);
      const selected = await selectRoleFrames(roleRaw);
      idle = await copyFrames(
        selected.idle,
        path.join(charactersDir, id, 'idle'),
        `./assets/battle/characters/${id}/idle`,
      );
      attack = await copyFrames(
        selected.attack,
        path.join(charactersDir, id, 'attack'),
        `./assets/battle/characters/${id}/attack`,
      );
    }

    if (ffdecPath && await exists(weaponSource) && (await stat(weaponSource)).size > 78) {
      await runFfdec(ffdecPath, weaponSource, weaponRaw, javaBin);
      weapon = await copyLargestPng(
        weaponRaw,
        path.join(charactersDir, id, 'weapon.png'),
        `./assets/battle/characters/${id}/weapon.png`,
      );
    }

    characters.push(createCharacterEntry({ id, idle, attack, weapon }));
  }

  return { characters, rawRoot };
}

async function prepareSoundEffects({ outputDir, rawRoot }) {
  const sfxDir = path.join(outputDir, 'sfx');
  await rm(sfxDir, { recursive: true, force: true });
  await mkdir(sfxDir, { recursive: true });
  const candidates = (await listFilesRecursive(path.join(rawRoot, '1', 'role', 'sounds'), /\.(?:mp3|wav)$/i))
    .filter((file) => !file.endsWith(`${path.sep}-1.wav`));
  const sfx = {};

  for (const [index, event] of SFX_EVENTS.entries()) {
    if (candidates.length === 0) break;
    const source = candidates[index % candidates.length];
    const extension = path.extname(source).toLowerCase();
    const destinationName = `${event}${extension}`;
    await copyFile(source, path.join(sfxDir, destinationName));
    sfx[event] = `./assets/battle/sfx/${destinationName}`;
  }

  const missing = SFX_EVENTS.filter((event) => !sfx[event]);
  const readme = [
    '# Battle sound effects',
    '',
    'These browser-ready effects are deterministically mapped from sounds embedded in the original character SWF files.',
    'Several event names may intentionally share an original clip when the SWF does not contain a distinct effect.',
    '',
    `Mapped events: ${Object.keys(sfx).join(', ') || '(none)'}`,
    `Fallback-only events: ${missing.join(', ') || '(none)'}`,
    '',
  ].join('\n');
  await writeFile(path.join(sfxDir, 'README.md'), readme, 'utf8');
  return sfx;
}

export async function prepareBattleAssets({
  sourceDir = path.join(projectRoot, 'D_Unit', 'Game_03'),
  outputDir = path.join(projectRoot, 'web', 'assets', 'battle'),
  ffdecPath: requestedFfdecPath,
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

  const ffdecPath = await resolveFfdecPath(requestedFfdecPath);
  const javaBin = await findPortableJava();
  const { characters, rawRoot } = await prepareCharacters({
    sourceDir,
    outputDir,
    ffdecPath,
    javaBin,
  });
  const sfx = await prepareSoundEffects({ outputDir, rawRoot });
  await rm(rawRoot, { recursive: true, force: true });

  const manifest = {
    ...createBaseBattleManifest(),
    characters,
    sfx,
  };
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
