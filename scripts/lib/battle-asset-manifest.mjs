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
