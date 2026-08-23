import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackState, drawAttack } from '../web/js/attack-randomizer.mjs';

test('每輪三次攻擊包含氣功出拳出腳各一次', () => {
  let state = createAttackState(() => 0);
  const attacks = [];
  for (let index = 0; index < 3; index += 1) {
    const result = drawAttack(state, 'left', () => 0);
    state = result.state;
    attacks.push(result.attackType);
  }
  assert.deepEqual(new Set(attacks), new Set(['energy', 'punch', 'kick']));
});

test('左右玩家的攻擊袋互不消耗', () => {
  const initial = createAttackState(() => 0);
  const result = drawAttack(initial, 'left', () => 0);
  assert.equal(result.state.left.length, 2);
  assert.equal(result.state.right.length, 3);
});

test('第四次攻擊會建立新一輪隨機袋', () => {
  let state = createAttackState(() => 0);
  for (let index = 0; index < 3; index += 1) state = drawAttack(state, 'left', () => 0).state;
  const fourth = drawAttack(state, 'left', () => 0);
  assert.ok(['energy', 'punch', 'kick'].includes(fourth.attackType));
  assert.equal(fourth.state.left.length, 2);
});
