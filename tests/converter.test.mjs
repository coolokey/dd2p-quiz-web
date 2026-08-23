import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertFolder, imageFilesForQuiz, makeCatalogEntry } from '../scripts/convert-a-quizbase.mjs';

test('目錄項目使用網頁可載入的 data 路徑', () => {
  assert.deepEqual(makeCatalogEntry({ id: 'sample', name: '範例', questions: [] }), {
    id: 'sample', name: '範例', questions: 0, file: './data/quizzes/sample.json',
  });
});

test('只複製題目實際引用的 JPG', () => {
  assert.deepEqual(imageFilesForQuiz({ questions: [{ image: './images/demo/001.jpg' }, { image: null }, { image: './images/demo/003.jpg' }] }), ['001.jpg', '003.jpg']);
});

test('略過缺少 _para.txt 的題庫資料夾', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'dd2p-empty-'));
  assert.deepEqual(await convertFolder(folder), { included: false, reason: '缺少 _para.txt' });
});

test('轉換有效題庫並略過不完整題目', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'dd2p-topic-'));
  await writeFile(join(folder, '_para.txt'), 'TxtFlag=1&&QzTotal=2&&Name=測試題庫&&okflag=1', 'utf8');
  await writeFile(join(folder, '001.txt'), 'Type=0&Q=題目&A1=甲&A2=乙&A=2&okflag=1', 'utf8');
  await writeFile(join(folder, '002.txt'), 'Type=0&Q=壞題&A1=甲&A=3&okflag=1', 'utf8');
  const result = await convertFolder(folder);
  assert.equal(result.included, true);
  assert.equal(result.quiz.questions.length, 1);
  assert.equal(result.report.invalidQuestions.length, 1);
});
