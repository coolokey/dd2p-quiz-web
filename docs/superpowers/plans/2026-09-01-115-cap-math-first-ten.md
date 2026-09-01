# 115 年國中教育會考數學前十題題庫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 115 年國中教育會考數學前十題題庫，並讓這份題庫的題幹固定依官方題號循序出題。

**Architecture:** 題庫根物件以 `questionOrder: "fixed"` 宣告順序；出題器根據此值決定是否洗牌題目。題目內容維持 JSON 資料檔，必要圖表以 PNG 資產引用，科目篩選只透過題庫目錄資料產生。

**Tech Stack:** 靜態 HTML、ES modules、Node.js 內建 `node:test`、JSON、官方 PDF 題本。

---

### Task 1: 固定題序出題器

**Files:**
- Modify: `web/js/question-randomizer.mjs:69-76`
- Modify: `web/js/app.mjs:527,552`
- Test: `tests/question-randomizer.test.mjs`

- [ ] **Step 1: 寫入會失敗的測試**

在 `tests/question-randomizer.test.mjs` 加入：

```js
test('固定題序保留題目 ID 順序，但仍重新配置選項位置', () => {
  const questions = [
    { id: '001', prompt: 'Q1', choices: ['正確', '乙', '丙', '丁'], answerIndex: 0 },
    { id: '002', prompt: 'Q2', choices: ['甲', '正確', '丙', '丁'], answerIndex: 1 },
    { id: '003', prompt: 'Q3', choices: ['甲', '乙', '正確', '丁'], answerIndex: 2 },
  ];
  const result = prepareQuestionRound(questions, () => 0, createAnswerPositionState(), 'fixed');
  assert.deepEqual(result.map(question => question.id), ['001', '002', '003']);
  assert.deepEqual(result.map(question => question.choices[question.answerIndex]), ['正確', '正確', '正確']);
});
```

- [ ] **Step 2: 確認測試正確失敗**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: 新測試的題目 ID 順序不為 `001, 002, 003`。

- [ ] **Step 3: 最小化實作**

將出題器函式改為：

```js
export function prepareQuestionRound(questions, random = Math.random, state = createAnswerPositionState(), questionOrder = 'random') {
  for (const question of questions) validateQuestionForRandomization(question);
  const orderedQuestions = questionOrder === 'fixed' ? [...questions] : shuffleWithRandom(questions, random);
  return orderedQuestions.map(question => {
    const position = drawAnswerPosition(state, question.choices.length, random);
    return randomizeQuestionToPosition(question, position, random);
  });
}
```

將 `web/js/app.mjs` 的兩個呼叫都改成：

```js
prepareQuestionRound(currentQuiz.questions, Math.random, answerPositionState, currentQuiz.questionOrder)
```

- [ ] **Step 4: 驗證與提交**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: 所有測試通過，既有題庫仍保持隨機題序。

```bash
git add tests/question-randomizer.test.mjs web/js/question-randomizer.mjs web/js/app.mjs
git commit -m "feat: support fixed question order"
```

### Task 2: 官方題庫、圖表與科目篩選

**Files:**
- Create: `web/data/quizzes/cap-115-math-01-10.json`
- Create: `web/assets/questions/cap-115-math-01-10/q002-figure.png`
- Create: `web/assets/questions/cap-115-math-01-10/q006-table.png`
- Create: `web/assets/questions/cap-115-math-01-10/q008-figure.png`
- Create: `web/assets/questions/cap-115-math-01-10/q010-dialogue.png`
- Modify: `web/data/catalog.json`
- Modify: `web/js/catalog-filter.mjs:1`
- Test: `tests/catalog-filter.test.mjs`

- [ ] **Step 1: 寫入會失敗的目錄與資料測試**

將 `tests/catalog-filter.test.mjs` 的目錄數量期望改為：

```js
assert.deepEqual(buildSubjectFilters(data.quizzes), [
  { subject: '全部', count: 32 },
  { subject: '國中教育會考', count: 1 },
  { subject: '數學', count: 23 },
  { subject: '國文', count: 4 },
  { subject: '英文', count: 2 },
  { subject: '公民', count: 1 },
  { subject: '歷史', count: 1 },
]);
```

並加入：

