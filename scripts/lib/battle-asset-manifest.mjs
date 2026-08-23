const CHARACTER_IDS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => String(index + 1)),
);

export function characterIds() {
  return [...CHARACTER_IDS];
}

export function validateCharacter(character) {
  const idle = character.states?.idle ?? [];
  const attack = character.states?.attack ?? [];
  const missing = [];
  if (idle.length === 0) missing.push('idle');
  if (attack.length === 0) missing.push('attack');

  return {
    playable: idle.length > 0 || attack.length > 0,
    missing,
  };
}

export function createCharacterEntry({
  id,
  idle = [],
  attack = [],
  weapon = null,
}) {
  const validation = validateCharacter({ id, states: { idle, attack } });
  const idleFallback = idle.length > 0 ? idle : attack;
  const attackFallback = attack.length > 0 ? attack : idle;
  const missing = [...validation.missing];
  if (!weapon) missing.push('weapon');

  return {
    id,
    label: `角色 ${id}`,
    playable: validation.playable,
    missing,
    states: {
      idle: idleFallback,
      attack: attackFallback,
      hurt: idleFallback,
      miss: attackFallback,
      win: idleFallback,
      lose: idleFallback,
    },
    weapon,
  };
}

export function createBaseBattleManifest() {
  return {
    version: 1,
    scenes: [
      {
        id: 'palace',
        label: '神殿決鬥',
        image: './assets/battle/scenes/palace.png',
        music: './assets/battle/music/palace.mp3',
      },
      {
        id: 'school',
        label: '校園真人擂台',
        image: './assets/battle/scenes/school.png',
        music: './assets/battle/music/school.mp3',
      },
      {
        id: 'ship',
        label: '冒險船艦戰',
        image: './assets/battle/scenes/ship.png',
        music: './assets/battle/music/ship.mp3',
      },
    ],
    characters: [],
    sfx: {},
  };
}
