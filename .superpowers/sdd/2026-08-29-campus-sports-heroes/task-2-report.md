# Task 2 Report：透明 Q 版校園英雄 PNG

## 完成摘要

- 依 `web/js/campus-heroes.mjs` 的 12 份 `artBrief`，完成 12 位原創人類校園英雄，每位各 1 張 `idle.png` 與 1 張 `attack.png`，共 24 張。
- 女 6 位、男 6 位；所有角色皆為約 2.5 頭身的高完成度 Q 版人類，使用運動／校園社團服與科技或魔法配件。
- 所有 PNG 已正規化為同一個 `1024×1024` 畫布、8-bit RGBA（PNG color type 6）、完整透明外框、至少 70 px 安全邊距、可見內容下緣一致為 `y=900`。
- 每張攻擊圖均以對應待機圖作為角色錨點，保留臉、髮型、服裝、主色與專屬配件，再改為明確的大幅衝拳、飛踢、旋踢或突進動作。
- 舊有 24 張 SVG 全數保留且內容未變；manifest 仍指向 SVG，留待 Task 3 切換。
- 未修改 `web/js/app.mjs`、`web/js/battle-renderer.mjs`、輸入、音效、暫停、題庫或戰鬥流程。
- `scripts/generate-campus-hero-sprites.mjs` 已由會覆寫 SVG 的產生器改為唯讀 PNG 驗證器；執行時只檢查已簽入的 24 張素材，不會重生或覆寫美術。

## 產生方式與共同限制

- 使用 Codex 內建 ImageGen（`stylized-concept`）生成待機圖；攻擊圖使用對應待機圖作 `identity-preserve` 參考。
- 共同提示限制：原創人類國中英雄、約 2.5 頭身、精緻手機遊戲插畫、乾淨粗外輪廓、全身、透明背景、無文字、無標誌、無既有動漫可識別元素、四肢與道具完整、角色完全位於畫布內。
- 攻擊圖額外要求：大幅度前衝／揮拳／踢擊；必須與待機圖為同一人；不得有裁切、缺肢、融合、多餘肢體或扭曲關節。
- 對 ImageGen 回傳的假棋盤格 RGB 圖，沒有以壓縮位元組猜測透明度；先以本地像素連通區抽離，再由 Pillow 與 Node PNG 解碼器確認實際 RGBA、Alpha 與邊界。

## 生成素材路徑

所有素材位於 `web/assets/battle/campus-heroes/<hero-id>/`：

| 角色 | 待機 | 攻擊 |
| --- | --- | --- |
| basketball-ace | `web/assets/battle/campus-heroes/basketball-ace/idle.png` | `web/assets/battle/campus-heroes/basketball-ace/attack.png` |
| track-sprinter | `web/assets/battle/campus-heroes/track-sprinter/idle.png` | `web/assets/battle/campus-heroes/track-sprinter/attack.png` |
| street-dancer | `web/assets/battle/campus-heroes/street-dancer/idle.png` | `web/assets/battle/campus-heroes/street-dancer/attack.png` |
| kendo-captain | `web/assets/battle/campus-heroes/kendo-captain/idle.png` | `web/assets/battle/campus-heroes/kendo-captain/attack.png` |
| science-maker | `web/assets/battle/campus-heroes/science-maker/idle.png` | `web/assets/battle/campus-heroes/science-maker/attack.png` |
| code-maker | `web/assets/battle/campus-heroes/code-maker/idle.png` | `web/assets/battle/campus-heroes/code-maker/attack.png` |
| math-strategist | `web/assets/battle/campus-heroes/math-strategist/idle.png` | `web/assets/battle/campus-heroes/math-strategist/attack.png` |
| chess-tactician | `web/assets/battle/campus-heroes/chess-tactician/idle.png` | `web/assets/battle/campus-heroes/chess-tactician/attack.png` |
| astronomy-observer | `web/assets/battle/campus-heroes/astronomy-observer/idle.png` | `web/assets/battle/campus-heroes/astronomy-observer/attack.png` |
| puzzle-detective | `web/assets/battle/campus-heroes/puzzle-detective/idle.png` | `web/assets/battle/campus-heroes/puzzle-detective/attack.png` |
| language-magician | `web/assets/battle/campus-heroes/language-magician/idle.png` | `web/assets/battle/campus-heroes/language-magician/attack.png` |
| nature-researcher | `web/assets/battle/campus-heroes/nature-researcher/idle.png` | `web/assets/battle/campus-heroes/nature-researcher/attack.png` |

## 自動驗證

### TDD RED 1：PNG 品質契約

命令：

