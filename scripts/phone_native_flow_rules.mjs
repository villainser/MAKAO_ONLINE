function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function latestPenaltyDraw(state, playerId, afterVersion) {
  return [...(state?.moveHistory || [])]
    .reverse()
    .find(entry =>
      Number(entry?.version || 0) > Number(afterVersion || 0)
      && entry?.type === 'draw_card'
      && entry?.playerId === playerId
      && Number(entry?.details?.activePenaltyAmount || 0) > 0
    );
}

function commonSnapshot({ state, playerId, beforeHandCount, afterVersion, penaltyAmount }) {
  const event = latestPenaltyDraw(state, playerId, afterVersion);
  invariant(event, `Expected a new draw_card penalty event after version ${afterVersion}.`);
  invariant(event.details?.drawnCount === 1, `Each penalty pull must draw exactly one card; got ${event.details?.drawnCount}.`);
  invariant(
    event.details?.activePenaltyAmount === penaltyAmount,
    `Penalty amount mismatch: expected ${penaltyAmount}, got ${event.details?.activePenaltyAmount}.`
  );

  return {
    eventVersion: event.version,
    handCount: state?.handCounts?.[playerId],
    penaltyDrawnCount: event.details.penaltyDrawnCount,
    penaltyRemainingCount: event.details.penaltyRemainingCount,
    counterAvailable: Boolean(event.details.canPlayDrawnCard),
    drawnCardInstanceId: state?.drawnCardInstanceId || null,
    acceptedPenalty: Boolean(event.details.acceptedPenalty)
  };
}

export function assertFirstPenaltyPull(input) {
  const snapshot = commonSnapshot(input);
  const { state, playerId, beforeHandCount, penaltyAmount } = input;

  invariant(
    snapshot.handCount === beforeHandCount + 1,
    `First penalty pull must grow the hand by one: expected ${beforeHandCount + 1}, got ${snapshot.handCount}.`
  );
  invariant(state?.activeEffect?.type === 'draw_penalty', 'Penalty must remain active after the first pull.');
  invariant(
    state.activeEffect.amount === penaltyAmount,
    `Active penalty amount changed: expected ${penaltyAmount}, got ${state.activeEffect.amount}.`
  );
  invariant(snapshot.penaltyDrawnCount === 1, `Expected penaltyDrawnCount=1, got ${snapshot.penaltyDrawnCount}.`);
  invariant(
    snapshot.penaltyRemainingCount === penaltyAmount - 1,
    `Expected penaltyRemainingCount=${penaltyAmount - 1}, got ${snapshot.penaltyRemainingCount}.`
  );
  invariant(snapshot.acceptedPenalty === false, 'First penalty pull cannot accept the whole penalty.');
  if (snapshot.counterAvailable) {
    invariant(
      state.hasDrawnCardThisTurn === true && Boolean(snapshot.drawnCardInstanceId),
      'Playable first penalty card must be exposed as the drawn card choice.'
    );
  }
  return snapshot;
}

export function assertCompletedPenaltyPull(input) {
  const snapshot = commonSnapshot(input);
  const { state, beforeHandCount, penaltyAmount } = input;

  invariant(
    snapshot.handCount === beforeHandCount + penaltyAmount,
    `Completed penalty must add ${penaltyAmount} cards: expected ${beforeHandCount + penaltyAmount}, got ${snapshot.handCount}.`
  );
  invariant(!state?.activeEffect, 'Penalty must be cleared only after the final one-card pull.');
  invariant(
    snapshot.penaltyDrawnCount === penaltyAmount,
    `Expected penaltyDrawnCount=${penaltyAmount}, got ${snapshot.penaltyDrawnCount}.`
  );
  invariant(snapshot.penaltyRemainingCount === 0, `Expected penaltyRemainingCount=0, got ${snapshot.penaltyRemainingCount}.`);
  invariant(snapshot.acceptedPenalty === true, 'Final penalty draw must report acceptedPenalty=true.');
  return snapshot;
}
