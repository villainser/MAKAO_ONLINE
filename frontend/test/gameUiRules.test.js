import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canDrawFromPile,
  canPassAfterDraw,
  canStageAnotherCard,
  getJokerRankCandidates,
  isMultipleCardPlayEnabled
} from '../src/gameUiRules.js';

test('missing allowMultipleCards stays enabled for existing rooms', () => {
  assert.equal(isMultipleCardPlayEnabled(), true);
  assert.equal(isMultipleCardPlayEnabled({}), true);
  assert.equal(isMultipleCardPlayEnabled({ allowMultipleCards: true }), true);
});

test('a playable first penalty card keeps the next one-card pull available and disables bulk pass', () => {
  assert.equal(canDrawFromPile({
    isMyTurn: true,
    hasDrawnCardThisTurn: true,
    activeEffectType: 'draw_penalty'
  }), true);
  assert.equal(canPassAfterDraw({
    hasDrawnCardThisTurn: true,
    activeEffectType: 'draw_penalty'
  }), false);
  assert.equal(canDrawFromPile({
    isMyTurn: true,
    hasDrawnCardThisTurn: true,
    activeEffectType: 'skip_turn'
  }), false);
});

test('disabled allowMultipleCards blocks staging a second card but still allows deselection', () => {
  const settings = { allowMultipleCards: false };
  assert.equal(canStageAnotherCard({ settings, selectedCount: 0 }), true);
  assert.equal(canStageAnotherCard({ settings, selectedCount: 1 }), false);
  assert.equal(canStageAnotherCard({ settings, selectedCount: 1, alreadySelected: true }), true);
});

test('active four limits an undeclared Joker to an explicit four declaration', () => {
  assert.deepEqual(getJokerRankCandidates({
    ranks: ['2', '3', '4', '5', 'joker'],
    activeEffectType: 'skip_turn'
  }), ['4']);
});

test('forced same-rank staging remains authoritative unless it conflicts with active four', () => {
  assert.deepEqual(getJokerRankCandidates({
    ranks: ['2', '3', '4', '5', 'joker'],
    activeEffectType: 'skip_turn',
    forcedRank: '4'
  }), ['4']);
  assert.deepEqual(getJokerRankCandidates({
    ranks: ['2', '3', '4', '5', 'joker'],
    activeEffectType: 'skip_turn',
    forcedRank: '3'
  }), []);
});
