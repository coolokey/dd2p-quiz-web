export function validateQuestion(question) {
  if (!question.prompt.trim()) return { valid: false, reason: '題目內容空白' };
  if (question.choices.length < 2 || question.choices.length > 4) return { valid: false, reason: '選項數必須介於 2 至 4' };
  if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0 || question.answerIndex >= question.choices.length) {
    return { valid: false, reason: '答案索引不在選項範圍內' };
  }
  return { valid: true };
}
