const DEFAULT_VOLUME = 0.8;

function browserAudioFactory(src) {
  if (typeof Audio === 'undefined') return null;
  return new Audio(src);
}

function clampVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, number));
}

function sourcePath(source) {
  if (typeof source === 'string') return source;
  return source?.src ?? source?.url ?? null;
}

function buildSceneMusic(manifest, audioManifest) {
  const entries = new Map();
  const addScenes = (scenes = []) => {
    for (const scene of scenes) {
      const source = sourcePath(scene?.music);
      if (scene?.id && source) entries.set(scene.id, source);
    }
  };

  addScenes(manifest?.scenes);
  addScenes(audioManifest?.scenes);
  for (const [sceneId, source] of Object.entries(audioManifest?.bgm ?? {})) {
    const path = sourcePath(source);
    if (path) entries.set(sceneId, path);
  }
  return entries;
}

function buildSfx(manifest, audioManifest) {
  return {
    ...(manifest?.sfx ?? {}),
    ...(audioManifest?.sfx ?? {}),
  };
}

async function safePlay(audio) {
  try {
    await audio?.play?.();
  } catch {
    // Browsers can reject play() before or during an interaction unlock.
  }
}

export function createAudioManager({
  manifest = {},
  audioManifest = {},
  audioFactory = browserAudioFactory,
  volume = DEFAULT_VOLUME,
  musicVolume = 1,
  effectsVolume = 1,
  muted = false,
} = {}) {
  const sceneMusic = buildSceneMusic(manifest, audioManifest);
  const soundEffects = buildSfx(manifest, audioManifest);
  const activeAudios = new Map();
  let unlocked = false;
  let selectedScene = null;
  let backgroundMusic = null;
  let currentVolume = clampVolume(volume);
  let currentMusicVolume = clampVolume(musicVolume);
  let currentEffectsVolume = clampVolume(effectsVolume);
  let isMuted = Boolean(muted);

  function effectiveVolume(kind) {
    return currentVolume * (kind === 'music' ? currentMusicVolume : currentEffectsVolume);
  }

  function configure(audio, { loop = false, kind = 'effect' } = {}) {
    if (!audio) return null;
    audio.loop = loop;
    audio.volume = effectiveVolume(kind);
    audio.muted = isMuted;
    activeAudios.set(audio, kind);
    return audio;
  }

  function refreshVolumes() {
    for (const [audio, kind] of activeAudios) audio.volume = effectiveVolume(kind);
  }

  function stopBackgroundMusic() {
    if (!backgroundMusic) return;
    backgroundMusic.pause?.();
    try {
      backgroundMusic.currentTime = 0;
    } catch {
      // Some streams do not allow seeking before metadata is available.
    }
    activeAudios.delete(backgroundMusic);
    backgroundMusic = null;
  }

  async function startBackgroundMusic() {
    stopBackgroundMusic();
    const src = sceneMusic.get(selectedScene);
    if (!unlocked || !src) return;
    backgroundMusic = configure(audioFactory(src), { loop: true, kind: 'music' });
    await safePlay(backgroundMusic);
  }

  return {
    async unlock() {
      if (unlocked) return;
      unlocked = true;
      await startBackgroundMusic();
    },

    async setScene(sceneId) {
      if (selectedScene === sceneId) return;
      selectedScene = sceneId;
      await startBackgroundMusic();
    },

    async playSfx(eventName) {
      if (!unlocked) return;
      const src = sourcePath(soundEffects[eventName]);
      if (!src) return;
      const audio = configure(audioFactory(src));
      await safePlay(audio);
    },

    setMuted(nextMuted) {
      isMuted = Boolean(nextMuted);
      for (const audio of activeAudios.keys()) audio.muted = isMuted;
      return isMuted;
    },

    setVolume(nextVolume) {
      currentVolume = clampVolume(nextVolume);
      refreshVolumes();
      return currentVolume;
    },

    setMusicVolume(nextVolume) {
      currentMusicVolume = clampVolume(nextVolume);
      refreshVolumes();
      return currentMusicVolume;
    },

    setEffectsVolume(nextVolume) {
      currentEffectsVolume = clampVolume(nextVolume);
      refreshVolumes();
      return currentEffectsVolume;
    },

    stop() {
      stopBackgroundMusic();
      selectedScene = null;
    },
  };
}
