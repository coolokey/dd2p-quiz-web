# DDP 對戰暫停與安全離場 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在單人與本機雙人對戰中加入可疊加的手動暫停、`Esc` 操作、三種需確認的離場動作，以及可從原位置恢復的背景音樂。

**Architecture:** 延伸既有 `createBattlePauseCoordinator`，把手動、方向與背景三種暫停原因集中管理；以獨立純函式模組產生暫停／確認視窗並管理焦點；`app.mjs` 只負責賽局狀態轉換與 lifecycle 邊界。動畫期間的暫停採 `pauseRequested` 延遲旗標，等既有答案結算完成後才顯示選單，避免中斷動畫 Promise 或重複計分。

**Tech Stack:** 原生 ES modules、HTML／CSS、Node.js `node:test`、既有 GitHub Pages `web` 子樹發布流程。

---

## 規格依據

- 已核准規格：`docs/superpowers/specs/2026-08-26-battle-pause-exit-design.md`
- 已核准版型：頂端中央「Ⅱ 暫停」按鈕，加中央模態選單。
- 破壞性操作：重新開始、更換題庫、返回首頁一律二次確認。
- 動畫中暫停：完成本次攻擊、音效、扣血與計分後自動暫停。

### Task 1：讓暫停協調器支援三種可疊加原因

**Files:**

- Modify: `web/js/battle-orientation.mjs`
- Test: `tests/battle-orientation.test.mjs`

- [ ] **Step 1：先新增失敗測試**

在 `tests/battle-orientation.test.mjs` 新增測試，建立 coordinator 後依序執行：

```js
coordinator.setManualPaused(true);
coordinator.setOrientationPaused(true);
coordinator.setManualPaused(false);
assert.equal(coordinator.isPaused(), true);
coordinator.setOrientationPaused(false);
assert.equal(coordinator.isPaused(), false);
```

同一測試還要驗證：

- `setManualPaused(true)` 第一次只呼叫一次 `disableInput`、`pauseCpu`、`clearTimer` 與 `renderBattle`。
- 重複設定相同值回傳 `false`，不重複呼叫 hook。
- 解除手動暫停時若仍為直向或背景暫停，只重繪、不恢復 CPU、輸入或 timer。
- `reset()` 同時清除 manual／orientation／background 三種旗標。
- 非 live battle 不接受狀態變更。

- [ ] **Step 2：執行測試並確認先失敗**

```powershell
node --test tests/battle-orientation.test.mjs
```

Expected: 因 `setManualPaused`／`isManualPaused` 尚不存在而失敗。

- [ ] **Step 3：以共用 setter 實作三種暫停原因**

在 `createBattlePauseCoordinator` 增加 `manualPaused`，並讓 `isPaused()` 回傳三者 OR。抽出內部 `setPauseReason(current, next, assign)`，確保所有 setter 都遵守相同的冪等與 live-battle 規則。公開：

```js
isManualPaused: () => manualPaused,
setManualPaused,
```

`reset()` 清除三種狀態，不直接觸發 resume hooks。

- [ ] **Step 4：重跑測試**

```powershell
node --test tests/battle-orientation.test.mjs
```

Expected: 全部通過。

- [ ] **Step 5：提交 checkpoint**

```powershell
git add web/js/battle-orientation.mjs tests/battle-orientation.test.mjs
git commit -m "feat: compose manual battle pause state"
```

### Task 2：背景音樂暫停後從原位置恢復

**Files:**

- Modify: `web/js/audio-manager.mjs`
- Test: `tests/audio-manager.test.mjs`

- [ ] **Step 1：新增失敗測試**

在 audio harness 的音樂物件保留 `currentTime`。新增三組測試：

1. `pauseMusic()` 呼叫目前 BGM 的 `pause()`，但不把 `currentTime` 歸零；`resumeMusic()` 在同一物件呼叫 `play()`。
2. 重複暫停／恢復為冪等，不會多呼叫 `pause()`／`play()`。
3. 暫停後 `stop()` 或切換場景，舊音樂歸零且後續 `resumeMusic()` 不會復活舊音軌。

核心斷言：

```js
audio.currentTime = 37;
manager.pauseMusic();
assert.equal(audio.currentTime, 37);
await manager.resumeMusic();
assert.equal(audio.playCount, 2);
```

- [ ] **Step 2：確認測試先失敗**

