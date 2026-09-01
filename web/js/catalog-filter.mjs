export const SUBJECT_ORDER = ['國中教育會考', '數學', '國文', '英文', '公民', '歷史', '其他'];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[char]);

export function buildSubjectFilters(catalog) {
  const counts = new Map();
  for (const quiz of catalog) {
    counts.set(quiz.subject, (counts.get(quiz.subject) || 0) + 1);
  }
  return [
    { subject: '全部', count: catalog.length },
    ...SUBJECT_ORDER
      .filter(subject => counts.has(subject))
      .map(subject => ({ subject, count: counts.get(subject) })),
  ];
}

export function filterCatalog(catalog, subject) {
  return subject === '全部' ? catalog : catalog.filter(quiz => quiz.subject === subject);
}

export function buildSubjectButtons(filters, activeSubject) {
  return filters.map(({ subject, count }) => {
    const active = subject === activeSubject;
    return `<button class="subject-filter${active ? ' is-active' : ''}" data-subject="${escapeHtml(subject)}" aria-pressed="${active}">${escapeHtml(subject)}<span>${escapeHtml(count)}</span></button>`;
  }).join('');
}
