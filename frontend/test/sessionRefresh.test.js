import assert from 'node:assert/strict';
import test from 'node:test';
import { requestSessionRefresh } from '../src/sessionRefresh.js';

function installWindowTimers() {
  globalThis.window = {
    setTimeout,
    clearTimeout
  };
}

test('odświeżenie sesji wysyła identyfikatory i zwraca pokój serwera', async () => {
  installWindowTimers();
  let emitted = null;
  const socket = {
    connected: true,
    off() {},
    timeout(value) {
      assert.equal(value, 7000);
      return this;
    },
    emit(event, payload, callback) {
      emitted = { event, payload };
      callback(null, { success: true, room: { id: 'ABC123' } });
    }
  };

  const result = await requestSessionRefresh({
    socket,
    serverUrl: 'https://makao.example',
    roomId: 'abc123',
    clientId: 'client-a',
    resumeToken: 'secret-token'
  });

  assert.deepEqual(emitted, {
    event: 'reconnect_session',
    payload: {
      roomId: 'ABC123',
      clientId: 'client-a',
      supportsResumeToken: true,
      resumeToken: 'secret-token'
    }
  });
  assert.deepEqual(result, { success: true, room: { id: 'ABC123' } });
});

test('odświeżenie czeka na ponowne połączenie przed żądaniem stanu', async () => {
  installWindowTimers();
  let connectHandler = null;
  let emitted = false;
  const socket = {
    connected: false,
    on(event, handler) {
      if (event === 'connect') connectHandler = handler;
    },
    off() {},
    connect() {
      this.connected = true;
      connectHandler();
    },
    timeout() {
      return this;
    },
    emit(_event, _payload, callback) {
      emitted = true;
      callback(null, { success: true, room: { id: 'ABC123' } });
    }
  };

  const result = await requestSessionRefresh({
    socket,
    roomId: 'ABC123',
    clientId: 'client-a'
  });

  assert.equal(emitted, true);
  assert.equal(result.success, true);
});

test('odświeżenie przekazuje nowy token tylko z prywatnego ACK', async () => {
  installWindowTimers();
  const socket = {
    connected: true,
    off() {},
    timeout() {
      return this;
    },
    emit(_event, _payload, callback) {
      callback(null, {
        success: true,
        room: { id: 'ABC123' },
        resumeToken: 'migrated-secret'
      });
    }
  };

  const result = await requestSessionRefresh({
    socket,
    roomId: 'ABC123',
    clientId: 'client-a'
  });

  assert.deepEqual(result, {
    success: true,
    room: { id: 'ABC123' },
    resumeToken: 'migrated-secret'
  });
});

test('odświeżenie przekazuje błąd od serwera bez zmiany lokalnego stanu', async () => {
  installWindowTimers();
  const socket = {
    connected: true,
    off() {},
    timeout() {
      return this;
    },
    emit(_event, _payload, callback) {
      callback(null, { success: false, error: 'Player session not found in this room' });
    }
  };

  const result = await requestSessionRefresh({
    socket,
    roomId: 'ABC123',
    clientId: 'client-a'
  });

  assert.deepEqual(result, {
    success: false,
    error: 'Player session not found in this room'
  });
});
