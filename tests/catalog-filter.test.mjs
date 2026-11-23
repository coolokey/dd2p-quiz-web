import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSubjectButtons, buildSubjectFilters, filterCatalog } from '../web/js/catalog-filter.mjs';

const catalog = [
  { id: 'm1', subject: '數學' },
  { id: 'm2', subject: '數學' },
  { id: 'c1', subject: '國文' },
  { id: 'e1', subject: '英文' },
  { id: 'x1', subject: '其他' },
];

test('科目篩選依固定順序顯示並隱藏零筆科目', () => {
  assert.deepEqual(buildSubjectFilters(catalog), [
    { subject: '全部', count: 5 },
    { subject: '數學', count: 2 },
    { subject: '國文', count: 1 },
    { subject: '英文', count: 1 },
    { subject: '其他', count: 1 },
  ]);
});

test('全部保留所有題庫，指定科目只留下相符題庫', () => {
  assert.deepEqual(filterCatalog(catalog, '全部'), catalog);
  assert.deepEqual(filterCatalog(catalog, '數學').map(quiz => quiz.id), ['m1', 'm2']);
  assert.deepEqual(filterCatalog(catalog, '公民'), []);
});

test('科目按鈕包含數量、選取狀態、可及性與安全文字', () => {
  const html = buildSubjectButtons([
    { subject: '全部', count: 5 },
    { subject: '<數學>', count: 2 },
  ], '<數學>');
  assert.match(html, /data-subject="全部"[^>]*aria-pressed="false"[^>]*>全部<span>5<\/span>/);
  assert.match(html, /class="subject-filter is-active" data-subject="&lt;數學&gt;"[^>]*aria-pressed="true"[^>]*>&lt;數學&gt;<span>2<\/span>/);
  assert.doesNotMatch(html, /data-subject="<數學>"/);
});

test('首頁接入科目篩選模組與響應式樣式', async () => {
  const [app, css, index] = await Promise.all([
    readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8'),
    readFile(new URL('../web/index.html', import.meta.url), 'utf8'),
  ]);
  for (const name of ['buildSubjectButtons', 'buildSubjectFilters', 'filterCatalog']) {
    assert.match(app, new RegExp(name));
  }
  assert.match(app, /activeSubject/);
  assert.match(app, /\[data-subject\]/);
  assert.match(app, /activeButton\?\.focus\(\)/);
  assert.match(index, /<main id="app" aria-live="polite">/);
  assert.match(css, /\.subject-filters\s*\{[^}]*flex-wrap\s*:\s*wrap/s);
  assert.match(css, /\.subject-filter\.is-active/);
});

test('目前題庫資料維持確認過的各科數量', async () => {
  const data = JSON.parse(await readFile(new URL('../web/data/catalog.json', import.meta.url), 'utf8'));
  assert.deepEqual(buildSubjectFilters(data.quizzes), [
    { subject: '全部', count: 41 },
    { subject: '國中教育會考', count: 5 },
    { subject: '數學', count: 28 },
    { subject: '國文', count: 4 },
    { subject: '英文', count: 2 },
    { subject: '公民', count: 1 },
    { subject: '歷史', count: 1 },
  ]);
});

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


test('2-2 根式的運算 5 份主題題庫完整收錄 141 題並修正原講義勘誤', async () => {
  const catalog = JSON.parse(await readFile(new URL('../web/data/catalog.json', import.meta.url), 'utf8'));
  const expected = [
    ['math-8a-2-2-t1-representation', 12],
    ['math-8a-2-2-t2-multiply-compare', 30],
    ['math-8a-2-2-t3-division-rationalize', 53],
    ['math-8a-2-2-t4-add-sub', 24],
    ['math-8a-2-2-t5-four-ops-formula', 22],
  ];
  let total = 0;
  for (const [id, count] of expected) {
    const entry = catalog.quizzes.find(item => item.id === id);
    assert.ok(entry, `缺少題庫目錄項：${id}`);
    assert.equal(entry.subject, '數學');
    assert.equal(entry.questions, count);
    const quiz = JSON.parse(await readFile(new URL(`../web/data/quizzes/${id}.json`, import.meta.url), 'utf8'));
    assert.equal(quiz.questions.length, count);
    for (const q of quiz.questions) {
      assert.ok(q.choices.length >= 2 && q.choices.length <= 4, `${id} ${q.id} 選項數超出範圍`);
      assert.equal(new Set(q.choices).size, q.choices.length, `${id} ${q.id} 選項重複`);
      assert.ok(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.choices.length);
    }
    total += count;
  }
  assert.equal(total, 141);

  const t5 = JSON.parse(await readFile(new URL('../web/data/quizzes/math-8a-2-2-t5-four-ops-formula.json', import.meta.url), 'utf8'));
  const q11 = t5.questions.find(q => q.id === '011');
  const q15 = t5.questions.find(q => q.id === '015');
  assert.equal(q11.choices[q11.answerIndex], '9＋6√2');
  assert.equal(q15.choices[q15.answerIndex], '25－6√14');
});
