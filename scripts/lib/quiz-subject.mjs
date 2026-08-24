export function subjectForQuiz({ id = '', name = '' }) {
  for (const subject of ['國文', '英文', '公民', '歷史', '數學']) {
    if (name.includes(subject)) return subject;
  }
  if (id === '99' || id === 'clock' || /^math[-_]/.test(id) || /^txt_add_/.test(id)) return '數學';
  return '其他';
}
