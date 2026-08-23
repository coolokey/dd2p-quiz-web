import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBattleMarkup, buildProjectileMarkup, playSpriteFrames, resolveAssetUrl } from '../web/js/battle-renderer.mjs';
import { readFile } from 'node:fs/promises';

const viewModel = {
  scene: { label: '神殿決鬥', image: './assets/battle/scenes/palace.png' },
  players: {
    left: { name: '紅方', health: 100, score: 2, image: './left.png' },
    right: { name: '藍方', health: 70, score: 1, image: './right.png' },
  },
  progress: '3／10',
  prompt: '下列何者正確？',
  choices: ['甲', '乙', '丙', '丁'],
  status: '兩位玩家請搶答',
  phase: 'regulation',
};

test('戰鬥畫面包含場景、雙方角色、血條、題目與音量控制', () => {
  const html = buildBattleMarkup(viewModel);
  assert.match(html, /palace\.png/);
  assert.match(html, /left\.png/);
  assert.match(html, /right\.png/);
  assert.match(html, /data-health="right"[^>]*style="--health:70%"/);
  assert.match(html, /下列何者正確？/);
  assert.match(html, /data-audio-toggle/);
  assert.match(html, /data-master-volume/);
  assert.match(html, /data-music-volume/);
  assert.match(html, /data-effects-volume/);
});

test('驟死階段顯示驟死提示', () => {
  const html = buildBattleMarkup({ ...viewModel, phase: 'sudden-death' });
  assert.match(html, /驟死決勝/);
});

test('場景網址以頁面根目錄解析，不會因 CSS 檔位置重複 assets 路徑', () => {
  assert.equal(
    resolveAssetUrl('./assets/battle/scenes/ship.png', 'http://localhost:4173/'),
    'http://localhost:4173/assets/battle/scenes/ship.png',
  );
});

test('沒有原始武器的角色仍會產生可見能量彈', () => {
  assert.match(buildProjectileMarkup(null, 'left'), /energy-bolt from-left/);
  assert.match(buildProjectileMarkup('./weapon.png', 'right'), /flying-weapon from-right/);
});

test('攻擊時依序播放原始角色影格並回復待機圖', async () => {
  const assignments = [];
  const image = {
    _src: './idle.png',
    get src() { return this._src; },
    set src(value) { this._src = value; assignments.push(value); },
  };

  await playSpriteFrames(image, ['./attack-1.png', './attack-2.png', './attack-3.png'], 30);

  assert.deepEqual(assignments.slice(0, 3), ['./attack-1.png', './attack-2.png', './attack-3.png']);
  assert.equal(assignments.at(-1), './idle.png');
});

test('減少動態模式仍保留可辨識的攻擊與命中效果', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const reducedMotion = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.doesNotMatch(reducedMotion, /animation-duration:\s*\.01ms/);
  assert.match(css, /\.energy-bolt/);
});
