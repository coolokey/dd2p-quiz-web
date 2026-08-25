import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { bindStartScreen, buildStartScreen } from '../web/js/start-screen.mjs';

test('控制台包含兩種主要模式與兩個次要入口', () => {
  const html = buildStartScreen({ quizCount: 31, muted: false, scene: './scene.png', fighters: ['./left.png', './right.png'] });
  assert.match(html, /class="start-screen"/);
  assert.match(html, /data-game-mode="solo"[^>]*>[^<]*玩家 VS 電腦/s);
  assert.match(html, /data-game-mode="local"[^>]*>[^<]*本機雙人對戰/s);
  assert.match(html, /id="start-help"/);
  assert.match(html, /id="start-audio"/);
  assert.match(html, /31 QUIZ PACKS/);
});

test('兩個模式按鈕回傳正確模式', () => {
  const elements = { solo: {}, local: {}, '#start-help': {}, '#start-audio': {} };
  const modes = [];
  bindStartScreen({
    querySelector: selector => selector === '[data-game-mode="solo"]' ? elements.solo
      : selector === '[data-game-mode="local"]' ? elements.local : elements[selector],
  }, { onMode: mode => modes.push(mode), onHelp() {}, onAudio() {} });
  elements.solo.onclick();
  elements.local.onclick();
  assert.deepEqual(modes, ['solo', 'local']);
});

test('起始畫面使用本地電競字型且提供響應式與減少動態樣式', () => {
  const css = readFileSync(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.match(css, /@font-face[\s\S]*NotoSansTC-Variable\.woff2/);
  assert.match(css, /@font-face[\s\S]*Orbitron-Variable\.woff2/);
  assert.match(css, /\.start-screen/);
  assert.match(css, /@media\s*\(max-width:900px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:reduce\)/);
  assert.ok(existsSync(new URL('../web/assets/fonts/NotoSansTC-Variable.woff2', import.meta.url)));
  assert.ok(existsSync(new URL('../web/assets/fonts/Orbitron-Variable.woff2', import.meta.url)));
});
