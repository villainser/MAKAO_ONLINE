export function persistActiveRoom(roomData, storage = window.localStorage, storageKey = 'makaoRoomId') {
  const roomId = String(roomData?.id || '').trim().toUpperCase();
  if (!roomId) return false;
  storage.setItem(storageKey, roomId);
  return true;
}

export function isTerminalRoomReconnectFailure(response) {
  const error = String(response?.error || '').trim().toLowerCase();
  return response?.code === 'ROOM_NOT_FOUND'
    || error === 'room not found'
    || error === 'room not found.';
}
