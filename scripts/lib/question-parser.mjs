function decode(value = '') {
  return decodeURIComponent(value.replace(/\+/g, '%20'));
}

export function parseQuestionRecord(raw) {
  const values = new Map();
  for (const pair of raw.replace(/^\uFEFF/, '').split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    values.set(pair.slice(0, separator), decode(pair.slice(separator + 1)));
  }
  return {
    type: Number(values.get('Type')),
    prompt: values.get('Q') ?? '',
    choices: ['A1', 'A2', 'A3', 'A4'].map(key => values.get(key)).filter(Boolean),
    answerIndex: Number(values.get('A')) - 1,
  };
}

export function parseParameterRecord(raw) {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/&&/g, '&');
  const values = Object.fromEntries(normalized.split('&').filter(Boolean).map(pair => {
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), decode(pair.slice(separator + 1))];
  }));
  return { name: values.Name ?? '', total: Number(values.QzTotal), textFlag: Number(values.TxtFlag) };
}
