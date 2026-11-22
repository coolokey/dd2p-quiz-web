import { isValidRoomCode, normalizeRoomCode } from './room-code.mjs';

export const ONLINE_API_STORAGE_KEY = 'dd2p-online-api-url';
export const ONLINE_NAME_STORAGE_KEY = 'dd2p-online-player-name';

// 部署 online-worker 後可將正式 Cloudflare Worker 網址填入此處（不含結尾斜線）
export const DEFAULT_ONLINE_API_URL = 'https://ddp-online-battle-worker.cloudflare-supabase-connection-test.workers.dev';

export function normalizeApiUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
      return '';
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function resolveOnlineApiUrl({
  search = typeof location !== 'undefined' ? location.search : '',
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  defaultUrl = DEFAULT_ONLINE_API_URL,
} = {}) {
  const params = new URLSearchParams(search);
  const queryUrl = normalizeApiUrl(params.get('onlineApi'));
  if (queryUrl) return queryUrl;

  const savedUrl = normalizeApiUrl(storage?.getItem?.(ONLINE_API_STORAGE_KEY));
  if (savedUrl) return savedUrl;

  return normalizeApiUrl(defaultUrl);
}

export function saveOnlineApiUrl(url, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  const normalized = normalizeApiUrl(url);
  if (!storage) return normalized;
  if (normalized) storage.setItem?.(ONLINE_API_STORAGE_KEY, normalized);
  else storage.removeItem?.(ONLINE_API_STORAGE_KEY);
  return normalized;
}

export function readInviteParams(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  const rawRoom = normalizeRoomCode(params.get('room'));
  const roomCode = isValidRoomCode(rawRoom) ? rawRoom : '';
  const apiUrl = normalizeApiUrl(params.get('onlineApi'));
  return { roomCode, apiUrl };
}

export function buildInviteUrl({
  roomCode,
  pageUrl = typeof location !== 'undefined' ? location.href : 'https://coolokey.github.io/dd2p-quiz-web/',
  apiUrl = '',
} = {}) {
  const normalized = normalizeRoomCode(roomCode);
  if (!isValidRoomCode(normalized)) return '';
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', normalized);
  const cleanApi = normalizeApiUrl(apiUrl);
  if (cleanApi && cleanApi !== normalizeApiUrl(DEFAULT_ONLINE_API_URL)) {
    url.searchParams.set('onlineApi', cleanApi);
  }
  return url.href;
}
