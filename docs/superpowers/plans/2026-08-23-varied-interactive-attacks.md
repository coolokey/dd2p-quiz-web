# 三種隨機攻擊與受擊互動 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓全部角色依每位玩家各自的隨機袋輪流使用氣功、出拳、出腳，並讓對手呈現對應受擊動作。

**Architecture:** 新增純函式攻擊袋模組，將攻擊選擇與畫面演出分離。`app.mjs` 只負責在新局初始化攻擊狀態、答對時抽取攻擊種類與安排音效；`battle-renderer.mjs` 依攻擊種類建立特效、套用攻擊／受擊類別並在動畫後完整清理。

**Tech Stack:** JavaScript ES modules、CSS keyframes、Node.js built-in test runner、HTML5 browser application

---

### Task 1: 每位玩家獨立的攻擊隨機袋

**Files:**
- Create: `web/js/attack-randomizer.mjs`
- Create: `tests/attack-randomizer.test.mjs`

- [ ] **Step 1: 寫入攻擊袋失敗測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackState, drawAttack } from '../web/js/attack-randomizer.mjs';

test('每輪三次攻擊包含氣功出拳出腳各一次', () => {
  let state = createAttackState(() => 0);
  const attacks = [];
  for (let index = 0; index < 3; index += 1) {
    const result = drawAttack(state, 'left', () => 0);
    state = result.state;
    attacks.push(result.attackType);
  }
  assert.deepEqual(new Set(attacks), new Set(['energy', 'punch', 'kick']));
});
```

- [ ] **Step 2: 執行測試並確認模組不存在**

Run: `node --test tests/attack-randomizer.test.mjs`

Expected: FAIL，找不到 `attack-randomizer.mjs`。

- [ ] **Step 3: 實作最小攻擊袋**

```js
export const ATTACK_TYPES = ['energy', 'punch', 'kick'];

function createBag(random) {
  const bag = [...ATTACK_TYPES];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [bag[index], bag[target]] = [bag[target], bag[index]];
  }
  return bag;
}

export function createAttackState(random = Math.random) {
  return { left: createBag(random), right: createBag(random) };
}

export function drawAttack(state, player, random = Math.random) {
  const bag = state[player].length > 0 ? state[player] : createBag(random);
  const [attackType, ...remaining] = bag;
  return { attackType, state: { ...state, [player]: remaining } };
}
```

- [ ] **Step 4: 增加左右玩家互不消耗與補袋測試**

```js
test('左右玩家的攻擊袋互不消耗', () => {
  const initial = createAttackState(() => 0);
  const result = drawAttack(initial, 'left', () => 0);
  assert.equal(result.state.left.length, 2);
  assert.equal(result.state.right.length, 3);
});

test('第四次攻擊會建立新一輪隨機袋', () => {
  let state = createAttackState(() => 0);
  for (let index = 0; index < 3; index += 1) state = drawAttack(state, 'left', () => 0).state;
  const fourth = drawAttack(state, 'left', () => 0);
  assert.ok(['energy', 'punch', 'kick'].includes(fourth.attackType));
  assert.equal(fourth.state.left.length, 2);
});
```

- [ ] **Step 5: 執行測試並提交**

Run: `node --test tests/attack-randomizer.test.mjs`

Expected: PASS，`3` 項測試通過。

```bash
git add web/js/attack-randomizer.mjs tests/attack-randomizer.test.mjs
git commit -m "feat: add per-player attack bags"
```

### Task 2: 三種特效與動畫狀態

**Files:**
- Modify: `web/js/battle-renderer.mjs`
- Modify: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: 寫入三種演出標記失敗測試**

```js
import {
  attackClassNames,
  buildAttackEffectMarkup,
  buildBattleMarkup,
  buildProjectileMarkup,
  playSpriteFrames,
  resolveAssetUrl,
} from '../web/js/battle-renderer.mjs';