```powershell
node --test tests/audio-manager.test.mjs
```

Expected: 因 `pauseMusic`／`resumeMusic` 尚不存在而失敗。

- [ ] **Step 3：實作可恢復音樂狀態**

在 `createAudioManager` 增加 `musicPaused`。`pauseMusic()` 只 pause 目前 BGM、不呼叫 `stopAudio()`；`resumeMusic()` 只在 `musicPaused && backgroundMusic && unlocked` 時清除旗標並 `safePlay(backgroundMusic)`。`startBackgroundMusic()`、`stopBackgroundMusic()` 與 `stop()` 必須清除旗標，避免舊音軌復活。

靜音不等於停止音軌：即使 muted，恢復仍可呼叫 `play()`，由 audio 元件的 `muted` 狀態維持靜音，避免解除靜音後音樂沒有繼續。

- [ ] **Step 4：重跑測試**

```powershell
node --test tests/audio-manager.test.mjs
```

Expected: 全部通過，既有場景切換與 stop 歸零行為不變。

- [ ] **Step 5：提交 checkpoint**

```powershell
git add web/js/audio-manager.mjs tests/audio-manager.test.mjs
git commit -m "feat: pause and resume battle music in place"
```

### Task 3：建立暫停選單與確認視窗的純函式模組

**Files:**

- Create: `web/js/battle-pause-menu.mjs`
- Create: `tests/battle-pause-menu.test.mjs`

- [ ] **Step 1：為文字、動作與 HTML 新增失敗測試**

定義固定 action：`restart`、`catalog`、`home`。測試 `buildBattlePauseMenu({ confirmAction })`：

- 無 confirm action 時含四個按鈕，順序為繼續、重新開始、更換題庫、返回首頁。
- 遮罩含 `role="dialog"`、`aria-modal="true"`、標題 id 與 `aria-labelledby`。
- 三種 confirm action 各自顯示核准規格中的精確警告文字。
- 確認畫面只有取消及清楚命名的確認按鈕，返回首頁套用危險樣式。
- 所有動態文字經 HTML escape。

- [ ] **Step 2：確認測試先失敗**

```powershell
node --test tests/battle-pause-menu.test.mjs
```

Expected: 模組尚不存在而失敗。

- [ ] **Step 3：實作最小純函式 API**

```js
export const PAUSE_ACTIONS = Object.freeze({ restart: 'restart', catalog: 'catalog', home: 'home' });
export function buildBattlePauseMenu({ confirmAction = null } = {}) { /* escaped markup */ }
export function pauseConfirmCopy(action) { /* exact title/message/confirmLabel */ }
```

Markup 使用穩定 selectors：`data-pause-continue`、`data-pause-action`、`data-pause-cancel`、`data-pause-confirm`。未知 action 應拋出可診斷錯誤，不能默認執行離場。

- [ ] **Step 4：加入焦點圈選 helper 與測試**

新增 `trapDialogTab(dialog, event)`。測試第一個可操作元素上 `Shift+Tab` 會跳至最後一個、最後一個上 `Tab` 會跳至第一個；非 `Tab` 或中間元素不攔截。

- [ ] **Step 5：重跑測試並提交**

```powershell
node --test tests/battle-pause-menu.test.mjs
git add web/js/battle-pause-menu.mjs tests/battle-pause-menu.test.mjs
git commit -m "feat: build accessible battle pause dialogs"
```

### Task 4：把暫停入口與模態畫面接進 battle renderer

**Files:**

- Modify: `web/js/battle-renderer.mjs`
- Modify: `web/assets/app.css`
- Modify: `tests/battle-renderer.test.mjs`

- [ ] **Step 1：新增 renderer 失敗測試**

擴充 view model，測試：

- 正常 live battle 顯示 `data-pause-battle`，且原 `battle-progress` 仍存在。
- `manualPaused: true` 顯示暫停選單。
- `pauseConfirmAction: 'home'` 顯示返回首頁確認。
- manual／orientation／animation 任一狀態都鎖住 mobile buttons。
- `pausePending: true` 時暫停按鈕 disabled，文字為「等待本次攻擊結束……」。
- CSS 含按鈕最小 `48px`、modal safe-area、無水平 overflow、極矮橫式仍保留「暫停」文字。

- [ ] **Step 2：確認測試先失敗**

```powershell
node --test tests/battle-renderer.test.mjs
```

