export const PLAYER_KEYS = {
  left: {
    navigation: ['KeyW', 'KeyX', 'KeyA', 'KeyD'],
    answers: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  },
  right: {
    navigation: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
    answers: ['Digit0', 'Minus', 'Equal', 'Backslash'],
  },
};

export function getAnswerInput(code) {
  for (const [player, keys] of Object.entries(PLAYER_KEYS)) {
    const answerIndex = keys.answers.indexOf(code);
    if (answerIndex >= 0) return { player, answerIndex };
  }
  return null;
}

export function isGameKey(code) {
  return Object.values(PLAYER_KEYS).some(keys => [...keys.navigation, ...keys.answers].includes(code));
}
