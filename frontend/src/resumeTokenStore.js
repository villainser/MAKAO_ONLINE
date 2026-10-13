export const RESUME_TOKEN_STORAGE_PREFIX = 'makaoResumeTokenV1';

export function normalizeServerOrigin(serverUrl) {
  const raw = String(serverUrl || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw, window.location?.origin).origin.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, '').toLowerCase();
  }
}

export function resumeTokenStorageKey(serverUrl, roomId, clientId) {
  const origin = normalizeServerOrigin(serverUrl);
  const normalizedRoomId = String(roomId || '').trim().toUpperCase();
  const normalizedClientId = String(clientId || '').trim();
  if (!origin || !normalizedRoomId || !normalizedClientId) return '';
  return [
    RESUME_TOKEN_STORAGE_PREFIX,
    encodeURIComponent(origin),
    encodeURIComponent(normalizedRoomId),
    encodeURIComponent(normalizedClientId)
  ].join(':');
}

export function readResumeToken(serverUrl, roomId, clientId, storage = window.localStorage) {
  const key = resumeTokenStorageKey(serverUrl, roomId, clientId);
  if (!key) return '';
  try {
    return String(storage.getItem(key) || '');
  } catch {
    return '';
  }
}

export function writeResumeToken(
  serverUrl,
  roomId,
  clientId,
  resumeToken,
  storage = window.localStorage
) {
  const key = resumeTokenStorageKey(serverUrl, roomId, clientId);
  const token = String(resumeToken || '');
  if (!key || !token) return false;
  try {
    storage.setItem(key, token);
    return true;
  } catch {
    return false;
  }
}

export function clearResumeToken(serverUrl, roomId, clientId, storage = window.localStorage) {
  const key = resumeTokenStorageKey(serverUrl, roomId, clientId);
  if (!key) return;
  try {
    storage.removeItem(key);
  } catch {
    // A confirmed leave is still valid even when storage is unavailable.
  }
}

export function resumeSessionPayload({ serverUrl, roomId, clientId, storage = window.localStorage }) {
  const payload = {
    roomId: String(roomId || '').trim().toUpperCase(),
    clientId: String(clientId || '').trim(),
    supportsResumeToken: true
  };
  const resumeToken = readResumeToken(serverUrl, roomId, clientId, storage);
  return resumeToken ? { ...payload, resumeToken } : payload;
}

export function persistResumeTokenFromAck({
  serverUrl,
  roomId,
  clientId,
  response,
  storage = window.localStorage
}) {
  if (!response?.success || !response?.resumeToken) return false;
  return writeResumeToken(serverUrl, roomId, clientId, response.resumeToken, storage);
}