- [ ] **Step 3：擴充 battle markup**

匯入 `buildBattlePauseMenu`，將 topbar 中央改為：

```html
<div class="battle-center-controls">
  <strong class="battle-progress">…</strong>
  <button type="button" class="battle-pause-button" data-pause-battle aria-label="暫停對戰">Ⅱ 暫停</button>
</div>
```

在 `battle-shell` 尾端加入 manual pause markup。觸控鎖定條件改為：

```js
viewModel.mobileInputLocked || viewModel.orientationPaused || viewModel.manualPaused || viewModel.pausePending
```

- [ ] **Step 4：加入響應式樣式**

在 `web/assets/app.css` 新增 `.battle-center-controls`、`.battle-pause-button`、`.battle-pause-overlay`、`.battle-pause-dialog`、`.battle-pause-actions`、`.pause-danger`。z-index 必須低於方向遮罩 `100`，讓直向提示優先；modal 內容使用四側 `env(safe-area-inset-*)`。

調整現有 `max-width:760px` 及極矮橫式 media query，確保中央按鈕不與右側音量控制重疊。

- [ ] **Step 5：重跑測試與 CSS 靜態檢查**

```powershell
node --test tests/battle-renderer.test.mjs
git diff --check
```

- [ ] **Step 6：提交 checkpoint**

```powershell
git add web/js/battle-renderer.mjs web/assets/app.css tests/battle-renderer.test.mjs
git commit -m "feat: render responsive battle pause controls"
```

### Task 5：在 app 中接上按鈕、`Esc`、音樂與延後暫停

**Files:**

- Modify: `web/js/app.mjs`
- Modify: `tests/app-integration.test.mjs`

- [ ] **Step 1：新增整合契約失敗測試**

在 `tests/app-integration.test.mjs` 新增來源契約，至少涵蓋：

- `renderGame` 傳入 `manualPaused`、`pauseConfirmAction`、`pausePending`。
- `[data-pause-battle]` 綁定 `requestManualPause`。
- `Escape` 分支在 `isGameKey` 之前處理並 `preventDefault()`。
- 確認視窗的 `Esc` 只取消確認；暫停選單的 `Esc` 繼續；正常 live battle 的 `Esc` 暫停。
- `openManualPause()` 呼叫 `audioManager.pauseMusic()` 與 `battlePause.setManualPaused(true)`。
- `continueBattle()` 先解除 manual pause，再呼叫 `audioManager.resumeMusic()`。
- lifecycle animating 時只設定 `pauseRequested` 並 disable input。
- `settleBattleAnswer` 在未結束時兌現 pending pause；已結束時清除 pending 並保留結果頁。
- 快速重複暫停是冪等。

- [ ] **Step 2：確認整合測試先失敗**

```powershell
node --test tests/app-integration.test.mjs
```

- [ ] **Step 3：加入手動暫停狀態與操作函式**

在 app-level state 加入：

```js
let pauseRequested = false;
let pauseConfirmAction = null;
let pauseReturnFocus = null;
```

新增明確函式：`requestManualPause`、`openManualPause`、`continueBattle`、`requestPauseAction`、`cancelPauseConfirmation`。所有入口先檢查 `hasLiveBattle()`，confirmation 顯示時不接受背景選單動作。

`openManualPause()` 保存目前焦點、暫停 BGM、設定 coordinator，重繪後聚焦 `[data-pause-continue]`。`continueBattle()` 關閉 confirmation、解除 manual pause、恢復 BGM，最後將焦點送回 `[data-pause-battle]`。

- [ ] **Step 4：正確處理動畫邊界**

`requestManualPause()` 遇到 `battleLifecycle.isAnimating()` 時：

```js
pauseRequested = true;
battleInputGate.disable();
// 更新現存按鈕為 disabled 與等待文字，不重新 render 破壞動畫 DOM。
```

在 `settleBattleAnswer` 中先處理結果；若未結束且 `pauseRequested`，呼叫 `openManualPause()` 並略過一般重繪／重新排 CPU。若本次攻擊終局，清除旗標並由 `renderResult()` 結算。

- [ ] **Step 5：接上 render、事件及焦點圈選**

`renderGame()` 傳入三個新欄位，綁定 pause／continue／action／cancel／confirm 按鈕與 dialog `keydown`。每次重繪只建立一組 handler。`Escape` document handler 必須優先於遊戲按鍵判斷，且只在 live battle 消費事件。

