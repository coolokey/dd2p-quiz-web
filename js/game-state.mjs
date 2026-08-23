export function createGameState({ mode, limit }) {
  return {
    mode,
    limit,
    phase: 'open',
    questionIndex: 0,
    scores: { left: 0, right: 0 },
    eligiblePlayers: ['left', 'right'],
    lockedPlayer: null,
    ended: false,
  };
}

export function claimAnswer(state, player) {
  if (state.ended || state.phase !== 'open' || !state.eligiblePlayers.includes(player)) return state;
  return { ...state, phase: 'locked', lockedPlayer: player };
}

export function submitAnswer(state, player, answerIndex, correctAnswerIndex) {
  if (state.ended || state.phase !== 'locked' || state.lockedPlayer !== player) return state;
  if (answerIndex === correctAnswerIndex) {
    const nextQuestion = state.questionIndex + 1;
    const ended = state.mode === 'questions' && nextQuestion >= state.limit;
    return {
      ...state,
      scores: { ...state.scores, [player]: state.scores[player] + 1 },
      questionIndex: nextQuestion,
      phase: ended ? 'ended' : 'open',
      eligiblePlayers: ended ? [] : ['left', 'right'],
      lockedPlayer: null,
      ended,
    };
  }
  const eligiblePlayers = state.eligiblePlayers.filter(candidate => candidate !== player);
  if (eligiblePlayers.length === 0) {
    const nextQuestion = state.questionIndex + 1;
    const ended = state.mode === 'questions' && nextQuestion >= state.limit;
    return { ...state, questionIndex: nextQuestion, phase: ended ? 'ended' : 'open', eligiblePlayers: ended ? [] : ['left', 'right'], lockedPlayer: null, ended };
  }
  return { ...state, phase: 'open', eligiblePlayers, lockedPlayer: null };
}

export function submitBuzzerAnswer(state, player, answerIndex, correctAnswerIndex) {
  return submitAnswer(claimAnswer(state, player), player, answerIndex, correctAnswerIndex);
}

export function endGame(state) {
  return { ...state, phase: 'ended', eligiblePlayers: [], lockedPlayer: null, ended: true };
}