test('三種攻擊建立不同特效且只有氣功產生投射物', () => {
  const energy = buildAttackEffectMarkup({ attackType: 'energy', player: 'left', opponent: 'right', damage: 10 });
  const punch = buildAttackEffectMarkup({ attackType: 'punch', player: 'left', opponent: 'right', damage: 10 });
  const kick = buildAttackEffectMarkup({ attackType: 'kick', player: 'left', opponent: 'right', damage: 10 });
  assert.match(energy.weapon, /energy-bolt/);
  assert.doesNotMatch(punch.weapon, /energy-bolt/);
  assert.doesNotMatch(kick.weapon, /energy-bolt/);
  assert.match(punch.impact, /impact-punch/);
  assert.match(kick.impact, /impact-kick/);
});

test('每種攻擊提供不同攻擊者與受擊者類別', () => {
  assert.deepEqual(attackClassNames('energy'), { actor: 'attack-energy', target: 'hit-energy' });
  assert.deepEqual(attackClassNames('punch'), { actor: 'attack-punch', target: 'hit-punch' });
  assert.deepEqual(attackClassNames('kick'), { actor: 'attack-kick', target: 'hit-kick' });
});
```

- [ ] **Step 2: 執行測試並確認缺少匯出而失敗**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL，缺少 `attackClassNames` 或 `buildAttackEffectMarkup`。

- [ ] **Step 3: 實作攻擊類別與特效建構器**

```js
export function attackClassNames(attackType = 'energy') {
  return { actor: `attack-${attackType}`, target: `hit-${attackType}` };
}

