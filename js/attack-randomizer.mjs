export const ATTACK_TYPES = ['energy', 'punch', 'kick'];

function createBag(random) {
  const bag = [...ATTACK_TYPES];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [bag[index], bag[target]] = [bag[target], bag[index]];
  }
  return bag;
}

export function createAttackState(random = Math.random) {
  return { left: createBag(random), right: createBag(random) };
}

export function drawAttack(state, player, random = Math.random) {
  const bag = state[player].length > 0 ? state[player] : createBag(random);
  const [attackType, ...remaining] = bag;
  return { attackType, state: { ...state, [player]: remaining } };
}
