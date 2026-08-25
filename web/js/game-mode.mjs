export const GAME_MODES = Object.freeze({ solo: 'solo', local: 'local' });

export function requiredCharacterPlayers(mode) {
  return mode === GAME_MODES.solo ? ['left'] : ['left', 'right'];
}

export function playersForKeyTest(mode) {
  return requiredCharacterPlayers(mode);
}

export function selectCpuCharacter(characters, playerCharacterId, random = Math.random) {
  const available = characters.filter(character =>
    character.playable !== false && String(character.id) !== String(playerCharacterId));
  if (available.length === 0) throw new Error('沒有可供電腦選擇的角色，請重新選角');
  return available[Math.floor(random() * available.length)];
}