```powershell
node --test tests/campus-heroes.test.mjs
```

結果：4 passed、1 failed。失敗原因符合預期：`basketball-ace/idle.png` 尚不存在（`ENOENT`），證明測試確實拒絕只有 SVG 的輸出。

### TDD RED 2：唯讀驗證器契約

命令：

```powershell
node --test tests/campus-heroes.test.mjs
```

結果：5 passed、1 failed。失敗原因符合預期：舊 `generate-campus-hero-sprites.mjs` 沒有匯出 `validateCampusHeroSprites`，實際值為 `undefined`。

### GREEN：聚焦測試

命令：

```powershell
node --test tests/campus-heroes.test.mjs
```

結果：6 passed、0 failed。涵蓋：

- 12 位原創人類角色、ID 唯一、男女各 6 位、12 份 artBrief 唯一。
- 每位 `idle.png`／`attack.png` 均存在。
- 每張皆為 `1024×1024`、8-bit RGBA、color type 6、非交錯 PNG。
- 解壓並反濾鏡後逐像素驗證四條外框完全透明。
- 可見範圍左右與上方至少保留 70 px，所有下緣一致為 `y=900`。
- 唯讀驗證器回報 24 張，不重生素材。

### 直接執行唯讀驗證器

命令：

```powershell
node scripts/generate-campus-hero-sprites.mjs
```

結果：

```text
Validated 24 checked-in campus hero PNG sprites; no artwork was regenerated.
```

### 其他檢查

- Pillow 逐張盤點：24／24 均為 `(1024, 1024)`、`RGBA`、Alpha extrema `(0, 255)`；可見 bbox 全數符合 70 px 安全邊距與 `bottom=900`。
- PNG 數量：24；保留的 SVG 數量：24。
- `git diff --check`：通過。

## 24 張接觸表視覺審查

接觸表：`.superpowers/sdd/2026-08-29-campus-sports-heroes/task-2-contact-sheet.png`

接觸表以棋盤格顯示透明區，黃色水平線標示共同 `y=900` 基準。24 張已逐張檢查：

| 角色 | 攻擊動作 | 視覺驗收 |
| --- | --- | --- |
| 籃球王牌 | 帶球前衝直拳 | 同一高馬尾女角；球、兩手兩腳完整；拳向前伸展自然；無裁切。 |
| 田徑快手 | 跨欄式高踢 | 同一護目鏡男角；支撐腳與踢擊腳完整；兩手完整；無扭曲。 |
| 街舞高手 | 旋身高踢 | 同一雙髮髻女角；耳機、外套、雙鞋完整；大幅動作清楚。 |
| 劍道社長 | 雙手竹劍突進斬 | 同一髮髻男角；僅一把完整竹劍；雙手握法、兩腿站姿自然；無裁切。 |
| 科學發明家 | 發明手套衝拳 | 同一短鮑伯女角；護目鏡與雙手套完整；兩腳完整；前拳方向清楚。 |
| 程式發明家 | 前躍側踢 | 同一尖翹短髮男角；兩腕帶、兩手、兩腳完整；伸腿自然。 |
| 數學策略家 | 幾何弧線高踢 | 同一短髮女角；平板完整且空白；支撐腿與高踢腿清楚；無裁切。 |
| 棋局軍師 | 披肩躍踢 | 同一灰藍髮男角；眼鏡與披肩完整；兩手兩腳皆可辨；無多肢。 |
| 天文觀測員 | 行星環高踢 | 同一側馬尾女角；望遠鏡固定且完整；兩手兩腳與斗篷完整。 |
| 解謎偵探 | 放大鏡追蹤拳 | 同一棕髮男角；單一放大鏡與腰包完整；前拳、兩腿自然。 |
| 語言魔術師 | 書頁卡旋踢 | 同一高馬尾女角；3 張空白卡、披肩與雙鞋完整；無文字、無裁切。 |
| 自然研究員 | 葉能手甲衝拳 | 同一捲髮男角；手甲、採集包、植物樣本完整；兩手兩腳完整。 |

共同結果：無動物、怪獸、非人類、文字、標誌、既有動漫可識別服裝／角色；未見邊界裁切、缺肢、融合、多餘肢體或明顯關節扭曲。12 組 `idle`／`attack` 均可辨識為同一角色，且各角色髮型、服裝輪廓、專屬道具與主色互異。

## 提交

- `a99afe4` — `feat: add polished original campus hero sprites`
- 基底提交：`8a30e44399c79b1a0035653742f08219a34af125`（Task 1）

未 push、未發布、未切換 manifest；Task 3 才會把角色狀態引用改為 PNG。
