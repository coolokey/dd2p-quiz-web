# 明顯拳腳攻擊與可略過鍵盤測試 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓所有角色的出拳與出腳有清楚不同的漫畫式演出，並讓玩家在選角後自行選擇測試鍵盤或直接開始。

**Architecture:** 新增一個純函式的開局操作模組，負責產生與綁定「測試鍵盤／略過測試」入口，兩條路徑最後共用既有 `startGame(settings)`。戰鬥 renderer 依 `attackType` 產生大型拳腳圖形與攻擊文字，繼續沿用既有命中時間軸與集中清理；CSS 負責左右鏡像、漫畫效果、角色動作、受擊反應與 reduced-motion。

**Tech Stack:** JavaScript ES modules、CSS keyframes、Node.js built-in test runner、HTML5 browser application、GitHub Pages

---

### Task 1: 可選擇的鍵盤測試入口

**Files:**
- Create: `web/js/prebattle-flow.mjs`
- Create: `tests/prebattle-flow.test.mjs`
- Modify: `web/js/app.mjs`

- [ ] **Step 1: 寫入開局操作的失敗測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCharacterActions, buildCharacterActions } from '../web/js/prebattle-flow.mjs';

test('選角完成後提供測試鍵盤與略過測試兩條入口', () => {
  const html = buildCharacterActions(true);
  assert.match(html, /id="test-keys"[^>]*>測試鍵盤/);
  assert.match(html, /id="skip-key-test"[^>]*>略過測試，直接開始/);
  assert.doesNotMatch(html, /id="test-keys"[^>]*disabled/);
  assert.doesNotMatch(html, /id="skip-key-test"[^>]*disabled/);
});

test('角色未選齊時停用兩個開始入口', () => {
  const html = buildCharacterActions(false);
  assert.match(html, /id="test-keys"[^>]*disabled/);
  assert.match(html, /id="skip-key-test"[^>]*disabled/);
});

test('兩個入口分別觸發測試與略過回呼', () => {
  const buttons = Object.fromEntries(['#back', '#test-keys', '#skip-key-test'].map(id => [id, {}]));
  const calls = [];
  bindCharacterActions({ querySelector: selector => buttons[selector] }, {
    onBack: () => calls.push('back'),
    onTest: () => calls.push('test'),
    onSkip: () => calls.push('skip'),
  });
  buttons['#test-keys'].onclick();
  buttons['#skip-key-test'].onclick();
  assert.deepEqual(calls, ['test', 'skip']);
});
```

- [ ] **Step 2: 執行測試並確認模組不存在**

Run: `node --test tests/prebattle-flow.test.mjs`

Expected: FAIL，找不到 `prebattle-flow.mjs`。

- [ ] **Step 3: 實作開局操作純函式**

```js
export function buildCharacterActions(ready) {
  const disabled = ready ? '' : ' disabled';
  return `<div class="actions prebattle-actions">
    <button class="secondary" id="back">返回戰場</button>
    <button class="secondary" id="test-keys"${disabled}>測試鍵盤</button>
    <button class="primary" id="skip-key-test"${disabled}>略過測試，直接開始</button>
  </div>`;
}

export function bindCharacterActions(root, { onBack, onTest, onSkip }) {
  root.querySelector('#back').onclick = onBack;
  root.querySelector('#test-keys').onclick = onTest;
  root.querySelector('#skip-key-test').onclick = onSkip;
}
```

- [ ] **Step 4: 執行模組測試並確認通過**

Run: `node --test tests/prebattle-flow.test.mjs`

Expected: PASS，`3` 項測試通過。

- [ ] **Step 5: 將兩個入口接入選角頁並共用開局函式**

在 `web/js/app.mjs` 匯入：

```js
import { bindCharacterActions, buildCharacterActions } from './prebattle-flow.mjs';
```

將 `renderCharacterSelect(settings)` 原本的單一「前往按鍵測試」按鈕替換為：

```js
${buildCharacterActions(Boolean(characterSelection.left && characterSelection.right))}
```

並在角色卡綁定後加入：

```js
const selectedSettings = () => ({ ...settings, characters: { ...characterSelection } });
bindCharacterActions(app, {
  onBack: () => renderArenaSelect(settings, settings.arenaId),
  onTest: () => {
    playUiSound('start');
    renderKeyTest(selectedSettings());
  },
  onSkip: () => {
    playUiSound('start');
    startGame(selectedSettings());
  },
});
```

刪除舊的 `#next` 處理器；`renderKeyTest()` 的全部按鍵通過條件及 `#start` 呼叫 `startGame(settings)` 維持不變。

- [ ] **Step 6: 執行完整測試並提交**

Run: `npm test`

Expected: 所有測試通過。

```bash
git add web/js/prebattle-flow.mjs web/js/app.mjs tests/prebattle-flow.test.mjs
git commit -m "feat: make keyboard test optional"
```

### Task 2: 大型拳腳漫畫標記

