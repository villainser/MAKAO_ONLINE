import {
  BATTLE_COUNTER_MODES,
  EFFECT_TYPES,
  JACK_REQUEST_RANK_NON_BATTLE_KING,
  QUEEN_REQUEST_MODES,
  QUEEN_VARIANTS,
  RANKS,
  SUITS
} from './constants.js';

export function getEffectiveCard(card) {
  if (!card) return card;
  if (card.rank !== "joker" || !card.jokerDeclaration) return card;

  const { rank, suit } = card.jokerDeclaration;
  if (!RANKS.includes(rank) || rank === "joker" || !SUITS.includes(suit)) return card;
  return { ...card, rank, suit, declaredFromJoker: true };
}

export function isBattleCard(card) {
  const effectiveCard = getEffectiveCard(card);
  if (effectiveCard.rank === "2" || effectiveCard.rank === "3") return true;
  if (effectiveCard.rank === "king" && (effectiveCard.suit === "hearts" || effectiveCard.suit === "spades")) return true;
  return false;
}

export function getBattleValue(card) {
  const effectiveCard = getEffectiveCard(card);
  if (effectiveCard.rank === "2") return 2;
  if (effectiveCard.rank === "3") return 3;
  if (effectiveCard.rank === "king" && (effectiveCard.suit === "hearts" || effectiveCard.suit === "spades")) return 5;
  return 0;
}

function isDrawPenaltyCounter(card, state) {
  const effectiveCard = getEffectiveCard(card);
  if (!isBattleCard(effectiveCard)) return false;

  const battleSuit = state.activeEffect?.battleSuit;
  if (battleSuit && effectiveCard.suit === battleSuit) return true;

  const battleCounterMode = state.settings?.battleCounterMode || BATTLE_COUNTER_MODES.SUIT_OR_RANK;
  if (battleCounterMode !== BATTLE_COUNTER_MODES.SUIT_OR_RANK) return false;

  const topCard = getEffectiveCard(state.topCard);
  return Boolean(topCard && effectiveCard.rank === topCard.rank);
}

export function isNonBattleKingRequestValue(value) {
  return value === JACK_REQUEST_RANK_NON_BATTLE_KING;
}

export function matchesRankRequest(card, requestedRank) {
  const effectiveCard = getEffectiveCard(card);
  if (isNonBattleKingRequestValue(requestedRank)) {
    return effectiveCard.rank === "king" && (effectiveCard.suit === "clubs" || effectiveCard.suit === "diamonds");
  }
  return effectiveCard.rank === requestedRank;
}

export function compareCards(a, b) {
  const rankDiff = RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
  if (rankDiff !== 0) return rankDiff;

  const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  if (suitDiff !== 0) return suitDiff;

  const deckDiff = (a.deckIndex ?? 0) - (b.deckIndex ?? 0);
  if (deckDiff !== 0) return deckDiff;

  return String(a.cardInstanceId).localeCompare(String(b.cardInstanceId));
}

export function isCardLegal(card, state) {
  if (!card) return false;
  if (card.rank === "joker" && !card.jokerDeclaration) return true;

  let isLegal = false;
  const effectiveCard = getEffectiveCard(card);
  const topCard = getEffectiveCard(state.topCard);
  
  const queenVariant = state.settings?.queenVariant || QUEEN_VARIANTS.DEFENSIVE_NON_FUNCTIONAL;
  const queenRequestMode = state.settings?.queenRequestMode || QUEEN_REQUEST_MODES.CANCELS_REQUEST;
  const queenCanCancelRequest = queenRequestMode === QUEEN_REQUEST_MODES.CANCELS_REQUEST;

	  if (state.activeEffect) {
	    if (state.activeEffect.type === EFFECT_TYPES.DRAW_PENALTY) {
	      if (isDrawPenaltyCounter(effectiveCard, state)) {
	        isLegal = true;
	      } else if (effectiveCard.rank === "queen" && queenVariant === QUEEN_VARIANTS.WARSAW_PARDON && (effectiveCard.suit === "hearts" || effectiveCard.suit === "spades")) {
	        isLegal = true;
	      }
    } else if (state.activeEffect.type === EFFECT_TYPES.SUIT_REQUEST) {
      if (effectiveCard.suit === state.activeEffect.requestedSuit || (queenCanCancelRequest && effectiveCard.rank === "queen") || effectiveCard.rank === "ace") {
         isLegal = true;
      }
    } else if (state.activeEffect.type === EFFECT_TYPES.RANK_REQUEST) {
      if (matchesRankRequest(effectiveCard, state.activeEffect.requestedRank) || (queenCanCancelRequest && effectiveCard.rank === "queen") || effectiveCard.rank === "jack") {
         isLegal = true;
      }
    } else if (state.activeEffect.type === EFFECT_TYPES.SKIP_TURN) {
      if (effectiveCard.rank === "4") {
         isLegal = true;
      }
    }
  } else {
    if (effectiveCard.rank === "queen") {
      isLegal = true; // dama/joker na wszystko
    } else if (topCard && topCard.rank === "queen") {
      isLegal = true; // wszystko na damę
    } else if (topCard && (effectiveCard.rank === topCard.rank || effectiveCard.suit === topCard.suit)) {
      isLegal = true;
    }
  }

  return isLegal;
}
