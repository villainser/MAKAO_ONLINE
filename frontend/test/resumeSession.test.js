import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearResumeToken,
  persistResumeTokenFromAck,
  readResumeToken,
  resumeSessionPayload,
  writeResumeToken
} from '../src/resumeTokenStore.js';
import { isTerminalRoomReconnectFailure, persistActiveRoom } from '../src/sessionPersistence.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function installWindow() {
  globalThis.window = { location: { origin: 'https://web.example' } };
}

test('resume token is private to server origin, room and client', () => {
  installWindow();
  const storage = memoryStorage();
  writeResumeToken('https://makao.example/api', 'abc123', 'client-a', 'secret-token', storage);

  assert.equal(readResumeToken('https://makao.example/other', 'ABC123', 'client-a', storage), 'secret-token');
  assert.equal(readResumeToken('https://other.example', 'ABC123', 'client-a', storage), '');
  assert.equal(readResumeToken('https://makao.example', 'XYZ789', 'client-a', storage), '');
  assert.equal(readResumeToken('https://makao.example', 'ABC123', 'client-b', storage), '');
});

test('reconnect always advertises capability and only adds a stored token', () => {
  installWindow();
  const storage = memoryStorage();
  const session = {
    serverUrl: 'https://makao.example',
    roomId: 'abc123',
    clientId: 'client-a',
    storage
  };

  assert.deepEqual(resumeSessionPayload(session), {
    roomId: 'ABC123',
    clientId: 'client-a',
    supportsResumeToken: true
  });

  persistResumeTokenFromAck({
    ...session,
    response: { success: true, resumeToken: 'secret-token' }
  });
  assert.deepEqual(resumeSessionPayload(session), {
    roomId: 'ABC123',
    clientId: 'client-a',
    supportsResumeToken: true,
    resumeToken: 'secret-token'
  });

  clearResumeToken(session.serverUrl, session.roomId, session.clientId, storage);
  assert.equal(readResumeToken(session.serverUrl, session.roomId, session.clientId, storage), '');
});

test('game over room updates preserve the membership for reload and end-game choices', () => {
  const storage = memoryStorage();
  persistActiveRoom({ id: 'abc123', status: 'playing', gameOver: true }, storage);
  assert.equal(storage.getItem('makaoRoomId'), 'ABC123');
});

test('only an explicit room-not-found reconnect response is terminal', () => {
  assert.equal(isTerminalRoomReconnectFailure({ success: false, error: 'Room not found' }), true);
  assert.equal(isTerminalRoomReconnectFailure({ success: false, code: 'ROOM_NOT_FOUND' }), true);
  assert.equal(isTerminalRoomReconnectFailure({ success: false, error: 'Invalid resume token' }), false);
  assert.equal(isTerminalRoomReconnectFailure({ success: false, error: 'Server unavailable' }), false);
});
