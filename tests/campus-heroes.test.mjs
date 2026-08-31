import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { CAMPUS_HEROES, CAMPUS_SCENES, HERO_CANVAS } from '../web/js/campus-heroes.mjs';

function pngMetadata(data) {
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bitDepth: data[24],
    colorType: data[25],
  };
}

function decodeRgba(data) {
  const { width, height, bitDepth, colorType } = pngMetadata(data);
  assert.equal(bitDepth, 8, 'sprites must use 8-bit channels');
  assert.equal(colorType, 6, 'sprites must use RGBA colour type');
  assert.equal(data[28], 0, 'interlaced PNGs are not supported');

  const idat = [];
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(data.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const encoded = inflateSync(Buffer.concat(idat));
  const scanlines = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = encoded[y * (stride + 1)];
    const sourceOffset = y * (stride + 1) + 1;
    const targetOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = encoded[sourceOffset + x];
      const left = x >= bytesPerPixel ? scanlines[targetOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? scanlines[targetOffset + x - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? scanlines[targetOffset + x - stride - bytesPerPixel] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const distances = [Math.abs(estimate - left), Math.abs(estimate - above), Math.abs(estimate - upperLeft)];
        value = raw + (distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? above : upperLeft);
      } else {
        assert.fail(`unsupported PNG filter ${filter}`);
      }
      scanlines[targetOffset + x] = value & 0xff;
    }
  }

  return { width, height, stride, scanlines };
}

function alphaAt(decoded, x, y) {
  return decoded.scanlines[y * decoded.stride + x * 4 + 3];
}

function hasTransparentBorder(decoded) {
  const { width, height } = decoded;
  for (let x = 0; x < width; x += 1) {
    if (alphaAt(decoded, x, 0) !== 0 || alphaAt(decoded, x, height - 1) !== 0) return false;
  }
  for (let y = 0; y < height; y += 1) {
    if (alphaAt(decoded, 0, y) !== 0 || alphaAt(decoded, width - 1, y) !== 0) return false;
  }
  return true;
}

function visibleBounds(decoded) {
  let left = decoded.width;
  let top = decoded.height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      if (alphaAt(decoded, x, y) === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return { left, top, right, bottom };
}

function syntheticOpaquePanel(width, height, inset) {
  const stride = width * 4;
  const scanlines = Buffer.alloc(stride * height);
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) {
      scanlines[y * stride + x * 4 + 3] = 255;
    }
  }
  return { width, height, stride, scanlines };
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

test('campus heroes use the approved Daxi-themed Chinese names', () => {
  assert.deepEqual(
    CAMPUS_HEROES.map(({ name }) => name),
    ['溪羽', '崁迅', '桃樂', '嵙辰', '溪棠', '崁宇', '桃弦', '溪策', '崁星', '大川', '桃語', '嵙森'],
  );
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

test('campus arena full backgrounds use WebP while selection thumbnails remain separate PNG files', () => {
  assert.ok(CAMPUS_SCENES.every(scene => scene.image.endsWith('.webp')));
});

test('campus arena artwork exists as WebP files', async () => {
  for (const scene of CAMPUS_SCENES) {
    const filePath = path.resolve('web', scene.image.replace(/^\.\//, ''));
    await access(filePath);
    const source = await readFile(filePath);
    assert.equal(source.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(source.subarray(8, 12).toString('ascii'), 'WEBP');
  }
});

test('every campus hero has a transparent RGBA PNG idle and attack sprite', async () => {
  for (const hero of CAMPUS_HEROES) {
    for (const pose of ['idle', 'attack']) {
      const filePath = path.resolve('web', 'assets', 'battle', 'campus-heroes', hero.id, `${pose}.png`);
      await access(filePath);
      const sprite = await readFile(filePath);
      assert.deepEqual(pngMetadata(sprite), {
        width: HERO_CANVAS.width,
        height: HERO_CANVAS.height,
        bitDepth: 8,
        colorType: 6,
      });
      const decoded = decodeRgba(sprite);
      assert.ok(hasTransparentBorder(decoded), `${hero.id}/${pose} must retain a fully transparent border`);
      const bounds = visibleBounds(decoded);
      assert.equal(bounds.bottom, HERO_CANVAS.baseline, `${hero.id}/${pose} feet must align at y=${HERO_CANVAS.baseline}`);
      assert.ok(bounds.left >= 70 && bounds.right <= 954, `${hero.id}/${pose} must retain horizontal safety margins`);
      assert.ok(bounds.top >= 70, `${hero.id}/${pose} must retain a top safety margin`);
    }
  }
});

test('sprite validation script reports all checked-in PNG pairs without regenerating art', async () => {
  const { validateCampusHeroSprites } = await import('../scripts/generate-campus-hero-sprites.mjs');
  assert.equal(typeof validateCampusHeroSprites, 'function');
  const results = await validateCampusHeroSprites();
  assert.equal(results.length, CAMPUS_HEROES.length * 2);
  assert.deepEqual(new Set(results.map(result => result.pose)), new Set(['idle', 'attack']));
});

test('sprite alpha validation rejects opaque panels hidden behind transparent borders', async () => {
  const { validateAlphaTransparency } = await import('../scripts/generate-campus-hero-sprites.mjs');
  assert.equal(typeof validateAlphaTransparency, 'function');
  assert.throws(
    () => validateAlphaTransparency(syntheticOpaquePanel(64, 64, 1), 'thin-border-fixture'),
    /transparent background/i,
  );
  assert.throws(
    () => validateAlphaTransparency(syntheticOpaquePanel(100, 100, 15), 'padded-panel-fixture'),
    /opaque background panel/i,
  );
});