**Files:**
- Modify: `web/js/battle-renderer.mjs`
- Modify: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: 擴充特效標記的失敗測試**

在既有「三種攻擊建立不同特效」測試加入：

```js
assert.match(punch.impact, /melee-symbol-punch/);
assert.match(punch.impact, />拳</);
assert.match(punch.impact, /attack-callout-punch[^>]*>重拳/);
assert.match(punch.impact, /from-left/);
assert.match(kick.impact, /melee-symbol-kick/);
assert.match(kick.impact, />腳</);
assert.match(kick.impact, /attack-callout-kick[^>]*>飛踢/);
assert.match(kick.impact, /from-left/);
assert.doesNotMatch(energy.impact, /melee-symbol|重拳|飛踢/);
```

再加入右方方向測試：

```js
test('近身漫畫特效保留攻擊方向', () => {
  const rightPunch = buildAttackEffectMarkup({ attackType: 'punch', player: 'right', opponent: 'left', damage: 10 });
  assert.match(rightPunch.impact, /from-right/);
  assert.match(rightPunch.impact, /damage-left/);
});
```

- [ ] **Step 2: 執行 renderer 測試並確認缺少新標記**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL，拳腳特效中找不到 `melee-symbol-punch`。

- [ ] **Step 3: 擴充近身攻擊特效建構器**

將 `buildAttackEffectMarkup()` 的近身分支改為：

```js
const melee = attackType === 'kick'
  ? { glyph: '腳', callout: '飛踢' }
  : { glyph: '拳', callout: '重拳' };
return {
  weapon: '',
  impact: `<span class="melee-impact impact-${attackType} damage-${opponent} from-${player}" aria-hidden="true"><span class="melee-symbol melee-symbol-${attackType}">${melee.glyph}</span></span><b class="attack-callout attack-callout-${attackType} damage-${opponent} from-${player}" aria-hidden="true">${melee.callout}</b><b class="damage-pop damage-${opponent}">−${escapeHtml(damage)}</b>`,
};
```

維持 `playBattleAnimation()` 的命中延遲、`impact.innerHTML` 寫入時機及動畫結束清理，確保圖形與文字只在命中後出現並會自動移除。

- [ ] **Step 4: 執行 renderer 測試並提交**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: 所有 renderer 測試通過。

```bash
git add web/js/battle-renderer.mjs tests/battle-renderer.test.mjs
git commit -m "feat: add clear punch and kick callouts"
```

### Task 3: 明顯不同的拳腳動作與受擊反應

**Files:**
- Modify: `web/assets/app.css`
- Modify: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: 寫入 CSS 視覺契約失敗測試**

```js
test('CSS 提供大型拳腳圖形、文字與方向樣式', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  for (const selector of ['melee-symbol-punch', 'melee-symbol-kick', 'attack-callout-punch', 'attack-callout-kick', 'melee-impact.from-left', 'melee-impact.from-right']) {
    assert.match(css, new RegExp(`\\.${selector.replace('.', '\\.').replace('-', '\\-')}`));
  }
  assert.match(css, /@keyframes punchLeft/);
  assert.match(css, /@keyframes kickLeft/);
  assert.match(css, /@keyframes hitPunchLeft/);
  assert.match(css, /@keyframes hitKickLeft/);
});

test('reduced-motion 仍保留拳腳辨識標記', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  const reduced = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced, /melee-impact/);
  assert.match(reduced, /attack-callout/);
});
```

- [ ] **Step 2: 執行 renderer 測試並確認缺少新樣式**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL，找不到 `.melee-symbol-punch` 或 `.attack-callout-punch`。

- [ ] **Step 3: 加入拳腳漫畫圖形及攻擊文字**

在 `web/assets/app.css` 的近身特效區加入：

```css
.melee-symbol { position:absolute; inset:50% auto auto 50%; display:grid; place-items:center; width:118px; height:118px; color:#fff; font:900 68px/1 system-ui,sans-serif; text-shadow:4px 4px 0 #200; transform:translate(-50%,-50%) rotate(-12deg); }
.melee-symbol-punch { clip-path:polygon(8% 28%,28% 8%,48% 18%,64% 5%,91% 28%,82% 52%,96% 70%,70% 96%,42% 84%,18% 94%,4% 65%); background:linear-gradient(145deg,#fff06a 0 18%,#ff7a19 42%,#d41420 78%); box-shadow:0 0 0 9px #fff,0 0 32px #ff5a16; }
.melee-symbol-kick { width:138px; height:104px; border:10px solid #fff; border-radius:70% 18% 65% 30%; background:linear-gradient(135deg,#fff77a,#27cfff 55%,#2055ff); box-shadow:0 0 30px #36e5ff; transform:translate(-50%,-50%) rotate(-28deg); }
.attack-callout { position:absolute; z-index:12; top:34%; padding:7px 12px; border:4px solid #fff; color:#fff; font:900 clamp(20px,3.5vw,42px)/1 'Press Start 2P',system-ui; text-shadow:4px 4px 0 #16020a; transform:rotate(-8deg); animation:calloutPop .65s steps(2,end) both; }
.attack-callout.damage-left { left:8%; }
.attack-callout.damage-right { right:8%; }
.attack-callout-punch { background:#d71920; box-shadow:6px 6px 0 #ffb51b; }
.attack-callout-kick { background:#1458d8; box-shadow:6px 6px 0 #32eaff; }
.melee-impact.from-right .melee-symbol,.attack-callout.from-right { scale:-1 1; }
@keyframes calloutPop { 0%{opacity:0;scale:.35} 35%,70%{opacity:1;scale:1.12} 100%{opacity:0;scale:.9} }
```