- [ ] **Step 6：執行相關測試**

```powershell
node --test tests/app-integration.test.mjs tests/battle-renderer.test.mjs tests/battle-orientation.test.mjs tests/audio-manager.test.mjs tests/battle-lifecycle.test.mjs tests/async-navigation.test.mjs
```

Expected: 全部通過，無重複 timer／CPU callback 的既有契約退化。

- [ ] **Step 7：提交 checkpoint**

```powershell
git add web/js/app.mjs tests/app-integration.test.mjs
git commit -m "feat: control live battle pause lifecycle"
```

### Task 6：實作三種經確認的離場結果

**Files:**

- Modify: `web/js/app.mjs`
- Modify: `tests/app-integration.test.mjs`
- Modify: `tests/battle-session-coordinator.test.mjs`（只有在需要補強舊 session 失效契約時）

- [ ] **Step 1：新增離場狀態轉換失敗測試**

以來源契約搭配可測 helper，逐項驗證：

- `restart` 保存 `battleSettings` 與 `currentQuiz`，先讓舊 session／timer／CPU／動畫失效，再呼叫新一輪 start；新狀態的 score、health、questionIndex、answerPositionState 均重設。
- `catalog` 保存 `gameMode`，但清除 `currentQuiz`、`battleSettings`、角色選擇與賽局狀態，再 `renderCatalog()`。
- `home` 清除 mode、quiz、settings、角色與賽局狀態，再 `renderStartScreen()`。
- 三者只有 `confirmPauseAction()` 才能執行，取消不改變賽局。
- 舊 lifecycle settle callback 完成時，無法改寫新 session 畫面。

- [ ] **Step 2：確認測試先失敗**

```powershell
node --test tests/app-integration.test.mjs tests/battle-session-coordinator.test.mjs
```

- [ ] **Step 3：集中清理 live battle state**

新增 `clearPauseUiState()` 與 `clearBattleState({ keepGameMode = false })`，避免三條路徑漏清 `pauseRequested`、confirmation、timer、input gate 或 audio。`stopBattleActivity()` 仍是停止非同步活動的唯一入口。

- [ ] **Step 4：實作 restart**

在確認按鈕的使用者手勢中複製現有 settings，呼叫 `stopBattleActivity()`，清除暫停 UI 狀態，再以 `startGameOnce(savedSettings)` 建立新 session。不要清除目前 quiz 或 character ids；`prepareBattleStart()` 會重新建立亂數題序、答案位置、比分與血量。

- [ ] **Step 5：實作 catalog 與 home**

`catalog` 先保存 mode，再完整停止舊賽局，清除 current quiz 以下狀態，還原 mode 後呼叫 `renderCatalog()`。`home` 走完整清理後呼叫 `returnToMainMenu()`。兩者不得依賴瀏覽器 reload。

- [ ] **Step 6：在所有既有離場／開局／結果路徑清除暫停 UI 狀態**

檢查 `prepareBattleStart`、`stopBattleActivity`、`renderCatalog`、`renderStartScreen`、`renderResult`、錯誤處理，保證舊 dialog、pending pause 或 music pause 不會帶進下一畫面。

- [ ] **Step 7：執行整合測試並提交**

```powershell
node --test tests/app-integration.test.mjs tests/battle-session-coordinator.test.mjs tests/async-navigation.test.mjs
git add web/js/app.mjs tests/app-integration.test.mjs tests/battle-session-coordinator.test.mjs
git commit -m "feat: confirm restart quiz change and home exit"
```

若 `tests/battle-session-coordinator.test.mjs` 沒有實際變更，不要把它加入 commit。

### Task 7：完整回歸與本機瀏覽器驗收

**Files:**

- Modify: `README.md`（只在操作說明需要補上暫停與 `Esc` 時）

- [ ] **Step 1：執行完整自動化與靜態檢查**

```powershell
npm test
node --check web/js/app.mjs
Get-ChildItem web/js -Filter *.mjs | ForEach-Object { node --check $_.FullName }
git diff --check
```

Expected: 所有測試通過；所有 module 語法正確；無空白錯誤。

- [ ] **Step 2：啟動本機網站並檢查 console**

```powershell
npm start
```

使用 in-app browser 開啟本機網址，清除舊 console 訊息後執行下列流程；任何 console error 都先修復並重跑測試。

