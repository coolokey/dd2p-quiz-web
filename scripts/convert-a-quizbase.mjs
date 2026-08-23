import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseParameterRecord, parseQuestionRecord } from './lib/question-parser.mjs';
import { validateQuestion } from './lib/question-validator.mjs';

function topicId(name) {
  return name.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'quiz';
}

export function makeCatalogEntry(quiz) {
  return { id: quiz.id, name: quiz.name, questions: quiz.questions.length, file: `./data/quizzes/${quiz.id}.json` };
}

export function imageFilesForQuiz(quiz) {
  return quiz.questions.filter(question => question.image).map(question => basename(question.image));
}

export async function convertFolder(folderPath) {
  const parameterPath = join(folderPath, '_para.txt');
  try {
    await stat(parameterPath);
  } catch {
    return { included: false, reason: '缺少 _para.txt' };
  }

  const parameter = parseParameterRecord(await readFile(parameterPath, 'utf8'));
  const entries = await readdir(folderPath, { withFileTypes: true });
  const questionFiles = entries.filter(entry => entry.isFile() && /^\d+\.txt$/i.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const questions = [];
  const invalidQuestions = [];
  for (const entry of questionFiles) {
    const question = parseQuestionRecord(await readFile(join(folderPath, entry.name), 'utf8'));
    const validation = validateQuestion(question);
    if (!validation.valid) {
      invalidQuestions.push({ file: entry.name, reason: validation.reason });
      continue;
    }
    const base = basename(entry.name, '.txt');
    const hasImage = entries.some(file => file.isFile() && file.name === `${base}.jpg`);
    questions.push({ id: base, ...question, image: hasImage ? `./images/${topicId(basename(folderPath))}/${base}.jpg` : null });
  }
  if (questions.length === 0) return { included: false, reason: '沒有可用的文字選擇題', report: { invalidQuestions } };
  const id = topicId(basename(folderPath));
  return {
    included: true,
    quiz: { id, name: parameter.name || basename(folderPath), declaredTotal: parameter.total, questions },
    report: { id, source: basename(folderPath), declaredTotal: parameter.total, converted: questions.length, invalidQuestions },
  };
}

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const sourceRoot = join(root, 'A_QuizBase');
  const outputRoot = join(root, 'web', 'data');
  const quizRoot = join(outputRoot, 'quizzes');
  const imageRoot = join(root, 'web', 'images');
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(quizRoot, { recursive: true });
  await mkdir(imageRoot, { recursive: true });
  const catalog = [];
  const skipped = [];
  const reports = [];
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(sourceRoot, entry.name);
    const result = await convertFolder(source);
    if (!result.included) {
      skipped.push({ source: entry.name, reason: result.reason });
      continue;
    }
    const { quiz, report } = result;
    await writeFile(join(quizRoot, `${quiz.id}.json`), JSON.stringify(quiz), 'utf8');
    const imageFiles = imageFilesForQuiz(quiz);
    if (imageFiles.length) {
      const targetFolder = join(imageRoot, quiz.id);
      await mkdir(targetFolder, { recursive: true });
      await Promise.all(imageFiles.map(file => copyFile(join(source, file), join(targetFolder, file))));
    }
    catalog.push(makeCatalogEntry(quiz));
    reports.push(report);
  }
  await writeFile(join(outputRoot, 'catalog.json'), JSON.stringify({ quizzes: catalog }, null, 2), 'utf8');
  await writeFile(join(outputRoot, 'conversion-report.json'), JSON.stringify({ converted: reports, skipped }, null, 2), 'utf8');
  console.log(`已轉換 ${catalog.length} 份題庫，略過 ${skipped.length} 份資料夾。`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
