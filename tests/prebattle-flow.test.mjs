import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCharacterActions, buildCharacterActions, createStartGate, isKeyTestComplete, recordKeyTestKey } from '../web/js/prebattle-flow.mjs';

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

test('單人選角只要求玩家角色完成', () => {
  assert.doesNotMatch(buildCharacterActions(true), /disabled/);
});

test('單人鍵盤測試忽略右方按鍵，不增加計數也不解鎖', () => {
  const needed = ['KeyW', 'KeyX'];
  const afterRightPlayerKey = recordKeyTestKey(new Set(), needed, 'ArrowUp');

  assert.equal(afterRightPlayerKey.size, 0);
  assert.equal(isKeyTestComplete(afterRightPlayerKey, needed), false);

  const afterLeftPlayerKeys = recordKeyTestKey(recordKeyTestKey(afterRightPlayerKey, needed, 'KeyW'), needed, 'KeyX');
  assert.equal(afterLeftPlayerKeys.size, 2);
  assert.equal(isKeyTestComplete(afterLeftPlayerKeys, needed), true);
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

test('快速重複開始只執行一次非同步初始化', async () => {
  let starts = 0;
  let finishStart;
  const pending = new Promise(resolve => { finishStart = resolve; });
  const startOnce = createStartGate(async () => {
    starts += 1;
    await pending;
  });

  const first = startOnce();
  const second = startOnce();
  assert.equal(starts, 1);
  assert.equal(await second, false);
  finishStart();
  assert.equal(await first, true);
  assert.equal(await startOnce(), true);
  assert.equal(starts, 2);
});

test('開局初始化失敗後允許再次嘗試', async () => {
  let starts = 0;
  const startOnce = createStartGate(async () => {
    starts += 1;
    if (starts === 1) throw new Error('audio failed');
  });

  await assert.rejects(startOnce(), /audio failed/);
  assert.equal(await startOnce(), true);
  assert.equal(starts, 2);
});
