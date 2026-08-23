# 題目選項隨機排列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓全部題庫的每一題在進入一局遊戲時公平洗牌選項，並讓正確答案索引同步更新。

**Architecture:** 新增一個無瀏覽器依賴的題目隨機化模組，以可注入亂數的 `Fisher–Yates` 演算法建立題目副本。`app.mjs` 只在建立新一輪 `activeQuestions` 時呼叫此模組，因此同一題轉交作答與播放動畫時維持相同選項排列。

**Tech Stack:** JavaScript ES modules、Node.js built-in test runner、HTML5 browser application

---

### Task 1: 題目選項隨機化核心

**Files:**
- Create: `web/js/question-randomizer.mjs`
- Create: `tests/question-randomizer.test.mjs`

- [ ] **Step 1: 寫入會失敗的正確答案位置測試**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomizeQuestion } from '../web/js/question-randomizer.mjs';

test('洗牌選項後正確答案索引仍指向原正確答案', () => {
  const original = { id: 'q1', prompt: '1x2=?', choices: ['2', '3', '1', '4'], answerIndex: 0 };
  const randomized = randomizeQuestion(original, () => 0);

  assert.equal(randomized.choices[randomized.answerIndex], '2');
  assert.equal(randomized.answerIndex, 3);
});
```

- [ ] **Step 2: 執行測試並確認因模組不存在而失敗**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: FAIL，錯誤指出找不到 `web/js/question-randomizer.mjs`。

- [ ] **Step 3: 實作最小的 Fisher–Yates 題目洗牌**

```js
export function shuffleWithRandom(values, random = Math.random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function randomizeQuestion(question, random = Math.random) {
  const options = question.choices.map((choice, index) => ({
    choice,
    correct: index === question.answerIndex,
  }));
  const shuffled = shuffleWithRandom(options, random);
  return {
    ...question,
    choices: shuffled.map(option => option.choice),
    answerIndex: shuffled.findIndex(option => option.correct),
  };
}
```

- [ ] **Step 4: 執行測試並確認通過**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: PASS，`1` 項測試通過。

- [ ] **Step 5: 增加不可變性與 2 至 4 個選項測試**

```js
test('不修改原題目與原 choices 陣列', () => {
  const original = { prompt: 'Q', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 };
  const originalChoices = [...original.choices];
  randomizeQuestion(original, () => 0);
  assert.deepEqual(original.choices, originalChoices);
  assert.equal(original.answerIndex, 0);
});

test('支援 2 至 4 個選項並保留其他題目欄位', () => {
  for (const choices of [['A', 'B'], ['A', 'B', 'C'], ['A', 'B', 'C', 'D']]) {
    const result = randomizeQuestion({ id: 'q', image: './q.jpg', prompt: 'Q', choices, answerIndex: 0 }, () => 0);
    assert.equal(result.choices[result.answerIndex], 'A');
    assert.equal(result.id, 'q');
    assert.equal(result.image, './q.jpg');
  }
});
```

- [ ] **Step 6: 執行核心測試並提交**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: PASS，`3` 項測試通過。

```bash
git add web/js/question-randomizer.mjs tests/question-randomizer.test.mjs
git commit -m "feat: randomize answer positions"
```

### Task 2: 接入新局與題目補充流程

**Files:**
- Modify: `web/js/question-randomizer.mjs`
- Modify: `tests/question-randomizer.test.mjs`
- Modify: `web/js/app.mjs`

- [ ] **Step 1: 寫入會失敗的新一輪題目測試**

```js
import { prepareQuestionRound, randomizeQuestion } from '../web/js/question-randomizer.mjs';

test('每一輪同時隨機排列題目順序與各題選項', () => {
  const questions = [
    { id: 'q1', prompt: 'Q1', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 },
    { id: 'q2', prompt: 'Q2', choices: ['甲', '乙', '丙', '丁'], answerIndex: 0 },
  ];
  const round = prepareQuestionRound(questions, () => 0);

  assert.deepEqual(round.map(question => question.id), ['q2', 'q1']);
  assert.equal(round[0].choices[round[0].answerIndex], '甲');
  assert.equal(round[1].choices[round[1].answerIndex], 'A');
  assert.notStrictEqual(round[0], questions[1]);
});
```

- [ ] **Step 2: 執行測試並確認缺少函式而失敗**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: FAIL，錯誤指出沒有匯出 `prepareQuestionRound`。

- [ ] **Step 3: 實作每輪題目準備函式**

```js
export function prepareQuestionRound(questions, random = Math.random) {
  return shuffleWithRandom(questions, random)
    .map(question => randomizeQuestion(question, random));
}
```

- [ ] **Step 4: 執行核心測試並確認通過**

Run: `node --test tests/question-randomizer.test.mjs`

Expected: PASS，`4` 項測試通過。

- [ ] **Step 5: 將新局與補入下一輪改用同一函式**

在 `web/js/app.mjs` 匯入：

```js
import { prepareQuestionRound } from './question-randomizer.mjs';
```

刪除原本的 `sort(() => Math.random() - .5)` 洗牌函式，並將新局初始化改為：

```js
currentQuiz = { ...currentQuiz, activeQuestions: prepareQuestionRound(currentQuiz.questions) };
```

將 `ensureQuestion()` 補入題目改為：

```js
function ensureQuestion() {
  if (quizState.questionIndex >= currentQuiz.activeQuestions.length) {
    currentQuiz.activeQuestions.push(...prepareQuestionRound(currentQuiz.questions));
  }
}
```

- [ ] **Step 6: 執行完整測試並提交**

Run: `npm test`

Expected: 所有測試通過，沒有失敗項目。

```bash
git add web/js/app.mjs web/js/question-randomizer.mjs tests/question-randomizer.test.mjs
git commit -m "feat: shuffle choices for every quiz round"
```

### Task 3: 瀏覽器驗證與發布

**Files:**
- Verify: `web/js/app.mjs`
- Verify: `web/js/question-randomizer.mjs`

- [ ] **Step 1: 執行發布前檢查**

Run: `npm test`

Expected: 所有測試通過。

Run: `git diff --check`

Expected: 沒有空白錯誤。

- [ ] **Step 2: 在本機瀏覽器重複開始 99 乘法表遊戲**

每次進入第一題時，讀取題目四個選項與 `answerIndex`，至少重開多局確認正確答案位置不是固定為第 1 個；同一題答錯轉交另一位玩家時，四個選項順序必須保持不變。

- [ ] **Step 3: 發布 `web` 子樹到 GitHub Pages**

```bash
git subtree split --prefix web -b gh-pages-randomized-answers
git push origin gh-pages-randomized-answers:gh-pages --force-with-lease
```

- [ ] **Step 4: 驗證公開版**

確認 `https://coolokey.github.io/dd2p-quiz-web/` 回應 `HTTP 200`，公開版 `question-randomizer.mjs` 存在，並實際開始一局確認正確答案位置已隨機化。
