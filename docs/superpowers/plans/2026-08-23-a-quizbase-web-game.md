# A_QuizBase 雙人搶答網頁遊戲 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可部署於 GitHub Pages 的雙人同機四選一搶答遊戲，並把有效的 `A_QuizBase` 題庫自動轉換為可玩的網頁題庫。

**Architecture:** 前端是零依賴 ES Module 靜態網站；題庫轉換程式從舊資料夾產生 `web/data/catalog.json` 與每份題庫 JSON。遊戲以純函式管理搶答、計分與結束條件，DOM 層僅負責畫面與鍵盤事件。

**Tech Stack:** Node.js 22、Node built-in test runner、HTML、CSS、原生 JavaScript、GitHub Pages。

---

## 檔案結構

- `package.json`：定義轉檔、測試與本機預覽命令。
- `scripts/convert-a-quizbase.mjs`：讀取舊題庫、驗證並產生 JSON 與素材副本。
- `scripts/lib/question-parser.mjs`：解析 `key=value&` 格式與題目圖片規則。
- `scripts/lib/question-validator.mjs`：產生可顯示／略過的驗證結果。
- `web/index.html`：唯一網頁入口。
- `web/assets/app.css`：響應式遊戲介面與玩家狀態樣式。
- `web/js/game-state.mjs`：無 DOM 的賽制、搶答與計分狀態機。
- `web/js/input.mjs`：左右玩家按鍵映射與按鍵測試資料。
- `web/js/app.mjs`：載入題庫、渲染各畫面、連接狀態機與鍵盤事件。
- `web/data/`：轉換後題庫資料；由程式產生，不手動修改。
- `tests/*.test.mjs`：轉檔與遊戲規則測試。
- `.github/workflows/pages.yml`：GitHub Pages 自動發布。

### Task 1: 初始化工具鏈與測試框架

**Files:**
- Create: `package.json`
- Create: `tests/fixtures/valid-question.txt`
- Create: `tests/question-parser.test.mjs`

- [ ] **Step 1: 寫出解析器的失敗測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestionRecord } from '../scripts/lib/question-parser.mjs';

test('parses a four-choice A_QuizBase record', () => {
  const question = parseQuestionRecord('Type=0&Q=1x1=?&A1=1&A2=2&A3=3&A4=4&A=1&okflag=1');
  assert.deepEqual(question, {
    type: 0, prompt: '1x1=?', choices: ['1', '2', '3', '4'], answerIndex: 0,
  });
});
```

- [ ] **Step 2: 執行並確認失敗**

Run: `node --test tests/question-parser.test.mjs`

Expected: FAIL，因 `scripts/lib/question-parser.mjs` 尚不存在。

- [ ] **Step 3: 建立 Node 專案命令**

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "convert": "node scripts/convert-a-quizbase.mjs",
    "test": "node --test tests/*.test.mjs",
    "start": "npx --yes serve web"
  }
}
```

- [ ] **Step 4: 確認測試命令可被 npm 執行**

Run: `npm test`

Expected: 測試仍失敗，但 npm 正確呼叫 Node test runner。

- [ ] **Step 5: 建立 Git checkpoint**

Run: `git add package.json tests && git commit -m "chore: set up web game tests"`

Expected: 若尚未初始化 Git，先執行 `git init` 並設定使用者資訊後再提交。

### Task 2: 實作 A_QuizBase 題目解析與驗證

**Files:**
- Create: `scripts/lib/question-parser.mjs`
- Create: `scripts/lib/question-validator.mjs`
- Modify: `tests/question-parser.test.mjs`
- Create: `tests/question-validator.test.mjs`

- [ ] **Step 1: 寫出無效題目的失敗測試**

```js
test('rejects a record whose answer is outside its choices', () => {
  assert.deepEqual(validateQuestion({ prompt: 'Q', choices: ['A', 'B'], answerIndex: 3 }), {
    valid: false, reason: '答案索引不在選項範圍內',
  });
});
```

