const MIN_CHARACTER_WIDTH = 100;
const MIN_CHARACTER_HEIGHT = 160;

export function chooseCharacterSpriteGroup(groups) {
  const candidates = groups
    .map(group => ({
      ...group,
      frames: (group.frames ?? []).filter(({ width, height }) =>
        width >= MIN_CHARACTER_WIDTH && height >= MIN_CHARACTER_HEIGHT),
    }))
    .filter(({ frames }) => frames.length > 0);

  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    const leftBytes = left.frames.reduce((total, frame) => total + frame.size, 0);
    const rightBytes = right.frames.reduce((total, frame) => total + frame.size, 0);
    return rightBytes - leftBytes || right.frames.length - left.frames.length || left.name.localeCompare(right.name);
  })[0];
}

export function selectAnimationFrames(frames, count) {
  return [...frames]
    .sort((left, right) => right.size - left.size || left.number - right.number)
    .slice(0, count)
    .sort((left, right) => left.number - right.number);
}
