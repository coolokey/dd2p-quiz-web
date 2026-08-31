const firstFrame = (character, state) => {
  const frames = character?.states?.[state];
  return Array.isArray(frames) ? frames[0] : frames;
};

export function collectBattleAssetPaths(scene, characters = []) {
  return [...new Set([
    scene?.image,
    ...characters.flatMap(character => [
      firstFrame(character, 'idle'),
      firstFrame(character, 'attack'),
    ]),
  ].filter(Boolean))];
}

export function preloadBattleAssets(paths, createImage = typeof Image === 'function' ? () => new Image() : null) {
  if (typeof createImage !== 'function') return [];
  return [...new Set(paths)].filter(Boolean).map(path => {
    const image = createImage();
    image.decoding = 'async';
    image.src = path;
    return image;
  });
}
