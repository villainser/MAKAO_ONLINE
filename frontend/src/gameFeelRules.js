export const TABLE_RETURN_COPY = Object.freeze({
  action: 'Wróć do stołu',
  pending: 'Wracam do stołu…',
  title: 'Powrót do stołu',
  success: 'Stół jest aktualny.',
  failure: 'Nie udało się wrócić do stołu. Spróbuj ponownie.',
  offlineMove: 'Wracamy do stołu…'
});

export function getSensoryChannels({ reducedMotion = false, hapticsEnabled = true } = {}) {
  return {
    cardMotion: !reducedMotion,
    haptics: Boolean(hapticsEnabled)
  };
}

export function getCardMotionTiming(kind, index, animations) {
  const isDraw = kind === 'draw';
  const duration = Math.max(0, Number(
    isDraw ? animations?.drawDuration : animations?.throwDuration
  ) || 0);
  const stagger = Math.max(0, Number(
    isDraw ? animations?.drawStagger : animations?.throwStagger
  ) || 0);
  const landingAt = Math.max(0, Math.min(1, Number(
    isDraw ? animations?.drawLandingAt : animations?.throwLandingAt
  ) || 0));
  const delay = Math.max(0, Number(index) || 0) * stagger;

  return {
    duration,
    delay,
    landingDelay: Math.round(duration * landingAt + delay)
  };
}

export function getPendingMoveHint({ pendingAction = false, connected = true } = {}) {
  if (!pendingAction) return null;
  return connected ? null : TABLE_RETURN_COPY.offlineMove;
}

export function getHumanMoveErrorMessage(message) {
  const normalized = String(message || '').trim();
  if (!normalized || /serwer|server|synchroniz/i.test(normalized)) {
    return 'Ten ruch się nie udał. Spróbuj ponownie.';
  }
  return normalized;
}
