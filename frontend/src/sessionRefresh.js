import { EVENTS } from './shared/constants.js';

const DEFAULT_REFRESH_TIMEOUT_MS = 7000;

export function requestSessionRefresh({
  socket,
  roomId,
  clientId,
  resumeToken,
  timeoutMs = DEFAULT_REFRESH_TIMEOUT_MS
}) {
  const normalizedRoomId = String(roomId || '').trim().toUpperCase();
  const normalizedClientId = String(clientId || '').trim();

  if (!socket || !normalizedRoomId || !normalizedClientId) {
    return Promise.resolve({
      success: false,
      error: 'Brak aktywnej sesji do odświeżenia.'
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let connectTimer = null;

    const cleanup = () => {
      window.clearTimeout(connectTimer);
      socket.off?.('connect', handleConnect);
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const emitRefresh = () => {
      window.clearTimeout(connectTimer);
      const payload = {
        roomId: normalizedRoomId,
        clientId: normalizedClientId,
        supportsResumeToken: true,
        ...(resumeToken ? { resumeToken: String(resumeToken) } : {})
      };
      socket.timeout(timeoutMs).emit(
        EVENTS.RECONNECT_SESSION,
        payload,
        (timeoutError, response) => {
          if (timeoutError) {
            finish({ success: false, error: 'Serwer nie odpowiedział na odświeżenie sesji.' });
            return;
          }
          if (!response?.success || !response.room) {
            finish({
              success: false,
              error: response?.error || 'Nie udało się pobrać stanu sesji.'
            });
            return;
          }
          finish({
            success: true,
            room: response.room,
            ...(response.resumeToken ? { resumeToken: response.resumeToken } : {})
          });
        }
      );
    };

    const handleConnect = () => emitRefresh();

    if (socket.connected) {
      emitRefresh();
      return;
    }

    socket.on?.('connect', handleConnect);
    connectTimer = window.setTimeout(() => {
      finish({ success: false, error: 'Brak połączenia z serwerem.' });
    }, timeoutMs);
    socket.connect?.();
  });
}
