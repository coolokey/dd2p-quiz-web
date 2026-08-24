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
  const [app, css] = await Promise.all([
    readFile(new URL('../web/js/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../web/assets/app.css', import.meta.url), 'utf8'),
  ]);
  for (const name of ['buildSubjectButtons', 'buildSubjectFilters', 'filterCatalog']) {
    assert.match(app, new RegExp(name));
  }
  assert.match(app, /activeSubject/);
  assert.match(app, /\[data-subject\]/);
  assert.match(css, /\.subject-filters\s*\{[^}]*flex-wrap\s*:\s*wrap/s);
  assert.match(css, /\.subject-filter\.is-active/);
});