- [ ] **Step 4: 放大拳腳差異與對應受擊動作**

調整既有 `punchLeft`／`punchRight`，讓命中前有短暫後拉、命中時快速前傾，並維持直線衝刺；調整 `kickLeft`／`kickRight`，讓命中時有更大的上抬與旋轉。`hitPunchLeft`／`hitPunchRight` 使用快速水平震退與回彈；`hitKickLeft`／`hitKickRight` 使用向後、向上、傾斜後落回。每條動畫仍以 `0%,100%` 回復原始 transform。

將 `.impact-punch` 放大至至少 `118px` 並保留橘紅爆裂與速度線；將 `.impact-kick` 放大至至少 `138px`，保留藍黃雙弧軌跡。左右玩家使用 `.damage-left`／`.damage-right` 定位，窄螢幕調整至 `left:5%`／`right:5%`，不得進入下方題目區。

- [ ] **Step 5: 補齊 reduced-motion 與窄螢幕規則**

在 `@media(prefers-reduced-motion:reduce)` 明確保留：

```css
.melee-impact,.attack-callout{animation-duration:.6s!important}
.fighter.attack-punch .fighter-sprite{animation:reducedPunch .5s ease-in-out!important}
.fighter.attack-kick .fighter-sprite{animation:reducedKick .5s ease-in-out!important}
```

窄螢幕縮小 `.melee-symbol` 與 `.attack-callout`，但不可隱藏；沿用既有手機版近身位移變數，避免角色越界。

- [ ] **Step 6: 執行 renderer 與完整測試並提交**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: 所有 renderer 測試通過。

Run: `npm test`

Expected: 所有測試通過。

```bash
git add web/assets/app.css tests/battle-renderer.test.mjs
git commit -m "feat: emphasize punch and kick animations"
```

### Task 4: 瀏覽器驗證、程式審查與發布

**Files:**
- Verify: `web/js/prebattle-flow.mjs`
- Verify: `web/js/app.mjs`
- Verify: `web/js/battle-renderer.mjs`
- Verify: `web/assets/app.css`

- [ ] **Step 1: 執行發布前自動檢查**

Run: `npm test`

Expected: 所有測試通過。

Run: `git diff --check`

Expected: 沒有空白錯誤。

- [ ] **Step 2: 驗證兩條開局路徑**

本機啟動 `npm start`。完成題庫、規則、戰場與雙方選角後，確認同時顯示「測試鍵盤」及「略過測試，直接開始」。先走測試路徑，確認未按完時不能開始、全部按完後可以開始；重開一局後走略過路徑，確認不經測試頁即可進入同一種戰鬥畫面。

- [ ] **Step 3: 驗證左右玩家與十二名角色的拳腳演出**

至少讓左右玩家各觸發一次出拳與出腳，確認命中前不顯示漫畫標記、命中時分別顯示「拳／重拳」與「腳／飛踢」、受擊者呈現不同反應、攻擊者退回原位且特效完整清除。輪流選用十二名角色，確認每一名角色的拳腳都能辨識；氣功不得出現拳腳專屬標記。

- [ ] **Step 4: 驗證窄螢幕與 reduced-motion**

將視窗縮到手機寬度，確認角色與拳腳特效不超出戰場、不遮住題目或答案。模擬 `prefers-reduced-motion: reduce`，確認位移縮小但大型拳腳圖形與文字仍可辨識。

- [ ] **Step 5: 請求程式審查並修正所有 Critical／Important 意見**

審查範圍包含：兩條開局路徑是否共用 `startGame()`、按鍵測試完成條件是否回歸、命中時間同步、左右鏡像、特效清理、十二名角色、窄螢幕、reduced-motion 及既有氣功／音效回歸。

- [ ] **Step 6: 發布並驗證 GitHub Pages**

以目前遠端 `gh-pages` SHA 建立／更新發布子樹，使用 `--force-with-lease` 安全推送 `web` 內容。等待 GitHub Pages 建置完成，確認首頁、`js/prebattle-flow.mjs`、`js/battle-renderer.mjs` 與 `assets/app.css` 均回應 `HTTP 200`，再於公開網址實際走完兩條開局路徑並觸發拳、腳各一次。
