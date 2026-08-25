export const GAME_MODES = Object.freeze({ solo: 'solo', local: 'local' });

export function requiredCharacterPlayers(mode) {
  return mode === GAME_MODES.solo ? ['left'] : ['left', 'right'];
}

export function playersForKeyTest(mode) {
  return requiredCharacterPlayers(mode);
}

function availableCpuCharacters(characters, playerCharacterId) {
  return characters.filter(character =>
    character.playable !== false && String(character.id) !== String(playerCharacterId));
}

export function getCharacterSelectionReadiness(mode, selections, characters) {
  const missingPlayer = requiredCharacterPlayers(mode).find(player => !selections[player]);
  if (missingPlayer) return { ready: false, message: '請先完成必要的角色選擇。' };
  if (mode === GAME_MODES.solo && availableCpuCharacters(characters, selections.left).length === 0) {
    return { ready: false, message: '沒有可供 CPU 選擇的其他角色，請增加可用角色。' };
  }
  return { ready: true, message: '' };
}

export function selectCpuCharacter(characters, playerCharacterId, random = Math.random) {
  const available = availableCpuCharacters(characters, playerCharacterId);
  if (available.length === 0) throw new Error('沒有可供電腦選擇的角色，請重新選角');
  return available[Math.floor(random() * available.length)];
}

export function battleStatus(mode, eligiblePlayers, phase) {
  if (phase === 'sudden-death') return '驟死決勝：第一位答對者立即獲勝！';
  if (eligiblePlayers.length === 1) {
    const player = eligiblePlayers[0];
    const name = mode === GAME_MODES.solo
      ? (player === 'left' ? '玩家紅隊' : 'CPU 藍隊')
      : (player === 'left' ? '左方紅隊' : '右方藍隊');
    return `${name}可作答`;
  }
  const prompt = mode === GAME_MODES.solo ? '玩家與 CPU 請搶答' : '兩位玩家請搶答';
  return `${prompt}　｜　答對攻擊 −10 HP，答錯交給對手`;
}
