# 題庫分科篩選 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首頁加入附題庫數量的科目篩選按鈕，並讓轉換後的每份題庫都有明確科目。

**Architecture:** 轉換端用獨立純函式判定並寫入 `subject`；瀏覽器端用另一個純函式模組計數、排序、篩選與產生安全 HTML，`app.mjs` 只負責狀態與事件。現有題庫卡片及遊戲流程保持不變。

**Tech Stack:** JavaScript ES modules、CSS、Node.js built-in test runner、HTML5 browser application、GitHub Pages

---

### Task 1: 題庫科目資料

**Files:**
- Create: `scripts/lib/quiz-subject.mjs`
- Modify: `scripts/convert-a-quizbase.mjs`
- Modify: `tests/converter.test.mjs`
- Regenerate: `web/data/catalog.json`

- [ ] **Step 1: 寫入科目判定與目錄欄位的失敗測試**

在 `tests/converter.test.mjs` 匯入 `subjectForQuiz`，測試「(數學)國文 第三冊 文言文」為國文、英文／公民／歷史名稱正確分類、`99`／`clock`／`math-add_10-20` 為數學、未知題庫為其他；並將既有 `makeCatalogEntry()` 測試名稱改為「數學範例」，預期值加入 `subject: '數學'`。

- [ ] **Step 2: 執行測試並確認失敗**

Run: `node --test tests/converter.test.mjs`

Expected: FAIL，找不到 `quiz-subject.mjs` 或目錄項目缺少 `subject`。

- [ ] **Step 3: 實作最小科目判定函式**

```js
export function subjectForQuiz({ id = '', name = '' }) {
  for (const subject of ['國文', '英文', '公民', '歷史', '數學']) {
    if (name.includes(subject)) return subject;
  }
  if (id === '99' || id === 'clock' || /^math[-_]/.test(id)) return '數學';
  return '其他';
}
```

在 `makeCatalogEntry(quiz)` 回傳值加入 `subject: subjectForQuiz(quiz)`。

- [ ] **Step 4: 執行轉換測試並確認通過**

Run: `node --test tests/converter.test.mjs`

Expected: 所有 converter 測試通過。

- [ ] **Step 5: 重新產生題庫資料並驗證各科數量**

Run: `npm run convert`

Expected: 顯示已轉換 31 份題庫；`catalog.json` 統計為數學 23、國文 4、英文 2、公民 1、歷史 1，沒有其他。

### Task 2: 科目計數、篩選與安全標記

**Files:**
- Create: `web/js/catalog-filter.mjs`
- Create: `tests/catalog-filter.test.mjs`

- [ ] **Step 1: 寫入失敗測試**

測試 `buildSubjectFilters()` 預設先顯示「全部」，再依數學、國文、英文、公民、歷史、其他排序，只顯示數量大於零的科目；測試 `filterCatalog()` 在全部時保留所有題庫、指定科目時只保留相符題庫；測試 `buildSubjectButtons()` 包含數量、`aria-pressed`、`data-subject` 且會跳脫特殊字元。

- [ ] **Step 2: 執行測試並確認模組不存在**

Run: `node --test tests/catalog-filter.test.mjs`

Expected: FAIL，找不到 `catalog-filter.mjs`。

- [ ] **Step 3: 實作純函式模組**

```js
export const SUBJECT_ORDER = ['數學', '國文', '英文', '公民', '歷史', '其他'];

export function buildSubjectFilters(catalog) {
  const counts = new Map();
  for (const quiz of catalog) counts.set(quiz.subject, (counts.get(quiz.subject) || 0) + 1);
  return [{ subject: '全部', count: catalog.length }, ...SUBJECT_ORDER
    .filter(subject => counts.has(subject))
    .map(subject => ({ subject, count: counts.get(subject) }))];
}

export function filterCatalog(catalog, subject) {
  return subject === '全部' ? catalog : catalog.filter(quiz => quiz.subject === subject);
}
```

同一模組加入內部 HTML 跳脫函式，以及輸出 `.subject-filter` 按鈕的 `buildSubjectButtons(filters, activeSubject)`。

- [ ] **Step 4: 執行模組測試並確認通過**

Run: `node --test tests/catalog-filter.test.mjs`

Expected: 所有 catalog-filter 測試通過。

### Task 3: 首頁科目篩選介面

**Files:**
- Modify: `web/js/app.mjs`
- Modify: `web/assets/app.css`
- Modify: `tests/catalog-filter.test.mjs`

- [ ] **Step 1: 擴充首頁整合契約的失敗測試**

讀取 `app.mjs` 與 `app.css`，確認首頁匯入並呼叫 `buildSubjectFilters`、`filterCatalog`、`buildSubjectButtons`，按鈕事件更新目前科目後重繪；CSS 必須包含 `.subject-filters`、`.subject-filter`、`.subject-filter.is-active` 與可換行規則。

- [ ] **Step 2: 執行測試並確認整合尚未存在**

Run: `node --test tests/catalog-filter.test.mjs`

Expected: FAIL，`app.mjs` 尚未匯入科目篩選模組。

- [ ] **Step 3: 將篩選狀態接入首頁**

在 `app.mjs` 匯入三個純函式，新增 `let activeSubject = '全部'`。`renderCatalog()` 先取得 filters 與 visibleCatalog，再渲染按鈕列、篩選後卡片及「目前顯示 X 份，共 Y 份題庫」提示；綁定 `[data-subject]` 點擊，播放選單音效、更新 `activeSubject` 並重繪。返回題庫時保留目前選取科目。

- [ ] **Step 4: 加入響應式按鈕樣式**

`.subject-filters` 使用 `display:flex; flex-wrap:wrap`；`.subject-filter` 沿用粗框與陰影；`.is-active` 使用黃色底色與按下效果；窄螢幕讓按鈕平均擴張但保持可換行，不造成水平溢位。

- [ ] **Step 5: 執行模組及完整測試**

Run: `node --test tests/catalog-filter.test.mjs`

Expected: 所有 catalog-filter 測試通過。

Run: `npm test`

Expected: 所有測試通過。

### Task 4: 實機驗證與發布

**Files:**
- Verify: `web/data/catalog.json`
- Verify: `web/js/app.mjs`
- Verify: `web/js/catalog-filter.mjs`
- Verify: `web/assets/app.css`

- [ ] **Step 1: 執行發布前檢查**

Run: `npm test`

Expected: 所有測試通過。

Run: `git diff --check`

Expected: 沒有空白錯誤。

- [ ] **Step 2: 本機瀏覽器驗證**

啟動本機伺服器；確認預設「全部（31）」且顯示 31 張卡片，再逐一點擊數學、國文、英文、公民、歷史，分別確認 23、4、2、1、1 張卡片與選取狀態。確認國文清單含誤寫的文言文題庫，並從篩選後卡片成功進入規則頁。

- [ ] **Step 3: 窄螢幕與回歸驗證**

縮至手機寬度，確認按鈕換行且不溢位；返回題庫時保留原科目。確認音效、戰場、選角、可選鍵盤測試及對戰流程未受影響。

- [ ] **Step 4: 程式審查**

檢查分類優先順序、未知題庫 fallback、HTML 跳脫、按鈕可及性、事件重綁與現有流程回歸；修正所有 Critical／Important 意見。

- [ ] **Step 5: 提交與發布 GitHub Pages**

提交程式及重新產生的資料；將 `web` 子樹發布到 `gh-pages`，等待公開資源回應 `HTTP 200`，再於帶新版本參數的 GitHub Pages 網址重做各科數量與進入遊戲驗證。
