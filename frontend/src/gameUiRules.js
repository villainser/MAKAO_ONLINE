export function isMultipleCardPlayEnabled(settings) {
  return settings?.allowMultipleCards !== false;
}

export function canStageAnotherCard({ settings, selectedCount = 0, alreadySelected = false }) {
  return alreadySelected || isMultipleCardPlayEnabled(settings) || selectedCount === 0;
}

export function getJokerRankCandidates({ ranks = [], activeEffectType = null, forcedRank = null }) {
  const availableRanks = ranks.filter(rank => rank && rank !== 'joker');
  const allowedForEffect = activeEffectType === 'skip_turn'
    ? availableRanks.filter(rank => rank === '4')
    : availableRanks;
  if (!forcedRank) return allowedForEffect;
  return allowedForEffect.includes(forcedRank) ? [forcedRank] : [];
}

export function canDrawFromPile({
  gameOver = false,
  isMyTurn = false,
  hasPendingAction = false,
  hasDrawnCardThisTurn = false,
  activeEffectType = null
}) {
  if (gameOver || !isMyTurn || hasPendingAction || activeEffectType === 'skip_turn') return false;
  return !hasDrawnCardThisTurn || activeEffectType === 'draw_penalty';
}

export function canPassAfterDraw({ hasDrawnCardThisTurn = false, activeEffectType = null }) {
  return hasDrawnCardThisTurn
    && activeEffectType !== 'draw_penalty'
    && activeEffectType !== 'skip_turn';
}