- [ ] **Step 2: 執行並確認失敗**

Run: `node --test tests/question-validator.test.mjs`

Expected: FAIL，因 `validateQuestion` 尚未匯出。

- [ ] **Step 3: 實作最小解析與驗證函式**

```js
export function parseQuestionRecord(raw) {
  const values = Object.fromEntries(raw.replace(/^\uFEFF/, '').split('&').filter(Boolean).map(pair => pair.split('=')));
  return { type: Number(values.Type), prompt: values.Q ?? '', choices: [values.A1, values.A2, values.A3, values.A4].filter(Boolean), answerIndex: Number(values.A) - 1 };
}

export function validateQuestion(question) {
  if (question.choices.length < 2 || question.choices.length > 4) return { valid: false, reason: '選項數必須介於 2 至 4' };
  if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex >= question.choices.length) return { valid: false, reason: '答案索引不在選項範圍內' };
  return { valid: true };
}
```

- [ ] **Step 4: 執行所有解析測試**

Run: `npm test`

Expected: PASS。

- [ ] **Step 5: 建立 Git checkpoint**

Run: `git add scripts tests && git commit -m "feat: parse and validate A QuizBase questions"`

### Task 3: 建立題庫轉換器與轉換報表

**Files:**
- Create: `scripts/convert-a-quizbase.mjs`
- Create: `tests/converter.test.mjs`
- Create: `web/data/.gitkeep`

- [ ] **Step 1: 寫出題庫略過規則的失敗測試**

```js
test('omits a source folder that has no _para.txt', async () => {
  const result = await convertFolder('tests/fixtures/empty-topic');
  assert.deepEqual(result, { included: false, reason: '缺少 _para.txt' });
});
```

- [ ] **Step 2: 執行並確認失敗**

Run: `node --test tests/converter.test.mjs`

Expected: FAIL，因 `convertFolder` 尚未實作。

- [ ] **Step 3: 實作轉換流程**

```js
const sourceRoot = new URL('../A_QuizBase/', import.meta.url);
const outputRoot = new URL('../web/data/', import.meta.url);
// 對每個有 _para.txt 的資料夾：讀取 QzTotal 與 Name，解析數字命名的 .txt，
// 只輸出 validateQuestion() 為 valid 的題目；複製相同基名的小寫 .jpg；
// 寫入 { id, name, questions } JSON，並寫入 catalog.json 與 conversion-report.json。
```

- [ ] **Step 4: 產生題庫並檢查報表**

Run: `npm run convert`

Expected: `web/data/catalog.json` 存在；`test`、`think` 被列為略過；含 `.swf` 的題庫被明確標記為不支援。

- [ ] **Step 5: 執行全部測試並建立 checkpoint**

Run: `npm test && git add scripts web/data tests && git commit -m "feat: convert A QuizBase topics for web"`

Expected: PASS；若 Git 未初始化，保留工作檔並在建立儲存庫後提交。

### Task 4: 建立可測試的雙人搶答狀態機與按鍵映射

**Files:**
- Create: `web/js/game-state.mjs`
- Create: `web/js/input.mjs`
- Create: `tests/game-state.test.mjs`
- Create: `tests/input.test.mjs`

- [ ] **Step 1: 寫出搶答轉手的失敗測試**

```js
test('gives the other player a chance after a wrong locked answer', () => {
  let state = createGameState({ mode: 'questions', limit: 2 });
  state = claimAnswer(state, 'left');
  state = submitAnswer(state, 'left', 2, 0);
  assert.equal(state.phase, 'open');
  assert.deepEqual(state.eligiblePlayers, ['right']);
});
```

- [ ] **Step 2: 執行並確認失敗**

Run: `node --test tests/game-state.test.mjs`

Expected: FAIL，因狀態機尚未建立。

- [ ] **Step 3: 實作不可變狀態機與映射表**

