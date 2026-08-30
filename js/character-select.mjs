const PLAYERS = new Set(['left', 'right']);

export function createCharacterSelection() {
  return { left: null, right: null };
}

export function selectCharacter(state, player, character) {
  assertPlayer(player);

  const { id, playable } = normalizeCharacter(character);
  if (!playable) {
    throw new Error('角色目前無法使用');
  }

  const opponent = player === 'left' ? 'right' : 'left';
  if (state[opponent] === id) {
    throw new Error('角色已被選擇');
  }

  return { ...state, [player]: id };
}

export function clearCharacterSelection(state, player) {
  assertPlayer(player);
  return { ...state, [player]: null };
}

function assertPlayer(player) {
  if (!PLAYERS.has(player)) {
    throw new Error('未知的玩家');
  }
}

function normalizeCharacter(character) {
  if (typeof character === 'string') {
    return { id: character, playable: true };
  }

  if (character && typeof character === 'object') {
    return { id: String(character.id), playable: character.playable === true };
  }

  throw new Error('角色資料無效');
}
