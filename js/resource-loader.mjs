const emptyManifest = () => ({ scenes: [], characters: [], sfx: {} });

export async function fetchJson(url, fetcher = fetch) {
  const response = await fetcher(url);
  if (!response?.ok) {
    const status = Number.isFinite(response?.status) ? response.status : '未知';
    throw new Error(`HTTP ${status} 載入失敗：${url}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`JSON 資料格式錯誤：${url}`, { cause: error });
  }
}

export function normalizeBootstrapResults(results) {
  const [catalogResult, manifestResult] = results;
  const issues = [];

  const catalog = catalogResult?.status === 'fulfilled' && Array.isArray(catalogResult.value?.quizzes)
    ? catalogResult.value.quizzes
    : [];
  if (catalogResult?.status !== 'fulfilled') issues.push('題庫清單載入失敗');
  else if (!Array.isArray(catalogResult.value?.quizzes)) issues.push('題庫清單格式錯誤');
  else if (catalog.length === 0) issues.push('目前沒有可用題庫');

  const manifestValid = manifestResult?.status === 'fulfilled'
    && Array.isArray(manifestResult.value?.scenes)
    && Array.isArray(manifestResult.value?.characters);
  const manifest = manifestValid ? manifestResult.value : emptyManifest();
  if (manifestResult?.status !== 'fulfilled') issues.push('對戰素材載入失敗');
  else if (!manifestValid) issues.push('對戰素材格式錯誤');

  const playableCharacters = manifest.characters.filter(character => character.playable !== false);
  if (manifestValid && (manifest.scenes.length === 0 || playableCharacters.length < 2)) {
    issues.push('對戰素材不完整');
  }

  const ready = catalog.length > 0 && manifest.scenes.length > 0 && playableCharacters.length >= 2;
  return {
    catalog,
    manifest,
    ready,
    message: ready ? '' : `${[...new Set(issues)].join('、')}，請重試。`,
  };
}

export async function loadBootstrapResources(fetcher = fetch) {
  const results = await Promise.allSettled([
    fetchJson('./data/catalog.json', fetcher),
    fetchJson('./assets/battle/manifest.json', fetcher),
  ]);
  return normalizeBootstrapResults(results);
}
