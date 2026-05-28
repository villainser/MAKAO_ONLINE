import theme from '../frontend/theme.config.js';

const CARD_ASSET_BASE = theme.cards.assetBase || '/cards';
const CARD_ASSET_EXTENSION = theme.cards.assetExtension || 'svg';

const cardRanks = new Set([
  '2', '3', '4', '5', '6', '7', '8', '9', '10',
  'jack', 'queen', 'king', 'ace'
]);

const cardSuits = new Set(['hearts', 'diamonds', 'clubs', 'spades']);

function getJokerAssetName(card) {
  const id = String(card?.cardInstanceId || '');
  if (/joker_3(?:\b|$)/.test(id)) return `joker-a.${CARD_ASSET_EXTENSION}`;
  return /joker_2(?:\b|$)/.test(id)
    ? `joker-d.${CARD_ASSET_EXTENSION}`
    : `joker-b.${CARD_ASSET_EXTENSION}`;
}

export function getCardImagePath(card, options = {}) {
  if (options.hidden || !card?.rank) return `${CARD_ASSET_BASE}/back.${CARD_ASSET_EXTENSION}`;

  if (card.rank === 'joker' && !card.jokerDeclaration) {
    return `${CARD_ASSET_BASE}/${getJokerAssetName(card)}`;
  }

  const rank = card.rank === 'joker' ? card.jokerDeclaration?.rank : card.rank;
  const suit = card.rank === 'joker' ? card.jokerDeclaration?.suit : card.suit;

  if (!cardRanks.has(rank) || !cardSuits.has(suit)) return null;
  return `${CARD_ASSET_BASE}/${rank}-${suit}.${CARD_ASSET_EXTENSION}`;
}

export function getCardImageStyle(imagePath) {
  return imagePath ? { '--card-image': `url("${imagePath}")` } : {};
}
