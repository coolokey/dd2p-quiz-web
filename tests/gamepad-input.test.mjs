import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGamepadState,
  getConnectedGamepads,
  mapGamepadButtonToEvent,
  pollGamepadEvents,
} from '../web/js/gamepad-input.mjs';

test('getConnectedGamepads 過濾無效項與 null', () => {
  const mockPads = [
    { id: 'USB Gamepad 1', index: 0, buttons: [] },
    null,
    { id: 'USB Gamepad 2', index: 1, buttons: [] },
  ];
  const connected = getConnectedGamepads(() => mockPads);
  assert.equal(connected.length, 2);
  assert.equal(connected[0].id, 'USB Gamepad 1');
  assert.equal(connected[1].id, 'USB Gamepad 2');
});

test('mapGamepadButtonToEvent 正確解析左右玩家的物理印刷按鈕對應', () => {
  // 左方紅隊 (Player 1)
  // Button 3 (Top / 上) -> 印刷 1 -> 選項 1 (answerIndex 0, Digit1)
  assert.deepEqual(mapGamepadButtonToEvent('left', 3), {
    player: 'left',
    type: 'answer',
    answerIndex: 0,
    code: 'Digit1',
  });
  // Button 1 (Right / 右) -> 印刷 2 -> 選項 2 (answerIndex 1, Digit2)
  assert.deepEqual(mapGamepadButtonToEvent('left', 1), {
    player: 'left',
    type: 'answer',
    answerIndex: 1,
    code: 'Digit2',
  });
  // Button 0 (Bottom / 下) -> 印刷 3 -> 選項 3 (answerIndex 2, Digit3)
  assert.deepEqual(mapGamepadButtonToEvent('left', 0), {
    player: 'left',
    type: 'answer',
    answerIndex: 2,
    code: 'Digit3',
  });
  // Button 2 (Left / 左) -> 印刷 4 -> 選項 4 (answerIndex 3, Digit4)
  assert.deepEqual(mapGamepadButtonToEvent('left', 2), {
    player: 'left',
    type: 'answer',
    answerIndex: 3,
    code: 'Digit4',
  });
  assert.deepEqual(mapGamepadButtonToEvent('left', 9), {
    player: 'left',
    type: 'start',
  });
  assert.deepEqual(mapGamepadButtonToEvent('left', 12), {
    player: 'left',
    type: 'navigation',
    direction: 'up',
    code: 'KeyW',
  });

  // 右方藍隊 (Player 2)
  // Button 3 (Top / 上) -> 印刷 1 -> 選項 1 (answerIndex 0, Digit0)
  assert.deepEqual(mapGamepadButtonToEvent('right', 3), {
    player: 'right',
    type: 'answer',
    answerIndex: 0,
    code: 'Digit0',
  });
  // Button 2 (Left / 左) -> 印刷 4 -> 選項 4 (answerIndex 3, Backslash)
  assert.deepEqual(mapGamepadButtonToEvent('right', 2), {
    player: 'right',
    type: 'answer',
    answerIndex: 3,
    code: 'Backslash',
  });
  assert.deepEqual(mapGamepadButtonToEvent('right', 13), {
    player: 'right',
    type: 'navigation',
    direction: 'down',
    code: 'ArrowDown',
  });
});

test('pollGamepadEvents 具備按鍵邊緣觸發（Edge Trigger），防止連續觸發', () => {
  const state = createGamepadState();

  const mockPadPressed = [
    {
      index: 0,
      buttons: [
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: true, value: 1.0 }, // Button 3 (Top / 印刷 1) pressed
      ],
      axes: [0, 0],
    },
  ];

  // 第一次輪詢：應偵測到按下事件 (按鍵 1 -> answerIndex 0)
  const events1 = pollGamepadEvents(state, () => mockPadPressed);
  assert.equal(events1.length, 1);
  assert.equal(events1[0].player, 'left');
  assert.equal(events1[0].answerIndex, 0);

  // 第二次輪詢（按住不放）：不應再產生新事件
  const events2 = pollGamepadEvents(state, () => mockPadPressed);
  assert.equal(events2.length, 0);

  // 放開按鍵
  const mockPadReleased = [
    {
      index: 0,
      buttons: [
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
      ],
      axes: [0, 0],
    },
  ];
  pollGamepadEvents(state, () => mockPadReleased);

  // 再次按下按鍵：應再次產生新事件
  const events3 = pollGamepadEvents(state, () => mockPadPressed);
  assert.equal(events3.length, 1);
  assert.equal(events3[0].answerIndex, 0);
});

test('pollGamepadEvents 支援 1P 與 2P 雙搖桿獨立輪詢', () => {
  const state = createGamepadState();

  const mockTwoPads = [
    {
      index: 0,
      buttons: [
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: true, value: 1.0 }, // 1P Button 3 (Top / 印刷 1) -> Digit1
      ],
      axes: [0, 0],
    },
    {
      index: 1,
      buttons: [
        { pressed: false, value: 0 },
        { pressed: true, value: 1.0 }, // 2P Button 1 (Right / 印刷 2) -> Minus
      ],
      axes: [0, 0],
    },
  ];

  const events = pollGamepadEvents(state, () => mockTwoPads);
  assert.equal(events.length, 2);

  assert.deepEqual(events[0], {
    player: 'left',
    type: 'answer',
    answerIndex: 0,
    code: 'Digit1',
  });

  assert.deepEqual(events[1], {
    player: 'right',
    type: 'answer',
    answerIndex: 1,
    code: 'Minus',
  });
});