- [ ] **Step 3：驗收單人模式**

- 玩家 VS 電腦進入對戰，滑鼠按暫停、繼續，確認題目、答案位置、比分、HP 與剩餘時間未改。
- 以 `Esc` 暫停；進入返回首頁確認後再按 `Esc`，確認只回暫停選單。
- 暫停超過 CPU 原等待時間，再繼續，確認 CPU 只等待原剩餘時間且只作答一次。
- 分別驗證取消／確認重新開始、更換題庫、返回首頁。

- [ ] **Step 4：驗收本機雙人與行動版**

- 本機雙人用鍵盤左右兩套按鍵正常作答，`Esc` 不影響原鍵盤對戰。
- DevTools／in-app browser 使用平板橫式與矮手機橫式尺寸，暫停鈕至少 `48 CSS px`，不遮住題目、音量或觸控 `1–4`。
- 直向時方向遮罩優先；手動暫停後旋轉直向、按繼續，再轉回橫向，只有所有暫停原因解除才恢復。
- 切到背景再回前景，不越過手動暫停。

- [ ] **Step 5：驗收動畫中延後暫停**

單人與雙人各在拳、腳或氣功動畫中按一次暫停：本次扣血與計分各發生一次，動畫完成後才顯示選單。再製造一次 KO，確認直接進結果頁而不出現暫停選單。

- [ ] **Step 6：必要時更新 README 並提交修正**

若 README 有操作鍵位段落，補上「對戰中按 `Esc` 或頂端暫停按鈕」。提交所有驗收中發現的修正：

```powershell
git add web tests README.md
git commit -m "test: verify battle pause and exit flows"
```

若沒有變更，不建立空 commit。

### Task 8：程式審查、安全發布與公開版複驗

**Files:**

- Review: 本計畫所有變更
- Publish source: `web/`

- [ ] **Step 1：執行完成前程式審查**

依 `requesting-code-review` skill 檢查規格覆蓋、競速、錯誤處理、可及性與不相關變更。修復 Critical／Important 項目後重跑 Task 7 的全部檢查。

- [ ] **Step 2：確認乾淨工作樹與提交範圍**

```powershell
git status --short
git log --oneline -8
git diff HEAD~1 --check
```

Expected: 無未提交的本功能變更；不包含 `.superpowers/brainstorm/manual/` 預覽檔或其他使用者檔案。

- [ ] **Step 3：推送 main**

```powershell
git push origin main
```

- [ ] **Step 4：以遠端 SHA 保護方式發布 `web` 子樹**

```powershell
$remoteLine = git ls-remote --heads origin gh-pages
$remoteGhPages = ($remoteLine -split "`t")[0]
$publishCommit = git subtree split --prefix web main
git push --force-with-lease="gh-pages:$remoteGhPages" origin "${publishCommit}:gh-pages"
```

Expected: `main` 與 `gh-pages` 成功更新；若 lease 不符，停止並重新取得遠端狀態，不能直接無保護 force push。

- [ ] **Step 5：等待 GitHub Pages 新版並確認資源**

以 `$publishCommit.Substring(0,7)` 建立版本網址：

```text
https://coolokey.github.io/dd2p-quiz-web/?v=<publish7>
```

等待首頁、`js/app.mjs`、`js/battle-pause-menu.mjs`、`js/audio-manager.mjs` 與 `assets/app.css` 均回應 `HTTP 200`，且公開 HTML／JS 包含新 selectors 與 API。

- [ ] **Step 6：在公開網址重做關鍵實機驗收**

至少完成：

- 電腦：單人 `Esc` 暫停／繼續、雙人鍵盤作答、三種確認視窗各一次。
- 平板橫式：觸控暫停／繼續、觸控答案鍵仍正常。
- 動畫中暫停一次，確認結算後才暫停。
- 暫停／繼續前後 BGM 從同一位置恢復，console 無 error。

公開版通過後才回報正式版本網址與 commit。

## 完成條件

- 已核准規格中的每一項操作、狀態、競速、音訊、響應式與可及性需求都有測試或瀏覽器驗收對應。
- 不以重新整理頁面完成任何離場動作。
- 既有鍵盤、觸控、單人 CPU、雙人、答案隨機、攻擊動畫、方向鎖定及音效測試全部維持通過。
- GitHub Pages 公開版完成實機複驗後才算完成。
