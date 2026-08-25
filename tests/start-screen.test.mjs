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

test('資料載入不完整時仍顯示起始畫面、停用模式並提供重試', () => {
  const html = buildStartScreen({
    quizCount: 31,
    muted: false,
    scene: '',
    fighters: [],
    modesEnabled: false,
    loadMessage: '對戰素材載入失敗，請重試。',
  });

  assert.match(html, /class="start-screen"/);
  assert.match(html, /data-game-mode="solo"[^>]*disabled/);
  assert.match(html, /data-game-mode="local"[^>]*disabled/);
  assert.match(html, /class="start-load-error"[^>]*>對戰素材載入失敗/);
  assert.match(html, /id="retry-start-load"/);
});

test('模式選單 focus 與 hover 共用節流音效並可觸發重試', () => {
  const listeners = new Map();
  const buttons = Array.from({ length: 4 }, () => ({
    addEventListener(type, listener) { listeners.set(`${buttons.indexOf(this)}:${type}`, listener); },
  }));
  const elements = {
    solo: buttons[0], local: buttons[1], '#start-help': buttons[2], '#start-audio': buttons[3], '#retry-start-load': {},
  };
  const calls = [];
  bindStartScreen({
    querySelector: selector => selector === '[data-game-mode="solo"]' ? elements.solo
      : selector === '[data-game-mode="local"]' ? elements.local : elements[selector],
    querySelectorAll: selector => selector === 'button' ? buttons : [],
  }, {
    onMode() {}, onHelp() {}, onAudio() {},
    onNavigate: () => calls.push('navigate'),
    onRetry: () => calls.push('retry'),
  });

  listeners.get('0:focus')();
  listeners.get('0:mouseenter')();
  elements['#retry-start-load'].onclick();
  assert.deepEqual(calls, ['navigate', 'retry']);
});

test('起始畫面使用本地電競字型且提供響應式與減少動態樣式', () => {
  const css = readFileSync(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.match(css, /@font-face[\s\S]*NotoSansTC-Variable\.woff2/);
  assert.match(css, /font-family:'VectorGrid Local'[\s\S]*VectorGrid-Variable\.woff2/);
  assert.doesNotMatch(css, /Orbitron-Variable\.woff2|font-family:'Orbitron Local'/);
  assert.match(css, /\.start-screen/);
  assert.match(css, /@media\s*\(max-width:900px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:reduce\)/);
  assert.ok(existsSync(new URL('../web/assets/fonts/NotoSansTC-Variable.woff2', import.meta.url)));
  assert.ok(existsSync(new URL('../web/assets/fonts/VectorGrid-Variable.woff2', import.meta.url)));
  assert.equal(existsSync(new URL('../web/assets/fonts/Orbitron-Variable.woff2', import.meta.url)), false);
  assert.ok(existsSync(new URL('../web/assets/fonts/FONTLOG-VectorGrid.txt', import.meta.url)));
});

test('窄螢幕不保留會造成水平溢位的 MODE SELECT 裝飾字', () => {
  const css = readFileSync(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const mobileCss = css.slice(css.indexOf('@media(max-width:900px)'));

  assert.match(mobileCss, /\.start-control::after\s*\{\s*content:none/);
});

test('起始畫面在根元素與窄螢幕容器都禁止水平捲動', () => {
  const css = readFileSync(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const mobileCss = css.slice(css.indexOf('@media(max-width:900px)'));

  assert.match(css, /html:has\(\.start-screen\)\s*\{\s*overflow-x:clip/);
  assert.match(mobileCss, /\.start-screen\s*\{[^}]*overflow-x:clip/);
});

test('窄螢幕先顯示模式控制再顯示戰鬥預覽', () => {
  const css = readFileSync(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const mobileCss = css.slice(css.indexOf('@media(max-width:900px)'));

  assert.match(mobileCss, /\.start-control\s*\{[^}]*order:1/);
  assert.match(mobileCss, /\.start-arena\s*\{[^}]*order:2/);
});
