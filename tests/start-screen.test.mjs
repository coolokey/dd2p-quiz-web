import test from 'node:test';
import assert from 'node:assert/strict';
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
