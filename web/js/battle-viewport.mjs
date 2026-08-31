export const BATTLE_CANVAS = Object.freeze({ width: 1280, height: 720 });

export function calculateBattleScale({ width, height }, canvas = BATTLE_CANVAS) {
  return Math.min(width / canvas.width, height / canvas.height);
}
