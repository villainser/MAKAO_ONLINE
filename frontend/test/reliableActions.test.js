import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPendingGameActionsForSession,
  readPendingGameActions,
  replacePendingActionsForSession,
  shouldRetryReliableAction,
  writePendingGameActions
} from '../src/useReliableGameActions.js';
import {
  canSendPendingLeaveThroughServer,
  clearPendingLeaveAfterAck,
  createPendingLeaveIntent,
  readPendingLeave,
  writePendingLeave
} from '../src/reliableLeave.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

test('pending game action survives storage roundtrip and stays scoped to its session', () => {
  const storage = memoryStorage();
  const firstAction = {
    actionId: 'action-1',
    actionType: 'play_cards',
    roomId: 'ABC123',
    playerId: 'client-a',
    expectedStateVersion: 7,
    data: { cardIds: ['card-1'] }
  };
  const otherAction = {
    actionId: 'action-2',
    actionType: 'draw_card',
    roomId: 'XYZ789',
    playerId: 'client-b',
    expectedStateVersion: 4,
    data: {}
  };

  writePendingGameActions([firstAction, otherAction], storage);
  const replaced = replacePendingActionsForSession(
    readPendingGameActions(storage),
    'ABC123',
    'client-a',
    [{ ...firstAction, expectedStateVersion: 8, retryCount: 1 }]
  );
  writePendingGameActions(replaced, storage);

  const restored = readPendingGameActions(storage);
  assert.equal(restored.length, 2);
  assert.equal(restored.find(action => action.actionId === 'action-1').expectedStateVersion, 8);
  assert.equal(restored.find(action => action.actionId === 'action-1').retryCount, 1);
  assert.equal(restored.find(action => action.actionId === 'action-2').roomId, 'XYZ789');
});

test('a delayed leave ACK cannot clear a newer pending leave intent', () => {
  const storage = memoryStorage();
  writePendingLeave({ actionId: 'leave-new', roomId: 'XYZ789', clientId: 'client-a' }, storage);

  assert.equal(clearPendingLeaveAfterAck('leave-old', storage), false);
  assert.equal(readPendingLeave(storage).actionId, 'leave-new');
  assert.equal(clearPendingLeaveAfterAck('leave-new', storage), true);
  assert.equal(readPendingLeave(storage), null);
});

test('only durability rejection retries the same intent; stale state stays a final rejection', () => {
  assert.equal(shouldRetryReliableAction({
    success: false,
    retryable: true,
    code: 'PERSISTENCE_FAILED'
  }), true);
  assert.equal(shouldRetryReliableAction({
    success: false,
    retryable: true,
    code: 'STATE_VERSION_MISMATCH'
  }), false);
  assert.equal(shouldRetryReliableAction({
    success: false,
    retryable: false,
    code: 'PERSISTENCE_FAILED'
  }), false);
});

test('confirmed leave clears only game actions from the departed room membership', () => {
  const storage = memoryStorage();
  writePendingGameActions([
    { actionId: 'action-1', actionType: 'draw_card', roomId: 'ABC123', playerId: 'client-a' },
    { actionId: 'action-2', actionType: 'draw_card', roomId: 'XYZ789', playerId: 'client-a' },
    { actionId: 'action-3', actionType: 'draw_card', roomId: 'ABC123', playerId: 'client-b' }
  ], storage);

  clearPendingGameActionsForSession('abc123', 'client-a', storage);

  assert.deepEqual(
    readPendingGameActions(storage).map(action => action.actionId),
    ['action-2', 'action-3']
  );
});

test('pending resignation is retained until an acknowledgement clears it', () => {
  const storage = memoryStorage();
  const intent = {
    actionId: 'leave-1',
    roomId: 'ABC123',
    clientId: 'client-a',
    createdAt: 123
  };

  writePendingLeave(intent, storage);
  assert.deepEqual(readPendingLeave(storage), intent);

  writePendingLeave(null, storage);
  assert.equal(readPendingLeave(storage), null);
});

test('pending resignation carries the private resume capability through an unmapped retry', () => {
  globalThis.window = {
    crypto: { randomUUID: () => 'leave-private-1' },
    location: { origin: 'https://web.example' }
  };
  const intent = createPendingLeaveIntent('abc123', 'client-a', {
    serverUrl: 'https://makao.example',
    resumeToken: 'secret-token'
  });

  assert.deepEqual(intent, {
    actionId: 'leave-private-1',
    roomId: 'ABC123',
    clientId: 'client-a',
    supportsResumeToken: true,
    serverOrigin: 'https://makao.example',
    resumeToken: 'secret-token',
    createdAt: intent.createdAt
  });
});

test('pending leave is never routed through a socket connected to another server origin', () => {
  globalThis.window = { location: { origin: 'https://web.example' } };
  const intent = createPendingLeaveIntent('ABC123', 'client-a', {
    serverUrl: 'https://old.example/api',
    resumeToken: 'secret-token'
  });

  assert.equal(canSendPendingLeaveThroughServer(intent, 'https://old.example/other'), true);
  assert.equal(canSendPendingLeaveThroughServer(intent, 'https://new.example'), false);
});
