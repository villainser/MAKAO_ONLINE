import { normalizeServerOrigin } from './resumeTokenStore.js';

export const PENDING_LEAVE_STORAGE_KEY = 'makaoPendingLeaveV1';

export function createPendingLeaveIntent(roomId, clientId, { serverUrl, resumeToken } = {}) {
  const actionId = window.crypto?.randomUUID?.()
    || `leave_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return {
    actionId,
    roomId: String(roomId || '').trim().toUpperCase(),
    clientId,
    supportsResumeToken: true,
    ...(serverUrl ? { serverOrigin: normalizeServerOrigin(serverUrl) } : {}),
    ...(resumeToken ? { resumeToken: String(resumeToken) } : {}),
    createdAt: Date.now()
  };
}

export function canSendPendingLeaveThroughServer(intent, activeServerUrl) {
  if (!intent) return false;
  const intentOrigin = normalizeServerOrigin(intent.serverOrigin);
  const activeOrigin = normalizeServerOrigin(activeServerUrl);
  return Boolean(intentOrigin && activeOrigin && intentOrigin === activeOrigin);
}

export function readPendingLeave(storage = window.localStorage) {
  try {
    const intent = JSON.parse(storage.getItem(PENDING_LEAVE_STORAGE_KEY) || 'null');
    return intent?.actionId && intent?.roomId && intent?.clientId ? intent : null;
  } catch {
    return null;
  }
}

export function writePendingLeave(intent, storage = window.localStorage) {
  try {
    if (!intent) {
      storage.removeItem(PENDING_LEAVE_STORAGE_KEY);
      return;
    }
    storage.setItem(PENDING_LEAVE_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // The current Socket.IO connection can still deliver the leave request.
  }
}

export function clearPendingLeaveAfterAck(actionId, storage = window.localStorage) {
  const current = readPendingLeave(storage);
  if (!current || current.actionId !== actionId) return false;
  writePendingLeave(null, storage);
  return true;
}
