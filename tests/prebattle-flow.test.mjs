import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCharacterActions, buildCharacterActions } from '../web/js/prebattle-flow.mjs';

test('選角完成後提供測試鍵盤與略過測試兩條入口', () => {
  const html = buildCharacterActions(true);
  assert.match(html, /id="test-keys"[^>]*>測試鍵盤/);
  assert.match(html, /id="skip-key-test"[^>]*>略過測試，直接開始/);
  assert.doesNotMatch(html, /id="test-keys"[^>]*disabled/);
  assert.doesNotMatch(html, /id="skip-key-test"[^>]*disabled/);
});

test('角色未選齊時停用兩個開始入口', () => {
  const html = buildCharacterActions(false);
  assert.match(html, /id="test-keys"[^>]*disabled/);
  assert.match(html, /id="skip-key-test"[^>]*disabled/);
});

test('兩個入口分別觸發測試與略過回呼', () => {
  const buttons = Object.fromEntries(['#back', '#test-keys', '#skip-key-test'].map(id => [id, {}]));
  const calls = [];
  bindCharacterActions({ querySelector: selector => buttons[selector] }, {
    onBack: () => calls.push('back'),
    onTest: () => calls.push('test'),
    onSkip: () => calls.push('skip'),
  });
  buttons['#test-keys'].onclick();
  buttons['#skip-key-test'].onclick();
  assert.deepEqual(calls, ['test', 'skip']);
});