export function buildAttackEffectMarkup({ attackType = 'energy', player, opponent, damage, weapon = null }) {
  if (attackType === 'energy') {
    return {
      weapon: buildProjectileMarkup(weapon, player),
      impact: `<span class="impact-burst impact-energy damage-${opponent}" aria-hidden="true"></span><b class="damage-pop damage-${opponent}">−${escapeHtml(damage)}</b>`,
    };
  }
  return {
    weapon: '',
    impact: `<span class="melee-impact impact-${attackType} damage-${opponent}" aria-hidden="true"></span><b class="damage-pop damage-${opponent}">−${escapeHtml(damage)}</b>`,
  };
}
```

- [ ] **Step 4: 將動畫播放函式接上攻擊種類並集中清理**

`playBattleAnimation()` 新增 `attackType = 'energy'` 選項。攻擊時加入 `attackClassNames(attackType)` 回傳的兩個類別，將建構器輸出放入武器層與撞擊層；結束時移除 `is-attacking`、`is-hit`、攻擊類別與受擊類別，並清空兩個特效層。答錯動畫維持原有 `is-missing`，不抽取消耗攻擊袋。

- [ ] **Step 5: 執行 renderer 測試並提交**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: 所有 renderer 測試通過。

```bash
git add web/js/battle-renderer.mjs tests/battle-renderer.test.mjs
git commit -m "feat: render energy punch and kick attacks"
```

### Task 3: 三種攻擊與受擊 CSS 動畫

**Files:**
- Modify: `web/assets/app.css`
- Modify: `tests/battle-renderer.test.mjs`

- [ ] **Step 1: 寫入 CSS 契約失敗測試**

```js
test('CSS 包含三種攻擊與三種受擊動畫', async () => {
  const css = await readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8');
  for (const name of ['attack-energy', 'attack-punch', 'attack-kick', 'hit-energy', 'hit-punch', 'hit-kick']) {
    assert.match(css, new RegExp(`\\.${name}`));
  }
  assert.match(css, /\.impact-punch/);
  assert.match(css, /\.impact-kick/);
});
```

- [ ] **Step 2: 執行測試並確認缺少拳腳類別而失敗**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL，找不到 `.attack-punch`。

- [ ] **Step 3: 加入三種攻擊動畫**

在 `app.css` 加入：氣功維持原地發亮與投射物；拳擊左右方向快速移動至場中央、短促前傾後回原位；踢擊左右方向移動至場中央、傾斜旋轉後回原位。使用獨立 `@keyframes`，不能共用同一條攻擊動畫。

- [ ] **Step 4: 加入三種受擊與撞擊特效**

加入 `.hit-energy` 的閃白滑退、`.hit-punch` 的短促後仰、`.hit-kick` 的旋轉後退，以及 `.impact-energy`、`.impact-punch`、`.impact-kick`。拳擊使用集中爆裂與水平速度線；踢擊使用弧形邊框與較大的火花。

- [ ] **Step 5: 補齊窄螢幕與 reduced-motion 規則**

窄螢幕降低近身位移幅度，避免角色越界。`prefers-reduced-motion` 將拳腳改成較小幅度位移與亮度變化，但保留三種不同特效標記及受擊狀態。

- [ ] **Step 6: 執行 renderer 測試並提交**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: 所有 renderer 測試通過。

```bash
git add web/assets/app.css tests/battle-renderer.test.mjs
git commit -m "feat: animate varied attacks and reactions"
```

### Task 4: 接入遊戲狀態與音效時間

**Files:**
- Modify: `web/js/app.mjs`
- Modify: `tests/attack-randomizer.test.mjs`

- [ ] **Step 1: 在 `app.mjs` 匯入攻擊袋模組並建立狀態**

```js
import { createAttackState, drawAttack } from './attack-randomizer.mjs';
```

新增 `attackState`，並在 `startGame()` 以 `createAttackState()` 重設左右玩家的袋子。

- [ ] **Step 2: 答對時抽取攻擊並傳給 renderer**

```js
const attack = drawAttack(attackState, input.player);
attackState = attack.state;
const impactDelay = { energy: 420, punch: 280, kick: 340 }[attack.attackType];
const animation = playBattleAnimation(app, combatState.animation, {
  attackType: attack.attackType,
  weapon: actor?.weapon,
  attackFrames: actor?.states?.attack,
  duration: 650,
});
```

只有答對會呼叫 `drawAttack()`；答錯不消耗攻擊袋。三種攻擊都播放 `attack` 音效，氣功立即播放 `weapon`，拳擊與踢擊在接近命中前播放 `weapon`；到 `impactDelay` 後播放 `hit` 與 `hurt`。

- [ ] **Step 3: 執行完整測試並提交**

Run: `npm test`

Expected: 所有測試通過。

```bash
git add web/js/app.mjs web/js/attack-randomizer.mjs tests/attack-randomizer.test.mjs
git commit -m "feat: choose varied attacks during battle"
```

### Task 5: 實際驗證、審查與發布

**Files:**
- Verify: `web/js/app.mjs`
- Verify: `web/js/battle-renderer.mjs`
- Verify: `web/assets/app.css`

- [ ] **Step 1: 執行發布前檢查**

Run: `npm test`

Expected: 所有測試通過。

Run: `git diff --check`

Expected: 沒有空白錯誤。

- [ ] **Step 2: 在本機瀏覽器驗證同一玩家連續三次答對**

確認三次攻擊包含氣功、出拳、出腳各一次；氣功留在原位，拳腳衝近後退回；受擊者分別呈現閃白滑退、短促後仰、旋轉後退；動畫結束後雙方人物恢復原位。

- [ ] **Step 3: 驗證角色 4 與窄螢幕**

以只有單一完整人物影格的角色 4 各觸發三種攻擊，確認仍有完整演出。將視窗縮至手機寬度，確認拳腳不越界且題目區仍可閱讀。

- [ ] **Step 4: 請求程式審查並處理所有 Critical／Important 意見**

審查範圍包含攻擊袋公平性、動畫清理、輸入鎖定、左右方向、reduced-motion、角色 4 與既有音效回歸。

- [ ] **Step 5: 發布並驗證 GitHub Pages**

以目前遠端 `gh-pages` SHA 執行 `--force-with-lease` 安全推送 `web` 子樹。等待 Pages 狀態為 `built`，確認公開頁面與新模組回應 `HTTP 200`，再於公開版實際觸發三種攻擊。
