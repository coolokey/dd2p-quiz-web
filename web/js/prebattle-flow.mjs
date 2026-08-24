export function buildCharacterActions(ready) {
  const disabled = ready ? '' : ' disabled';
  return `<div class="actions prebattle-actions">
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

export function createStartGate(start) {
  let starting = false;
  return async (...args) => {
    if (starting) return false;
    starting = true;
    try {
      await start(...args);
      return true;
    } finally {
      starting = false;
    }
  };
}