```js
test('115 年會考數學題庫保存官方前十題與固定題序', async () => {
  const catalog = JSON.parse(await readFile(new URL('../web/data/catalog.json', import.meta.url), 'utf8'));
  const quiz = catalog.quizzes.find(item => item.id === 'cap-115-math-01-10');
  assert.equal(quiz.subject, '國中教育會考');
  assert.equal(quiz.questions, 10);
  const data = JSON.parse(await readFile(new URL('../web/data/quizzes/cap-115-math-01-10.json', import.meta.url), 'utf8'));
  assert.equal(data.questionOrder, 'fixed');
  assert.deepEqual(data.questions.map(question => question.id), ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010']);
  assert.deepEqual(data.questions.map(question => question.answerIndex), [2, 2, 2, 1, 1, 2, 0, 0, 0, 1]);
  assert.ok(data.questions.every(question => question.choices.length === 4));
});
```

- [ ] **Step 2: 確認測試正確失敗**

Run: `node --test tests/catalog-filter.test.mjs`

Expected: 目前題庫數量為 31，且找不到 `cap-115-math-01-10`。

- [ ] **Step 3: 建立圖表與題庫資料**

以 `115年國中教育會考題本與參考答案/115年國中教育會考數學科試題本.pdf` 為唯一來源，擷取第 2 題直角柱圖、第 6 題文旦分類表、第 8 題培養皿圖、第 10 題兄妹對話圖。圖檔只保留必要圖表，並逐張開啟確認文字、數字和線條可讀。

新增目錄項目：

```json
{
  "id": "cap-115-math-01-10",
  "name": "115 年國中教育會考數學第 1～10 題",
  "subject": "國中教育會考",
  "questions": 10,
  "file": "./data/quizzes/cap-115-math-01-10.json"
}
```

將 `SUBJECT_ORDER` 改為：

```js
['國中教育會考', '數學', '國文', '英文', '公民', '歷史', '其他']
```

新題庫根物件為：

```json
{
  "id": "cap-115-math-01-10",
  "name": "115 年國中教育會考數學第 1～10 題",
  "declaredTotal": 10,
  "questionOrder": "fixed",
  "questions": []
}
```

依官方第 1 至第 10 題填入四個選項與題幹；答案索引須依序為 `[2, 2, 2, 1, 1, 2, 0, 0, 0, 1]`，第 2、6、8、10 題的 `image` 分別連結新 PNG，其他題目為 `null`。

- [ ] **Step 4: 驗證與提交**

Run: `node --test tests/catalog-filter.test.mjs`

Expected: 顯示「全部 32」與「國中教育會考 1」，所有測試通過。

```bash
git add web/data/catalog.json web/data/quizzes/cap-115-math-01-10.json web/js/catalog-filter.mjs web/assets/questions/cap-115-math-01-10 tests/catalog-filter.test.mjs
git commit -m "feat: add 115 cap math first ten questions"
```

### Task 3: 整合驗證

**Files:**
- Verify: `web/data/quizzes/cap-115-math-01-10.json`
- Verify: `web/assets/questions/cap-115-math-01-10/`
- Test: `tests/*.test.mjs`

- [ ] **Step 1: 驗證題庫資料與資產**

Run:

```bash
node -e "const fs=require('fs');const q=JSON.parse(fs.readFileSync('web/data/quizzes/cap-115-math-01-10.json'));if(q.questions.length!==10||q.questionOrder!=='fixed')process.exit(1);for(const n of ['q002-figure.png','q006-table.png','q008-figure.png','q010-dialogue.png'])if(!fs.existsSync('web/assets/questions/cap-115-math-01-10/'+n))process.exit(1);"
```

Expected: 結束碼為 0。

- [ ] **Step 2: 執行完整測試**

Run: `npm test`

Expected: 所有測試通過。

- [ ] **Step 3: 手動檢查**

Run: `npm run start`

在瀏覽器選擇「國中教育會考」→「115 年國中教育會考數學第 1～10 題」→固定題數制 10 題，確認題目依 1 到 10 題出現，且第 2、6、8、10 題圖表完整可讀；另一局仍從第 1 題開始。

- [ ] **Step 4: 最後檢查**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` 無輸出，工作目錄沒有未預期檔案。
