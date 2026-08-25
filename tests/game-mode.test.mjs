import test from 'node:test';
import assert from 'node:assert/strict';
import {
  battleStatus,
  GAME_MODES,
  getCharacterSelectionReadiness,
  playersForKeyTest,
  requiredCharacterPlayers,
  selectCpuCharacter,
} from '../web/js/game-mode.mjs';

test('單人只要求左方角色與左方按鍵', () => {
  assert.deepEqual(requiredCharacterPlayers(GAME_MODES.solo), ['left']);
  assert.deepEqual(playersForKeyTest(GAME_MODES.solo), ['left']);
});

test('本機雙人要求左右角色與雙方按鍵', () => {
  assert.deepEqual(requiredCharacterPlayers(GAME_MODES.local), ['left', 'right']);
  assert.deepEqual(playersForKeyTest(GAME_MODES.local), ['left', 'right']);
});

test('CPU 從玩家未選的可玩角色中依亂數選角', () => {
  const characters = [
    { id: '1', playable: true },
    { id: '2', playable: true },
    { id: '3', playable: false },
  ];
  assert.equal(selectCpuCharacter(characters, '1', () => 0).id, '2');
  assert.throws(() => selectCpuCharacter([{ id: '1', playable: true }], '1'), /沒有可供電腦選擇/);
});

test('單人模式必須有未被玩家選取的 CPU 可用角色', () => {
  const onlyPlayer = [{ id: '1', playable: true }];
  assert.deepEqual(
    getCharacterSelectionReadiness(GAME_MODES.solo, { left: '1', right: null }, onlyPlayer),
    { ready: false, message: '沒有可供 CPU 選擇的其他角色，請增加可用角色。' },
  );
  assert.deepEqual(
    getCharacterSelectionReadiness(GAME_MODES.solo, { left: '1', right: null }, [...onlyPlayer, { id: '2', playable: false }]),
    { ready: false, message: '沒有可供 CPU 選擇的其他角色，請增加可用角色。' },
  );
  assert.deepEqual(
    getCharacterSelectionReadiness(GAME_MODES.solo, { left: '1', right: null }, [...onlyPlayer, { id: '2', playable: true }]),
    { ready: true, message: '' },
  );
});

test('對戰狀態文字會區分玩家對 CPU 與本機雙人', () => {
  assert.match(battleStatus(GAME_MODES.solo, ['left', 'right'], 'regulation'), /玩家與 CPU 請搶答/);
  assert.doesNotMatch(battleStatus(GAME_MODES.solo, ['left', 'right'], 'regulation'), /兩位玩家/);
  assert.match(battleStatus(GAME_MODES.local, ['left', 'right'], 'regulation'), /兩位玩家請搶答/);
});
