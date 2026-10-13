import assert from 'node:assert/strict';
import test from 'node:test';

import theme from '../theme.config.js';
import {
  getCardMotionTiming,
  getHumanMoveErrorMessage,
  getPendingMoveHint,
  getSensoryChannels,
  TABLE_RETURN_COPY
} from '../src/gameFeelRules.js';

test('card flights use a readable human rhythm with a short settle', () => {
  const play = getCardMotionTiming('play', 0, theme.animations);
  const draw = getCardMotionTiming('draw', 0, theme.animations);
  const nextDraw = getCardMotionTiming('draw', 1, theme.animations);

  assert.ok(play.duration >= 520 && play.duration <= 700);
  assert.ok(draw.duration >= 420 && draw.duration <= 600);
  assert.ok(play.landingDelay < play.duration);
  assert.ok(draw.landingDelay < draw.duration);
  assert.equal(nextDraw.delay, theme.animations.drawStagger);
});

test('reduced motion and haptics stay independent', () => {
  assert.deepEqual(getSensoryChannels({ reducedMotion: true, hapticsEnabled: true }), {
    cardMotion: false,
    haptics: true
  });
  assert.deepEqual(getSensoryChannels({ reducedMotion: false, hapticsEnabled: false }), {
    cardMotion: true,
    haptics: false
  });
});

test('a short online pending move stays silent while offline copy returns to the table', () => {
  assert.equal(getPendingMoveHint({ pendingAction: true, connected: true }), null);
  assert.equal(
    getPendingMoveHint({ pendingAction: true, connected: false }),
    'Wracamy do stołu…'
  );
});

test('manual recovery copy speaks about the shared table, not infrastructure', () => {
  const visibleCopy = Object.values(TABLE_RETURN_COPY).join(' ');
  assert.doesNotMatch(visibleCopy, /serwer|server|synchroniz/i);
  assert.equal(TABLE_RETURN_COPY.success, 'Stół jest aktualny.');
});

test('technical action errors are replaced before reaching the table UI', () => {
  assert.equal(
    getHumanMoveErrorMessage('Serwer odrzucił akcję. Stan jest synchronizowany.'),
    'Ten ruch się nie udał. Spróbuj ponownie.'
  );
  assert.equal(getHumanMoveErrorMessage('Nie możesz położyć tej karty.'), 'Nie możesz położyć tej karty.');
});
