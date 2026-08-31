import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_CANVAS, calculateBattleScale } from '../web/js/battle-viewport.mjs';

test('以完整 16:9 畫布可放入範圍的較小比例縮放', () => {
  assert.deepEqual(BATTLE_CANVAS, { width: 1280, height: 720 });
  assert.equal(calculateBattleScale({ width: 844, height: 390 }), 390 / 720);
  assert.equal(calculateBattleScale({ width: 1024, height: 768 }), 1024 / 1280);
});
