import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_MODES,
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
