import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPUS_HEROES, CAMPUS_SCENES, HERO_CANVAS } from '../web/js/campus-heroes.mjs';

test('campus roster has twelve original human heroes', () => {
  assert.equal(CAMPUS_HEROES.length, 12);
  assert.equal(new Set(CAMPUS_HEROES.map(hero => hero.id)).size, 12);
  for (const hero of CAMPUS_HEROES) {
    assert.equal(hero.kind, 'human');
    assert.match(hero.name, /.+/);
    assert.deepEqual(Object.keys(hero.attacks), ['energy', 'punch', 'kick']);
    assert.equal(new Set(Object.values(hero.attacks).map(attack => attack.callout)).size, 3);
    assert.doesNotMatch(JSON.stringify(hero), /七龍珠|火影|航海王|灌籃高手|動物|怪獸|獸人/);
  }
});

test('campus arenas define gate, track, basketball court and classroom', () => {
  assert.deepEqual(
    CAMPUS_SCENES.map(scene => scene.id),
    ['daxi-gate', 'track', 'basketball-court', 'classroom'],
  );
  assert.deepEqual(HERO_CANVAS, { width: 1024, height: 1024, baseline: 900 });
});
