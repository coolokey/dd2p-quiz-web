import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioManager } from '../web/js/audio-manager.mjs';

const manifest = {
  scenes: [
    { id: 'palace', music: './assets/battle/music/palace.mp3' },
    { id: 'school', music: './assets/battle/music/school.mp3' },
  ],
  sfx: {
    menu: './assets/battle/sfx/menu.mp3',
    buzz: './assets/battle/sfx/buzz.mp3',
    correct: './assets/battle/sfx/correct.mp3',
    wrong: './assets/battle/sfx/wrong.mp3',
    attack: './assets/battle/sfx/attack.mp3',
    hit: './assets/battle/sfx/hit.mp3',
    ko: './assets/battle/sfx/ko.mp3',
    win: './assets/battle/sfx/win.mp3',
    lose: './assets/battle/sfx/lose.mp3',
  },
};

function createAudioHarness({ rejectPlay = false } = {}) {
  const audios = [];
  const audioFactory = (src) => {
    const audio = {
      src,
      loop: false,
      volume: 1,
      muted: false,
      currentTime: 4,
      playCount: 0,
      pauseCount: 0,
      play() {
        this.playCount += 1;
        return rejectPlay ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve();
      },
      pause() {
        this.pauseCount += 1;
      },
    };
    audios.push(audio);
    return audio;
  };
  return { audios, audioFactory };
}

test('首次解鎖前不播放音樂，解鎖後播放目前場景的循環音樂', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({ manifest, audioFactory });

  manager.setScene('palace');
  assert.equal(audios.length, 0);

  await manager.unlock();
  assert.equal(audios.length, 1);
  assert.equal(audios[0].src, './assets/battle/music/palace.mp3');
  assert.equal(audios[0].loop, true);
  assert.equal(audios[0].playCount, 1);
});

test('切換場景時停止舊音樂並播放新音樂', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({ manifest, audioFactory });
  manager.setScene('palace');
  await manager.unlock();

  await manager.setScene('school');

  assert.equal(audios[0].pauseCount, 1);
  assert.equal(audios[0].currentTime, 0);
  assert.equal(audios[1].src, './assets/battle/music/school.mp3');
  assert.equal(audios[1].playCount, 1);
});

test('支援所有指定戰鬥音效事件並允許音效重疊', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({ manifest, audioFactory });
  await manager.unlock();

  for (const event of Object.keys(manifest.sfx)) {
    await manager.playSfx(event);
  }

  assert.deepEqual(audios.map((audio) => audio.src), Object.values(manifest.sfx));
  assert.ok(audios.every((audio) => audio.playCount === 1));
});

test('取消開局時可停止已經開始的短音效', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({ manifest, audioFactory });
  await manager.unlock();
  await manager.playSfx('correct');

  manager.stopEffects();

  assert.equal(audios[0].pauseCount, 1);
  assert.equal(audios[0].currentTime, 0);
});

test('缺少場景或音效檔時優雅略過', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({ manifest: { scenes: [], sfx: {} }, audioFactory });

  await manager.unlock();
  await manager.setScene('unknown');
  await manager.playSfx('unknown');

  assert.equal(audios.length, 0);
});

test('靜音、音量及解除靜音會套用至目前與後續音訊', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({ manifest, audioFactory, volume: 0.6 });
  manager.setScene('palace');
  await manager.unlock();

  manager.setVolume(0.25);
  manager.setMuted(true);
  assert.equal(audios[0].volume, 0.25);
  assert.equal(audios[0].muted, true);

  await manager.playSfx('correct');
  assert.equal(audios[1].volume, 0.25);
  assert.equal(audios[1].muted, true);

  manager.setMuted(false);
  assert.ok(audios.every((audio) => audio.muted === false));
});

test('瀏覽器拒絕播放時不拋出錯誤', async () => {
  const { audioFactory } = createAudioHarness({ rejectPlay: true });
  const manager = createAudioManager({ manifest, audioFactory });
  manager.setScene('palace');

  await assert.doesNotReject(() => manager.unlock());
  await assert.doesNotReject(() => manager.playSfx('correct'));
});

test('可以使用獨立音訊 manifest 覆蓋場景音樂與音效', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({
    manifest,
    audioManifest: {
      bgm: { palace: { src: './audio/new-palace.mp3' } },
      sfx: { correct: { url: './audio/new-correct.mp3' } },
    },
    audioFactory,
  });

  manager.setScene('palace');
  await manager.unlock();
  await manager.playSfx('correct');

  assert.deepEqual(audios.map((audio) => audio.src), [
    './audio/new-palace.mp3',
    './audio/new-correct.mp3',
  ]);
});

test('停止後再次選擇同一場景會重新播放背景音樂', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({ manifest, audioFactory });
  await manager.setScene('palace');
  await manager.unlock();
  manager.stop();
  await manager.setScene('palace');

  assert.equal(audios.length, 2);
  assert.equal(audios[1].src, './assets/battle/music/palace.mp3');
  assert.equal(audios[1].playCount, 1);
});

test('背景音樂與事件音效可分別調整音量', async () => {
  const { audios, audioFactory } = createAudioHarness();
  const manager = createAudioManager({ manifest, audioFactory, volume: 0.8, musicVolume: 0.5, effectsVolume: 0.25 });
  await manager.setScene('palace');
  await manager.unlock();
  await manager.playSfx('correct');

  assert.equal(audios[0].volume, 0.4);
  assert.equal(audios[1].volume, 0.2);
  manager.setMusicVolume(0.25);
  manager.setEffectsVolume(0.75);
  assert.equal(audios[0].volume, 0.2);
  assert.ok(Math.abs(audios[1].volume - 0.6) < Number.EPSILON * 4);
});
