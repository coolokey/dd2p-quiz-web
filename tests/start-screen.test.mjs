import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { bindStartScreen, buildStartScreen, escapeCssString, resolveStartSceneUrl } from '../web/js/start-screen.mjs';

test('起始戰場圖片依頁面 URL 解析，保留 GitHub Pages 子路徑', () => {
  assert.equal(
    resolveStartSceneUrl('./assets/battle/scenes/palace.png', 'http://localhost:4173/'),
    'http://localhost:4173/assets/battle/scenes/palace.png',
  );
  assert.equal(
    resolveStartSceneUrl('./assets/battle/scenes/palace.png', 'https://coolokey.github.io/dd2p-quiz-web/'),
    'https://coolokey.github.io/dd2p-quiz-web/assets/battle/scenes/palace.png',
  );
});

test('沒有起始戰場圖片時保留安全漸層，且不插入 undefined URL', () => {
  const html = buildStartScreen({ quizCount: 0, muted: false, scene: '', fighters: [] });
  const css = readFileSync(new URL('../web/assets/app.css', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /url\('undefined'\)/);
  assert.doesNotMatch(html, /--start-scene:url/);
  assert.match(css, /var\(--start-scene,\s*none\)/);
});

test('起始戰場 style 跳脫 CSS 反斜線與單引號，不允許額外宣告', () => {
  const scene = "https://example.test/a\\file/a'quote.png";
  const html = buildStartScreen({ quizCount: 0, muted: false, scene, fighters: [] });
  const style = html.match(/<section class="start-arena" style="([^"]+)"/)?.[1];

  assert.equal(escapeCssString(scene), "https://example.test/a\\\\file/a\\'quote.png");
  assert.equal(style, "--start-scene:url('https://example.test/a\\\\file/a\\&#039;quote.png')");
  assert.doesNotMatch(style, /;\s*[a-z-]+\s*:/i);
});

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

test('起始畫面保留本地電競標題字型，中文字型改用裝置系統字型', () => {
  const css = readFileSync(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.doesNotMatch(css, /NotoSansTC-Variable\.woff2/);
  assert.match(css, /font-family:'VectorGrid Local'[\s\S]*VectorGrid-Variable\.woff2/);
  assert.match(css, /Microsoft JhengHei/);
  assert.doesNotMatch(css, /Orbitron-Variable\.woff2|font-family:'Orbitron Local'/);
  assert.match(css, /\.start-screen/);
  assert.match(css, /@media\s*\(max-width:900px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:reduce\)/);
  assert.ok(existsSync(new URL('../web/assets/fonts/NotoSansTC-Variable.woff2', import.meta.url)), '保留原始字型檔，供日後離線字型方案使用');
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
