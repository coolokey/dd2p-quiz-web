export const PAUSE_ACTIONS = Object.freeze({
  restart: 'restart',
  catalog: 'catalog',
  home: 'home',
});

const CONFIRM_COPY = Object.freeze({
  [PAUSE_ACTIONS.restart]: Object.freeze({
    title: '重新開始本局？',
    message: '目前分數、血量與題目進度將歸零。',
    confirmLabel: '確認重新開始本局',
  }),
  [PAUSE_ACTIONS.catalog]: Object.freeze({
    title: '更換題庫？',
    message: '目前對戰進度將不會保留，將返回題庫選單。',
    confirmLabel: '確認更換題庫',
  }),
  [PAUSE_ACTIONS.home]: Object.freeze({
    title: '返回首頁？',
    message: '目前對戰進度將不會保留，將返回模式選擇首頁。',
    confirmLabel: '確認返回首頁',
  }),
});

const TITLE_ID = 'battle-pause-title';
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]);
}

function assertPauseAction(action) {
  if (typeof action !== 'string' || !Object.hasOwn(CONFIRM_COPY, action)) {
    throw new Error(`Unknown pause action: ${String(action)}`);
  }
}

export function pauseConfirmCopy(action) {
  assertPauseAction(action);
  return { ...CONFIRM_COPY[action] };
}

function menuMarkup() {
  return `<div class="battle-pause-overlay" role="dialog" aria-modal="true" aria-labelledby="${TITLE_ID}">
    <div class="battle-pause-dialog">
      <h2 id="${TITLE_ID}">遊戲暫停</h2>
      <div class="battle-pause-actions">
        <button type="button" data-pause-continue>繼續遊戲</button>
        <button type="button" data-pause-action="${escapeHtml(PAUSE_ACTIONS.restart)}">重新開始本局</button>
        <button type="button" data-pause-action="${escapeHtml(PAUSE_ACTIONS.catalog)}">更換題庫</button>
        <button type="button" data-pause-action="${escapeHtml(PAUSE_ACTIONS.home)}">返回首頁</button>
      </div>
    </div>
  </div>`;
}

function confirmationMarkup(action) {
  const copy = pauseConfirmCopy(action);
  const dangerClass = action === PAUSE_ACTIONS.home ? ' pause-danger' : '';
  return `<div class="battle-pause-overlay" role="dialog" aria-modal="true" aria-labelledby="${TITLE_ID}">
    <div class="battle-pause-dialog">
      <h2 id="${TITLE_ID}">${escapeHtml(copy.title)}</h2>
      <p>${escapeHtml(copy.message)}</p>
      <div class="battle-pause-actions">
        <button type="button" data-pause-cancel>取消</button>
        <button type="button" class="primary${dangerClass}" data-pause-confirm>${escapeHtml(copy.confirmLabel)}</button>
      </div>
    </div>
  </div>`;
}

export function buildBattlePauseMenu({ confirmAction = null } = {}) {
  if (confirmAction === null) return menuMarkup();
  return confirmationMarkup(confirmAction);
}

function isFocusable(element) {
  return element && !element.disabled && element.getAttribute?.('aria-hidden') !== 'true';
}

export function trapDialogTab(dialog, event) {
  if (!dialog || event?.key !== 'Tab' || typeof dialog.querySelectorAll !== 'function') return false;
  const focusable = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isFocusable);
  if (focusable.length === 0) return false;
  const activeElement = dialog.ownerDocument?.activeElement ?? event.target;
  const first = focusable[0];
  const last = focusable.at(-1);
  const shouldWrapBackward = event.shiftKey && activeElement === first;
  const shouldWrapForward = !event.shiftKey && activeElement === last;
  if (!shouldWrapBackward && !shouldWrapForward) return false;
  event.preventDefault();
  (shouldWrapBackward ? last : first).focus?.();
  return true;
}
