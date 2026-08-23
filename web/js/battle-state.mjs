import { BATTLE_CONFIG } from './battle-config.mjs';

const PLAYERS = ['left', 'right'];

function opponentOf(player) {
  if (!PLAYERS.includes(player)) throw new TypeError(`未知玩家：${player}`);
  return player === 'left' ? 'right' : 'left';
}

export function createBattleState() {
  return {
    health: { left: BATTLE_CONFIG.maxHealth, right: BATTLE_CONFIG.maxHealth },
    scores: { left: 0, right: 0 },
    phase: 'regulation',
    animation: null,
    ended: false,
    endReason: null,
    winner: null,
  };
}

export function applyCorrectAnswer(state, player) {
  if (state.ended) return state;

  const opponent = opponentOf(player);
  const opponentHealth = Math.max(0, state.health[opponent] - BATTLE_CONFIG.damage);
  const suddenDeathWin = state.phase === 'sudden-death';
  const ko = opponentHealth === 0;
  const ended = suddenDeathWin || ko;

  return {
    ...state,
    health: { ...state.health, [opponent]: opponentHealth },
    scores: { ...state.scores, [player]: state.scores[player] + 1 },
    phase: ended ? 'ended' : state.phase,
    animation: { type: 'attack', player, opponent },
    ended,
    endReason: suddenDeathWin ? 'sudden-death' : ko ? 'ko' : null,
    winner: ended ? player : null,
  };
}

export function applyWrongAnswer(state, player) {
  if (state.ended) return state;

  const opponent = opponentOf(player);
  return {
    ...state,
    health: { ...state.health },
    scores: { ...state.scores },
    animation: { type: 'miss', player, opponent },
  };
}

export function finishRegulation(state) {
  if (state.ended || state.phase !== 'regulation') return state;

  if (state.scores.left === state.scores.right) {
    return {
      ...state,
      phase: 'sudden-death',
      animation: null,
      ended: false,
      endReason: null,
      winner: null,
    };
  }

  return {
    ...state,
    phase: 'ended',
    animation: null,
    ended: true,
    endReason: 'score',
    winner: state.scores.left > state.scores.right ? 'left' : 'right',
  };
}
