import { useEffect, useRef, useState } from 'react';
import { EVENTS, EFFECT_TYPES, JACK_REQUEST_RANKS, QUEEN_VARIANTS, RANKS, SUITS } from '../shared/constants';
import { compareCards, getBattleValue, getEffectiveCard, isCardLegal } from '../shared/utils';
import { getCardImagePath, getCardImageStyle } from '../shared/cardAssets';
import audioManager from '../audio/AudioManager.js';
import theme from '../../theme.config.js';

const HAND_SORT_STORAGE_KEY = 'makaoHandSortMode';
const HAND_PLAYABLE_FILTER_STORAGE_KEY = 'makaoHandPlayableFilter';
const HAPTICS_ENABLED_STORAGE_KEY = 'makaoHapticsEnabled';
const HAND_SORT_MODES = [
  { id: 'rank', label: 'Wartość', hint: 'Joker -> A -> 2, mocne karty z przodu' },
  { id: 'suit', label: 'Kolor', hint: 'Kier, karo, trefl, pik' },
  { id: 'type', label: 'Typ', hint: 'Kary, ⏸, specjalne, zwykłe' },
  { id: 'playable', label: 'Możliwe', hint: 'Karty możliwe teraz idą na początek' },
  { id: 'duplicates', label: 'Duplikaty', hint: 'Identyczne karty z wielu talii jako stos' },
  { id: 'draw', label: 'Dobranie', hint: 'Kolejność ręki z serwera' }
];

function getStoredHandSortMode() {
  const value = window.localStorage.getItem(HAND_SORT_STORAGE_KEY);
  return HAND_SORT_MODES.some(mode => mode.id === value) ? value : 'rank';
}

function getStoredPlayableFilter() {
  return window.localStorage.getItem(HAND_PLAYABLE_FILTER_STORAGE_KEY) === '1';
}

function shouldReduceMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function shouldUseHaptics() {
  try {
    return window.localStorage.getItem(HAPTICS_ENABLED_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function escapeAttributeSelectorValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function compareCardsHighFirst(a, b) {
  return compareCards(b, a);
}

function Game({ socket, room, gameState, socketId, onLeaveRoom }) {
  const [selectedCards, setSelectedCards] = useState([]);
  const [handSortMode, setHandSortModeState] = useState(getStoredHandSortMode);
  const [showOnlyPlayable, setShowOnlyPlayable] = useState(getStoredPlayableFilter);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(null);
  const [showJokerModal, setShowJokerModal] = useState(null);
  const [showHostResumeConfirm, setShowHostResumeConfirm] = useState(null);
  const [showHostActionConfirm, setShowHostActionConfirm] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [draggedCardId, setDraggedCardId] = useState(null);
  const [pointerDrag, setPointerDrag] = useState(null);
  const [cardMotions, setCardMotions] = useState([]);
  const [drawPilePulse, setDrawPilePulse] = useState(0);
  const [inspectedCard, setInspectedCard] = useState(null);
  const [cardPressTimerId, setCardPressTimerId] = useState(null);
  const [cardLongPressTriggered, setCardLongPressTriggered] = useState(false);
  const [pendingPlay, setPendingPlay] = useState(null);
  const [expandedHandRank, setExpandedHandRank] = useState(null);
  const [handScrollState, setHandScrollState] = useState({
    canScroll: false,
    thumbLeft: 0,
    thumbWidth: 100
  });
  const [now, setNow] = useState(() => Date.now());
  const handScrollRef = useRef(null);
  const discardDropRef = useRef(null);
  const pointerDragRef = useRef(null);
  const textStateRef = useRef(null);
  const motionIdRef = useRef(0);
  const pendingLocalDrawCountRef = useRef(0);
  const previousHandIdsRef = useRef(new Set(gameState.myHand.map(card => card.cardInstanceId)));
  const previousIsMyTurnRef = useRef(false);
  const gameOverSoundPlayedRef = useRef(Boolean(gameState.gameOver));
  const lastAnimatedHistoryVersionRef = useRef(gameState.moveHistory?.at(-1)?.version || 0);
  const suppressNextCardClickRef = useRef(false);
  const sortPressTimerRef = useRef(null);
  const sortLongPressTriggeredRef = useRef(false);

  const isGameOver = Boolean(gameState.gameOver);
  const gamePaused = Boolean(gameState.paused);
  const currentPlayerId = gameState.turnOrder[gameState.currentPlayerIndex];
  const isMyTurn = !isGameOver && !gamePaused && currentPlayerId === socketId;
  const isHost = room.hostId === socketId;

  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify(textStateRef.current || {
      screen: 'game',
      note: 'Stan gry nie został jeszcze wyrenderowany.'
    });
    window.advanceTime = (ms = 0) => {
      setNow(Date.now() + Math.max(0, Number(ms) || 0));
      return window.render_game_to_text();
    };

    return () => {
      if (window.render_game_to_text) delete window.render_game_to_text;
      if (window.advanceTime) delete window.advanceTime;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(sortPressTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(cardPressTimerId);
  }, [cardPressTimerId]);

  const closeExpandedHandGroup = () => {
    setExpandedHandRank(null);
  };

  const getCardElement = (cardId) => {
    if (!cardId) return null;
    return document.querySelector(`[data-card-id="${escapeAttributeSelectorValue(cardId)}"]`);
  };

  const getOpponentElement = (playerId) => {
    if (!playerId) return null;
    const nodes = document.querySelectorAll(`[data-player-id="${escapeAttributeSelectorValue(playerId)}"]`);
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return node;
    }
    return nodes[0] || null;
  };

  const playUiFeedback = (kind = 'tap', options = {}) => {
    const patterns = {
      play: [10, 18, 12],
      draw: [8],
      remote: [4],
      makao: [8, 28, 8],
      win: [16, 30, 16],
      error: [18],
      tap: [6]
    };

    if (shouldUseHaptics() && !shouldReduceMotion()) {
      navigator.vibrate?.(patterns[kind] || patterns.tap);
    }

    const sound = {
      play: 'card_throw',
      draw: 'card_draw',
      remote: options.throw ? 'card_throw' : 'card_land',
      makao: 'makao',
      win: 'round_win',
      error: 'illegal_move',
      tap: 'card_land'
    }[kind] || 'card_land';

    audioManager.playSound(sound, options.audio || {});
  };

  const isFunctionalCard = (card) => {
    const effectiveCard = getEffectiveCard(card);
    if (!effectiveCard?.rank) return false;
    if (['2', '3', '4', 'ace', 'jack', 'queen', 'joker'].includes(effectiveCard.rank)) return true;
    return effectiveCard.rank === 'king' && ['hearts', 'spades'].includes(effectiveCard.suit);
  };

  const playCardThrowFeedback = (cards = []) => {
    playUiFeedback('play');
    audioManager.playSound('card_land', {
      delay: Math.max(0.05, theme.animations.throwDuration * 0.68 / 1000),
      volume: 0.88
    });

    if (cards.some(isFunctionalCard)) {
      audioManager.playSound('card_function', {
        delay: Math.max(0.08, theme.animations.throwDuration * 0.45 / 1000),
        volume: 0.92
      });
    }
  };

  const queueCardMotion = (card, sourceElement, targetElement, kind = 'play', index = 0, options = {}) => {
    if (shouldReduceMotion()) return;

    const sourceRect = sourceElement?.getBoundingClientRect();
    const targetRect = targetElement?.getBoundingClientRect();
    if (!sourceRect || !targetRect) return;

    const id = `motion_${motionIdRef.current++}`;
    const width = Math.max(24, options.width || sourceRect.width || targetRect.width);
    const height = Math.max(34, options.height || sourceRect.height || targetRect.height);
    const fromX = sourceRect.left + (sourceRect.width - width) / 2;
    const fromY = sourceRect.top + (sourceRect.height - height) / 2;
    const toX = targetRect.left + (targetRect.width - width) / 2;
    const toY = targetRect.top + (targetRect.height - height) / 2;
    const midX = fromX + (toX - fromX) * 0.5;
    const arcHeight = options.arcHeight || theme.animations.arcHeight;
    const midY = kind === 'draw'
      ? Math.min(fromY, toY) - Math.min(arcHeight, Math.abs(toY - fromY) * 0.22 + 18)
      : Math.min(fromY, toY) - Math.min(arcHeight * 1.45, Math.abs(toY - fromY) * 0.32 + 30);
    const duration = kind === 'draw' ? theme.animations.drawDuration : theme.animations.throwDuration;
    const delay = index * (kind === 'draw' ? 62 : 72);
    const rotate = kind === 'draw'
      ? ['-2deg', '7deg', '1deg']
      : ['-5deg', '10deg', '-2deg'];

    const motionCard = {
      ...card,
      cardInstanceId: card.cardInstanceId || id
    };

    setCardMotions(prev => [
      ...prev,
      {
        id,
        card: motionCard,
        kind,
        style: {
          '--motion-width': `${width}px`,
          '--motion-height': `${height}px`,
          '--motion-from-x': `${fromX}px`,
          '--motion-from-y': `${fromY}px`,
          '--motion-mid-x': `${midX}px`,
          '--motion-mid-y': `${midY}px`,
          '--motion-to-x': `${toX}px`,
          '--motion-to-y': `${toY}px`,
          '--motion-start-rotate': rotate[0],
          '--motion-mid-rotate': rotate[1],
          '--motion-end-rotate': rotate[2],
          '--motion-duration': `${duration}ms`,
          '--motion-delay': `${delay}ms`
        }
      }
    ]);

    window.setTimeout(() => {
      setCardMotions(prev => prev.filter(motion => motion.id !== id));
    }, duration + delay + 120);
  };

  const animatePlayedCards = (payload) => {
    const targetElement = discardDropRef.current;
    const cards = getDeclaredPlayCards(payload);
    cards.forEach((card, index) => {
      queueCardMotion(
        card,
        getCardElement(card.cardInstanceId),
        targetElement,
        'play',
        index
      );
    });
  };

  const animateDrawToHand = (count = 1, drawnCards = []) => {
    const sourceElement = getCardElement('draw_pile');
    const targetElement = handScrollRef.current;
    const visibleCount = Math.max(1, Math.min(count || 1, 5));

    setDrawPilePulse(prev => prev + 1);
    window.setTimeout(() => setDrawPilePulse(prev => Math.max(0, prev - 1)), theme.animations.drawDuration + 80);

    for (let index = 0; index < visibleCount; index += 1) {
      queueCardMotion(
        drawnCards[index] || { cardInstanceId: `draw_motion_${motionIdRef.current}_${index}` },
        sourceElement,
        targetElement,
        'draw',
        index,
        { width: 54, height: 81 }
      );
    }
  };

  const animateRemotePlay = (event) => {
    const targetElement = discardDropRef.current;
    const sourceElement = getOpponentElement(event.playerId);
    const playedCards = event.details?.playedCards || [];
    playedCards.slice(0, 4).forEach((card, index) => {
      queueCardMotion(
        {
          ...card,
          cardInstanceId: `remote_play_${event.version}_${index}`
        },
        sourceElement,
        targetElement,
        'play',
        index,
        { width: 54, height: 81 }
      );
    });
    if (playedCards.length > 0) playCardThrowFeedback(playedCards);
  };

  const animateRemoteDraw = (event) => {
    const sourceElement = getCardElement('draw_pile');
    const targetElement = getOpponentElement(event.playerId);
    const drawnCount = event.details?.drawnCount || event.details?.amount || 1;
    const visibleCount = Math.max(1, Math.min(drawnCount, 5));

    for (let index = 0; index < visibleCount; index += 1) {
      queueCardMotion(
        { cardInstanceId: `remote_draw_${event.version}_${index}` },
        sourceElement,
        targetElement,
        'draw',
        index,
        { width: 42, height: 63 }
      );
    }
    audioManager.playSound('card_draw', { volume: 0.55 });
  };

  useEffect(() => {
    const latestEvent = gameState.moveHistory?.at(-1);
    if (!latestEvent?.version) return;

    if (latestEvent.version < lastAnimatedHistoryVersionRef.current) {
      lastAnimatedHistoryVersionRef.current = latestEvent.version;
      return;
    }

    if (latestEvent.version <= lastAnimatedHistoryVersionRef.current) return;
    lastAnimatedHistoryVersionRef.current = latestEvent.version;

    if (latestEvent.type === 'draw_pile_refilled') {
      audioManager.playSound('deck_shuffle');
      return;
    }

    if (!latestEvent.playerId || latestEvent.playerId === socketId) return;

    if (latestEvent.type === 'play_cards') {
      animateRemotePlay(latestEvent);
      return;
    }

    if (latestEvent.type === 'draw_card' || latestEvent.type === 'accept_penalty') {
      animateRemoteDraw(latestEvent);
    }
  });

  useEffect(() => {
    const previousIds = previousHandIdsRef.current;
    const addedCards = gameState.myHand.filter(card => !previousIds.has(card.cardInstanceId));

    if (pendingLocalDrawCountRef.current > 0 && addedCards.length > 0) {
      const visibleCards = addedCards.slice(0, pendingLocalDrawCountRef.current);
      animateDrawToHand(visibleCards.length, visibleCards);
      pendingLocalDrawCountRef.current = Math.max(0, pendingLocalDrawCountRef.current - visibleCards.length);
    }

    previousHandIdsRef.current = new Set(gameState.myHand.map(card => card.cardInstanceId));
  });

  useEffect(() => {
    if (isMyTurn && !previousIsMyTurnRef.current) {
      audioManager.playSound('turn_ping');
    }
    previousIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  useEffect(() => {
    if (gameState.gameOver && !gameOverSoundPlayedRef.current) {
      gameOverSoundPlayedRef.current = true;
      if (gameState.winnerId === socketId) {
        playUiFeedback('win');
      }
    }

    if (!gameState.gameOver) {
      gameOverSoundPlayedRef.current = false;
    }
  }, [gameState.gameOver, gameState.winnerId, socketId]);

  const setHandSortMode = (mode) => {
    setHandSortModeState(mode);
    window.localStorage.setItem(HAND_SORT_STORAGE_KEY, mode);
    closeExpandedHandGroup();
  };

  const cycleHandSortMode = () => {
    const currentIndex = HAND_SORT_MODES.findIndex(mode => mode.id === handSortMode);
    const nextMode = HAND_SORT_MODES[(currentIndex + 1) % HAND_SORT_MODES.length];
    setHandSortMode(nextMode.id);
  };

  const startSortPress = () => {
    sortLongPressTriggeredRef.current = false;
    window.clearTimeout(sortPressTimerRef.current);
    sortPressTimerRef.current = window.setTimeout(() => {
      sortLongPressTriggeredRef.current = true;
      setShowSortModal(true);
    }, 450);
  };

  const endSortPress = () => {
    window.clearTimeout(sortPressTimerRef.current);
  };

  const handleSortClick = () => {
    if (sortLongPressTriggeredRef.current) {
      sortLongPressTriggeredRef.current = false;
      return;
    }
    cycleHandSortMode();
  };

  const togglePlayableFilter = () => {
    setShowOnlyPlayable(prev => {
      const next = !prev;
      window.localStorage.setItem(HAND_PLAYABLE_FILTER_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const toggleCardSelection = (cardId) => {
    setSelectedCards(prev => 
      prev.includes(cardId) 
        ? prev.filter(id => id !== cardId) 
        : [...prev, cardId]
    );
  };

  const startCardPress = (card, inspectable) => {
    if (!inspectable) return;
    setCardLongPressTriggered(false);
    window.clearTimeout(cardPressTimerId);
    const nextTimerId = window.setTimeout(() => {
      setCardLongPressTriggered(true);
      setInspectedCard(card);
    }, 460);
    setCardPressTimerId(nextTimerId);
  };

  const endCardPress = () => {
    window.clearTimeout(cardPressTimerId);
    setCardPressTimerId(null);
  };

  const handleCardClick = (onClick) => {
    if (suppressNextCardClickRef.current) {
      suppressNextCardClickRef.current = false;
      return;
    }
    if (cardLongPressTriggered) {
      setCardLongPressTriggered(false);
      return;
    }
    onClick?.();
  };

  const getDeclaredPlayCards = (payload) => {
    return payload.cardIds.map(id => {
      const card = gameState.myHand.find(c => c.cardInstanceId === id);
      const declaration = payload.jokerDeclarations?.[id];
      return card?.rank === 'joker' && declaration
        ? { ...card, jokerDeclaration: declaration }
        : card;
    }).filter(Boolean);
  };

  const getPendingCards = (payload = pendingPlay) => {
    return (payload?.cardIds || [])
      .map(id => gameState.myHand.find(card => card.cardInstanceId === id))
      .filter(Boolean);
  };

  const getForcedJokerRank = (payload = pendingPlay, declarations = {}) => {
    const declaredRanks = getPendingCards(payload)
      .map(card => {
        if (card.rank !== 'joker') return card.rank;
        return declarations[card.cardInstanceId]?.rank || null;
      })
      .filter(Boolean);
    return declaredRanks[0] || null;
  };

  const getAllowedJokerSuits = (rank, declarations = {}, jokerId = null) => {
    if (!rank || rank === 'joker') return [];

    const cards = getPendingCards(pendingPlay);
    const firstCard = cards[0];
    const currentJokerIsAnchor = Boolean(jokerId && firstCard?.cardInstanceId === jokerId);
    const forcedRank = getForcedJokerRank(pendingPlay, declarations);
    const jokerCard = gameState.myHand.find(card => card.cardInstanceId === jokerId) || { rank: 'joker' };
    const declaredJoker = {
      ...jokerCard,
      jokerDeclaration: { rank, suit: 'hearts' }
    };

    if (gameState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY) {
      return SUITS.filter(suit => isCardLegal({
        ...declaredJoker,
        jokerDeclaration: { rank, suit }
      }, gameState));
    }

    if (!currentJokerIsAnchor && forcedRank) {
      return [...SUITS];
    }

    return SUITS.filter(suit => isCardLegal({
      ...declaredJoker,
      jokerDeclaration: { rank, suit }
    }, gameState));
  };

  const getAllowedJokerRanks = (declarations = {}, jokerId = null) => {
    const forcedRank = getForcedJokerRank(pendingPlay, declarations);
    if (forcedRank) return [forcedRank];
    return RANKS
      .filter(rank => rank !== 'joker')
      .filter(rank => getAllowedJokerSuits(rank, declarations, jokerId).length > 0);
  };

  const withExpectedStateVersion = (payload) => {
    if (!payload || payload.expectedStateVersion) return payload;
    const expectedStateVersion = gameState?.stateVersion || 0;
    return expectedStateVersion > 0 ? { ...payload, expectedStateVersion } : payload;
  };

  const continuePlayWithPayload = (payload) => {
    const playPayload = withExpectedStateVersion(payload);
    const declaredCards = getDeclaredPlayCards(playPayload);
    const effectiveCards = declaredCards.map(getEffectiveCard);
    const firstRank = effectiveCards[0]?.rank;

    if (firstRank === 'ace') {
      setPendingPlay(playPayload);
      setShowRequestModal({ type: 'suit' });
      return;
    }

    if (firstRank === 'jack') {
      setPendingPlay(playPayload);
      setShowRequestModal({ type: 'rank' });
      return;
    }

    animatePlayedCards(playPayload);
    playCardThrowFeedback(declaredCards);
    socket.emit(EVENTS.PLAY_CARDS, playPayload);
    setSelectedCards([]);
    closeExpandedHandGroup();
    setPendingPlay(null);
  };

  const canPlayCardIdsNow = (cardIds) => {
    const cards = cardIds
      .map(id => gameState.myHand.find(card => card.cardInstanceId === id))
      .filter(Boolean);
    if (cards.length !== cardIds.length || cards.length === 0) return false;

    const remainingCards = gameState.myHand.length - cards.length;
    const playsLastCards = gameState.myHand.length > 1 && remainingCards === 0;
    const makaoState = gameState.makao?.[socketId];
    const makaoReady = makaoState?.declared === true || makaoState?.armed === true;
    return !playsLastCards || makaoReady;
  };

  const startPlayWithCardIds = (cardIds) => {
    if (cardIds.length === 0) return;
    if (!canPlayCardIdsNow(cardIds)) {
      setSelectedCards(cardIds);
      playUiFeedback('error');
      return;
    }

    const cardsToPlay = cardIds.map(id => gameState.myHand.find(c => c.cardInstanceId === id));
    const jokerIds = cardsToPlay
      .filter(card => card?.rank === 'joker')
      .map(card => card.cardInstanceId);

    const basePayload = withExpectedStateVersion({ cardIds });
    if (jokerIds.length > 0) {
      setPendingPlay(basePayload);
      setShowJokerModal({
        jokerIds,
        index: 0,
        declarations: {},
        selectedRank: getForcedJokerRank(basePayload, {})
      });
      return;
    }

    continuePlayWithPayload(basePayload);
  };

  const playSelectedCards = () => {
    startPlayWithCardIds(selectedCards);
  };

  const confirmPlayWithRequest = (value) => {
    const payload = withExpectedStateVersion({ ...pendingPlay });
    if (showRequestModal.type === 'suit') payload.suitRequest = value;
    if (showRequestModal.type === 'rank') payload.rankRequest = value;
    const declaredCards = getDeclaredPlayCards(payload);

    animatePlayedCards(payload);
    playCardThrowFeedback(declaredCards);
    socket.emit(EVENTS.PLAY_CARDS, payload);
    setSelectedCards([]);
    closeExpandedHandGroup();
    setShowRequestModal(null);
    setPendingPlay(null);
  };

  const chooseJokerRank = (rank) => {
    const jokerId = showJokerModal?.jokerIds[showJokerModal.index];
    if (!getAllowedJokerRanks(showJokerModal?.declarations || {}, jokerId).includes(rank)) return;
    setShowJokerModal(prev => ({ ...prev, selectedRank: rank }));
  };

  const chooseJokerSuit = (suit) => {
    if (!showJokerModal?.selectedRank || !pendingPlay) return;

    const jokerId = showJokerModal.jokerIds[showJokerModal.index];
    const allowedSuits = getAllowedJokerSuits(showJokerModal.selectedRank, showJokerModal.declarations, jokerId);
    if (!allowedSuits.includes(suit)) return;
    const declarations = {
      ...showJokerModal.declarations,
      [jokerId]: {
        rank: showJokerModal.selectedRank,
        suit
      }
    };
    const nextIndex = showJokerModal.index + 1;

    if (nextIndex < showJokerModal.jokerIds.length) {
      setShowJokerModal({
        ...showJokerModal,
        index: nextIndex,
        declarations,
        selectedRank: getForcedJokerRank(pendingPlay, declarations)
      });
      return;
    }

    setShowJokerModal(null);
    continuePlayWithPayload({
      ...pendingPlay,
      jokerDeclarations: declarations
    });
  };

  const cancelJokerDeclaration = () => {
    setShowJokerModal(null);
    setPendingPlay(null);
  };

  const drawCard = () => {
    pendingLocalDrawCountRef.current = Math.max(pendingLocalDrawCountRef.current, 1);
    playUiFeedback('draw');
    socket.emit(EVENTS.DRAW_CARD);
  };

  const acceptPenalty = () => {
    const penaltyCount = gameState.activeEffect?.amount || 1;
    pendingLocalDrawCountRef.current = Math.max(pendingLocalDrawCountRef.current, penaltyCount);
    playUiFeedback('draw');
    socket.emit(EVENTS.ACCEPT_PENALTY);
  };

  const acceptSkip = () => {
    audioManager.playSound('card_function');
    socket.emit(EVENTS.ACCEPT_SKIP);
  };

  const declareMakao = () => {
    playUiFeedback('makao');
    socket.emit(EVENTS.DECLARE_MAKAO, withExpectedStateVersion({}));
  };

  const catchMakao = (targetPlayerId) => {
    playUiFeedback('makao');
    socket.emit(EVENTS.CATCH_MAKAO, withExpectedStateVersion({ targetPlayerId }));
  };

  const passTurn = () => {
    audioManager.playSound('card_land', { volume: 0.55 });
    socket.emit(EVENTS.PASS_TURN);
    setSelectedCards([]);
    closeExpandedHandGroup();
  };

  const handleCardDragStart = (cardId) => {
    setDraggedCardId(cardId);
  };

  const handleCardDragEnd = () => {
    setDraggedCardId(null);
  };

  const handleTableDrop = (event) => {
    event.preventDefault();
    const cardId = event.dataTransfer?.getData('text/plain') || draggedCardId;
    if (!cardId) return;
    const nextSelection = selectedCards.includes(cardId) ? selectedCards : [cardId];
    startPlayWithCardIds(nextSelection);
    setDraggedCardId(null);
  };

  const handlePointerCardDragStart = (event, cardId, draggable) => {
    if (!draggable) return;
    pointerDragRef.current = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerCardDragMove = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const distance = Math.hypot(deltaX, deltaY);
    const shouldStartDrag = distance > 12 && Math.abs(deltaY) > Math.abs(deltaX) * 0.7;

    if (!drag.active && !shouldStartDrag) return;

    const nextDrag = {
      ...drag,
      x: event.clientX,
      y: event.clientY,
      active: true
    };
    pointerDragRef.current = nextDrag;
    setPointerDrag(nextDrag);
    setDraggedCardId(drag.cardId);
    endCardPress();
    event.preventDefault();
  };

  const handlePointerCardDragFinish = (event) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;

    pointerDragRef.current = null;
    setPointerDrag(null);

    if (!drag.active) return false;

    const dropRect = discardDropRef.current?.getBoundingClientRect();
    const droppedOnTable = Boolean(
      dropRect &&
      event.clientX >= dropRect.left &&
      event.clientX <= dropRect.right &&
      event.clientY >= dropRect.top &&
      event.clientY <= dropRect.bottom
    );

    if (droppedOnTable) {
      const nextSelection = selectedCards.includes(drag.cardId) ? selectedCards : [drag.cardId];
      startPlayWithCardIds(nextSelection);
    }

    setDraggedCardId(null);
    suppressNextCardClickRef.current = true;
    window.setTimeout(() => {
      suppressNextCardClickRef.current = false;
    }, 0);
    event.preventDefault();
    return true;
  };

  const handlePointerCardDragCancel = () => {
    pointerDragRef.current = null;
    setPointerDrag(null);
    setDraggedCardId(null);
  };

  const pauseGame = () => {
    socket.emit(EVENTS.PAUSE_GAME);
  };

  const resumeGame = () => {
    if (
      gameState.pauseReason === 'manual' &&
      gameState.pausedPlayerId !== socketId &&
      isHost
    ) {
      setShowHostResumeConfirm({ step: 1 });
      return;
    }
    socket.emit(EVENTS.RESUME_GAME, {});
  };

  const confirmHostResumeOverride = () => {
    if (showHostResumeConfirm?.step === 1) {
      setShowHostResumeConfirm({ step: 2 });
      return;
    }
    socket.emit(EVENTS.RESUME_GAME, {
      hostOverrideConfirmed: true,
      hostOverrideRiskAccepted: true
    });
    setShowHostResumeConfirm(null);
  };

  const requestHostAction = (action) => {
    setShowHostActionConfirm({ ...action, step: 1 });
  };

  const confirmHostAction = () => {
    if (showHostActionConfirm?.step === 1) {
      setShowHostActionConfirm({ ...showHostActionConfirm, step: 2 });
      return;
    }

    socket.emit(showHostActionConfirm.event, {
      targetPlayerId: showHostActionConfirm.targetPlayerId,
      hostOverrideConfirmed: true,
      hostOverrideRiskAccepted: true
    });
    setShowHostActionConfirm(null);
  };

  const transferHost = (targetPlayerId) => {
    socket.emit(EVENTS.TRANSFER_HOST, { targetPlayerId });
  };

  const returnToLobby = () => {
    socket.emit(EVENTS.RETURN_TO_LOBBY);
  };

  const requestLeaveRoom = () => {
    if (isGameOver) {
      onLeaveRoom();
      return;
    }
    setShowLeaveConfirm(true);
  };

  const getPlayerName = (playerId) => {
    const gamePlayer = gameState.players?.find(p => p.id === playerId);
    return gamePlayer?.name || room.players.find(p => p.id === playerId)?.name || 'Gracz';
  };

  const formatPauseCount = (count) => {
    return `⏸ ${Math.max(0, count || 0)}`;
  };

  const formatCardCount = (count) => {
    if (count === 1) return '1 karta';
    if (count >= 2 && count <= 4) return `${count} karty`;
    return `${count} kart`;
  };

  const formatGroupCount = (count) => {
    if (count === 1) return '1 grupa';
    if (count >= 2 && count <= 4) return `${count} grupy`;
    return `${count} grup`;
  };

  const formatHistoryTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatCard = (card) => {
    if (!card) return 'kartę';
    const rank = getRankLabel(getCardRank(card));
    const suit = getSuitSymbol(getCardSuit(card));
    return `${rank}${suit}`;
  };

  const getRankLabel = (rank) => ({
    ace: 'A',
    jack: 'J',
    queen: 'Q',
    king: 'K',
    non_battle_king: 'K♣/♦',
    joker: 'JOK'
  }[rank] || rank);

  const getCardRank = (card) => getEffectiveCard(card)?.rank;

  const getCardSuit = (card) => getEffectiveCard(card)?.suit;

  const getSuitSymbol = (suit) => ({
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  }[suit] || '');

  const getSuitName = (suit) => ({
    hearts: 'kier',
    diamonds: 'karo',
    clubs: 'trefl',
    spades: 'pik'
  }[suit] || suit);

  const formatTurnEvent = (event) => {
    if (event.type === 'draw_pile_refilled') {
      return `Stos dobierania przetasowany. Nowa karta stołu: ${formatCard(event.topCard)}`;
    }
    const name = getPlayerName(event.playerId);
    const nextName = event.nextPlayerId ? getPlayerName(event.nextPlayerId) : getPlayerName(currentPlayerId);
    if (event.type === 'skip_added') return `${name} ma ${formatPauseCount(event.remaining)}`;
    if (event.type === 'skip_used') return `${name} ⏸. Zostaje ${formatPauseCount(event.remaining)}. Teraz gra ${nextName}`;
    if (event.type === 'skip_finished') return `${name} ⏸. Zużyte. Teraz gra ${nextName}`;
    if (event.type === 'auto_draw_playable') {
      if (event.playerId === socketId) return `Dobrałeś ${formatCard(event.drawnCard)}. Decydujesz: zagrać albo spasować`;
      return `${name} dobrał kartę. ${name} decyduje: zagrać albo spasować`;
    }
    if (event.type === 'auto_draw_pass') {
      if (event.playerId === socketId) return `Dobrałeś ${formatCard(event.drawnCard)} bez odpowiedzi. Teraz gra ${nextName}`;
      return `${name} dobrał kartę bez odpowiedzi. Teraz gra ${nextName}`;
    }
    if (event.type === 'penalty_accepted') return `${name} dobrał karę +${event.amount}. Teraz gra ${nextName}`;
    if (event.type === 'makao_armed') return `${name}: Makao gotowe`;
    if (event.type === 'makao_declared') return `${name}: Makao`;
    if (event.type === 'makao_missing') return `${name} ma 1 kartę`;
    if (event.type === 'makao_caught') return `${name} złapany na braku Makao: +${event.amount}`;
    if (event.type === 'player_finished') return `${name} skończył grę`;
    if (event.type === 'game_over') return `Wygrał ${name}`;
    if (event.type === 'game_paused_disconnect') return `Gra ⏸: czekamy na powrót gracza ${name}`;
    if (event.type === 'game_resumed_disconnect') return `${name} wrócił do gry`;
    if (event.type === 'game_paused_manual') return `${name} wstrzymał grę`;
    if (event.type === 'game_resumed_manual') return `${name} wznowił grę`;
    if (event.type === 'host_removed_player') return `${name} został usunięty z gry`;
    if (event.type === 'player_left') return `${name} opuścił grę`;
    if (event.type === 'host_skipped_offline') return `Host pominął offline: ${name}. Teraz gra ${nextName}`;
    if (event.type === 'host_forced_effect') return `Host rozliczył efekt gracza ${name}. Teraz gra ${nextName}`;
    if (event.type === 'host_ended_game') return `${name} zakończył partię`;
    if (event.type === 'host_transferred') return `${name} przekazał hosta graczowi ${getPlayerName(event.targetPlayerId)}`;
    if (event.type === 'turn_timeout_loss') return `${name} przekroczył limit czasu i przegrywa${event.nextPlayerId ? `. Teraz gra ${nextName}` : ''}`;
    return null;
  };

  const formatHistoryEvent = (event) => {
    const actor = event.playerId ? getPlayerName(event.playerId) : 'System';
    const version = event.version ? `#${event.version}` : '';
    const cards = event.details?.playedCards?.length
      ? event.details.playedCards.map(formatCard).join(', ')
      : null;
    const request = event.details?.suitRequest && event.details.suitRequest !== 'none'
      ? `, żąda ${getSuitName(event.details.suitRequest)}`
      : event.details?.rankRequest && event.details.rankRequest !== 'none'
        ? `, żąda ${getRankLabel(event.details.rankRequest)}`
        : '';
    const labels = {
      game_started: `start gry: ${event.details?.playerCount || '?'} graczy, ${event.details?.deckCount || '?'} talia`,
      play_cards: cards ? `zagrał ${cards}${request}` : `ruch: ${event.details?.cardCount || 1} kart`,
      draw_card: event.details?.canPlayDrawnCard ? 'dobrał kartę i decyduje' : 'dobranie karty',
      accept_penalty: `przyjęcie kary +${event.details?.amount || '?'}`,
      accept_skip: `przyjęcie ⏸ ${event.details?.amount ? `(${formatPauseCount(event.details.amount)})` : ''}`,
      declare_makao: 'Makao',
      catch_makao: `złapanie Makao gracza ${getPlayerName(event.details?.targetPlayerId)}: +${event.details?.amount || '?'}`,
      pass_turn: 'pas po dobraniu',
      player_disconnected: 'rozłączenie',
      player_reconnected: 'powrót do gry',
      game_paused: '⏸',
      game_resumed: 'wznowienie',
      host_removed_player: `usunięcie gracza ${getPlayerName(event.details?.targetPlayerId)}`,
      player_left: 'opuszczenie gry',
      host_skipped_offline: `pominięcie offline ${getPlayerName(event.details?.targetPlayerId)}`,
      host_forced_effect: `wymuszenie efektu ${getPlayerName(event.details?.targetPlayerId)}`,
      host_ended_game: 'zakończenie partii',
      host_transferred: `przekazanie hosta ${getPlayerName(event.details?.targetPlayerId)}`,
      turn_timeout_loss: 'przegrana po czasie'
    };
    return `${version} ${actor}: ${labels[event.type] || event.type}`;
  };

  const myMakaoState = gameState.makao?.[socketId];
  const isDrawPenaltyActive = gameState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY;
  const isSkipEffectActive = gameState.activeEffect?.type === EFFECT_TYPES.SKIP_TURN;
  const drawnCard = gameState.myHand.find(c => c.cardInstanceId === gameState.drawnCardInstanceId);
  const activeSortMode = HAND_SORT_MODES.find(mode => mode.id === handSortMode) || HAND_SORT_MODES[0];
  const getCardTypePriority = (card) => {
    const effectiveCard = getEffectiveCard(card);
    if (effectiveCard.rank === '2' || effectiveCard.rank === '3') return 0;
    if (effectiveCard.rank === 'king' && (effectiveCard.suit === 'hearts' || effectiveCard.suit === 'spades')) return 0;
    if (effectiveCard.rank === '4') return 1;
    if (['ace', 'jack', 'queen', 'joker'].includes(effectiveCard.rank)) return 2;
    return 3;
  };
  const getCardSortKey = (card) => {
    const effectiveCard = getEffectiveCard(card);
    return `${effectiveCard.rank}_${effectiveCard.suit || 'joker'}`;
  };
  const duplicateCounts = gameState.myHand.reduce((counts, card) => {
    const key = getCardSortKey(card);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const canCardJoinCurrentMove = (card) => {
    if (!isMyTurn) return false;
    if (gameState.hasDrawnCardThisTurn) {
      if (!drawnCard) return false;
      if (card.cardInstanceId === gameState.drawnCardInstanceId) return true;
      return card.rank === 'joker' || drawnCard.rank === 'joker' || card.rank === drawnCard.rank;
    }
    return isCardLegal(card, gameState);
  };
  const compareByMode = (a, b) => {
    if (handSortMode === 'draw') {
      return gameState.myHand.indexOf(a) - gameState.myHand.indexOf(b);
    }
    if (handSortMode === 'suit') {
      const suitDiff = SUITS.indexOf(getCardSuit(a)) - SUITS.indexOf(getCardSuit(b));
      if (suitDiff !== 0) return suitDiff;
      return compareCardsHighFirst(a, b);
    }
    if (handSortMode === 'type') {
      const typeDiff = getCardTypePriority(a) - getCardTypePriority(b);
      if (typeDiff !== 0) return typeDiff;
      return compareCardsHighFirst(a, b);
    }
    if (handSortMode === 'playable') {
      const playableDiff = Number(canCardJoinCurrentMove(b)) - Number(canCardJoinCurrentMove(a));
      if (playableDiff !== 0) return playableDiff;
      return compareCardsHighFirst(a, b);
    }
    if (handSortMode === 'duplicates') {
      const duplicateDiff = (duplicateCounts.get(getCardSortKey(b)) || 0) - (duplicateCounts.get(getCardSortKey(a)) || 0);
      if (duplicateDiff !== 0) return duplicateDiff;
      return compareCardsHighFirst(a, b);
    }
    return compareCardsHighFirst(a, b);
  };
  const sortedHand = [...gameState.myHand]
    .filter(card => !showOnlyPlayable || !isMyTurn || canCardJoinCurrentMove(card) || selectedCards.includes(card.cardInstanceId))
    .sort(compareByMode);
  const getHandGroupKey = (card) => {
    const effectiveCard = getEffectiveCard(card);
    if (handSortMode !== 'duplicates') return card.cardInstanceId;
    return `${effectiveCard.rank}_${effectiveCard.suit || 'joker'}`;
  };
  const groupedHand = sortedHand.reduce((groups, card) => {
    const groupKey = getHandGroupKey(card);
    const effectiveCard = getEffectiveCard(card);
    const group = groups.find(item => item.key === groupKey);
    if (group) {
      group.cards.push(card);
    } else {
      groups.push({
        key: groupKey,
        rank: effectiveCard.rank,
        suit: effectiveCard.suit,
        cards: [card]
      });
    }
    return groups;
  }, []);
  const expandableGroupCount = groupedHand.filter(group => group.cards.length > 1).length;
  const expandedGroup = groupedHand.find(group => group.key === expandedHandRank && group.cards.length > 1);
  const activeExpandedHandRank = expandedGroup ? expandedHandRank : null;
  const selectedCardObjects = selectedCards
    .map(id => gameState.myHand.find(card => card.cardInstanceId === id))
    .filter(Boolean);

  const getSelectionPreview = () => {
    if (selectedCardObjects.length === 0) return null;

    const jokerCount = selectedCardObjects.filter(card => card.rank === 'joker').length;
    const nonJokerCards = selectedCardObjects.filter(card => card.rank !== 'joker');
    const knownRank = nonJokerCards[0]?.rank || null;
    const selectedCount = formatCardCount(selectedCardObjects.length);
    const remainingCards = gameState.myHand.length - selectedCardObjects.length;
    const playsLastCards = selectedCardObjects.length === selectedCards.length
      && gameState.myHand.length > 1
      && remainingCards === 0;

    if (playsLastCards) {
      return `${selectedCount}. Przed zagraniem ostatnich kart kliknij Makao.`;
    }

    if (jokerCount > 0) {
      if (knownRank) {
        return `${selectedCount}. Joker zostanie zadeklarowany jako ${getRankLabel(knownRank)}; kolor wybierzesz przed ruchem.`;
      }
      return `${selectedCount}. Przed ruchem zadeklarujesz wartość i kolor jokera.`;
    }

    const firstRank = selectedCardObjects[0].rank;
    const allSameRank = selectedCardObjects.every(card => card.rank === firstRank);
    if (!allSameRank) return `${selectedCount}. Ruch musi mieć jedną wartość.`;

    const battleValue = selectedCardObjects.reduce((sum, card) => sum + getBattleValue(card), 0);
    if (battleValue > 0) {
      const existingPenalty = gameState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY
        ? gameState.activeEffect.amount
        : 0;
      return `${selectedCount}. Kara po ruchu: +${existingPenalty + battleValue}.`;
    }

    if (firstRank === '4') {
      const existingPauses = gameState.activeEffect?.type === EFFECT_TYPES.SKIP_TURN
        ? gameState.activeEffect.amount
        : 0;
      return `${selectedCount}. ⏸ po ruchu: ${formatPauseCount(existingPauses + selectedCardObjects.length)}.`;
    }

    if (firstRank === 'ace') {
      return `${selectedCount}. Po zagraniu wybierzesz kolor albo bez żądania.`;
    }

    if (firstRank === 'jack') {
      return `${selectedCount}. Po zagraniu wybierzesz żądaną wartość 5-10 albo bez żądania.`;
    }

    if (firstRank === 'queen') {
      if (gameState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY && gameState.settings?.queenVariant === QUEEN_VARIANTS.WARSAW_PARDON) {
        return `${selectedCount}. Dama kier/pik anuluje aktywną karę.`;
      }
      return null;
    }

    return null;
  };
  const selectionPreview = getSelectionPreview();

  useEffect(() => {
    const handScroll = handScrollRef.current;
    if (!handScroll) return undefined;

    const updateHandScrollState = () => {
      const maxScrollLeft = handScroll.scrollWidth - handScroll.clientWidth;
      const canScroll = maxScrollLeft > 1;
      const thumbWidth = canScroll
        ? Math.max(18, (handScroll.clientWidth / handScroll.scrollWidth) * 100)
        : 100;
      const thumbLeft = canScroll
        ? (handScroll.scrollLeft / maxScrollLeft) * (100 - thumbWidth)
        : 0;

      setHandScrollState(prev => {
        const next = {
          canScroll,
          thumbLeft: Number(thumbLeft.toFixed(2)),
          thumbWidth: Number(thumbWidth.toFixed(2))
        };

        if (
          prev.canScroll === next.canScroll &&
          prev.thumbLeft === next.thumbLeft &&
          prev.thumbWidth === next.thumbWidth
        ) {
          return prev;
        }

        return next;
      });
    };

    updateHandScrollState();
    const animationFrameId = window.requestAnimationFrame(updateHandScrollState);
    handScroll.addEventListener('scroll', updateHandScrollState, { passive: true });
    window.addEventListener('resize', updateHandScrollState);

    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(updateHandScrollState)
      : null;
    resizeObserver?.observe(handScroll);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      handScroll.removeEventListener('scroll', updateHandScrollState);
      window.removeEventListener('resize', updateHandScrollState);
      resizeObserver?.disconnect();
    };
  }, [gameState.myHand.length, groupedHand.length]);

  const selectedMoveRemainingCards = gameState.myHand.length - selectedCardObjects.length;
  const selectedMovePlaysLastCards = selectedCardObjects.length > 0
    && selectedCardObjects.length === selectedCards.length
    && gameState.myHand.length > 1
    && selectedMoveRemainingCards === 0;
  const selectedMoveNeedsMakao = selectedCardObjects.length > 0
    && selectedCardObjects.length === selectedCards.length
    && (selectedMoveRemainingCards === 1 || (gameState.myHand.length > 1 && selectedMoveRemainingCards === 0));
  const myMakaoReady = myMakaoState?.declared === true || myMakaoState?.armed === true;
  const selectedMoveBlockedByMakao = selectedMovePlaysLastCards && !myMakaoReady;
  const canDeclareMissingMakao = myMakaoState?.declared === false
    && (!myMakaoState.canBeCaughtAt || now < myMakaoState.canBeCaughtAt);
  const canArmMakaoForSelectedMove = isMyTurn && selectedMoveNeedsMakao && !myMakaoReady;
  const canDeclareMakaoNow = canDeclareMissingMakao || canArmMakaoForSelectedMove;
  const shouldShowMakaoButton = (gameState.myHand.length === 1 && myMakaoState?.declared === false)
    || canArmMakaoForSelectedMove;
  const canPlaySelectedOnTable = !isGameOver && !gamePaused && isMyTurn && selectedCards.length > 0 && !selectedMoveBlockedByMakao;
  const canUseDrawPile = !isGameOver && isMyTurn && !gameState.hasDrawnCardThisTurn && !isSkipEffectActive;
  const canResumeManualPause = gamePaused && gameState.pauseReason === 'manual' && (gameState.pausedPlayerId === socketId || isHost);
  const handleDrawPileClick = () => {
    if (!canUseDrawPile) return;
    if (isDrawPenaltyActive) {
      acceptPenalty();
      return;
    }
    drawCard();
  };
  const handleDiscardPileClick = () => {
    if (!canPlaySelectedOnTable) return;
    playSelectedCards();
  };

  const getHandFanStyle = (index, total) => {
    if (total <= 1) return { '--hand-card-tilt': '0deg' };
    const center = (total - 1) / 2;
    const offset = index - center;
    const tilt = Math.max(-9, Math.min(9, offset * 1.6));
    return {
      '--hand-card-tilt': `${tilt.toFixed(2)}deg`
    };
  };

  const getCardColor = (suit) => {
    return (suit === 'hearts' || suit === 'diamonds') ? 'var(--card-red-suit)' : 'var(--card-black-suit)';
  };

  const isSelectableCardLegal = (card) => {
    if (!isMyTurn) return false;

    if (gameState.hasDrawnCardThisTurn) {
      const isDrawnCard = card.cardInstanceId === gameState.drawnCardInstanceId;
      const drawnCardSelected = selectedCards.includes(gameState.drawnCardInstanceId);
      if (selectedCards.includes(card.cardInstanceId) || isDrawnCard) return true;
      if (!drawnCardSelected) return false;
      if (card.rank === 'joker' || drawnCard?.rank === 'joker') return true;
      return Boolean(
        drawnCard &&
        card.rank === drawnCard.rank
      );
    }

    if (selectedCards.length > 0) {
      if (card.rank === 'joker') return true;
      if (gameState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY && !isCardLegal(card, gameState)) return false;
      const firstSelectedNonJoker = selectedCards
        .map(id => gameState.myHand.find(c => c.cardInstanceId === id))
        .find(selectedCard => selectedCard?.rank !== 'joker');
      return !firstSelectedNonJoker || card.rank === firstSelectedNonJoker.rank;
    }

    return isCardLegal(card, gameState);
  };

  const getMoveHintText = () => {
    if (isGameOver) return null;
    if (gamePaused) {
      return gameState.pauseReason === 'manual'
        ? `⏸: ${getPlayerName(gameState.pausedPlayerId)} zaraz wraca`
        : `Czekamy na powrót gracza ${getPlayerName(gameState.pausedPlayerId)}`;
    }
    if (!isMyTurn) {
      return null;
    }
    if (gameState.hasDrawnCardThisTurn) {
      if (drawnCard && isCardLegal(drawnCard, gameState)) {
        return 'Dobrana karta jest aktywna. Rzuć ją albo spasuj.';
      }
      return 'Dobrana karta nie pasuje. Pas oddaje turę.';
    }
    if (gameState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY) {
      return null;
    }
    if (gameState.activeEffect?.type === EFFECT_TYPES.SKIP_TURN) {
      return null;
    }
    if (gameState.activeEffect?.type === EFFECT_TYPES.SUIT_REQUEST) {
      return null;
    }
    if (gameState.activeEffect?.type === EFFECT_TYPES.RANK_REQUEST) {
      return null;
    }
    return null;
  };

  const getCardInspectDetails = (card) => {
    if (!card) return [];
    const effectiveCard = getEffectiveCard(card);
    const details = [
      `Wartość: ${getRankLabel(effectiveCard.rank)}`,
      `Kolor: ${effectiveCard.suit ? getSuitName(effectiveCard.suit) : 'brak'}`
    ];

    if (card.rank === 'joker' && card.jokerDeclaration) {
      details.unshift('Joker z deklaracją');
    } else if (card.rank === 'joker') {
      details.unshift('Joker bez deklaracji');
    }

    if (card.cardInstanceId === gameState.drawnCardInstanceId) {
      details.push('Karta dobrana w tej turze');
    }

    if (isMyTurn && gameState.myHand.some(handCard => handCard.cardInstanceId === card.cardInstanceId)) {
      details.push(isCardLegal(card, gameState) ? 'Możliwa teraz' : 'Nie pasuje teraz');
    }

    return details;
  };

  const getActiveEffectText = () => {
    if (!gameState.activeEffect) return null;
    if (gameState.activeEffect.type === EFFECT_TYPES.DRAW_PENALTY) {
      return `Kara +${gameState.activeEffect.amount} · ${getSuitName(gameState.activeEffect.battleSuit)}`;
    }
    if (gameState.activeEffect.type === EFFECT_TYPES.SKIP_TURN) {
      return `${getPlayerName(gameState.activeEffect.targetPlayerId)} · ${formatPauseCount(gameState.activeEffect.amount)}`;
    }
    if (gameState.activeEffect.type === EFFECT_TYPES.SUIT_REQUEST) {
      return `Żądanie: ${getSuitName(gameState.activeEffect.requestedSuit)}`;
    }
    if (gameState.activeEffect.type === EFFECT_TYPES.RANK_REQUEST) {
      return `Żądanie: ${getRankLabel(gameState.activeEffect.requestedRank)}`;
    }
    return null;
  };

  const renderCard = (card, isSelected = false, onClick, options = {}) => {
    const isHidden = !card.rank; // Dla przeciwników
    const selectable = Boolean(options.selectable);
    const size = options.size || 'normal';
    const displayRank = getCardRank(card);
    const displaySuit = getCardSuit(card);
    const declaredJoker = card.rank === 'joker' && card.jokerDeclaration;
    const cardImagePath = getCardImagePath(card, { hidden: isHidden });
    
    const legal = !selectable || isSelectableCardLegal(card);

    const interactive = Boolean(onClick) && (isHidden ? options.interactiveHidden : legal);
    const draggable = Boolean(options.draggable) && interactive;
    const inspectable = !isHidden && options.inspectable !== false && size !== 'mini';
    const classes = [
      'playing-card',
      `playing-card-${size}`,
      isHidden ? 'playing-card-back' : '',
      selectable ? 'playing-card-selectable' : 'playing-card-static',
      selectable && legal ? 'playing-card-legal' : '',
      selectable && !legal ? 'playing-card-blocked' : '',
      inspectable ? 'playing-card-inspectable' : '',
      cardImagePath ? 'playing-card-with-art' : '',
      isSelected ? 'playing-card-selected' : '',
      card.cardInstanceId === gameState.drawnCardInstanceId ? 'playing-card-drawn' : ''
    ].filter(Boolean).join(' ');

    const label = isHidden
      ? options.label || 'Zakryta karta'
      : displayRank === 'joker'
        ? 'Joker'
        : `${declaredJoker ? 'Joker jako ' : ''}${getRankLabel(displayRank)} ${getSuitName(displaySuit)}`;

    const onCardPointerDown = (event) => {
      startCardPress(card, inspectable);
      // eslint-disable-next-line react-hooks/refs -- event handler uses refs for pointer-drag bookkeeping only.
      handlePointerCardDragStart(event, card.cardInstanceId, draggable);
    };

    const onCardPointerUp = (event) => {
      endCardPress();
      // eslint-disable-next-line react-hooks/refs -- event handler uses refs for pointer-drag bookkeeping only.
      handlePointerCardDragFinish(event);
    };

    const onCardPointerCancel = () => {
      endCardPress();
      // eslint-disable-next-line react-hooks/refs -- event handler uses refs for pointer-drag bookkeeping only.
      handlePointerCardDragCancel();
    };

    const onCardPointerLeave = () => {
      if (!pointerDragRef.current?.active) endCardPress();
    };

    const onCardDoubleClick = (event) => {
      if (!options.onDoubleClick || !interactive) return;
      event.preventDefault();
      event.stopPropagation();
      options.onDoubleClick();
    };
    
    return (
      <button
        type="button"
        key={card.cardInstanceId}
        data-card-id={card.cardInstanceId}
        onPointerDown={onCardPointerDown}
        onPointerMove={handlePointerCardDragMove}
        onPointerUp={onCardPointerUp}
        onPointerCancel={onCardPointerCancel}
        onPointerLeave={onCardPointerLeave}
        onContextMenu={(event) => event.preventDefault()}
        draggable={draggable}
        onDragStart={(event) => {
          if (!draggable) return;
          event.dataTransfer.setData('text/plain', card.cardInstanceId);
          event.dataTransfer.effectAllowed = 'move';
          handleCardDragStart(card.cardInstanceId);
        }}
        onDragEnd={handleCardDragEnd}
        onDoubleClick={options.onDoubleClick && interactive ? onCardDoubleClick : undefined}
        // eslint-disable-next-line react-hooks/refs -- click handler reads refs only after a real card tap.
        onClick={(interactive || inspectable) ? () => handleCardClick(interactive ? onClick : undefined) : undefined}
        disabled={!interactive && !inspectable}
        className={classes}
        style={{
          '--card-color': isHidden ? 'var(--card-back-ink)' : getCardColor(displaySuit),
          ...getCardImageStyle(cardImagePath),
          ...options.style
        }}
        aria-pressed={selectable ? isSelected : undefined}
        aria-label={label}
      >
        {!isHidden && cardImagePath && declaredJoker && <span className="joker-marker">JOK</span>}
        {!isHidden && !cardImagePath && (
          <>
            <span className="card-corner card-corner-top">{getRankLabel(displayRank)}{getSuitSymbol(displaySuit)}</span>
            {declaredJoker && <span className="joker-marker">JOK</span>}
            <span className="card-suit">{getSuitSymbol(displaySuit) || '★'}</span>
            <span className="card-corner card-corner-bottom">{getRankLabel(displayRank)}{getSuitSymbol(displaySuit)}</span>
          </>
        )}
      </button>
    );
  };

  const renderMotionCard = (motion) => {
    if (motion.kind !== 'draw' || !motion.card.rank) {
      return renderCard(motion.card, false, undefined, { inspectable: false });
    }

    return (
      <div className="motion-card-flip">
        <div className="motion-card-face motion-card-face-back">
          {renderCard({ cardInstanceId: `${motion.id}_back` }, false, undefined, { inspectable: false })}
        </div>
        <div className="motion-card-face motion-card-face-front">
          {renderCard({ ...motion.card, cardInstanceId: `${motion.id}_front` }, false, undefined, { inspectable: false })}
        </div>
      </div>
    );
  };

  const getGroupLabel = (group) => {
    const rank = getRankLabel(group.rank);
    return group.suit ? `${rank}${getSuitSymbol(group.suit)}` : rank;
  };

  const getGroupPlayableCards = (group) => {
    if (!isMyTurn) return [];

    if (gameState.hasDrawnCardThisTurn) {
      const drawnInGroup = group.cards.find(card => card.cardInstanceId === gameState.drawnCardInstanceId);
      if (!drawnInGroup) return [];
      return [
        drawnInGroup,
        ...group.cards.filter(card => card.cardInstanceId !== drawnInGroup.cardInstanceId && canCardJoinCurrentMove(card))
      ];
    }

    if (gameState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY) {
      return group.cards.every(card => isCardLegal(card, gameState)) ? [...group.cards] : [];
    }

    const firstLegalCard = group.cards.find(card => isCardLegal(card, gameState));
    if (!firstLegalCard) return [];
    return [
      firstLegalCard,
      ...group.cards.filter(card => card.cardInstanceId !== firstLegalCard.cardInstanceId)
    ];
  };

  const selectAllGroupCards = (group) => {
    const playableCards = getGroupPlayableCards(group);
    if (playableCards.length !== group.cards.length) return;
    setSelectedCards(playableCards.map(card => card.cardInstanceId));
  };

  const renderHandGroup = (group, index = 0) => {
    const selectedCount = group.cards.filter(card => selectedCards.includes(card.cardInstanceId)).length;
    const legalCount = group.cards.filter(isSelectableCardLegal).length;
    const groupPlayableCards = getGroupPlayableCards(group);
    const canSelectWholeGroup = groupPlayableCards.length === group.cards.length;
    const representativeCard =
      group.cards.find(card => selectedCards.includes(card.cardInstanceId)) ||
      group.cards.find(card => card.cardInstanceId === gameState.drawnCardInstanceId) ||
      group.cards.find(isSelectableCardLegal) ||
      group.cards[0];
    const representativeCardImagePath = getCardImagePath(representativeCard);
    const representativeDeclaredJoker = representativeCard.rank === 'joker' && representativeCard.jokerDeclaration;
    const expanded = activeExpandedHandRank === group.key;
    const drawnInGroup = group.cards.some(card => card.cardInstanceId === gameState.drawnCardInstanceId);
    const classes = [
      'hand-group',
      expanded ? 'hand-group-expanded' : '',
      selectedCount > 0 ? 'hand-group-selected' : '',
      drawnInGroup ? 'hand-group-drawn' : '',
      isMyTurn && legalCount === 0 ? 'hand-group-blocked' : ''
    ].filter(Boolean).join(' ');

    return (
      <button
        key={group.key}
        type="button"
        className={classes}
        style={getHandFanStyle(index, groupedHand.length)}
        onClick={() => setExpandedHandRank(expanded ? null : group.key)}
        aria-expanded={expanded}
        aria-label={`${getGroupLabel(group)}, kart: ${group.cards.length}`}
      >
        <span
          className={representativeCardImagePath ? 'hand-group-card hand-group-card-with-art' : 'hand-group-card'}
          style={{
            '--card-color': getCardColor(representativeCard.suit),
            ...getCardImageStyle(representativeCardImagePath)
          }}
        >
          {representativeCardImagePath && representativeDeclaredJoker && <span className="joker-marker">JOK</span>}
          {!representativeCardImagePath && (
            <>
              <span className="card-corner card-corner-top">{getRankLabel(representativeCard.rank)}{getSuitSymbol(representativeCard.suit)}</span>
              <span className="card-suit">{getSuitSymbol(representativeCard.suit) || '★'}</span>
              <span className="card-corner card-corner-bottom">{getRankLabel(representativeCard.rank)}{getSuitSymbol(representativeCard.suit)}</span>
            </>
          )}
        </span>
        <span className="hand-group-count">
          {formatCardCount(group.cards.length)}
        </span>
        {canSelectWholeGroup && <span className="hand-group-action-hint">Wszystkie</span>}
        {selectedCount > 0 && <span className="hand-group-badge">{selectedCount}</span>}
      </button>
    );
  };

  const renderHandItem = (group, index) => {
    const isDesktopPointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

    if (group.cards.length === 1) {
      const card = group.cards[0];
      return renderCard(
        card,
        selectedCards.includes(card.cardInstanceId),
        () => {
          closeExpandedHandGroup();
          toggleCardSelection(card.cardInstanceId);
        },
        {
          selectable: true,
          draggable: true,
          onDoubleClick: isDesktopPointer ? () => startPlayWithCardIds([card.cardInstanceId]) : undefined,
          style: getHandFanStyle(index, groupedHand.length)
        }
      );
    }

    return renderHandGroup(group, index);
  };

  const activeEffectText = getActiveEffectText();
  const moveHintText = getMoveHintText();
  const latestTurnMessages = (gameState.turnEvents || [])
    .slice(-3)
    .map(formatTurnEvent)
    .filter(Boolean);
  const displayPlayers = gameState.players?.length ? gameState.players : room.players;
  const otherPlayers = displayPlayers.filter(p => p.id !== socketId);
  const currentPlayer = displayPlayers.find(p => p.id === currentPlayerId);
  const activeEffectTargetPlayer = displayPlayers.find(p => p.id === gameState.activeEffect?.targetPlayerId);
  const canHostSkipOffline = isHost &&
    !isGameOver &&
    gamePaused &&
    gameState.pauseReason === 'disconnect' &&
    currentPlayer &&
    !currentPlayer.isOnline &&
    !gameState.activeEffect;
  const canHostForceEffect = isHost &&
    !isGameOver &&
    gamePaused &&
    gameState.pauseReason === 'disconnect' &&
    activeEffectTargetPlayer &&
    !activeEffectTargetPlayer.isOnline;
  const currentStatus = isGameOver
    ? (gameState.endReason === 'host_admin'
      ? 'Partia zakończona'
      : (gameState.winnerId === socketId ? 'Wygrałeś' : `Wygrał ${getPlayerName(gameState.winnerId)}`))
    : (gamePaused ? 'Gra wstrzymana' : (isMyTurn ? 'Twoja tura' : `Gra ${getPlayerName(currentPlayerId)}`));
  const lastTimedOutPlayerId = gameState.timedOutPlayers?.at(-1)?.playerId;
  const firstPlayerId = gameState.moveHistory?.[0]?.details?.firstPlayerId || room.lastFirstPlayerId;
  const gameNumber = gameState.moveHistory?.[0]?.details?.gameNumber || room.gameNumber;
  const currentJokerId = showJokerModal?.jokerIds?.[showJokerModal.index] || null;
  const allowedJokerRanks = showJokerModal
    ? getAllowedJokerRanks(showJokerModal.declarations, currentJokerId)
    : [];
  const allowedJokerSuits = showJokerModal?.selectedRank
    ? getAllowedJokerSuits(showJokerModal.selectedRank, showJokerModal.declarations, currentJokerId)
    : [];
  const jokerForcedRank = showJokerModal
    ? getForcedJokerRank(pendingPlay, showJokerModal.declarations)
    : null;
  const draggedPreviewCard = pointerDrag?.active
    ? gameState.myHand.find(card => card.cardInstanceId === pointerDrag.cardId)
    : null;
  const selectedFocusCard = selectedCardObjects.length === 1 ? selectedCardObjects[0] : null;
  const drawPileClickHandler = canUseDrawPile ? handleDrawPileClick : undefined;
  const activeSortShortLabel = {
    rank: 'Wart.',
    suit: 'Kolor',
    type: 'Typ',
    playable: 'Możl.',
    duplicates: 'Dupl.',
    draw: 'Ręka'
  }[handSortMode] || activeSortMode.label;
  const recentHistoryEvents = [...(gameState.moveHistory || [])].slice(-7).reverse();
  const drawActionLabel = isDrawPenaltyActive
    ? `Przyjmij +${gameState.activeEffect?.amount || 1}`
    : 'Dobierz';
  // eslint-disable-next-line react-hooks/refs -- renderCard only reads pointer refs from event handlers, not while building elements.
  const handItems = groupedHand.map(renderHandItem);
  const renderOpponentChip = (p) => {
    const handCount = gameState.handCounts[p.id] || 0;
    const visibleBacks = Math.min(handCount, 5);
    const hasMakao = gameState.makao?.[p.id]?.declared || gameState.makao?.[p.id]?.armed;

    return (
      <article
        key={p.id}
        data-player-id={p.id}
        className={`opponent-chip ${currentPlayerId === p.id ? 'opponent-active' : ''}`}
      >
        <div className="opponent-row">
          <strong>{p.name}</strong>
          <span>{hasMakao ? 'Makao' : formatCardCount(handCount)}</span>
        </div>
        <div className="opponent-flags">
          {currentPlayerId === p.id && <span className="flag-badge flag-turn">Tura</span>}
          {!p.isOnline && <span className="flag-badge flag-offline">Offline</span>}
          {gameState.timedOutPlayers?.some(player => player.playerId === p.id) && <span className="flag-badge flag-timeout">Timeout</span>}
          {(gameState.skipTurns?.[p.id] || 0) > 0 && <span className="flag-badge flag-skip">{formatPauseCount(gameState.skipTurns[p.id])}</span>}
        </div>
        <div className="mini-hand" aria-hidden="true">
          {Array.from({ length: visibleBacks }).map((_, i) =>
            renderCard(
              { cardInstanceId: `${p.id}_hidden_${i}` },
              false,
              undefined,
              { size: 'mini' }
            )
          )}
          <span className="hand-count-pill">{handCount}</span>
        </div>
        {gameState.makao?.[p.id]?.declared === false && (
          <button
            className="btn btn-danger catch-button"
            onClick={() => catchMakao(p.id)}
            disabled={now < gameState.makao[p.id].canBeCaughtAt}
          >
            Złap Makao
          </button>
        )}
        {isHost && !isGameOver && p.id !== socketId && (
          <div className="host-chip-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => transferHost(p.id)}
              disabled={!p.isOnline}
            >
              Host
            </button>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => requestHostAction({
                event: EVENTS.REMOVE_PLAYER,
                targetPlayerId: p.id,
                title: 'Usunąć gracza?',
                confirmTitle: 'Potwierdź usunięcie',
                body: `${p.name} zostanie usunięty z gry. Akcja trafi do historii i logu administracyjnego.`,
                confirmLabel: 'Usuń gracza'
              })}
            >
              Usuń
            </button>
          </div>
        )}
      </article>
    );
  };

  const textState = {
    screen: 'game',
    coordinateSystem: 'DOM layout, origin top-left, x right, y down',
    roomId: room.id,
    status: currentStatus,
    isMyTurn,
    paused: gamePaused,
    gameOver: isGameOver,
    currentPlayer: currentPlayerId ? {
      id: currentPlayerId,
      name: getPlayerName(currentPlayerId)
    } : null,
    topCard: gameState.topCard ? formatCard(gameState.topCard) : null,
    drawPileCount: gameState.drawPileCount ?? 0,
    activeEffect: activeEffectText,
    messages: latestTurnMessages,
    selectedCards: selectedCardObjects.map(formatCard),
    canPlaySelectedOnTable,
    canUseDrawPile,
    hand: sortedHand.map(card => ({
      id: card.cardInstanceId,
      label: formatCard(card),
      legal: isSelectableCardLegal(card),
      selected: selectedCards.includes(card.cardInstanceId)
    })),
    players: displayPlayers.map(player => ({
      id: player.id,
      name: player.name,
      current: player.id === currentPlayerId,
      online: player.isOnline,
      handCount: gameState.handCounts[player.id] || 0,
      makao: gameState.makao?.[player.id]?.declared || false,
      pauses: gameState.skipTurns?.[player.id] || 0
    }))
  };

  useEffect(() => {
    textStateRef.current = textState;
  });

  return (
    <main className={`game-screen ${isMyTurn ? 'is-my-turn' : ''}`}>
      <div className="landscape-gate">
        <div className="phone-rotate-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </div>
        <strong>Obróć telefon</strong>
        <span>Graj wygodnie w poziomie</span>
      </div>
      <header className="game-topbar">
        <div className="turn-summary">
          <p className="eyebrow">Pokój {room.id}</p>
          <h1>{currentStatus}</h1>
          <div className="status-line">
            {(gameState.skipTurns?.[socketId] || 0) > 0 && <span className="status-chip-skip">{formatPauseCount(gameState.skipTurns[socketId])}</span>}
            {myMakaoReady && <span className="status-chip-makao">Makao</span>}
            <div className="status-stats-rail" aria-label="Stan partii">
              {gameNumber > 0 && (
                <span className="status-stat">
                  <small>P</small>
                  <strong>{gameNumber}</strong>
                </span>
              )}
              <span className="status-stat">
                <small>T</small>
                <strong>{gameState.drawPileCount ?? 0}</strong>
              </span>
              <button
                type="button"
                className="status-sort-chip"
                onPointerDown={startSortPress}
                onPointerUp={endSortPress}
                onPointerCancel={endSortPress}
                onPointerLeave={endSortPress}
                onClick={handleSortClick}
                aria-label={`Sortowanie: ${activeSortMode.label}`}
              >
                <small>K</small>
                <strong>{gameState.myHand.length}</strong>
                <span className="status-sort-label">{activeSortShortLabel}</span>
              </button>
            </div>
            {firstPlayerId && <span className="status-chip-first">Zaczynał {getPlayerName(firstPlayerId)}</span>}
            {gameState.stateVersion && <span className="status-chip-version">v{gameState.stateVersion}</span>}
          </div>
        </div>
        <button
          className="game-menu-toggle"
          type="button"
          onClick={() => setShowGameMenu(true)}
          aria-label="Menu gry"
          aria-expanded={showGameMenu}
        >
          <span aria-hidden="true">...</span>
        </button>
      </header>

      {showGameMenu && (
        <div className="game-menu-backdrop" onClick={() => setShowGameMenu(false)}>
          <section className="game-menu-sheet" aria-label="Menu gry" onClick={(event) => event.stopPropagation()}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setShowHistoryModal(true);
                setShowGameMenu(false);
              }}
            >
              Historia
            </button>
            {!isGameOver && !gamePaused && (
              <button
                className="btn btn-secondary"
                type="button"
                aria-label="Wstrzymaj grę"
                title="Wstrzymaj grę"
                onClick={() => {
                  pauseGame();
                  setShowGameMenu(false);
                }}
              >
                ⏸
              </button>
            )}
            {canResumeManualPause && (
              <button
                className="btn btn-warning"
                type="button"
                onClick={() => {
                  resumeGame();
                  setShowGameMenu(false);
                }}
              >
                Wznów
              </button>
            )}
            {isHost && !isGameOver && (
              <>
                {canHostSkipOffline && (
                  <button
                    className="btn btn-warning"
                    type="button"
                    onClick={() => {
                      setShowGameMenu(false);
                      requestHostAction({
                        event: EVENTS.HOST_SKIP_OFFLINE_TURN,
                        targetPlayerId: currentPlayer.id,
                        title: 'Pominąć gracza offline?',
                        confirmTitle: 'Potwierdź pominięcie',
                        body: `${currentPlayer.name} jest offline i ma turę. Tura zostanie pominięta, a akcja trafi do logu administracyjnego.`,
                        confirmLabel: 'Pomiń turę'
                      });
                    }}
                  >
                    Pomiń offline
                  </button>
                )}
                {canHostForceEffect && (
                  <button
                    className="btn btn-warning"
                    type="button"
                    onClick={() => {
                      setShowGameMenu(false);
                      requestHostAction({
                        event: EVENTS.HOST_FORCE_ACCEPT_EFFECT,
                        targetPlayerId: activeEffectTargetPlayer.id,
                        title: 'Wymusić przyjęcie efektu?',
                        confirmTitle: 'Potwierdź efekt',
                        body: `${activeEffectTargetPlayer.name} jest offline i musi rozliczyć aktywny efekt. Serwer wykona przyjęcie efektu i zapisze decyzję hosta.`,
                        confirmLabel: 'Przyjmij efekt'
                      });
                    }}
                  >
                    Efekt offline
                  </button>
                )}
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => {
                    setShowGameMenu(false);
                    requestHostAction({
                      event: EVENTS.HOST_END_GAME,
                      title: 'Zakończyć partię?',
                      confirmTitle: 'Potwierdź zakończenie',
                      body: 'Partia zostanie zakończona administracyjnie bez zwycięzcy. Akcja trafi do historii i logu administracyjnego.',
                      confirmLabel: 'Zakończ partię'
                    });
                  }}
                >
                  Zakończ partię
                </button>
              </>
            )}
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => {
                setShowGameMenu(false);
                requestLeaveRoom();
              }}
            >
              Wyjdź
            </button>
          </section>
        </div>
      )}

      <section className="opponent-strip" aria-label="Przeciwnicy">
        {otherPlayers.map(renderOpponentChip)}
      </section>

      <aside className="desktop-side-panel" aria-label="Panel gry">
        <section className="desktop-panel-card desktop-turn-card">
          <div className="desktop-panel-head">
            <span>Ruch</span>
            <strong>{currentStatus}</strong>
          </div>
          <div className="desktop-status-grid">
            <span>Talia <strong>{gameState.drawPileCount ?? 0}</strong></span>
            <span>Ręka <strong>{gameState.myHand.length}</strong></span>
            {gameState.stateVersion && <span>Wersja <strong>{gameState.stateVersion}</strong></span>}
          </div>
          {activeEffectText && <p className="desktop-effect-text">{activeEffectText}</p>}
          {selectionPreview && <p className="desktop-effect-text desktop-selection-text">{selectionPreview}</p>}
          {latestTurnMessages.length > 0 && (
            <div className="desktop-turn-events">
              {latestTurnMessages.map((message, index) => (
                <span key={`${message}-desktop-${index}`}>{message}</span>
              ))}
            </div>
          )}
          <div className="desktop-action-grid">
            <button
              className="btn btn-primary"
              type="button"
              onClick={playSelectedCards}
              disabled={!canPlaySelectedOnTable}
            >
              {selectedCards.length > 0 ? `Zagraj (${selectedCards.length})` : 'Zagraj'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleDrawPileClick}
              disabled={!canUseDrawPile}
            >
              {drawActionLabel}
            </button>
            {!isGameOver && !gamePaused && shouldShowMakaoButton && (
              <button
                className="btn makao-action"
                type="button"
                onClick={declareMakao}
                disabled={!canDeclareMakaoNow}
              >
                Makao
              </button>
            )}
            {!isGameOver && !gamePaused && isMyTurn && gameState.activeEffect?.type === EFFECT_TYPES.SKIP_TURN && !gameState.hasDrawnCardThisTurn && (
              <button className="btn btn-warning" type="button" onClick={acceptSkip}>
                Pauzuję
              </button>
            )}
            {!isGameOver && !gamePaused && isMyTurn && gameState.hasDrawnCardThisTurn && (
              <button className="btn btn-warning" type="button" onClick={passTurn}>
                Pas
              </button>
            )}
            {!isGameOver && !gamePaused && (
              <button className="btn btn-secondary" type="button" onClick={pauseGame}>
                Pauza
              </button>
            )}
            {canResumeManualPause && (
              <button className="btn btn-warning" type="button" onClick={resumeGame}>
                Wznów
              </button>
            )}
            <button className="btn btn-secondary" type="button" onClick={() => setShowHistoryModal(true)}>
              Historia
            </button>
          </div>
        </section>

        <section className="desktop-panel-card desktop-players-card">
          <div className="desktop-panel-head">
            <span>Gracze</span>
            <strong>{displayPlayers.length}</strong>
          </div>
          <div className="desktop-player-list">
            {otherPlayers.length > 0 ? otherPlayers.map(renderOpponentChip) : (
              <div className="desktop-empty-note">Czekasz sam przy stole.</div>
            )}
          </div>
        </section>

        <section className="desktop-panel-card desktop-history-card">
          <div className="desktop-panel-head">
            <span>Historia</span>
            <button type="button" onClick={() => setShowHistoryModal(true)}>Pełna</button>
          </div>
          <div className="desktop-history-list">
            {recentHistoryEvents.map(event => (
              <div key={`desktop-history-${event.version}`} className="desktop-history-item">
                <span>{formatHistoryTime(event.at)}</span>
                <strong>{formatHistoryEvent(event)}</strong>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="table-zone">
        {isGameOver && (
          <div className="table-banner banner-success">
            {gameState.endReason === 'host_admin'
              ? 'Partia zakończona przez hosta'
              : gameState.endReason === 'timeout'
                ? `${getPlayerName(lastTimedOutPlayerId)} przekroczył limit czasu. Wygrał ${getPlayerName(gameState.winnerId)}`
              : `Wygrał ${getPlayerName(gameState.winnerId)}`}
          </div>
        )}

        {isGameOver && (
          <div className="game-over-actions">
            {isHost ? (
              <button className="btn btn-primary" type="button" onClick={returnToLobby}>
                Kolejna partia
              </button>
            ) : (
              <span>Host przygotuje następną partię</span>
            )}
          </div>
        )}

        {!isGameOver && activeEffectText && (
          <div className="table-banner banner-danger">
            {activeEffectText}
          </div>
        )}

        {!isGameOver && moveHintText && (
          <div className="table-hint">
            {moveHintText}
          </div>
        )}

        {!isGameOver && gamePaused && (
          <div className="table-banner banner-warning">
            <span>
              {gameState.pauseReason === 'manual'
                ? `${getPlayerName(gameState.pausedPlayerId)} zaraz wraca`
                : `Czekamy na powrót gracza ${getPlayerName(gameState.pausedPlayerId)}`}
            </span>
            {canResumeManualPause && (
              <button className="btn btn-warning" onClick={resumeGame}>
                Wznów
              </button>
            )}
          </div>
        )}

        {latestTurnMessages.length > 0 && (
          <div className="turn-events">
            {latestTurnMessages.map((message, index) => (
              <div key={`${message}-${index}`}>{message}</div>
            ))}
          </div>
        )}

        <div className="table-cards">
          <div
            className={[
              'pile-slot',
              'pile-slot-draw',
              canUseDrawPile ? 'pile-slot-active' : '',
              drawPilePulse > 0 ? 'pile-slot-draw-shrink' : ''
            ].filter(Boolean).join(' ')}
          >
            {renderCard(
              { cardInstanceId: 'draw_pile' },
              false,
              // eslint-disable-next-line react-hooks/refs -- renderCard stores this handler; it reads refs only later on a player tap.
              drawPileClickHandler,
              { size: 'table', interactiveHidden: canUseDrawPile, label: isDrawPenaltyActive ? 'Przyjmij karę' : 'Dobierz kartę' }
            )}
            <span>{isDrawPenaltyActive ? `Kara +${gameState.activeEffect.amount}` : `Talia ${gameState.drawPileCount ?? 0}`}</span>
          </div>

          <div
            ref={discardDropRef}
            className={[
              'pile-slot',
              'pile-slot-discard',
              draggedCardId ? 'pile-slot-drop-ready' : '',
              canPlaySelectedOnTable ? 'pile-slot-play-ready' : ''
            ].filter(Boolean).join(' ')}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleTableDrop}
          >
            {gameState.topCard && renderCard(
              gameState.topCard,
              false,
              // eslint-disable-next-line react-hooks/refs -- discard click handler reads refs only after a table tap.
              canPlaySelectedOnTable ? handleDiscardPileClick : undefined,
              { size: 'table' }
            )}
            <span>Stół</span>
          </div>
        </div>
      </section>

      <section className="hand-sheet" aria-label="Twoje karty">
        {(selectedCards.length > 0 || expandableGroupCount > 0) && (
          <div className="hand-header">
            {expandableGroupCount > 0 && (
              <div className="hand-group-mini-count">
                {formatGroupCount(expandableGroupCount)}
              </div>
            )}
          {selectedCards.length > 0 && (
            <div className={canPlaySelectedOnTable ? 'hand-selection-pill hand-selection-ready' : 'hand-selection-pill'}>
              {selectedCards.length}
            </div>
          )}
          </div>
        )}

        <div className="action-bar">
          {!isGameOver && !gamePaused && shouldShowMakaoButton && (
            <button
              type="button"
              className="btn makao-action"
              onClick={declareMakao}
              disabled={!canDeclareMakaoNow}
              aria-pressed={false}
            >
              {canDeclareMakaoNow ? 'Makao' : 'Za późno'}
            </button>
          )}

          {!isGameOver && !gamePaused && isMyTurn && gameState.activeEffect?.type === EFFECT_TYPES.SKIP_TURN && !gameState.hasDrawnCardThisTurn && (
            <button className="btn btn-warning" onClick={acceptSkip}>
              Pauzuję
            </button>
          )}

          {!isGameOver && !gamePaused && isMyTurn && gameState.hasDrawnCardThisTurn && (
            <button className="btn btn-warning" onClick={passTurn}>
              Pas
            </button>
          )}
        </div>

        {selectionPreview && (
          <div className="selection-preview">
            {selectionPreview}
          </div>
        )}

        {expandedGroup && (
          <div className="hand-group-drawer">
            <div className="hand-group-drawer-header">
              <strong>{getGroupLabel(expandedGroup)}</strong>
              <span>{formatCardCount(expandedGroup.cards.length)} w grupie</span>
              {getGroupPlayableCards(expandedGroup).length === expandedGroup.cards.length && (
                <button type="button" onClick={() => selectAllGroupCards(expandedGroup)}>
                  Rzuć wszystkie
                </button>
              )}
              <button type="button" onClick={closeExpandedHandGroup} aria-label="Zamknij grupę">
                Zamknij
              </button>
            </div>
            <div className="hand-group-cards">
              {expandedGroup.cards.map(card =>
                renderCard(
                  card,
                  selectedCards.includes(card.cardInstanceId),
                  () => toggleCardSelection(card.cardInstanceId),
                  { selectable: true, size: 'detail' }
                )
              )}
            </div>
          </div>
        )}

        <div ref={handScrollRef} className="hand-scroll" aria-label="Karty i grupy kart">
          {handItems}
        </div>
        {handScrollState.canScroll && (
          <div className="hand-scrollbar" aria-hidden="true">
            <span
              className="hand-scrollbar-thumb"
              style={{
                '--scroll-thumb-left': `${handScrollState.thumbLeft}%`,
                '--scroll-thumb-width': `${handScrollState.thumbWidth}%`
              }}
            />
          </div>
        )}
      </section>

      {cardMotions.length > 0 && (
        <div className="card-motion-layer" aria-hidden="true">
          {cardMotions.map(motion => (
            <div
              key={motion.id}
              className={`card-motion card-motion-${motion.kind}`}
              style={motion.style}
            >
              {renderMotionCard(motion)}
            </div>
          ))}
        </div>
      )}

      {draggedPreviewCard && (
        <div
          className="drag-card-preview"
          style={{
            left: `${pointerDrag.x}px`,
            top: `${pointerDrag.y}px`
          }}
          aria-hidden="true"
        >
          {renderCard(draggedPreviewCard, true, undefined, { inspectable: false })}
        </div>
      )}

      {selectedFocusCard && !pointerDrag?.active && (
        <div className="selected-card-preview" aria-hidden="true">
          {renderCard(selectedFocusCard, true, undefined, { size: 'inspect', inspectable: false })}
        </div>
      )}

      {inspectedCard && (
        <div className="modal-backdrop" onClick={() => setInspectedCard(null)}>
          <div className="glass-panel modal-sheet card-inspect-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="card-inspect-layout">
              {renderCard(inspectedCard, false, undefined, { size: 'inspect', inspectable: false })}
              <div className="card-inspect-details">
                <h3>{formatCard(inspectedCard)}</h3>
                <div className="card-inspect-tags">
                  {getCardInspectDetails(inspectedCard).map(detail => (
                    <span key={detail}>{detail}</span>
                  ))}
                </div>
              </div>
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => setInspectedCard(null)}>
              Zamknij
            </button>
          </div>
        </div>
      )}

      {showSortModal && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-sheet sort-modal-sheet">
            <h3>Sortowanie ręki</h3>
            <div className="sort-mode-list">
              {HAND_SORT_MODES.map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  className={mode.id === handSortMode ? 'sort-mode-option sort-mode-option-active' : 'sort-mode-option'}
                  onClick={() => {
                    setHandSortMode(mode.id);
                    setShowSortModal(false);
                    closeExpandedHandGroup();
                  }}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.hint}</span>
                </button>
              ))}
            </div>
            <button
              className={showOnlyPlayable ? 'sort-filter-toggle sort-filter-toggle-active' : 'sort-filter-toggle'}
              type="button"
              onClick={togglePlayableFilter}
              aria-pressed={showOnlyPlayable}
            >
              {showOnlyPlayable ? 'Pokazuję tylko możliwe' : 'Pokaż tylko możliwe'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowSortModal(false)}>
              Zamknij
            </button>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-sheet history-modal-sheet">
            <h3>Historia partii</h3>
            <div className="history-modal-list">
              {[...(gameState.moveHistory || [])].reverse().map(event => (
                <div key={event.version} className="history-modal-item">
                  <span>{formatHistoryTime(event.at)}</span>
                  <strong>{formatHistoryEvent(event)}</strong>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" type="button" onClick={() => setShowHistoryModal(false)}>
              Zamknij
            </button>
          </div>
        </div>
      )}

      {showJokerModal && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-sheet joker-modal-sheet">
            <h3>
              Joker {showJokerModal.index + 1}/{showJokerModal.jokerIds.length}
            </h3>
            {jokerForcedRank && (
              <p className="modal-hint">
                Ten joker musi mieć wartość {getRankLabel(jokerForcedRank)}, żeby pasował do wybranej paczki.
              </p>
            )}
            <div className="joker-rank-grid" aria-label="Wartość jokera">
              {RANKS.filter(rank => rank !== 'joker').map(rank => (
                <button
                  key={rank}
                  type="button"
                  className={showJokerModal.selectedRank === rank ? 'joker-rank-option joker-rank-selected' : 'joker-rank-option'}
                  onClick={() => chooseJokerRank(rank)}
                  disabled={!allowedJokerRanks.includes(rank)}
                  aria-pressed={showJokerModal.selectedRank === rank}
                >
                  {getRankLabel(rank)}
                </button>
              ))}
            </div>
            <div className="joker-suit-grid" aria-label="Kolor jokera">
              {SUITS.map(suit => (
                <button
                  key={suit}
                  type="button"
                  className={`btn ${suit === 'hearts' || suit === 'diamonds' ? 'suit-red' : 'suit-black'}`}
                  onClick={() => chooseJokerSuit(suit)}
                  disabled={!showJokerModal.selectedRank || !allowedJokerSuits.includes(suit)}
                >
                  {getSuitSymbol(suit)} {getSuitName(suit)}
                </button>
              ))}
            </div>
            <button className="btn btn-danger" onClick={cancelJokerDeclaration}>
              Anuluj
            </button>
          </div>
        </div>
      )}

      {showRequestModal && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-sheet">
            <h3>{showRequestModal.type === 'suit' ? 'Wybierz kolor' : 'Wybierz wartość'}</h3>
            
            {showRequestModal.type === 'suit' && (
              <div className="choice-grid">
                <button className="btn suit-red" onClick={() => confirmPlayWithRequest('hearts')}>♥ Kier</button>
                <button className="btn suit-red" onClick={() => confirmPlayWithRequest('diamonds')}>♦ Karo</button>
                <button className="btn suit-black" onClick={() => confirmPlayWithRequest('clubs')}>♣ Trefl</button>
                <button className="btn suit-black" onClick={() => confirmPlayWithRequest('spades')}>♠ Pik</button>
              </div>
            )}

            {showRequestModal.type === 'rank' && (
              <div className="choice-grid rank-grid">
                {JACK_REQUEST_RANKS.map(r => (
                  <button key={r} className="btn" onClick={() => confirmPlayWithRequest(r)}>{getRankLabel(r)}</button>
                ))}
              </div>
            )}

            <button className="btn btn-secondary" onClick={() => confirmPlayWithRequest('none')}>
              Bez żądania
            </button>
            <button className="btn btn-danger" onClick={() => { setShowRequestModal(null); setPendingPlay(null); }}>
              Anuluj
            </button>
          </div>
        </div>
      )}

      {showHostResumeConfirm && gamePaused && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-sheet">
            <h3>{showHostResumeConfirm.step === 1 ? 'Wymusić wznowienie?' : 'Potwierdź jeszcze raz'}</h3>
            <p>
              {getPlayerName(gameState.pausedPlayerId)} nadal ma aktywne ⏸. Wymuszenie wznowienia zostanie zapisane w logu administracyjnym.
            </p>
            <button className="btn" onClick={confirmHostResumeOverride}>
              {showHostResumeConfirm.step === 1 ? 'Potwierdź' : 'Wymuś wznowienie'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowHostResumeConfirm(null)}>
              Anuluj
            </button>
          </div>
        </div>
      )}

      {showHostActionConfirm && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-sheet">
            <h3>{showHostActionConfirm.step === 1 ? showHostActionConfirm.title : showHostActionConfirm.confirmTitle}</h3>
            <p>{showHostActionConfirm.body}</p>
            <button className="btn btn-danger" onClick={confirmHostAction}>
              {showHostActionConfirm.step === 1 ? 'Potwierdź' : showHostActionConfirm.confirmLabel}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowHostActionConfirm(null)}>
              Anuluj
            </button>
          </div>
        </div>
      )}

      {showLeaveConfirm && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-sheet">
            <h3>Opuścić partię?</h3>
            <p>Wyjdziesz z tej sesji na tym urządzeniu. W aktywnej partii liczy się to jako porzucenie gry.</p>
            <button className="btn btn-danger" type="button" onClick={onLeaveRoom}>
              Opuść
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowLeaveConfirm(false)}>
              Anuluj
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default Game;
