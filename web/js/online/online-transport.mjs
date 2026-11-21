import { normalizeApiUrl } from './online-config.mjs';
import { normalizeRoomCode } from './room-code.mjs';

export const ONLINE_SESSION_STORAGE_KEY = 'dd2p-online-session';

const ERROR_MESSAGES = Object.freeze({
  CONFIGURATION_MISSING: '網路對戰伺服器尚未完成設定。',
  ROOM_NOT_FOUND: '找不到此房間，可能已過期或房主已關閉。',
  ROOM_FULL: '此房間人數已滿，請改加入其他房間。',
  ROOM_ALREADY_STARTED: '此房間已經開始對戰，無法中途加入。',
  INVALID_ROOM_CODE: '房間碼格式不正確，請輸入 6 位英數字。',
  CHARACTER_TAKEN: '這位角色已被對手選走，請改選其他角色。',
  CHARACTER_REQUIRED: '請先選擇一位角色再按準備完成。',
  UNAUTHORIZED: '連線憑證已失效，請重新加入房間。',
  REMATCH_UNAVAILABLE: '對手已離開房間，無法再戰一局。',
  UPSTREAM_TIMEOUT: '伺服器回應逾時，請稍後再試。',
  UPSTREAM_UNREACHABLE: '無法連線至網路對戰伺服器，請檢查網路或網址。',
  UPSTREAM_REJECTED: '後端資料庫拒絕請求，請確認 Supabase 設定與 Schema。',
  NETWORK_ERROR: '網路連線中斷，請檢查網路狀態。',
});

export function describeOnlineError(code, fallback = '網路操作失敗，請稍後再試。') {
  return ERROR_MESSAGES[code] ?? fallback;
}

export function saveOnlineSession(session, storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  if (!storage) return;
  if (!session) {
    storage.removeItem(ONLINE_SESSION_STORAGE_KEY);
    return;
  }
  storage.setItem(ONLINE_SESSION_STORAGE_KEY, JSON.stringify({
    roomCode: session.roomCode,
    playerId: session.playerId,
    resumeToken: session.resumeToken,
    seat: session.seat,
    apiUrl: session.apiUrl ?? '',
  }));
}

export function loadOnlineSession(storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ONLINE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.roomCode || !parsed?.playerId || !parsed?.resumeToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearOnlineSession(storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  storage?.removeItem?.(ONLINE_SESSION_STORAGE_KEY);
}

export function createOnlineTransport({ apiUrl, fetchImpl = fetch }) {
  const baseUrl = normalizeApiUrl(apiUrl);

  async function request(path, { method = 'GET', body = null, session = null } = {}) {
    if (!baseUrl) {
      return { ok: false, code: 'CONFIGURATION_MISSING', message: describeOnlineError('CONFIGURATION_MISSING') };
    }
    const headers = { Accept: 'application/json' };
    if (body !== null) headers['Content-Type'] = 'application/json';
    if (session?.playerId && session?.resumeToken) {
      headers['X-DDP-Player-Id'] = session.playerId;
      headers['X-DDP-Resume-Token'] = session.resumeToken;
    }

    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== null ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({ ok: false, code: 'INVALID_RESPONSE' }));
      if (!response.ok || data?.ok === false) {
        const code = data?.code ?? `HTTP_${response.status}`;
        return { ok: false, status: response.status, code, message: describeOnlineError(code), data };
      }
      return { ok: true, status: response.status, ...data };
    } catch {
      return { ok: false, code: 'NETWORK_ERROR', message: describeOnlineError('NETWORK_ERROR') };
    }
  }

  return {
    baseUrl,
    isConfigured: () => Boolean(baseUrl),
    checkHealth: () => request('/health'),
    createRoom: payload => request('/api/rooms', { method: 'POST', body: payload }),
    joinRoom: (roomCode, payload) => request(`/api/rooms/${encodeURIComponent(normalizeRoomCode(roomCode))}/join`, {
      method: 'POST',
      body: payload,
    }),
    getState: (session, sinceVersion = 0) => request(
      `/api/rooms/${encodeURIComponent(session.roomCode)}/state?sinceVersion=${encodeURIComponent(sinceVersion)}`,
      { method: 'GET', session },
    ),
    selectCharacter: (session, characterId) => request(
      `/api/rooms/${encodeURIComponent(session.roomCode)}/character`,
      { method: 'POST', session, body: { characterId: String(characterId) } },
    ),
    setReady: (session, ready) => request(
      `/api/rooms/${encodeURIComponent(session.roomCode)}/ready`,
      { method: 'POST', session, body: { ready: Boolean(ready) } },
    ),
    submitAnswer: (session, payload) => request(
      `/api/rooms/${encodeURIComponent(session.roomCode)}/answer`,
      { method: 'POST', session, body: payload },
    ),
    finishTime: session => request(
      `/api/rooms/${encodeURIComponent(session.roomCode)}/timeout`,
      { method: 'POST', session, body: {} },
    ),
    requestRematch: session => request(
      `/api/rooms/${encodeURIComponent(session.roomCode)}/rematch`,
      { method: 'POST', session, body: {} },
    ),
    leaveRoom: session => request(
      `/api/rooms/${encodeURIComponent(session.roomCode)}/leave`,
      { method: 'POST', session, body: {} },
    ),
  };
}
