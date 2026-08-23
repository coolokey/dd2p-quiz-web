import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCharacterSelection,
  createCharacterSelection,
  selectCharacter,
} from '../web/js/character-select.mjs';

test('creates an empty selection for both players', () => {
  assert.deepEqual(createCharacterSelection(), { left: null, right: null });
});

test('prevents both players from selecting the same character', () => {
  let selection = createCharacterSelection();
  selection = selectCharacter(selection, 'left', '3');

  assert.throws(
    () => selectCharacter(selection, 'right', '3'),
    /角色已被選擇/,
  );
});

test('allows players to choose two different playable characters', () => {
  let selection = selectCharacter(createCharacterSelection(), 'left', {
    id: '3',
    playable: true,
  });
  selection = selectCharacter(selection, 'right', {
    id: '8',
    playable: true,
  });

  assert.deepEqual(selection, { left: '3', right: '8' });
});

test('rejects an unplayable character', () => {
  assert.throws(
    () => selectCharacter(createCharacterSelection(), 'left', {
      id: '4',
      playable: false,
    }),
    /角色目前無法使用/,
  );
});

test('allows a player to change to an unclaimed playable character', () => {
  let selection = selectCharacter(createCharacterSelection(), 'left', '3');
  selection = selectCharacter(selection, 'right', '8');
  selection = selectCharacter(selection, 'left', '6');

  assert.deepEqual(selection, { left: '6', right: '8' });
});

test('clears one player selection without changing the opponent', () => {
  let selection = selectCharacter(createCharacterSelection(), 'left', '3');
  selection = selectCharacter(selection, 'right', '8');

  assert.deepEqual(clearCharacterSelection(selection, 'left'), {
    left: null,
    right: '8',
  });
});

test('cannot change to the opponent selected character', () => {
  let selection = selectCharacter(createCharacterSelection(), 'left', '3');
  selection = selectCharacter(selection, 'right', '8');

  assert.throws(
    () => selectCharacter(selection, 'left', '8'),
    /角色已被選擇/,
  );
});
