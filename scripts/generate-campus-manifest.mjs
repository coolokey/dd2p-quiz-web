import { readFile, writeFile } from 'node:fs/promises';
import { CAMPUS_HEROES, CAMPUS_SCENES } from '../web/js/campus-heroes.mjs';

const manifestPath = new URL('../web/assets/battle/manifest.json', import.meta.url);
const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
const statesFor = (hero) => {
  const idle = [`./assets/battle/campus-heroes/${hero.id}/idle.webp`];
  const attack = [`./assets/battle/campus-heroes/${hero.id}/attack.webp`];
  return { idle, attack, hurt: idle, miss: attack, win: idle, lose: idle };
};

const manifest = {
  version: 2,
  scenes: CAMPUS_SCENES.map((scene) => ({
    ...scene,
    thumbnail: scene.image.replace(/\.(?:png|webp)$/, '-thumb.webp'),
  })),
  characters: CAMPUS_HEROES.map((hero) => {
    const displayName = `${hero.name}｜${hero.role}`;
    return {
    id: hero.id,
    thumbnail: `./assets/battle/campus-heroes/${hero.id}/thumb.webp`,
    label: displayName,
    name: displayName,
    playable: true,
    missing: [],
    states: statesFor(hero),
    weapon: null,
    attacks: hero.attacks,
    };
  }),
  sfx: previous.sfx,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
