import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerInputFromTouchTarget,
  bindMobileAnswerControls,
  buildMobileAnswerControls,
  setMobileAnswerControlsLocked,
} from '../web/js/mobile-controls.mjs';

test('單人模式四選項只建立左方答案鍵', () => {
  const solo = buildMobileAnswerControls({ gameMode: 'solo', choiceCount: 4, eligiblePlayers: ['left'] });
  assert.equal((solo.match(/data-touch-answer/g) ?? []).length, 4);
  assert.doesNotMatch(solo, /data-player="right"/);
  assert.match(solo, /type="button"/);
});

test('本機雙人三選項建立左右兩組答案鍵', () => {
  const local = buildMobileAnswerControls({ gameMode: 'local', choiceCount: 3, eligiblePlayers: ['left', 'right'] });
  assert.equal((local.match(/data-touch-answer/g) ?? []).length, 6);
});

test('觸控目標轉成與鍵盤相同的答案輸入', () => {
  const target = { dataset: { touchAnswer: '2', player: 'right' } };
  assert.deepEqual(answerInputFromTouchTarget(target), { player: 'right', answerIndex: 2 });
  assert.equal(answerInputFromTouchTarget({ dataset: { touchAnswer: '2.5', player: 'right' } }), null);
  assert.equal(answerInputFromTouchTarget({ dataset: { touchAnswer: '4', player: 'left' } }), null);
});

test('全域鎖定時本機雙人兩選項全部 disabled', () => {
  const html = buildMobileAnswerControls({ gameMode: 'local', choiceCount: 2, eligiblePlayers: ['left'], locked: true });
  assert.equal((html.match(/ disabled/g) ?? []).length, 4);
});

test('選項數量限制在零到四', () => {
  assert.equal((buildMobileAnswerControls({ gameMode: 'solo', choiceCount: 8, eligiblePlayers: ['left'] }).match(/data-touch-answer/g) ?? []).length, 4);
  assert.equal((buildMobileAnswerControls({ gameMode: 'solo', choiceCount: -2, eligiblePlayers: ['left'] }).match(/data-touch-answer/g) ?? []).length, 0);
});

test('同一觸點不重複提交但兩位玩家可同時觸碰', () => {
  const left = { disabled: false, dataset: { touchAnswer: '0', player: 'left' } };
  const right = { disabled: false, dataset: { touchAnswer: '1', player: 'right' } };
  const root = { querySelectorAll: () => [left, right] };
  const answers = [];
  let prevented = 0;
  bindMobileAnswerControls(root, { onAnswer: input => answers.push(input) });
  const event1 = { pointerId: 11, preventDefault: () => { prevented += 1; } };
  left.onpointerdown(event1);
  left.onpointerdown(event1);
  right.onpointerdown({ pointerId: 22, preventDefault: () => { prevented += 1; } });
  assert.deepEqual(answers, [{ player: 'left', answerIndex: 0 }, { player: 'right', answerIndex: 1 }]);
  assert.equal(prevented, 3);
  left.onpointerup(event1);
  left.onpointerdown(event1);
  assert.equal(answers.length, 3);
});

test('鎖定 helper 同步停用全部觸控鍵', () => {
  const buttons = [{ disabled: false }, { disabled: false }];
  setMobileAnswerControlsLocked({ querySelectorAll: () => buttons }, true);
  assert.deepEqual(buttons.map(button => button.disabled), [true, true]);
});
