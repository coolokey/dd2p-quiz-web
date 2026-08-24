import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertFolder, imageFilesForQuiz, makeCatalogEntry } from '../scripts/convert-a-quizbase.mjs';
import { subjectForQuiz } from '../scripts/lib/quiz-subject.mjs';

test('目錄項目使用網頁可載入的 data 路徑', () => {
  assert.deepEqual(makeCatalogEntry({ id: 'sample', name: '數學範例', questions: [] }), {
    id: 'sample', name: '數學範例', subject: '數學', questions: 0, file: './data/quizzes/sample.json',
  });
});

test('依題庫名稱與識別碼判定科目', () => {
  assert.equal(subjectForQuiz({ id: 'chinese3-nanyi', name: '(數學)國文 第三冊 文言文' }), '國文');
  assert.equal(subjectForQuiz({ id: 'english', name: '(國中)英文 第三冊' }), '英文');
  assert.equal(subjectForQuiz({ id: 'civic', name: '(國中)公民 第三冊' }), '公民');
  assert.equal(subjectForQuiz({ id: 'history', name: '(國中)歷史 第三冊' }), '歷史');
  assert.equal(subjectForQuiz({ id: '99', name: '(國小)99乘法表' }), '數學');
  assert.equal(subjectForQuiz({ id: 'clock', name: '(國小)看時鐘' }), '數學');
  assert.equal(subjectForQuiz({ id: 'math-add_10-20', name: '(國小)１０～２０的加法' }), '數學');
  assert.equal(subjectForQuiz({ id: 'txt_add_10', name: '(國小)１０以內的加法' }), '數學');
  assert.equal(subjectForQuiz({ id: 'unknown', name: '未分類題庫' }), '其他');
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
