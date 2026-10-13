import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCompletedPenaltyPull,
  assertFirstPenaltyPull
} from '../phone_native_flow_rules.mjs';

function penaltyState({ handCount, drawnCount, remainingCount, active = true, counterAvailable = false }) {
  const event = {
    version: drawnCount,
    type: 'draw_card',
    playerId: 'phone',
    details: {
      drawnCount: 1,
      activePenaltyAmount: 2,
      penaltyDrawnCount: drawnCount,
      penaltyRemainingCount: remainingCount,
      acceptedPenalty: !active,
      canPlayDrawnCard: counterAvailable
    }
  };
  return {
    handCounts: { phone: handCount },
    hasDrawnCardThisTurn: counterAvailable,
    drawnCardInstanceId: counterAvailable ? 'counter-card' : null,
    activeEffect: active
      ? {
          type: 'draw_penalty',
          amount: 2,
          penaltyDrawnCount: drawnCount,
          penaltyRemainingCount: remainingCount
        }
      : null,
    moveHistory: [event]
  };
}

test('first penalty pull proves one authoritative draw and keeps the remaining penalty active', () => {
  const snapshot = assertFirstPenaltyPull({
    state: penaltyState({ handCount: 2, drawnCount: 1, remainingCount: 1 }),
    playerId: 'phone',
    beforeHandCount: 1,
    afterVersion: 0,
    penaltyAmount: 2
  });

  assert.equal(snapshot.eventVersion, 1);
  assert.equal(snapshot.penaltyDrawnCount, 1);
  assert.equal(snapshot.penaltyRemainingCount, 1);
  assert.equal(snapshot.counterAvailable, false);
});

test('a playable first penalty card is reported without pretending the penalty was accepted', () => {
  const snapshot = assertFirstPenaltyPull({
    state: penaltyState({
      handCount: 2,
      drawnCount: 1,
      remainingCount: 1,
      counterAvailable: true
    }),
    playerId: 'phone',
    beforeHandCount: 1,
    afterVersion: 0,
    penaltyAmount: 2
  });

  assert.equal(snapshot.counterAvailable, true);
  assert.equal(snapshot.drawnCardInstanceId, 'counter-card');
});

test('second penalty pull proves a second authoritative draw and completed acceptance', () => {
  const snapshot = assertCompletedPenaltyPull({
    state: penaltyState({ handCount: 3, drawnCount: 2, remainingCount: 0, active: false }),
    playerId: 'phone',
    beforeHandCount: 1,
    afterVersion: 1,
    penaltyAmount: 2
  });

  assert.equal(snapshot.eventVersion, 2);
  assert.equal(snapshot.penaltyDrawnCount, 2);
  assert.equal(snapshot.penaltyRemainingCount, 0);
});

test('legacy accept_penalty cannot satisfy either pull assertion', () => {
  const state = penaltyState({ handCount: 3, drawnCount: 2, remainingCount: 0, active: false });
  state.moveHistory[0].type = 'accept_penalty';

  assert.throws(() => assertCompletedPenaltyPull({
    state,
    playerId: 'phone',
    beforeHandCount: 1,
    afterVersion: 0,
    penaltyAmount: 2
  }), /draw_card/);
});
