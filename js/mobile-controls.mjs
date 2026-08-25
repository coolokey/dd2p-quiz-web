const esc = value => String(value).replace(/[&<>\"]/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
})[character]);

function playerMarkup(player, choiceCount, eligiblePlayers, locked) {
  const disabled = locked || !eligiblePlayers.includes(player);
  const buttons = Array.from({ length: choiceCount }, (_, answerIndex) =>
    `<button type="button" class="mobile-answer" data-touch-answer="${answerIndex}" data-player="${esc(player)}"${disabled ? ' disabled' : ''}><span>${answerIndex + 1}</span></button>`
  ).join('');
  return `<div class="mobile-answer-pad mobile-answer-pad-${esc(player)}" data-mobile-player="${esc(player)}">${buttons}</div>`;
}

export function buildMobileAnswerControls({ gameMode, choiceCount, eligiblePlayers = [], locked = false }) {
  const count = Math.max(0, Math.min(4, Number(choiceCount) || 0));
  const players = gameMode === 'solo' ? ['left'] : ['left', 'right'];
  return `<div class="mobile-answer-controls mode-${esc(gameMode)}" aria-label="觸控作答">${players.map(player => playerMarkup(player, count, eligiblePlayers, locked)).join('')}</div>`;
}

export function answerInputFromTouchTarget(target) {
  const answerIndex = Number(target?.dataset?.touchAnswer);
  const player = target?.dataset?.player;
  if (!['left', 'right'].includes(player)
    || !Number.isInteger(answerIndex)
    || answerIndex < 0
    || answerIndex > 3) return null;
  return { player, answerIndex };
}

export function bindMobileAnswerControls(root, { onAnswer }) {
  const activePointers = new Set();
  const release = event => activePointers.delete(event.pointerId);
  for (const button of root.querySelectorAll('[data-touch-answer]')) {
    button.onpointerdown = event => {
      event.preventDefault();
      if (button.disabled || activePointers.has(event.pointerId)) return;
      activePointers.add(event.pointerId);
      const input = answerInputFromTouchTarget(button);
      if (input) onAnswer(input);
    };
    button.onpointerup = release;
    button.onpointercancel = release;
  }
}

export function setMobileAnswerControlsLocked(root, locked) {
  for (const button of root.querySelectorAll('[data-touch-answer]')) button.disabled = Boolean(locked);
}
