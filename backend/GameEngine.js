import { randomInt } from "node:crypto";
import {
  ACE_JACK_REQUEST_MODES,
  EFFECT_TYPES,
  JACK_REQUEST_MODES,
  JACK_REQUEST_RANKS_BASIC,
  JACK_REQUEST_RANKS_WITH_NON_BATTLE_KINGS,
  MAKAO_CATCH_WINDOW_MS,
  MAKAO_DECLARE_GRACE_MS,
  QUEEN_REQUEST_MODES,
  QUEEN_VARIANTS,
  RANKS,
  SUITS
} from "./shared/constants.js";
import {
  getBattleValue,
  getEffectiveCard,
  isBattleCard,
  isCardLegal,
  matchesRankRequest
} from "./shared/utils.js";

const AUDIT_LOG_LIMIT = 300;
const STATE_SNAPSHOT_LIMIT = 80;

export class GameEngine {
  static createDeck(useJokers, deckIndex) {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        if (rank === "joker") continue;
        deck.push({ cardInstanceId: `d${deckIndex}_${rank}_${suit}`, rank, suit, deckIndex });
      }
    }
    if (useJokers) {
      deck.push({ cardInstanceId: `d${deckIndex}_joker_1`, rank: "joker", deckIndex });
      deck.push({ cardInstanceId: `d${deckIndex}_joker_2`, rank: "joker", deckIndex });
    }
    return deck;
  }

  static shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  static isNonFunctional(card) {
    const funcRanks = ["2", "3", "4", "jack", "queen", "ace", "joker"];
    if (funcRanks.includes(card.rank)) return false;
    if (card.rank === "king" && (card.suit === "hearts" || card.suit === "spades")) return false;
    return true;
  }

  static initializeGame(players, settings) {
    const requestedFirstPlayerIndex = players.findIndex(player => player.id === settings.firstPlayerId);
    const firstPlayerIndex = requestedFirstPlayerIndex !== -1
      ? requestedFirstPlayerIndex
      : (players.length > 0 ? Math.floor(Math.random() * players.length) : 0);
    let decks = [];
    for (let i = 0; i < settings.deckCount; i++) {
      decks = decks.concat(this.createDeck(settings.useJokers, i));
    }
    this.shuffle(decks);

    const hands = {};
    players.forEach(p => hands[p.id] = []);

    // Deal 5 cards each
    for (let i = 0; i < 5; i++) {
      players.forEach(p => {
        hands[p.id].push(decks.pop());
      });
    }

    let topCard = null;
    const discardPile = [];
    
    // Znajdź kartę startową (niefunkcyjną)
    const skippedFunctionalStartCards = [];
    while (decks.length > 0) {
      const card = decks.pop();
      if (this.isNonFunctional(card)) {
        topCard = card;
        break;
      } else {
        skippedFunctionalStartCards.push(card);
        decks.unshift(card); // na spód
      }
    }

    const state = {
      topCard,
      activeEffect: null,
      stateVersion: 1,
      moveHistory: [{
        version: 1,
        type: "game_started",
        at: Date.now(),
        playerId: null,
        currentPlayerId: players[firstPlayerIndex]?.id || null,
        topCard: this.publicCard(topCard),
        activeEffect: null,
        details: {
          playerCount: players.length,
          deckCount: settings.deckCount,
          useJokers: Boolean(settings.useJokers),
          firstPlayerId: players[firstPlayerIndex]?.id || null,
          gameNumber: settings.gameNumber || 1
        }
      }],
      privateDealLog: {
        skippedFunctionalStartCards: skippedFunctionalStartCards.map(card => this.publicCard(card))
      },
      auditLog: [],
      stateSnapshots: [],
      currentPlayerIndex: firstPlayerIndex,
      turnOrder: players.map(p => p.id),
      hands,
      drawPile: decks,
      discardPile,
      direction: 1, // 1 dla zgodnego z ruchem, -1 dla przeciwnego
      skipTurns: {},
      turnEvents: [],
      finishedPlayers: [],
      gameOver: false,
      winnerId: null,
      makao: {},
      settings: { ...settings }
    };
    this.refreshTurnTimer(state, true);
    this.recordAudit(state, "deal_log", "game_dealt", {
      details: {
        roomId: settings.roomId || null,
        gameNumber: settings.gameNumber || 1,
        playerCount: players.length,
        deckCount: settings.deckCount,
        useJokers: Boolean(settings.useJokers),
        queenVariant: settings.queenVariant,
        turnTimeLimitSeconds: settings.turnTimeLimitSeconds,
        firstPlayerId: players[firstPlayerIndex]?.id || null,
        playerOrder: players.map(player => ({ id: player.id, name: player.name })),
        dealtHands: Object.fromEntries(
          Object.entries(hands).map(([playerId, cards]) => [
            playerId,
            cards.map(card => this.privateCard(card))
          ])
        ),
        drawPileCardIds: decks.map(card => card.cardInstanceId),
        skippedFunctionalStartCards: skippedFunctionalStartCards.map(card => this.privateCard(card)),
        startCard: this.privateCard(topCard),
        settings: { ...settings }
      },
      includeSnapshot: true
    });
    this.recordAudit(state, "game_event_log", "game_started", {
      details: state.moveHistory[0].details
    });
    return state;
  }

  static getNextPlayerIndex(state, steps = 1) {
    const len = state.turnOrder.length;
    let nextIdx = (state.currentPlayerIndex + (state.direction * steps)) % len;
    if (nextIdx < 0) nextIdx += len;
    return nextIdx;
  }

  static getBattleDirection(card, playerCount) {
    const effectiveCard = getEffectiveCard(card);
    if (effectiveCard.rank === "king" && effectiveCard.suit === "spades" && playerCount >= 3) {
      return "previous";
    }
    return "next";
  }

  static getEffectTargetPlayerId(state, direction = "next") {
    if (!state.turnOrder.length) return null;
    return state.turnOrder[this.getNextPlayerIndex(state, direction === "previous" ? -1 : 1)];
  }

  static advanceTurn(state, steps = 1) {
    if (state.gameOver) return state;
    if (state.turnOrder.length === 0) return state;

    state.currentPlayerIndex = this.getNextPlayerIndex(state, steps);

    if (state.activeEffect?.targetPlayerId) {
      const targetIndex = state.turnOrder.indexOf(state.activeEffect.targetPlayerId);
      if (targetIndex !== -1) {
        state.currentPlayerIndex = targetIndex;
        return this.expireMakaoWindowsForCurrentTurn(state);
      }
    }

    this.consumePausesFromCurrent(state);
    return this.expireMakaoWindowsForCurrentTurn(state);
  }

  static consumePausesFromCurrent(state) {
    const maxPauses = Math.max(0, ...state.turnOrder.map(id => state.skipTurns?.[id] || 0));
    let guard = state.turnOrder.length * (maxPauses + 1);
    while (guard > 0) {
      const playerId = state.turnOrder[state.currentPlayerIndex];
      const pauses = state.skipTurns?.[playerId] || 0;
      if (pauses <= 0) break;

      state.skipTurns[playerId] = pauses - 1;
      const nextPlayerId = state.turnOrder[this.getNextPlayerIndex(state)];
      this.addTurnEvent(state, {
        type: state.skipTurns[playerId] > 0 ? "skip_used" : "skip_finished",
        playerId,
        pausedPlayerId: playerId,
        consumed: 1,
        remaining: state.skipTurns[playerId],
        nextPlayerId,
        currentPlayerId: nextPlayerId
      });
      state.currentPlayerIndex = this.getNextPlayerIndex(state);
      guard -= 1;
    }

    return state;
  }

  static resolveSkipEffect(state) {
    if (!state.activeEffect || state.activeEffect.type !== EFFECT_TYPES.SKIP_TURN) return state;

    const { targetPlayerId, amount } = state.activeEffect;
    const targetIndex = state.turnOrder.indexOf(targetPlayerId);
    if (targetIndex === -1) {
      state.activeEffect = null;
      return state;
    }

    state.currentPlayerIndex = targetIndex;
    state.activeEffect = null;
    this.addSkipTurns(state, targetPlayerId, amount);
    this.consumePausesFromCurrent(state);
    return this.expireMakaoWindowsForCurrentTurn(state);
  }

  static processAutomaticSkipEffects(state) {
    if (state.gameOver) return state;
    if (!state.turnOrder?.length) return state;

    let guard = (state.turnOrder?.length || 0) * Math.max(1, state.activeEffect?.amount || 1) + 10;
    while (guard > 0 && state.activeEffect?.type === EFFECT_TYPES.SKIP_TURN) {
      const targetPlayerId = state.activeEffect.targetPlayerId;
      const targetIndex = state.turnOrder.indexOf(targetPlayerId);
      if (targetIndex === -1) {
        state.activeEffect = null;
        break;
      }

      state.currentPlayerIndex = targetIndex;
      if (this.hasLegalCard(state, targetPlayerId)) break;

      this.resolveSkipEffect(state);
      guard -= 1;
    }

    return state;
  }

  static addTurnEvent(state, event) {
    if (!state.turnEvents) state.turnEvents = [];
    state.turnEvents.push({ ...event, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` });
    state.turnEvents = state.turnEvents.slice(-8);
  }

  static clearTurnEvents(state) {
    state.turnEvents = [];
  }

  static publicCard(card) {
    if (!card) return null;
    const summary = { rank: card.rank, suit: card.suit };
    if (card.jokerDeclaration) {
      summary.jokerDeclaration = { ...card.jokerDeclaration };
    }
    return summary;
  }

  static privateCard(card) {
    if (!card) return null;
    return {
      ...this.publicCard(card),
      cardInstanceId: card.cardInstanceId,
      deckIndex: card.deckIndex
    };
  }

  static getHandCounts(state) {
    return Object.fromEntries(
      Object.entries(state.hands || {}).map(([playerId, cards]) => [playerId, cards.length])
    );
  }

  static getStateSnapshot(state) {
    return {
      version: state.stateVersion || 0,
      at: Date.now(),
      currentPlayerId: this.getCurrentPlayerId(state),
      turnOrder: [...(state.turnOrder || [])],
      topCard: this.privateCard(state.topCard),
      activeEffect: this.publicEffect(state.activeEffect),
      handCounts: this.getHandCounts(state),
      drawPileCount: state.drawPile?.length || 0,
      discardPileCount: state.discardPile?.length || 0,
      zones: {
        hands: Object.fromEntries(
          Object.entries(state.hands || {}).map(([playerId, cards]) => [
            playerId,
            cards.map(card => card.cardInstanceId)
          ])
        ),
        drawPile: (state.drawPile || []).map(card => card.cardInstanceId),
        discardPile: (state.discardPile || []).map(card => card.cardInstanceId),
        topCard: state.topCard?.cardInstanceId || null
      },
      skipTurns: { ...(state.skipTurns || {}) },
      makao: { ...(state.makao || {}) },
      gameOver: Boolean(state.gameOver),
      winnerId: state.winnerId || null
    };
  }

  static publicEffect(effect) {
    if (!effect) return null;
    const summary = {
      type: effect.type,
      targetPlayerId: effect.targetPlayerId
    };
    if (effect.requesterPlayerId) summary.requesterPlayerId = effect.requesterPlayerId;
    if (effect.amount !== undefined) summary.amount = effect.amount;
    if (effect.penaltyDrawnCount) {
      summary.penaltyDrawnCount = effect.penaltyDrawnCount;
      if (effect.amount !== undefined) {
        summary.penaltyRemainingCount = Math.max(0, effect.amount - effect.penaltyDrawnCount);
      }
    }
    if (effect.battleSuit) summary.battleSuit = effect.battleSuit;
    if (effect.direction) summary.direction = effect.direction;
    if (effect.requestedSuit) summary.requestedSuit = effect.requestedSuit;
    if (effect.requestedRank) summary.requestedRank = effect.requestedRank;
    return summary;
  }

  static isRequestEffect(effect) {
    return effect?.type === EFFECT_TYPES.SUIT_REQUEST || effect?.type === EFFECT_TYPES.RANK_REQUEST;
  }

  static getRequestRequesterPlayerId(state, playerId) {
    if (state.activeEffect?.requesterPlayerId && state.turnOrder.includes(state.activeEffect.requesterPlayerId)) {
      return state.activeEffect.requesterPlayerId;
    }

    const currentIndex = state.turnOrder.indexOf(playerId);
    if (currentIndex === -1 || state.turnOrder.length <= 1) return null;

    const direction = state.direction || 1;
    const requesterIndex = (currentIndex - direction + state.turnOrder.length) % state.turnOrder.length;
    return state.turnOrder[requesterIndex] || null;
  }

  static advanceRequestAfterPass(state, playerId) {
    return this.advanceRequestAfterResponse(state, playerId);
  }

  static advanceRequestAfterAnswer(state, playerId) {
    return this.advanceRequestAfterResponse(state, playerId);
  }

  static advanceRequestAfterResponse(state, playerId) {
    if (!this.isRequestEffect(state.activeEffect)) return { ended: false, nextPlayerId: null };

    const requesterPlayerId = this.getRequestRequesterPlayerId(state, playerId);
    const currentIndex = state.turnOrder.indexOf(playerId);
    if (currentIndex === -1 || state.turnOrder.length <= 1) {
      state.activeEffect = null;
      return { ended: true, nextPlayerId: null };
    }

    if (requesterPlayerId && playerId === requesterPlayerId) {
      const nextPlayerId = state.turnOrder[this.getNextPlayerIndex(state)] || null;
      state.activeEffect = null;
      return { ended: true, nextPlayerId };
    }

    const direction = state.direction || 1;
    const nextIndex = (currentIndex + direction + state.turnOrder.length) % state.turnOrder.length;
    const nextPlayerId = state.turnOrder[nextIndex] || null;
    if (!nextPlayerId) {
      state.activeEffect = null;
      return { ended: true, nextPlayerId };
    }

    state.activeEffect = {
      ...state.activeEffect,
      requesterPlayerId,
      targetPlayerId: nextPlayerId
    };
    return { ended: false, nextPlayerId };
  }

  static getPenaltyDrawnCount(state) {
    if (state.activeEffect?.type !== EFFECT_TYPES.DRAW_PENALTY) return 0;
    const effectCount = Number(state.activeEffect.penaltyDrawnCount || 0);
    if (effectCount > 0) return Math.max(0, effectCount);
    return state.hasDrawnCardThisTurn && state.drawnCardInstanceId ? 1 : 0;
  }

  static setPenaltyDrawnCount(state, count) {
    if (state.activeEffect?.type !== EFFECT_TYPES.DRAW_PENALTY) return;
    state.activeEffect.penaltyDrawnCount = Math.max(0, count);
  }

  static clearDrawnCardState(state) {
    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;
  }

  static finishDrawPenalty(state, playerId, amount, drawnCount = amount) {
    state.activeEffect = null;
    this.clearDrawnCardState(state);
    this.advanceTurn(state);
    this.addTurnEvent(state, {
      type: "penalty_accepted",
      playerId,
      amount,
      drawnCount,
      nextPlayerId: state.turnOrder[state.currentPlayerIndex]
    });
    return state;
  }

  static validateSuitRequest(value) {
    if (value === undefined || value === null || value === "none") return;
    if (!SUITS.includes(value)) {
      throw new Error("Invalid suit request.");
    }
  }

  static getAllowedJackRequestRanks(state) {
    const mode = state.settings?.jackRequestMode || JACK_REQUEST_MODES.WITH_NON_BATTLE_KINGS;
    return mode === JACK_REQUEST_MODES.VALUES_5_TO_10
      ? JACK_REQUEST_RANKS_BASIC
      : JACK_REQUEST_RANKS_WITH_NON_BATTLE_KINGS;
  }

  static validateRankRequest(value, state) {
    if (value === undefined || value === null || value === "none") return;
    if (!this.getAllowedJackRequestRanks(state).includes(value)) {
      throw new Error("Invalid rank request.");
    }
  }

  static validateOptionalRequestDecision(cardRank, requestValue, state) {
    const mode = state.settings?.aceJackRequestMode || ACE_JACK_REQUEST_MODES.OPTIONAL;
    if (mode !== ACE_JACK_REQUEST_MODES.REQUIRED) return;
    if (cardRank !== "ace" && cardRank !== "jack") return;
    if (requestValue === undefined || requestValue === null || requestValue === "none") {
      throw new Error("This room requires a request for aces and jacks.");
    }
  }

  static recordHistory(state, type, { playerId = null, details = {} } = {}) {
    this.refreshTurnTimer(state);
    const nextVersion = (state.stateVersion || 0) + 1;
    state.stateVersion = nextVersion;
    if (!state.moveHistory) state.moveHistory = [];

    state.moveHistory.push({
      version: nextVersion,
      type,
      at: Date.now(),
      playerId,
      currentPlayerId: state.turnOrder[state.currentPlayerIndex] || null,
      topCard: this.publicCard(state.topCard),
      activeEffect: this.publicEffect(state.activeEffect),
      details
    });
    state.moveHistory = state.moveHistory.slice(-100);
    this.recordAudit(state, "game_event_log", type, {
      playerId,
      details,
      includeSnapshot: true
    });
    return state;
  }

  static recordAudit(state, category, type, { playerId = null, details = {}, includeSnapshot = false } = {}) {
    if (!state) return null;
    const at = Date.now();
    if (!state.auditLog) state.auditLog = [];

    const entry = {
      id: `${at}_${Math.random().toString(36).slice(2)}`,
      category,
      type,
      at,
      version: state.stateVersion || 0,
      playerId,
      currentPlayerId: this.getCurrentPlayerId(state),
      topCard: this.publicCard(state.topCard),
      activeEffect: this.publicEffect(state.activeEffect),
      handCounts: this.getHandCounts(state),
      drawPileCount: state.drawPile?.length || 0,
      discardPileCount: state.discardPile?.length || 0,
      details
    };

    state.auditLog.push(entry);
    state.auditLog = state.auditLog.slice(-AUDIT_LOG_LIMIT);

    if (includeSnapshot) {
      if (!state.stateSnapshots) state.stateSnapshots = [];
      state.stateSnapshots.push({
        auditEntryId: entry.id,
        ...this.getStateSnapshot(state)
      });
      state.stateSnapshots = state.stateSnapshots.slice(-STATE_SNAPSHOT_LIMIT);
    }

    return entry;
  }

  static getCurrentPlayerId(state) {
    return state.turnOrder?.[state.currentPlayerIndex] || null;
  }

  static assertActiveEffectTarget(state, playerId) {
    const targetPlayerId = state.activeEffect?.targetPlayerId;
    if (targetPlayerId && targetPlayerId !== playerId) {
      throw new Error("Active effect is waiting for another player.");
    }
  }

  static getMakaoPenaltyCards(state) {
    return state.settings?.makaoPenaltyCards ?? 5;
  }

  static getMakaoDeclareGraceMs(state) {
    return Number(state.settings?.makaoDeclareGraceMs || MAKAO_DECLARE_GRACE_MS);
  }

  static getMakaoCatchWindowMs(state) {
    return Number(state.settings?.makaoCatchWindowMs || MAKAO_CATCH_WINDOW_MS);
  }

  static hasDeclaredMakao(state, playerId) {
    const makaoState = state.makao?.[playerId];
    return makaoState?.declared === true || makaoState?.armed === true;
  }

  static applyMissingMakaoPenalty(state, playerId, type = "makao_penalty") {
    const amount = this.getMakaoPenaltyCards(state);
    this.drawCards(state, playerId, amount);
    delete state.makao?.[playerId];
    this.addTurnEvent(state, {
      type,
      playerId,
      amount
    });
    return amount;
  }

  static expireMakaoWindowsForCurrentTurn(state) {
    if (state.gameOver) return state;
    const playerId = this.getCurrentPlayerId(state);
    if (!playerId) return state;
    const makaoState = state.makao?.[playerId];
    if (!makaoState || makaoState.declared || !makaoState.catchUntil) return state;
    if (Date.now() <= makaoState.catchUntil) return state;

    state.makao[playerId] = {
      declared: true,
      declaredAt: Date.now(),
      autoSafeAfterCatchWindow: true
    };
    this.addTurnEvent(state, { type: "makao_uncaught", playerId });
    return state;
  }

  static refreshTurnTimer(state, force = false) {
    if (!state) return state;
    const limitSeconds = Number(state.settings?.turnTimeLimitSeconds || 0);
    const currentPlayerId = this.getCurrentPlayerId(state);

    if (!limitSeconds || state.gameOver || state.paused || !currentPlayerId) {
      state.turnTimerPlayerId = currentPlayerId;
      state.turnStartedAt = null;
      state.turnDeadlineAt = null;
      return state;
    }

    if (force || state.turnTimerPlayerId !== currentPlayerId || !state.turnStartedAt || !state.turnDeadlineAt) {
      const now = Date.now();
      state.turnTimerPlayerId = currentPlayerId;
      state.turnStartedAt = now;
      state.turnDeadlineAt = now + (limitSeconds * 1000);
    }

    return state;
  }

  static resetCardForDraw(card) {
    if (!card || card.rank !== "joker" || !card.jokerDeclaration) return card;
    const { jokerDeclaration, ...resetCard } = card;
    return resetCard;
  }

  static refillDrawPileIfNeeded(state) {
    if (state.drawPile.length > 0) return false;
    if (state.discardPile.length === 0) return false;
    const recycledCards = state.discardPile.map(card => this.privateCard(card));
    this.shuffle(state.discardPile);
    state.drawPile = state.discardPile.map(card => this.resetCardForDraw(card));
    state.discardPile = [];
    state.needsNeutralTopAfterRefill = true;
    this.recordAudit(state, "deal_log", "draw_pile_refilled", {
      details: {
        recycledCardCount: recycledCards.length,
        recycledCards,
        newDrawPileCardIds: state.drawPile.map(card => card.cardInstanceId)
      },
      includeSnapshot: true
    });
    return true;
  }

  static selectNeutralTopCardAfterRefill(state) {
    if (!state.needsNeutralTopAfterRefill) return null;
    state.needsNeutralTopAfterRefill = false;

    const hasNeutralCard = state.drawPile.some(card => this.isNonFunctional(getEffectiveCard(card)));
    if (!hasNeutralCard) {
      this.recordAudit(state, "deal_log", "neutral_table_card_unavailable", {
        details: {
          drawPileCount: state.drawPile.length,
          oldTopCard: this.privateCard(state.topCard)
        },
        includeSnapshot: true
      });
      return null;
    }

    const oldTopCard = state.topCard;
    const skippedFunctionalCards = [];
    let neutralCard = null;
    let guard = state.drawPile.length;

    while (guard > 0 && state.drawPile.length > 0) {
      const candidate = state.drawPile.pop();
      if (this.isNonFunctional(getEffectiveCard(candidate))) {
        neutralCard = candidate;
        break;
      }

      skippedFunctionalCards.push(candidate);
      state.drawPile.unshift(candidate);
      guard -= 1;
    }

    if (!neutralCard) {
      this.recordAudit(state, "deal_log", "neutral_table_card_unavailable", {
        details: {
          drawPileCount: state.drawPile.length,
          oldTopCard: this.privateCard(state.topCard)
        },
        includeSnapshot: true
      });
      return null;
    }

    if (oldTopCard) {
      state.discardPile.push(oldTopCard);
    }
    state.topCard = neutralCard;
    this.addTurnEvent(state, {
      type: "draw_pile_refilled",
      topCard: this.publicCard(neutralCard)
    });
    this.recordAudit(state, "deal_log", "neutral_table_card_selected", {
      details: {
        oldTopCard: this.privateCard(oldTopCard),
        newTopCard: this.privateCard(neutralCard),
        skippedFunctionalCards: skippedFunctionalCards.map(card => this.privateCard(card))
      },
      includeSnapshot: true
    });
    return neutralCard;
  }

  static normalizeJokerDeclarations(payload = {}, cardsToPlay = []) {
    const raw = payload.jokerDeclarations || payload.jokerDeclaration || {};
    const declarations = raw.rank && raw.suit
      ? Object.fromEntries(cardsToPlay.filter(card => card.rank === "joker").map(card => [card.cardInstanceId, raw]))
      : raw;

    const normalized = {};
    for (const card of cardsToPlay) {
      if (card.rank !== "joker") continue;
      const declaration = declarations?.[card.cardInstanceId];
      if (
        !declaration ||
        !RANKS.includes(declaration.rank) ||
        declaration.rank === "joker" ||
        !SUITS.includes(declaration.suit)
      ) {
        throw new Error("Joker must be declared as a concrete card.");
      }
      normalized[card.cardInstanceId] = {
        rank: declaration.rank,
        suit: declaration.suit
      };
    }
    return normalized;
  }

  static resolveJokerCard(card, jokerDeclarations = {}) {
    if (card.rank !== "joker") return card;
    return {
      ...card,
      jokerDeclaration: { ...jokerDeclarations[card.cardInstanceId] }
    };
  }

  static finishGameByHost(state, playerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    this.clearTurnEvents(state);
    state.gameOver = true;
    state.winnerId = null;
    state.activeEffect = null;
    state.skipTurns = {};
    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;
    state.endedByHostId = playerId;
    state.endReason = "host_admin";
    this.addTurnEvent(state, {
      type: "host_ended_game",
      playerId
    });
    return state;
  }

  static removePlayerFromGame(state, playerId, options = {}) {
    if (!state.hands[playerId] && !state.turnOrder.includes(playerId)) {
      throw new Error("Player is not in the active game.");
    }

    this.clearTurnEvents(state);
    const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
    const removedWasCurrent = currentPlayerId === playerId;
    const nextCandidate = removedWasCurrent
      ? state.turnOrder[this.getNextPlayerIndex(state)]
      : currentPlayerId;

    delete state.hands[playerId];
    delete state.skipTurns?.[playerId];
    delete state.makao?.[playerId];

    if (state.activeEffect?.targetPlayerId === playerId) {
      state.activeEffect = null;
    }

    state.turnOrder = state.turnOrder.filter(id => id !== playerId);
    state.hasDrawnCardThisTurn = removedWasCurrent ? false : state.hasDrawnCardThisTurn;
    state.drawnCardInstanceId = removedWasCurrent ? null : state.drawnCardInstanceId;

    this.addTurnEvent(state, {
      type: options.eventType || "host_removed_player",
      playerId,
      nextPlayerId: nextCandidate
    });

    if (state.turnOrder.length <= 1) {
      state.gameOver = true;
      state.winnerId = state.turnOrder[0] || state.finishedPlayers?.[0]?.playerId || null;
      state.activeEffect = null;
      state.skipTurns = {};
      state.currentPlayerIndex = 0;
      state.endReason = "not_enough_players";
      this.addTurnEvent(state, {
        type: "game_over",
        playerId: state.winnerId
      });
      return state;
    }

    const preservedIndex = state.turnOrder.indexOf(nextCandidate);
    state.currentPlayerIndex = preservedIndex !== -1
      ? preservedIndex
      : state.currentPlayerIndex % state.turnOrder.length;
    return state;
  }

  static timeOutPlayer(state, playerId, at = Date.now()) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
      throw new Error("This player is not the current player.");
    }

    this.clearTurnEvents(state);
    const nextCandidate = state.turnOrder[this.getNextPlayerIndex(state)];

    if (!state.timedOutPlayers) state.timedOutPlayers = [];
    if (!state.timedOutPlayers.some(player => player.playerId === playerId)) {
      state.timedOutPlayers.push({ playerId, at });
    }

    delete state.hands[playerId];
    delete state.skipTurns?.[playerId];
    delete state.makao?.[playerId];

    if (state.activeEffect?.targetPlayerId === playerId) {
      state.activeEffect = null;
    }

    state.turnOrder = state.turnOrder.filter(id => id !== playerId);
    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;
    state.turnTimerPlayerId = null;
    state.turnStartedAt = null;
    state.turnDeadlineAt = null;

    this.addTurnEvent(state, {
      type: "turn_timeout_loss",
      playerId,
      nextPlayerId: nextCandidate
    });

    if (state.turnOrder.length <= 1) {
      state.gameOver = true;
      state.winnerId = state.turnOrder[0] || state.finishedPlayers?.[0]?.playerId || null;
      state.activeEffect = null;
      state.skipTurns = {};
      state.currentPlayerIndex = 0;
      state.endReason = "timeout";
      this.addTurnEvent(state, {
        type: "game_over",
        playerId: state.winnerId
      });
      return state;
    }

    const preservedIndex = state.turnOrder.indexOf(nextCandidate);
    state.currentPlayerIndex = preservedIndex !== -1
      ? preservedIndex
      : state.currentPlayerIndex % state.turnOrder.length;
    return state;
  }

  static forceSkipTurn(state, playerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
      throw new Error("This player is not the current player.");
    }

    if (state.activeEffect) {
      throw new Error("Cannot skip a player while an active effect is waiting. Resolve the effect first.");
    }

    this.clearTurnEvents(state);
    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;
    this.advanceTurn(state);
    this.addTurnEvent(state, {
      type: "host_skipped_offline",
      playerId,
      nextPlayerId: state.turnOrder[state.currentPlayerIndex]
    });
    return state;
  }

  static forceAcceptActiveEffect(state, playerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
      throw new Error("This player is not the current player.");
    }

    const effect = state.activeEffect;
    if (!effect || effect.targetPlayerId !== playerId) {
      throw new Error("No active effect is waiting for this player.");
    }

    this.clearTurnEvents(state);
    const effectType = effect.type;
    const details = { effectType };
    let requestPassed = false;

    if (effectType === EFFECT_TYPES.DRAW_PENALTY) {
      details.amount = effect.amount;
      const alreadyDrawnCount = this.getPenaltyDrawnCount(state);
      const drawCount = Math.max(0, effect.amount - alreadyDrawnCount);
      if (drawCount > 0) {
        this.drawCards(state, playerId, drawCount);
      }
      this.syncMakaoAfterHandChange(state, playerId);
    } else if (effectType === EFFECT_TYPES.SKIP_TURN) {
      details.amount = effect.amount;
      const futurePauses = Math.max(0, effect.amount - 1);
      if (futurePauses > 0) {
        if (!state.skipTurns) state.skipTurns = {};
        state.skipTurns[playerId] = (state.skipTurns[playerId] || 0) + futurePauses;
      }
    } else if (
      effectType === EFFECT_TYPES.SUIT_REQUEST ||
      effectType === EFFECT_TYPES.RANK_REQUEST
    ) {
      details.amount = 1;
      this.drawCards(state, playerId, 1);
      this.syncMakaoAfterHandChange(state, playerId);
      this.advanceRequestAfterPass(state, playerId);
      requestPassed = true;
    } else {
      throw new Error("Unsupported effect type.");
    }

    if (!requestPassed) {
      state.activeEffect = null;
    }
    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;
    this.advanceTurn(state);
    this.addTurnEvent(state, {
      type: "host_forced_effect",
      playerId,
      effectType,
      amount: details.amount,
      nextPlayerId: state.turnOrder[state.currentPlayerIndex]
    });
    return details;
  }

  static addSkipTurns(state, playerId, amount) {
    if (!state.skipTurns) state.skipTurns = {};
    state.skipTurns[playerId] = (state.skipTurns[playerId] || 0) + amount;
    this.addTurnEvent(state, {
      type: "skip_added",
      playerId,
      pausedPlayerId: playerId,
      added: amount,
      remaining: state.skipTurns[playerId],
      currentPlayerId: this.getCurrentPlayerId(state)
    });
  }

  static drawCards(state, playerId, amount) {
    const drawnCards = [];
    let refilledDuringDraw = false;

    for (let i = 0; i < amount; i++) {
      refilledDuringDraw = this.refillDrawPileIfNeeded(state) || refilledDuringDraw;
      const card = state.drawPile.pop();
      if (card) {
        state.hands[playerId].push(card);
        drawnCards.push(card);
      }
    }

    if (refilledDuringDraw) {
      this.selectNeutralTopCardAfterRefill(state);
    }

    return drawnCards;
  }

  static hasLegalCard(state, playerId) {
    return state.hands[playerId]?.some(card => isCardLegal(card, state)) || false;
  }

  static canPlayDownToOne(state, playerId) {
    const hand = state.hands[playerId] || [];
    if (hand.length <= 1) return false;

    const cardsToPlayCount = hand.length - 1;
    const jokers = hand.filter(card => card.rank === "joker");
    const nonJokers = hand.filter(card => card.rank !== "joker");
    const ranks = new Set(nonJokers.map(card => card.rank));

    if (state.hasDrawnCardThisTurn) {
      const drawnCard = hand.find(c => c.cardInstanceId === state.drawnCardInstanceId);
      if (!drawnCard || !isCardLegal(drawnCard, state)) return false;

      if (drawnCard.rank === "joker") {
        if (jokers.length >= cardsToPlayCount) return true;
        for (const rank of ranks) {
          const sameRankCount = nonJokers.filter(card => card.rank === rank).length;
          if (sameRankCount + jokers.length >= cardsToPlayCount) return true;
        }
        return false;
      }

      const sameRankCount = nonJokers.filter(c => c.rank === drawnCard.rank).length;
      return sameRankCount + jokers.length >= cardsToPlayCount;
    }

    for (const rank of ranks) {
      const sameRankCards = nonJokers.filter(card => card.rank === rank);
      if (sameRankCards.length + jokers.length >= cardsToPlayCount && sameRankCards.some(card => isCardLegal(card, state))) {
        return true;
      }
    }

    return jokers.length >= cardsToPlayCount;
  }

  static processAutomaticDraws(state) {
    if (state.gameOver) return state;

    let guard = state.turnOrder.length * 2 + 10;

    while (guard > 0 && state.turnOrder.length > 0) {
      const playerId = state.turnOrder[state.currentPlayerIndex];
      if (!playerId || state.hasDrawnCardThisTurn) {
        break;
      }

      if (state.activeEffect?.type === EFFECT_TYPES.SKIP_TURN) {
        if (this.hasLegalCard(state, playerId)) {
          break;
        }
        this.resolveSkipEffect(state);
        guard -= 1;
        continue;
      }

      if (state.activeEffect || this.hasLegalCard(state, playerId)) {
        break;
      }

      const [drawnCard] = this.drawCards(state, playerId, 1);
      if (!drawnCard) break;
      this.syncMakaoAfterHandChange(state, playerId);

      if (isCardLegal(drawnCard, state)) {
        state.hasDrawnCardThisTurn = true;
        state.drawnCardInstanceId = drawnCard.cardInstanceId;
        this.addTurnEvent(state, {
          type: "auto_draw_playable",
          playerId,
          drawnCard: this.publicCard(drawnCard)
        });
        this.recordAudit(state, "game_event_log", "auto_draw_playable", {
          playerId,
          details: {
            drawnCount: 1,
            drawnCard: this.privateCard(drawnCard)
          },
          includeSnapshot: true
        });
        break;
      }

      this.advanceTurn(state);
      this.addTurnEvent(state, {
        type: "auto_draw_pass",
        playerId,
        drawnCard: this.publicCard(drawnCard),
        nextPlayerId: state.turnOrder[state.currentPlayerIndex]
      });
      this.recordAudit(state, "game_event_log", "auto_draw_pass", {
        playerId,
        details: {
          drawnCount: 1,
          drawnCard: this.privateCard(drawnCard),
          nextPlayerId: state.turnOrder[state.currentPlayerIndex]
        },
        includeSnapshot: true
      });
      guard -= 1;
    }

    return state;
  }

  static syncMakaoAfterHandChange(state, playerId) {
    if (!state.makao) state.makao = {};
    const handSize = state.hands[playerId]?.length || 0;
    const current = state.makao[playerId];
    const now = Date.now();

    if (handSize === 1) {
      if (current?.armed || current?.declared) {
        state.makao[playerId] = { declared: true, declaredAt: now };
        this.addTurnEvent(state, { type: "makao_declared", playerId });
      } else if (!current || current.declared !== false) {
        const declareUntil = now + this.getMakaoDeclareGraceMs(state);
        state.makao[playerId] = {
          declared: false,
          declareUntil,
          canBeCaughtAt: declareUntil,
          catchUntil: declareUntil + this.getMakaoCatchWindowMs(state)
        };
        this.addTurnEvent(state, { type: "makao_missing", playerId });
      }
    } else if (handSize === 0 || handSize > 1) {
      delete state.makao[playerId];
    }
  }

  static processDeclareMakao(state, playerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (!state.hands[playerId]) {
      throw new Error("Player not in game.");
    }

    if (!state.makao) state.makao = {};
    const handSize = state.hands[playerId].length;

    if (handSize <= 0) {
      throw new Error("Makao cannot be declared after finishing.");
    }

    if (handSize > 1) {
      if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
        throw new Error("Makao can be armed only on your turn.");
      }
      const current = state.makao[playerId];
      if (current?.armed || current?.declared) {
        return state;
      }
      this.clearTurnEvents(state);
      state.makao[playerId] = { armed: true, declaredAt: Date.now() };
      this.addTurnEvent(state, { type: "makao_armed", playerId });
      return state;
    }

    const current = state.makao[playerId];
    if (current?.declared) {
      return state;
    }

    const declareUntil = current?.declareUntil ?? current?.canBeCaughtAt;
    if (current?.declared === false && declareUntil && Date.now() >= declareUntil) {
      throw new Error("Makao declaration window has expired.");
    }

    this.clearTurnEvents(state);
    state.makao[playerId] = { declared: true, declaredAt: Date.now() };
    this.addTurnEvent(state, { type: "makao_declared", playerId });
    return state;
  }

  static processCatchMakao(state, catcherId, targetPlayerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (catcherId === targetPlayerId) {
      throw new Error("You cannot catch yourself.");
    }
    if (!state.hands[targetPlayerId]) {
      throw new Error("Player not in game.");
    }
    if (state.hands[targetPlayerId].length !== 1) {
      throw new Error("Player does not have one card.");
    }

    const makaoState = state.makao?.[targetPlayerId];
    if (!makaoState || makaoState.declared || makaoState.armed) {
      throw new Error("Player already declared Makao.");
    }
    const now = Date.now();
    if (now < makaoState.canBeCaughtAt) {
      throw new Error("Makao catch window is not open yet.");
    }
    if (makaoState.catchUntil && now > makaoState.catchUntil) {
      state.makao[targetPlayerId] = {
        declared: true,
        declaredAt: now,
        autoSafeAfterCatchWindow: true
      };
      throw new Error("Makao catch window has expired.");
    }

    this.clearTurnEvents(state);
    const penalty = state.settings?.makaoPenaltyCards ?? 5;
    this.drawCards(state, targetPlayerId, penalty);
    delete state.makao[targetPlayerId];
    this.addTurnEvent(state, {
      type: "makao_caught",
      playerId: targetPlayerId,
      catcherId,
      amount: penalty
    });
    return state;
  }

  static processPlayCards(state, playerId, payload) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    const { cardIds = [], suitRequest, rankRequest } = payload;
    if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
      throw new Error("It's not your turn.");
    }

    this.expireMakaoWindowsForCurrentTurn(state);
    this.assertActiveEffectTarget(state, playerId);
    
    const playerHand = state.hands[playerId];
    const makaoDeclaredBeforePlay = this.hasDeclaredMakao(state, playerId);
    const cardsById = new Map(playerHand.map(card => [card.cardInstanceId, card]));
    let orderedCardIds = [...cardIds];
    let cardsToPlay = orderedCardIds.map(cardId => cardsById.get(cardId));
    
    if (new Set(cardIds).size !== cardIds.length || cardsToPlay.some(card => !card) || cardsToPlay.length === 0) {
      throw new Error("Invalid cards selected.");
    }

    const jokerDeclarations = this.normalizeJokerDeclarations(payload, cardsToPlay);
    let resolvedCardsToPlay = [];
    let effectiveCardsToPlay = [];
    const rebuildResolvedCards = () => {
      resolvedCardsToPlay = cardsToPlay.map(card => this.resolveJokerCard(card, jokerDeclarations));
      effectiveCardsToPlay = resolvedCardsToPlay.map(card => getEffectiveCard(card));
    };
    const moveCardToFront = index => {
      if (index <= 0) return;
      const [cardId] = orderedCardIds.splice(index, 1);
      const [card] = cardsToPlay.splice(index, 1);
      orderedCardIds.unshift(cardId);
      cardsToPlay.unshift(card);
      rebuildResolvedCards();
    };
    rebuildResolvedCards();
    const remainingCardsAfterPlay = playerHand.length - cardsToPlay.length;

    // Po dobraniu można zagrać dobraną kartę oraz opcjonalnie inne karty tej samej wartości.
    if (state.hasDrawnCardThisTurn) {
      const drawnCard = playerHand.find(c => c.cardInstanceId === state.drawnCardInstanceId);
      const resolvedDrawnCard = drawnCard ? this.resolveJokerCard(drawnCard, jokerDeclarations) : null;
      const effectiveDrawnCard = getEffectiveCard(resolvedDrawnCard);
      const drawnCardIndex = resolvedCardsToPlay.findIndex(c => c.cardInstanceId === state.drawnCardInstanceId);
      const includesDrawnCard = drawnCardIndex >= 0;
      const allMatchDrawnRank = effectiveDrawnCard && effectiveCardsToPlay.every(c => c.rank === effectiveDrawnCard.rank);
      if (!includesDrawnCard || !allMatchDrawnRank) {
        throw new Error("You can only play the card you just drawn, plus matching cards of the same rank.");
      }
      moveCardToFront(drawnCardIndex);
    }

    if (
      state.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY &&
      this.getPenaltyDrawnCount(state) > 0 &&
      !(state.hasDrawnCardThisTurn && state.drawnCardInstanceId)
    ) {
      throw new Error("Penalty is being accepted. Draw the remaining penalty cards.");
    }

    // Sprawdzenie czy karty mają tę samą wartość (np. dwie dwójki)
    const firstRank = effectiveCardsToPlay[0].rank;
    const allSameRank = effectiveCardsToPlay.every(c => c.rank === firstRank);
    if (!allSameRank) {
      throw new Error("You can only play multiple cards of the same rank.");
    }

    // Złożona walidacja w zależności od activeEffect i topCard.
    let isLegal = isCardLegal(resolvedCardsToPlay[0], state);
    if (!isLegal && resolvedCardsToPlay.length > 1) {
      const legalCardIndex = resolvedCardsToPlay.findIndex(card => isCardLegal(card, state));
      if (legalCardIndex > 0) {
        moveCardToFront(legalCardIndex);
        isLegal = isCardLegal(resolvedCardsToPlay[0], state);
      }
    }

    if (!isLegal) {
      throw new Error("Selected cards cannot be played on the current top card.");
    }

    const firstCard = effectiveCardsToPlay[0];
    const lastResolvedCard = resolvedCardsToPlay[resolvedCardsToPlay.length - 1];

    if (state.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY) {
      const allCardsFitBattle = resolvedCardsToPlay.every(card => isCardLegal(card, state));
      if (!allCardsFitBattle) {
        throw new Error("All battle cards must match the active penalty rules.");
      }
    }

    if (firstCard.rank === "ace") {
      this.validateSuitRequest(suitRequest);
      this.validateOptionalRequestDecision("ace", suitRequest, state);
    }

    if (firstCard.rank === "jack") {
      this.validateRankRequest(rankRequest, state);
      this.validateOptionalRequestDecision("jack", rankRequest, state);
    }

    this.recordAudit(state, "rule_validation_log", "play_cards_accepted", {
      playerId,
      details: {
        cardIds: [...orderedCardIds],
        cards: resolvedCardsToPlay.map(card => this.privateCard(card)),
        effectiveCards: effectiveCardsToPlay.map(card => this.publicCard(card)),
        topCardBefore: this.privateCard(state.topCard),
        activeEffectBefore: this.publicEffect(state.activeEffect),
        suitRequest: suitRequest || null,
        rankRequest: rankRequest || null
      }
    });

    this.clearTurnEvents(state);

    // Update stanu
    state.discardPile.push(state.topCard); // stara karta na discard
    // kładziemy nowe karty na stos
    for (let i=0; i < resolvedCardsToPlay.length - 1; i++) {
      state.discardPile.push(resolvedCardsToPlay[i]);
    }
    state.topCard = resolvedCardsToPlay[resolvedCardsToPlay.length - 1]; // ostatnia jako top

    // Usunięcie z ręki
    state.hands[playerId] = playerHand.filter(c => !orderedCardIds.includes(c.cardInstanceId));
    this.syncMakaoAfterHandChange(state, playerId);

    // Aplikacja efektu rzuconej karty (As, Jopek, Dama, Bitewne)
    const hasBattleCard = effectiveCardsToPlay.some(c => isBattleCard(c));
    if (hasBattleCard) {
      const addedValue = effectiveCardsToPlay.reduce((sum, c) => sum + getBattleValue(c), 0);
      const battleDriver = [...effectiveCardsToPlay].reverse().find(c => isBattleCard(c));
      const battleDirection = this.getBattleDirection(battleDriver, state.turnOrder.length);
      const targetPlayer = this.getEffectTargetPlayerId(state, battleDirection);
      if (state.activeEffect && state.activeEffect.type === EFFECT_TYPES.DRAW_PENALTY) {
        state.activeEffect.amount += addedValue;
        state.activeEffect.targetPlayerId = targetPlayer;
        state.activeEffect.battleSuit = battleDriver.suit;
        state.activeEffect.direction = battleDirection;
        delete state.activeEffect.penaltyDrawnCount;
        if (!state.activeEffect.sourceCards) state.activeEffect.sourceCards = [];
        state.activeEffect.sourceCards.push(...orderedCardIds);
      } else {
        state.activeEffect = {
          type: EFFECT_TYPES.DRAW_PENALTY,
          amount: addedValue,
          battleSuit: battleDriver.suit,
          direction: battleDirection,
          targetPlayerId: targetPlayer,
          sourceCards: [...orderedCardIds],
          canBeAccepted: true,
          canBeCountered: true
        };
      }
    } else if (firstRank === "4") {
      const amount = (state.activeEffect?.type === EFFECT_TYPES.SKIP_TURN ? state.activeEffect.amount : 0) + cardsToPlay.length;
      const targetPlayer = state.turnOrder[this.getNextPlayerIndex(state)];

      state.activeEffect = {
        type: EFFECT_TYPES.SKIP_TURN,
        amount,
        targetPlayerId: targetPlayer,
        sourceCards: [...(state.activeEffect?.sourceCards || []), ...orderedCardIds]
      };
    } else if (firstRank === "queen") {
      const queenVariant = state.settings?.queenVariant || QUEEN_VARIANTS.DEFENSIVE_NON_FUNCTIONAL;
      const queenRequestMode = state.settings?.queenRequestMode || QUEEN_REQUEST_MODES.CANCELS_REQUEST;
      // Przerywanie żądań damą jest wariantem pokoju.
      if (queenRequestMode === QUEEN_REQUEST_MODES.CANCELS_REQUEST && state.activeEffect && (
        state.activeEffect.type === EFFECT_TYPES.SUIT_REQUEST ||
        state.activeEffect.type === EFFECT_TYPES.RANK_REQUEST
      )) {
        state.activeEffect = null;
      }
      // Dama pik/kier wariantu warszawskiego przerywa wojnę karną
      if (queenVariant === QUEEN_VARIANTS.WARSAW_PARDON && (firstCard.suit === "hearts" || firstCard.suit === "spades")) {
        if (state.activeEffect && state.activeEffect.type === EFFECT_TYPES.DRAW_PENALTY) {
          state.activeEffect = null;
        }
      }
    } else if (firstCard.rank === "ace") {
      if (suitRequest && suitRequest !== "none") {
        state.activeEffect = {
          type: EFFECT_TYPES.SUIT_REQUEST,
          requestedSuit: suitRequest,
          sourceCardId: lastResolvedCard.cardInstanceId,
          requesterPlayerId: playerId,
          targetPlayerId: this.getEffectTargetPlayerId(state)
        };
      } else {
        if (state.activeEffect && state.activeEffect.type === EFFECT_TYPES.SUIT_REQUEST) {
          state.activeEffect = null;
        }
      }
    } else if (firstCard.rank === "jack") {
      if (rankRequest && rankRequest !== "none") {
        state.activeEffect = {
          type: EFFECT_TYPES.RANK_REQUEST,
          requestedRank: rankRequest,
          sourceCardId: lastResolvedCard.cardInstanceId,
          requesterPlayerId: playerId,
          targetPlayerId: this.getEffectTargetPlayerId(state)
        };
      } else {
        if (state.activeEffect && state.activeEffect.type === EFFECT_TYPES.RANK_REQUEST) {
          state.activeEffect = null;
        }
      }
    } else {
      if (state.activeEffect && (state.activeEffect.type === EFFECT_TYPES.SUIT_REQUEST || state.activeEffect.type === EFFECT_TYPES.RANK_REQUEST)) {
        this.advanceRequestAfterAnswer(state, playerId);
      }
    }

    this.advanceTurn(state);
    
    // Sprawdzenie wygranej Makao
    if (state.hands[playerId].length === 0) {
      if (!makaoDeclaredBeforePlay) {
        this.applyMissingMakaoPenalty(state, playerId, "makao_finish_penalty");
        state.hasDrawnCardThisTurn = false;
        state.drawnCardInstanceId = null;
        return state;
      }

      const currentPlayerIdAfterMove = state.turnOrder[state.currentPlayerIndex];
      if (!state.finishedPlayers) state.finishedPlayers = [];
      if (!state.finishedPlayers.some(p => p.playerId === playerId)) {
        state.finishedPlayers.push({
          playerId,
          place: state.finishedPlayers.length + 1
        });
      }
      this.addTurnEvent(state, {
        type: "player_finished",
        playerId,
        place: state.finishedPlayers.find(p => p.playerId === playerId)?.place || 1
      });

      // Gracz skończył
      state.turnOrder = state.turnOrder.filter(id => id !== playerId);

      if (state.turnOrder.length <= 1) {
        state.gameOver = true;
        state.winnerId = state.finishedPlayers[0]?.playerId || playerId;
        state.activeEffect = null;
        state.skipTurns = {};
        state.currentPlayerIndex = 0;
        this.addTurnEvent(state, {
          type: "game_over",
          playerId: state.winnerId
        });
      }

      // Korekta indexu
      if (!state.gameOver && state.turnOrder.length > 0) {
        const preservedIndex = state.turnOrder.indexOf(currentPlayerIdAfterMove);
        state.currentPlayerIndex = preservedIndex !== -1
          ? preservedIndex
          : state.currentPlayerIndex % state.turnOrder.length;
      }
    }

    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;

    return state;
  }

  static processDrawCard(state, playerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
      throw new Error("It's not your turn.");
    }

    this.expireMakaoWindowsForCurrentTurn(state);
    this.assertActiveEffectTarget(state, playerId);

    if (state.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY) {
      this.clearTurnEvents(state);

      const amount = state.activeEffect.amount;
      let drawnCount = this.getPenaltyDrawnCount(state);

      if (drawnCount >= amount) {
        return this.finishDrawPenalty(state, playerId, amount, drawnCount);
      }

      // A second pull means the player declines the first-card counter window and continues accepting the penalty.
      this.clearDrawnCardState(state);

      const [card] = this.drawCards(state, playerId, 1);
      this.syncMakaoAfterHandChange(state, playerId);
      if (card) {
        drawnCount += 1;
        this.setPenaltyDrawnCount(state, drawnCount);
      }

      if (drawnCount === 1 && card && isCardLegal(card, state)) {
        state.hasDrawnCardThisTurn = true;
        state.drawnCardInstanceId = card.cardInstanceId;
        this.addTurnEvent(state, {
          type: "penalty_draw_counter",
          playerId,
          drawnCard: this.publicCard(card),
          amount,
          drawnCount,
          remaining: Math.max(0, amount - drawnCount)
        });
        return state;
      }

      this.clearDrawnCardState(state);
      if (drawnCount >= amount) {
        return this.finishDrawPenalty(state, playerId, amount, drawnCount);
      }

      this.addTurnEvent(state, {
        type: "penalty_draw_progress",
        playerId,
        amount,
        drawnCount,
        remaining: Math.max(0, amount - drawnCount)
      });
      return state;
    }

    if (state.activeEffect?.type === EFFECT_TYPES.SKIP_TURN) {
      throw new Error("Active pause must be accepted or answered with a 4.");
    }
    
    if (state.hasDrawnCardThisTurn) {
      throw new Error("You have already drawn a card this turn.");
    }

    this.clearTurnEvents(state);

    const [card] = this.drawCards(state, playerId, 1);
    this.syncMakaoAfterHandChange(state, playerId);

    if (this.isRequestEffect(state.activeEffect)) {
      if (card && isCardLegal(card, state)) {
        state.hasDrawnCardThisTurn = true;
        state.drawnCardInstanceId = card.cardInstanceId;
        this.addTurnEvent(state, {
          type: "request_draw_counter",
          playerId,
          drawnCard: this.publicCard(card),
          effectType: state.activeEffect.type
        });
        return state;
      }

      this.advanceRequestAfterPass(state, playerId);
      state.hasDrawnCardThisTurn = false;
      state.drawnCardInstanceId = null;
      this.advanceTurn(state);
      return state;
    }
    
    if (isCardLegal(card, state)) {
      state.hasDrawnCardThisTurn = true;
      state.drawnCardInstanceId = card.cardInstanceId;
      return state; // Tura nie mija
    }

    this.advanceTurn(state);
    return state;
  }

  static processAcceptPenalty(state, playerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
      throw new Error("It's not your turn.");
    }

    this.expireMakaoWindowsForCurrentTurn(state);

    if (!state.activeEffect || state.activeEffect.type !== EFFECT_TYPES.DRAW_PENALTY) {
      throw new Error("No active draw penalty.");
    }
    this.assertActiveEffectTarget(state, playerId);

    this.clearTurnEvents(state);

    const amount = state.activeEffect.amount;
    const alreadyDrawnCount = this.getPenaltyDrawnCount(state);
    const drawCount = Math.max(0, amount - alreadyDrawnCount);
    if (drawCount > 0) {
      this.drawCards(state, playerId, drawCount);
    }
    this.syncMakaoAfterHandChange(state, playerId);
    return this.finishDrawPenalty(state, playerId, amount, amount);
  }

  static processAcceptSkip(state, playerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
      throw new Error("It's not your turn.");
    }

    this.expireMakaoWindowsForCurrentTurn(state);

    if (!state.activeEffect || state.activeEffect.type !== EFFECT_TYPES.SKIP_TURN) {
      throw new Error("No active skip effect.");
    }
    this.assertActiveEffectTarget(state, playerId);

    this.clearTurnEvents(state);

    if (!state.skipTurns) state.skipTurns = {};
    const futurePauses = Math.max(0, state.activeEffect.amount - 1);
    if (futurePauses > 0) {
      state.skipTurns[playerId] = (state.skipTurns[playerId] || 0) + futurePauses;
    }
    state.activeEffect = null;
    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;
    this.advanceTurn(state);
    this.addTurnEvent(state, {
      type: "skip_accepted",
      playerId,
      pausedPlayerId: playerId,
      consumed: 1,
      remaining: state.skipTurns?.[playerId] || 0,
      nextPlayerId: this.getCurrentPlayerId(state),
      currentPlayerId: this.getCurrentPlayerId(state)
    });
    return state;
  }

  static processPassTurn(state, playerId) {
    if (state.gameOver) {
      throw new Error("Game is already over.");
    }

    if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
      throw new Error("It's not your turn.");
    }

    this.expireMakaoWindowsForCurrentTurn(state);

    if (!state.hasDrawnCardThisTurn) {
      throw new Error("You must draw a card before passing your turn.");
    }
    this.assertActiveEffectTarget(state, playerId);

    this.clearTurnEvents(state);

    let acceptedPenalty = null;
    if (state.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY) {
      const amount = state.activeEffect.amount;
      const alreadyDrawnCount = this.getPenaltyDrawnCount(state);
      const drawCount = Math.max(0, amount - alreadyDrawnCount);
      if (drawCount > 0) {
        this.drawCards(state, playerId, drawCount);
        this.syncMakaoAfterHandChange(state, playerId);
      }
      acceptedPenalty = { amount };
    }

    // Clear effects properly
    if (state.activeEffect && (
      state.activeEffect.type === EFFECT_TYPES.SUIT_REQUEST ||
      state.activeEffect.type === EFFECT_TYPES.RANK_REQUEST ||
      state.activeEffect.type === EFFECT_TYPES.DRAW_PENALTY
    )) {
      state.activeEffect = null;
    }

    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;
    this.advanceTurn(state);
    if (acceptedPenalty) {
      this.addTurnEvent(state, {
        type: "penalty_accepted",
        playerId,
        amount: acceptedPenalty.amount,
        drawnCount: acceptedPenalty.amount,
        nextPlayerId: state.turnOrder[state.currentPlayerIndex]
      });
    }
    return state;
  }
}
