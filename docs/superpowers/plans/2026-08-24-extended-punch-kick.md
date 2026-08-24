# 伸展式有趣拳腳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓所有角色的拳頭真的水平打出去、腳真的沿弧線踢出去，並依序完成命中與收招。

**Architecture:** 延用既有 `weapon-layer` 作為命中前的拳腳伸展層，拳與腳各自產生方向化標記；既有 `impact-layer` 繼續只在命中時顯示爆裂、傷害與受擊反應。CSS 控制拳的直線伸縮、腳的弧線旋轉、左右鏡像、手機尺寸及 reduced-motion。

**Tech Stack:** JavaScript ES modules、CSS keyframes、Node.js built-in test runner、HTML5 browser application、GitHub Pages

---

### Task 1: 拳腳伸展標記

**Files:**
- Modify: `tests/battle-renderer.test.mjs`
- Modify: `web/js/battle-renderer.mjs`

- [ ] **Step 1: 寫入失敗測試**

在三種攻擊特效測試中確認：出拳的 `weapon` 含 `melee-strike strike-punch from-left`、`strike-limb strike-fist` 與「拳」；出腳含 `melee-strike strike-kick from-left`、`strike-limb strike-boot` 與「腳」；氣功不含 `melee-strike`。在右方方向測試確認 `weapon` 含 `from-right`。

- [ ] **Step 2: 執行測試並確認失敗**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL，拳與腳的 `weapon` 目前為空字串。

- [ ] **Step 3: 實作最小伸展標記**

將近身攻擊設定擴充為拳／腳的 `strikeClass`、`limbClass` 與 `glyph`，並回傳：

```js
weapon: `<span class="melee-strike strike-${attackType} from-${player}" aria-hidden="true"><span class="strike-trail"></span><span class="strike-limb ${melee.limbClass}">${melee.glyph}</span></span>`,
```

命中層的爆裂、攻擊文字與傷害標記維持不變。

- [ ] **Step 4: 執行 renderer 測試並確認通過**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: 所有 renderer 測試通過。

### Task 2: 水平出拳與弧線踢擊動畫

**Files:**
- Modify: `tests/battle-renderer.test.mjs`
- Modify: `web/assets/app.css`

- [ ] **Step 1: 寫入 CSS 契約失敗測試**

確認 CSS 包含 `.melee-strike`、`.strike-fist`、`.strike-boot`、左右方向規則，以及 `extendPunchLeft`、`extendPunchRight`、`swingKickLeft`、`swingKickRight`、`fistPop`、`bootSwing` 六組 keyframes；手機版與 reduced-motion 區塊也必須保留 `.melee-strike`。

- [ ] **Step 2: 執行測試並確認缺少動畫**

Run: `node --test tests/battle-renderer.test.mjs`

Expected: FAIL，找不到 `.melee-strike` 或 `extendPunchLeft`。

- [ ] **Step 3: 實作拳的水平伸縮**

`.strike-punch.from-left` 從左方角色前緣水平延伸至中央偏右，命中前達到最大距離，命中後反向收回；右方以鏡像 keyframe 由右向左。`.strike-fist` 使用紅橘拳套造型，內層 `fistPop` 在命中前放大，`.strike-trail` 顯示三條水平速度線。

- [ ] **Step 4: 實作腳的弧線踢擊**

`.strike-kick.from-left` 由左方角色下半身向中央偏右上方旋轉，右方鏡像；`.strike-boot` 使用藍黃鞋子造型，`bootSwing` 旋轉並短暫露出鞋底，`.strike-trail` 改為弧形軌跡。動畫結尾回到透明及原點，避免殘留。

- [ ] **Step 5: 補齊手機版與 reduced-motion**

手機版將拳腳縮至桌面版約七成並縮短伸展距離；`prefers-reduced-motion` 保留可辨識的拳腳伸出，但降低位移及旋轉，不得隱藏拳頭或鞋子。

- [ ] **Step 6: 執行完整測試並提交**

Run: `npm test`

Expected: 所有測試通過。

Run: `git diff --check`

Expected: 沒有空白錯誤。

### Task 3: 瀏覽器驗證、審查與共同發布

**Files:**
- Verify: `web/js/battle-renderer.mjs`
- Verify: `web/assets/app.css`
- Verify: `web/data/catalog.json`

- [ ] **Step 1: 本機驗證拳腳順序**

啟動本機網站，讓左右玩家各觸發一次出拳與出腳；確認拳由角色前方水平伸出、腳由下方向上踢出、命中時對手才受擊，之後拳腳與特效均清除。

- [ ] **Step 2: 驗證手機版與既有功能**

在手機寬度確認拳腳不超出戰場與不遮住題目；確認題庫科目按鈕仍為 31／23／4／2／1／1，音效、選角、鍵盤測試與氣功均正常。

- [ ] **Step 3: 程式審查**

審查攻擊時間同步、左右鏡像、中文字方向、特效清理、reduced-motion、手機版與既有題庫分類回歸，修正所有 Critical／Important 意見。

- [ ] **Step 4: 發布 GitHub Pages**

GitHub 連線恢復後推送 `main`，再用明確遠端 SHA 的 `--force-with-lease` 更新 `gh-pages`；等待公開資源回應 `HTTP 200`，於帶新版本參數的公開網址驗證題庫分類及拳腳演出。
