import assert from 'node:assert/strict';
import test from 'node:test';
import { getMakaoMoveUiState, shouldResumePendingMakaoPlay } from '../src/makaoUiRules.js';

test('Makao arm button is available for two through six selected final same-rank cards', () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const state = getMakaoMoveUiState({
      handSize: count,
      selectedCount: count,
      selectionComplete: true,
      isMyTurn: true,
      estimatedServerNow: 1000
    });

    assert.equal(state.selectedMovePlaysLastCards, true, `plays last cards for ${count}`);
    assert.equal(state.selectedMoveBlockedByMakao, true, `blocks play before Makao for ${count}`);
    assert.equal(state.canArmMakaoForSelectedMove, true, `can arm Makao for ${count}`);
    assert.equal(state.canDeclareMakaoNow, true, `can declare Makao for ${count}`);
    assert.equal(state.shouldShowMakaoButton, true, `shows Makao button for ${count}`);
  }
});

test('Makao arm button is not shown for a partial play down to one card', () => {
  const state = getMakaoMoveUiState({
    handSize: 3,
    selectedCount: 2,
    selectionComplete: true,
    isMyTurn: true,
    estimatedServerNow: 1000
  });

  assert.equal(state.selectedMovePlaysLastCards, false);
  assert.equal(state.selectedMoveBlockedByMakao, false);
  assert.equal(state.canArmMakaoForSelectedMove, false);
  assert.equal(state.shouldShowMakaoButton, false);
});

test('existing one-card missing Makao flow still shows the button until the grace deadline', () => {
  const beforeDeadline = getMakaoMoveUiState({
    handSize: 1,
    selectedCount: 0,
    isMyTurn: true,
    makaoState: { declared: false, canBeCaughtAt: 2000 },
    estimatedServerNow: 1000
  });

  assert.equal(beforeDeadline.shouldShowMakaoButton, true);
  assert.equal(beforeDeadline.canDeclareMakaoNow, true);

  const afterDeadline = getMakaoMoveUiState({
    handSize: 1,
    selectedCount: 0,
    isMyTurn: true,
    makaoState: { declared: false, canBeCaughtAt: 2000 },
    estimatedServerNow: 2500
  });

  assert.equal(afterDeadline.shouldShowMakaoButton, true);
  assert.equal(afterDeadline.canDeclareMakaoNow, false);
});

test('armed Makao unblocks the selected final cards', () => {
  const state = getMakaoMoveUiState({
    handSize: 4,
    selectedCount: 4,
    selectionComplete: true,
    isMyTurn: true,
    makaoState: { armed: true },
    estimatedServerNow: 1000
  });

  assert.equal(state.myMakaoReady, true);
  assert.equal(state.selectedMoveBlockedByMakao, false);
  assert.equal(state.canArmMakaoForSelectedMove, false);
  assert.equal(state.shouldShowMakaoButton, false);
});

test('pending final-card play waits for both Makao state and declaration ACK', () => {
  const armedSnapshotBeforeAck = {
    hasPendingAction: true,
    isMyTurn: true,
    validSelection: true,
    playsLastCards: true,
    makaoReady: true
  };

  assert.equal(shouldResumePendingMakaoPlay(armedSnapshotBeforeAck), false);
  assert.equal(shouldResumePendingMakaoPlay({
    ...armedSnapshotBeforeAck,
    hasPendingAction: false
  }), true);
  assert.equal(shouldResumePendingMakaoPlay({
    ...armedSnapshotBeforeAck,
    hasPendingAction: false,
    makaoReady: false
  }), false);
});
