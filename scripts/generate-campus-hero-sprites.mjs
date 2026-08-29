import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { CAMPUS_HEROES, HERO_CANVAS } from '../web/js/campus-heroes.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPRITE_ROOT = path.join(REPO_ROOT, 'web', 'assets', 'battle', 'campus-heroes');
const SAFETY_MARGIN = 70;
const MIN_TRANSPARENT_RATIO = 0.4;
const MAX_BOUNDING_BOX_FILL_RATIO = 0.75;

function readPngMetadata(data) {
  if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('not a PNG file');
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bitDepth: data[24],
    colorType: data[25],
    interlace: data[28],
  };
}

function decodeRgba(data) {
  const metadata = readPngMetadata(data);
  const { width, height, bitDepth, colorType, interlace } = metadata;
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`expected non-interlaced 8-bit RGBA PNG, got bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
  }

  const idat = [];
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(data.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  if (idat.length === 0) throw new Error('PNG has no IDAT chunks');

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const encoded = inflateSync(Buffer.concat(idat));
  if (encoded.length !== height * (stride + 1)) throw new Error('unexpected decoded PNG byte length');
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
        value = raw + (distances[0] <= distances[1] && distances[0] <= distances[2]
          ? left
          : distances[1] <= distances[2] ? above : upperLeft);
      } else {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
      scanlines[targetOffset + x] = value & 0xff;
    }
  }
  return { ...metadata, stride, scanlines };
}

function inspectAlpha(decoded) {
  const alphaAt = (x, y) => decoded.scanlines[y * decoded.stride + x * 4 + 3];
  let left = decoded.width;
  let top = decoded.height;
  let right = 0;
  let bottom = 0;
  let alphaMin = 255;
  let alphaMax = 0;
  let transparentPixels = 0;
  let visiblePixels = 0;

  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const alpha = alphaAt(x, y);
      alphaMin = Math.min(alphaMin, alpha);
      alphaMax = Math.max(alphaMax, alpha);
      if (alpha === 0) {
        transparentPixels += 1;
        continue;
      }
      visiblePixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }

  const transparentBorder = Array.from({ length: decoded.width }, (_, x) =>
    alphaAt(x, 0) === 0 && alphaAt(x, decoded.height - 1) === 0,
  ).every(Boolean) && Array.from({ length: decoded.height }, (_, y) =>
    alphaAt(0, y) === 0 && alphaAt(decoded.width - 1, y) === 0,
  ).every(Boolean);

  const bounds = { left, top, right, bottom };
  const boundsArea = Math.max(0, right - left) * Math.max(0, bottom - top);
  return {
    alphaMin,
    alphaMax,
    transparentBorder,
    bounds,
    transparentRatio: transparentPixels / (decoded.width * decoded.height),
    boundingBoxFillRatio: boundsArea === 0 ? 0 : visiblePixels / boundsArea,
  };
}

export function validateAlphaTransparency(decoded, label = 'sprite') {
  const alpha = inspectAlpha(decoded);
  if (alpha.transparentRatio < MIN_TRANSPARENT_RATIO) {
    throw new Error(
      `${label}: transparent background covers ${(alpha.transparentRatio * 100).toFixed(1)}% of the canvas; expected at least ${MIN_TRANSPARENT_RATIO * 100}%`,
    );
  }
  if (alpha.boundingBoxFillRatio > MAX_BOUNDING_BOX_FILL_RATIO) {
    throw new Error(
      `${label}: possible opaque background panel fills ${(alpha.boundingBoxFillRatio * 100).toFixed(1)}% of the visible bounds; expected at most ${MAX_BOUNDING_BOX_FILL_RATIO * 100}%`,
    );
  }
  return alpha;
}

async function validateSprite(hero, pose) {
  const filePath = path.join(SPRITE_ROOT, hero.id, `${pose}.png`);
  const data = await readFile(filePath);
  const decoded = decodeRgba(data);
  const label = `${hero.id}/${pose}`;
  const alpha = validateAlphaTransparency(decoded, label);

  if (decoded.width !== HERO_CANVAS.width || decoded.height !== HERO_CANVAS.height) {
    throw new Error(`${label}: expected ${HERO_CANVAS.width}x${HERO_CANVAS.height}, got ${decoded.width}x${decoded.height}`);
  }
  if (alpha.alphaMin !== 0 || alpha.alphaMax !== 255 || !alpha.transparentBorder) {
    throw new Error(`${label}: must contain opaque pixels and a fully transparent border`);
  }
  if (alpha.bounds.bottom !== HERO_CANVAS.baseline) {
    throw new Error(`${label}: expected visible baseline ${HERO_CANVAS.baseline}, got ${alpha.bounds.bottom}`);
  }
  if (alpha.bounds.left < SAFETY_MARGIN || alpha.bounds.right > HERO_CANVAS.width - SAFETY_MARGIN || alpha.bounds.top < SAFETY_MARGIN) {
    throw new Error(`${label}: visible artwork violates the ${SAFETY_MARGIN}px safety margin`);
  }

  return {
    heroId: hero.id,
    pose,
    filePath,
    bounds: alpha.bounds,
    transparentRatio: alpha.transparentRatio,
    boundingBoxFillRatio: alpha.boundingBoxFillRatio,
  };
}

export async function validateCampusHeroSprites() {
  const results = [];
  for (const hero of CAMPUS_HEROES) {
    for (const pose of ['idle', 'attack']) results.push(await validateSprite(hero, pose));
  }
  return results;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const results = await validateCampusHeroSprites();
  console.log(`Validated ${results.length} checked-in campus hero PNG sprites; no artwork was regenerated.`);
}