```js
export const PLAYER_KEYS = {
  left: { up: 'KeyW', down: 'KeyX', previous: 'KeyA', next: 'KeyD', answers: ['Digit1', 'Digit2', 'Digit3', 'Digit4'] },
  right: { up: 'ArrowUp', down: 'ArrowDown', previous: 'ArrowLeft', next: 'ArrowRight', answers: ['Digit0', 'Minus', 'Equal', 'Backslash'] },
};
// claimAnswer 僅在 open 狀態鎖定第一位符合資格者。
// submitAnswer 答對時分數 +1 並進下一題；答錯時移除該玩家資格，另一位回到 open。
```

- [ ] **Step 4: 補齊賽制測試並執行**

Run: `npm test`

Expected: 固定題數、限時結束、答對加 1、答錯不扣分、兩組按鍵皆 PASS。

- [ ] **Step 5: 建立 Git checkpoint**

Run: `git add web/js tests && git commit -m "feat: add two-player quiz game rules"`

### Task 5: 實作靜態網頁介面與實際鍵盤操作

**Files:**
- Create: `web/index.html`
- Create: `web/assets/app.css`
- Create: `web/js/app.mjs`

- [ ] **Step 1: 建立最小可測 DOM 骨架**

```html
<main id="app" aria-live="polite">
  <section data-screen="catalog"></section>
  <section data-screen="rules" hidden></section>
  <section data-screen="key-test" hidden></section>
  <section data-screen="game" hidden></section>
  <section data-screen="result" hidden></section>
</main>
<script type="module" src="./js/app.mjs"></script>
```

- [ ] **Step 2: 以題庫載入失敗為先建立手動驗證條件**

Run: `npm start`

Expected: 瀏覽器載入首頁但顯示「尚未產生題庫」，直到 Task 3 的轉換資料存在。

- [ ] **Step 3: 實作五段流程與鍵盤事件**

```js
document.addEventListener('keydown', event => {
  if (isGameKey(event.code)) event.preventDefault();
  recordKeyTest(event.code);
  handleGameInput(event.code);
});
// renderCatalog → renderRules → renderKeyTest → renderQuestion → renderResult
// 選單僅列 catalog.json 的 playable 項目；固定題數及秒數使用具標籤的 number input。
```

- [ ] **Step 4: 完成手動驗證**

Run: `npm start`

Expected: 選擇任一有效題庫後，可完成按鍵測試、固定題數制、限時制、搶答、答錯轉手與結算。

- [ ] **Step 5: 建立 Git checkpoint**

Run: `git add web && git commit -m "feat: build playable two-player quiz interface"`

### Task 6: 發布設定與發布前驗證

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `README.md`

- [ ] **Step 1: 建立 GitHub Pages workflow**

```yaml
name: Deploy GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm test
      - run: test -f web/data/catalog.json && test -d web/images
      - uses: actions/upload-pages-artifact@v3
        with: { path: web }
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 撰寫 README 的使用與隱私內容**

```markdown
## 本機執行
`npm run convert` 後執行 `npm start`。

## 隱私
此網頁不載入 `D_Dual`；不包含學生姓名、帳號或雲端戰績。
```

- [ ] **Step 3: 完整驗證**

Run: `npm test && npm run convert && git diff --check`

Expected: 全數 PASS，且無空白錯誤。

- [ ] **Step 4: 建立發布 checkpoint**

Run: `git add .github README.md && git commit -m "ci: deploy quiz game to GitHub Pages"`

- [ ] **Step 5: GitHub Pages 實測**

Run: 推送 `main` 後，開啟 Actions 產生的 GitHub Pages 網址。

Expected: HTTP 200；在實際瀏覽器完成題庫選擇、按鍵測試與兩種賽制各一局。

## 自我檢查

- 規格中的所有流程、題庫範圍、按鍵、搶答規則、錯誤處理、測試與發布均各有對應任務。
- 未保留未定義的實作步驟或待補內容。
- `parseQuestionRecord`、`validateQuestion`、`convertFolder`、`createGameState`、`claimAnswer` 與 `submitAnswer` 均在使用前定義或在其任務中建立。
