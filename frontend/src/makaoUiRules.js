export function getMakaoMoveUiState({
  handSize,
  selectedCount,
  selectionComplete = true,
  isMyTurn = false,
  makaoState = null,
  estimatedServerNow = Date.now()
}) {
  const selectedMoveRemainingCards = handSize - selectedCount;
  const selectedMovePlaysLastCards = selectedCount > 0
    && selectionComplete
    && handSize > 1
    && selectedMoveRemainingCards === 0;
  const myMakaoReady = makaoState?.declared === true || makaoState?.armed === true;
  const selectedMoveBlockedByMakao = selectedMovePlaysLastCards && !myMakaoReady;
  const myMakaoDeclareUntil = makaoState?.declareUntil ?? makaoState?.canBeCaughtAt;
  const canDeclareMissingMakao = makaoState?.declared === false
    && (!myMakaoDeclareUntil || estimatedServerNow < myMakaoDeclareUntil);
  const canArmMakaoForSelectedMove = isMyTurn && selectedMovePlaysLastCards && !myMakaoReady;
  const canDeclareMakaoNow = canDeclareMissingMakao || canArmMakaoForSelectedMove;
  const shouldShowMakaoButton = (handSize === 1 && makaoState?.declared === false)
    || canArmMakaoForSelectedMove;

  return {
    selectedMoveRemainingCards,
    selectedMovePlaysLastCards,
    myMakaoReady,
    selectedMoveBlockedByMakao,
    canDeclareMissingMakao,
    canArmMakaoForSelectedMove,
    canDeclareMakaoNow,
    shouldShowMakaoButton
  };
}

export function shouldResumePendingMakaoPlay({
  hasPendingAction = false,
  isMyTurn = false,
  validSelection = false,
  playsLastCards = false,
  makaoReady = false
}) {
  return !hasPendingAction
    && isMyTurn
    && validSelection
    && playsLastCards
    && makaoReady;
}
