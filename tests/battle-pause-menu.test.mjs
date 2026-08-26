import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAUSE_ACTIONS,
  buildBattlePauseMenu,
  pauseConfirmCopy,
  trapDialogTab,
} from '../web/js/battle-pause-menu.mjs';

test('暫停 action 使用固定且不可變更的值', () => {
  assert.deepEqual(PAUSE_ACTIONS, { restart: 'restart', catalog: 'catalog', home: 'home' });
  assert.equal(Object.isFrozen(PAUSE_ACTIONS), true);
});

test('沒有確認 action 時依序顯示四個暫停按鈕', () => {
  const html = buildBattlePauseMenu();
  const labels = [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1]);
  assert.deepEqual(labels, ['繼續遊戲', '重新開始本局', '更換題庫', '返回首頁']);
  assert.match(html, /data-pause-continue/);
  assert.equal((html.match(/data-pause-action=/g) ?? []).length, 3);
});

test('暫停遮罩具備 dialog 語意並以 aria-labelledby 指向標題', () => {
  const html = buildBattlePauseMenu();
  const dialog = html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? '';
  const labelledBy = dialog.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.match(dialog, /aria-modal="true"/);
  assert.ok(labelledBy);
  assert.match(html, new RegExp(`<[^>]+id="${labelledBy}"[^>]*>`));
});

test('三種離場 action 顯示精確確認文案', () => {
  const expected = {
    restart: ['重新開始本局？', '目前分數、血量與題目進度將歸零。'],
    catalog: ['更換題庫？', '目前對戰進度將不會保留，將返回題庫選單。'],
    home: ['返回首頁？', '目前對戰進度將不會保留，將返回模式選擇首頁。'],
  };
  for (const action of Object.values(PAUSE_ACTIONS)) {
    const copy = pauseConfirmCopy(action);
    assert.deepEqual([copy.title, copy.message], expected[action]);
    const html = buildBattlePauseMenu({ confirmAction: action });
    assert.match(html, new RegExp(copy.message));
  }
});

test('確認畫面只有取消及清楚命名的確認按鈕，首頁確認使用危險樣式', () => {
  const html = buildBattlePauseMenu({ confirmAction: PAUSE_ACTIONS.home });
  const buttons = [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1]);
  assert.deepEqual(buttons, ['取消', '確認返回首頁']);
  assert.match(html, /data-pause-cancel/);
  assert.match(html, /data-pause-confirm/);
  assert.match(html, /class="[^"]*pause-danger[^"]*"[^>]*data-pause-confirm/);
  assert.doesNotMatch(html, /data-pause-continue|data-pause-action=/);
});

test('未知 action 會拋出可診斷錯誤且不產生離場 markup', () => {
  assert.throws(
    () => buildBattlePauseMenu({ confirmAction: '<img src=x onerror=alert(1)>' }),
    /Unknown pause action.*img|未知.*action.*img/i,
  );
  assert.throws(() => pauseConfirmCopy('leave-everything'), /Unknown pause action|未知.*action/i);
});

test('固定文案不會把外部 action 當作 HTML 注入', () => {
  for (const action of Object.values(PAUSE_ACTIONS)) {
    const html = buildBattlePauseMenu({ confirmAction: action });
    assert.doesNotMatch(html, /<script|onerror=|javascript:/i);
    assert.doesNotMatch(html, new RegExp(`data-pause-confirm="?${action}`));
  }
});

function makeDialog(activeElement, elements) {
  return {
    querySelectorAll: selector => selector === 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ? elements
      : [],
    ownerDocument: { activeElement },
  };
}

test('第一個可操作元素按 Shift+Tab 時跳至最後一個', () => {
  const focused = [];
  const first = { focus: () => focused.push('first') };
  const last = { focus: () => focused.push('last') };
  const event = { key: 'Tab', shiftKey: true, preventDefault: () => focused.push('prevented') };
  assert.equal(trapDialogTab(makeDialog(first, [first, last]), event), true);
  assert.deepEqual(focused, ['prevented', 'last']);
});

test('最後一個可操作元素按 Tab 時跳至第一個', () => {
  const focused = [];
  const first = { focus: () => focused.push('first') };
  const last = { focus: () => focused.push('last') };
  const event = { key: 'Tab', shiftKey: false, preventDefault: () => focused.push('prevented') };
  assert.equal(trapDialogTab(makeDialog(last, [first, last]), event), true);
  assert.deepEqual(focused, ['prevented', 'first']);
});

test('非 Tab 或中間元素不攔截焦點', () => {
  const first = { focus: () => {} };
  const middle = { focus: () => {} };
  const last = { focus: () => {} };
  let prevented = 0;
  const dialog = makeDialog(middle, [first, middle, last]);
  assert.equal(trapDialogTab(dialog, { key: 'Enter', shiftKey: false, preventDefault: () => { prevented += 1; } }), false);
  assert.equal(trapDialogTab(dialog, { key: 'Tab', shiftKey: false, preventDefault: () => { prevented += 1; } }), false);
  assert.equal(prevented, 0);
});
