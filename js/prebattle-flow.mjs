const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);

export function buildCharacterActions(ready, message = '') {
  const disabled = ready ? '' : ' disabled';
  const error = message ? `<p class="error prebattle-error">${escapeHtml(message)}</p>` : '';
  return `${error}<div class="actions prebattle-actions">
    <button class="secondary" id="back">返回戰場</button>
    <button class="secondary" id="test-keys"${disabled}>測試鍵盤</button>
    <button class="primary" id="skip-key-test"${disabled}>略過測試，直接開始</button>
  </div>`;
}

export function bindCharacterActions(root, { onBack, onTest, onSkip }) {
  root.querySelector('#back').onclick = onBack;
  root.querySelector('#test-keys').onclick = onTest;
  root.querySelector('#skip-key-test').onclick = onSkip;
}

export function attemptBattleSetup(createSettings, onReady, onError) {
  try {
    onReady(createSettings());
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}

export function recordKeyTestKey(keyHits, needed, code) {
  if (!needed.includes(code)) return keyHits;
  return new Set([...keyHits, code]);
}

export function isKeyTestComplete(keyHits, needed) {
  return needed.every(code => keyHits.has(code));
}
