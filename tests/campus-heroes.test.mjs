import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CAMPUS_HEROES, CAMPUS_SCENES, HERO_CANVAS } from '../web/js/campus-heroes.mjs';

async function pngSize(filePath) {
  const data = await readFile(filePath);
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

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

test('campus roster balances genders and has a distinct art brief per hero', () => {
  assert.deepEqual(
    CAMPUS_HEROES.map(hero => hero.gender).sort(),
    ['female', 'female', 'female', 'female', 'female', 'female', 'male', 'male', 'male', 'male', 'male', 'male'],
  );
  assert.equal(new Set(CAMPUS_HEROES.map(hero => hero.artBrief)).size, 12);
});

test('campus arenas define gate, track, basketball court and classroom', () => {
  assert.deepEqual(
    CAMPUS_SCENES.map(scene => scene.id),
    ['daxi-gate', 'track', 'basketball-court', 'classroom'],
  );
  assert.deepEqual(HERO_CANVAS, { width: 1024, height: 1024, baseline: 900 });
});

test('campus arena artwork exists as wide PNG files', async () => {
  for (const scene of CAMPUS_SCENES) {
    const filePath = path.resolve('web', scene.image.replace(/^\.\//, ''));
    await access(filePath);
    const { width, height } = await pngSize(filePath);
    assert.ok(width >= 1280, `${scene.id} should be high resolution`);
    assert.equal(width * 9, height * 16, `${scene.id} should be 16:9`);
  }
});

test('every campus hero has a same-canvas idle and attack sprite', async () => {
  for (const hero of CAMPUS_HEROES) {
    for (const pose of ['idle', 'attack']) {
      const filePath = path.resolve('web', 'assets', 'battle', 'campus-heroes', hero.id, `${pose}.svg`);
      await access(filePath);
      const svg = await readFile(filePath, 'utf8');
      assert.match(svg, new RegExp(`viewBox=\\"0 0 ${HERO_CANVAS.width} ${HERO_CANVAS.height}\\"`));
      assert.match(svg, /stroke-linecap="round"/);
    }
  }
});
