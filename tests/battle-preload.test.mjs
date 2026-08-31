import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBattleAssetPaths, preloadBattleAssets } from '../web/js/battle-preload.mjs';

test('僅收集本局場景與兩名角色的待機和攻擊素材，且會去重', () => {
  const scene = { image: './assets/battle/scenes/gate.webp' };
  const left = { states: { idle: ['./assets/battle/heroes/left-idle.png'], attack: ['./assets/battle/heroes/left-attack.png'] } };
  const right = { states: { idle: ['./assets/battle/heroes/right-idle.png'], attack: ['./assets/battle/heroes/left-attack.png'] } };

  assert.deepEqual(collectBattleAssetPaths(scene, [left, right]), [
    './assets/battle/scenes/gate.webp',
    './assets/battle/heroes/left-idle.png',
    './assets/battle/heroes/left-attack.png',
    './assets/battle/heroes/right-idle.png',
  ]);
});

test('預載不等待下載完成，並以非同步解碼設定每個唯一素材', () => {
  const images = [];
  const created = preloadBattleAssets(['one.webp', 'one.webp', 'two.png', ''], () => {
    const image = {};
    images.push(image);
    return image;
  });

  assert.equal(created.length, 2);
  assert.deepEqual(images, [
    { decoding: 'async', src: 'one.webp' },
    { decoding: 'async', src: 'two.png' },
  ]);
});

test('沒有瀏覽器 Image API 時安全略過預載', () => {
  assert.deepEqual(preloadBattleAssets(['one.webp'], null), []);
});
