import {
  ACE_JACK_REQUEST_MODES,
  BATTLE_COUNTER_MODES,
  DISCONNECT_POLICIES,
  EFFECT_TYPES,
  EVENTS,
  FIRST_PLAYER_MODES,
  JACK_REQUEST_MODES,
  MAKAO_CATCH_WINDOW_MS,
  MAKAO_DECLARE_GRACE_MS,
  QUEEN_REQUEST_MODES,
  QUEEN_VARIANTS,
  ROOM_LIMITS,
  TURN_TIME_LIMIT_OPTIONS
} from "./shared/constants.js";
import { GameEngine } from "./GameEngine.js";

const DEFAULT_SETTINGS = {
  deckCount: 1,
  useJokers: false,
  queenVariant: QUEEN_VARIANTS.DEFENSIVE_NON_FUNCTIONAL,
  queenRequestMode: QUEEN_REQUEST_MODES.CANCELS_REQUEST,
  battleCounterMode: BATTLE_COUNTER_MODES.SUIT_OR_RANK,
  jackRequestMode: JACK_REQUEST_MODES.WITH_NON_BATTLE_KINGS,
  aceJackRequestMode: ACE_JACK_REQUEST_MODES.OPTIONAL,
  makaoPenaltyCards: 5,
  makaoDeclareGraceMs: MAKAO_DECLARE_GRACE_MS,
  makaoCatchWindowMs: MAKAO_CATCH_WINDOW_MS,
  maxPlayers: 4,
  turnTimeLimitSeconds: ROOM_LIMITS.DEFAULT_TURN_LIMIT_SECONDS,
  disconnectPolicy: DISCONNECT_POLICIES.HOST_DECIDES,
  firstPlayerMode: FIRST_PLAYER_MODES.RANDOM_EACH_GAME,
  firstPlayerId: null
};

const ROOM_AUDIT_LOG_LIMIT = 300;
const COMPLETED_GAME_LOG_LIMIT = 20;
const PUBLIC_DISCARD_PILE_TAIL_COUNT = 2;

export class RoomManager {
  constructor(io, options = {}) {
    this.io = io;
    this.rooms = new Map(); // roomId -> Room
    this.playerRooms = new Map(); // socketId -> roomId
    this.socketPlayers = new Map(); // socketId -> stable playerId
    this.turnTimerMonitor = null;

    if (options.enableTurnTimerMonitor !== false) {
      this.turnTimerMonitor = setInterval(() => this.checkExpiredTurnTimers(), options.turnTimerMonitorMs || 1000);
      this.turnTimerMonitor.unref?.();
    }
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  normalizeRoomName(value, fallback = "Pokój Makao") {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, ROOM_LIMITS.MAX_ROOM_NAME_LENGTH);
    return normalized || fallback;
  }

  normalizeInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  normalizeTurnTimeLimit(value) {
    if (value === null || value === "none" || value === "no_limit") return 0;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    if (TURN_TIME_LIMIT_OPTIONS.includes(parsed)) return parsed;
    return Math.min(
      ROOM_LIMITS.MAX_CUSTOM_TURN_LIMIT_SECONDS,
      Math.max(ROOM_LIMITS.MIN_CUSTOM_TURN_LIMIT_SECONDS, parsed)
    );
  }

  normalizeEnum(value, allowedValues, fallback) {
    return allowedValues.includes(value) ? value : fallback;
  }

  normalizeFirstPlayerMode(value) {
    return Object.values(FIRST_PLAYER_MODES).includes(value)
      ? value
      : FIRST_PLAYER_MODES.RANDOM_EACH_GAME;
  }

  close() {
    if (this.turnTimerMonitor) {
      clearInterval(this.turnTimerMonitor);
      this.turnTimerMonitor = null;
    }
  }

  sanitizeSettings(settings = {}, room = null) {
    const current = room?.settings || DEFAULT_SETTINGS;
    const next = {};

    if (Object.hasOwn(settings, "deckCount")) {
      next.deckCount = this.normalizeInteger(
        settings.deckCount,
        current.deckCount,
        ROOM_LIMITS.MIN_DECKS,
        ROOM_LIMITS.MAX_DECKS
      );
    }

    if (Object.hasOwn(settings, "useJokers")) {
      next.useJokers = Boolean(settings.useJokers);
    }

    if (Object.hasOwn(settings, "queenVariant")) {
      const allowedVariants = Object.values(QUEEN_VARIANTS);
      next.queenVariant = allowedVariants.includes(settings.queenVariant)
        ? settings.queenVariant
        : current.queenVariant;
    }

    if (Object.hasOwn(settings, "queenRequestMode")) {
      next.queenRequestMode = this.normalizeEnum(
        settings.queenRequestMode,
        Object.values(QUEEN_REQUEST_MODES),
        current.queenRequestMode
      );
    }

    if (Object.hasOwn(settings, "battleCounterMode")) {
      next.battleCounterMode = this.normalizeEnum(
        settings.battleCounterMode,
        Object.values(BATTLE_COUNTER_MODES),
        current.battleCounterMode
      );
    }

    if (Object.hasOwn(settings, "jackRequestMode")) {
      next.jackRequestMode = this.normalizeEnum(
        settings.jackRequestMode,
        Object.values(JACK_REQUEST_MODES),
        current.jackRequestMode
      );
    }

    if (Object.hasOwn(settings, "aceJackRequestMode")) {
      next.aceJackRequestMode = this.normalizeEnum(
        settings.aceJackRequestMode,
        Object.values(ACE_JACK_REQUEST_MODES),
        current.aceJackRequestMode
      );
    }

    if (Object.hasOwn(settings, "makaoPenaltyCards")) {
      next.makaoPenaltyCards = this.normalizeInteger(settings.makaoPenaltyCards, current.makaoPenaltyCards, 0, 20);
    }

    if (Object.hasOwn(settings, "makaoDeclareGraceMs")) {
      next.makaoDeclareGraceMs = this.normalizeInteger(settings.makaoDeclareGraceMs, current.makaoDeclareGraceMs, 500, 10000);
    }

    if (Object.hasOwn(settings, "makaoCatchWindowMs")) {
      next.makaoCatchWindowMs = this.normalizeInteger(settings.makaoCatchWindowMs, current.makaoCatchWindowMs, 1000, 30000);
    }

    if (Object.hasOwn(settings, "maxPlayers")) {
      const currentPlayerCount = room?.players?.length || ROOM_LIMITS.MIN_PLAYERS;
      const minimum = Math.max(ROOM_LIMITS.MIN_PLAYERS, currentPlayerCount);
      next.maxPlayers = this.normalizeInteger(
        settings.maxPlayers,
        current.maxPlayers,
        minimum,
        ROOM_LIMITS.MAX_PLAYERS
      );
    }

    if (Object.hasOwn(settings, "turnTimeLimitSeconds")) {
      next.turnTimeLimitSeconds = this.normalizeTurnTimeLimit(settings.turnTimeLimitSeconds);
    }

    if (Object.hasOwn(settings, "disconnectPolicy")) {
      next.disconnectPolicy = this.normalizeEnum(
        settings.disconnectPolicy,
        Object.values(DISCONNECT_POLICIES),
        current.disconnectPolicy
      );
    }

    if (Object.hasOwn(settings, "firstPlayerMode")) {
      next.firstPlayerMode = this.normalizeFirstPlayerMode(settings.firstPlayerMode);
      if (next.firstPlayerMode === FIRST_PLAYER_MODES.RANDOM_EACH_GAME) {
        next.firstPlayerId = null;
      }
    }

    if (Object.hasOwn(settings, "firstPlayerId")) {
      const playerId = settings.firstPlayerId;
      next.firstPlayerId = room?.players?.some(player => player.id === playerId) ? playerId : null;
      next.firstPlayerMode = next.firstPlayerId
        ? FIRST_PLAYER_MODES.HOST_SELECTED_THEN_ROTATE
        : FIRST_PLAYER_MODES.RANDOM_EACH_GAME;
    }

    return next;
  }

  getRecommendedDeckCount(room) {
    const readyCount = room.players.filter(player => player.isReady).length || room.players.length;
    if (readyCount <= 4) return 1;
    if (readyCount <= 7) return 2;
    return 3;
  }

  getNextPlayerIdInRoom(room, afterPlayerId) {
    const playerIds = room.players.map(player => player.id);
    return this.getNextPlayerIdInOrder(playerIds, afterPlayerId, playerIds);
  }

  getNextPlayerIdInOrder(playerIds, afterPlayerId, availablePlayerIds = playerIds) {
    const available = new Set(availablePlayerIds);
    if (available.size === 0) return null;
    const currentIndex = playerIds.indexOf(afterPlayerId);
    if (currentIndex === -1) {
      return playerIds.find(id => available.has(id)) || availablePlayerIds[0] || null;
    }
    for (let offset = 1; offset <= playerIds.length; offset += 1) {
      const candidate = playerIds[(currentIndex + offset) % playerIds.length];
      if (available.has(candidate)) return candidate;
    }
    return availablePlayerIds[0] || null;
  }

  getRandomPlayerId(room) {
    if (room.players.length === 0) return null;
    return room.players[Math.floor(Math.random() * room.players.length)]?.id || null;
  }

  reconcileFirstPlayerState(room, removedPlayerContext = null) {
    const playerIds = room.players.map(player => player.id);
    const mode = room.settings.firstPlayerMode;
    const previousPlayerIds = removedPlayerContext?.previousPlayerIds || playerIds;

    if (mode === FIRST_PLAYER_MODES.RANDOM_EACH_GAME) {
      room.settings.firstPlayerId = null;
      room.nextGameFirstPlayerId = null;
      return;
    }

    const getFallbackAfter = (missingPlayerId, defaultPlayerId = null) => {
      if (missingPlayerId && previousPlayerIds.includes(missingPlayerId)) {
        return this.getNextPlayerIdInOrder(previousPlayerIds, missingPlayerId, playerIds)
          || defaultPlayerId
          || playerIds[0]
          || null;
      }
      return defaultPlayerId || playerIds[0] || null;
    };

    if (!playerIds.includes(room.settings.firstPlayerId)) {
      room.settings.firstPlayerId = getFallbackAfter(room.settings.firstPlayerId);
    }

    if (!playerIds.includes(room.nextGameFirstPlayerId)) {
      room.nextGameFirstPlayerId = getFallbackAfter(room.nextGameFirstPlayerId, room.settings.firstPlayerId);
    }
  }

  resolveStartingPlayerId(room) {
    this.reconcileFirstPlayerState(room);
    if (room.settings.firstPlayerMode === FIRST_PLAYER_MODES.RANDOM_EACH_GAME) {
      return this.getRandomPlayerId(room);
    }
    return room.nextGameFirstPlayerId || room.settings.firstPlayerId || room.players[0]?.id || null;
  }

  advanceNextGameFirstPlayer(room, firstPlayerId) {
    room.lastFirstPlayerId = firstPlayerId;
    if (room.settings.firstPlayerMode === FIRST_PLAYER_MODES.HOST_SELECTED_THEN_ROTATE) {
      room.nextGameFirstPlayerId = this.getNextPlayerIdInRoom(room, firstPlayerId);
    } else {
      room.nextGameFirstPlayerId = null;
    }
  }

  createRoom(hostSocketId, playerName, clientId, options = {}) {
    const roomId = this.generateRoomCode();
    const playerId = clientId || hostSocketId;
    const initialSettings = {
      ...DEFAULT_SETTINGS,
      ...this.sanitizeSettings(options.settings || {})
    };
    const room = {
      id: roomId,
      name: this.normalizeRoomName(options.roomName, `${playerName || "Gracz"} - Makao`),
      hostId: playerId,
      players: [
        { id: playerId, socketId: hostSocketId, name: playerName, isReady: true, isOnline: true }
      ],
      settings: initialSettings,
      gameNumber: 0,
      lastFirstPlayerId: null,
      nextGameFirstPlayerId: initialSettings.firstPlayerId || null,
      stats: {
        gamesPlayed: 0,
        wins: {}
      },
      lastStatsRecordedGameNumber: null,
      status: "lobby", // 'lobby' | 'playing'
      gameState: null,
      adminLog: [],
      auditLog: [],
      completedGameLogs: []
    };
    
    this.rooms.set(roomId, room);
    this.playerRooms.set(hostSocketId, roomId);
    this.socketPlayers.set(hostSocketId, playerId);
    this.recordRoomAuditLog(room, "room_log", "room_created", {
      actorPlayerId: playerId,
      details: {
        roomName: room.name,
        settings: room.settings
      }
    });
    return room;
  }

  joinRoom(roomId, socketId, playerName, clientId) {
    const normalizedRoomId = String(roomId || "").trim().toUpperCase();
    const room = this.rooms.get(normalizedRoomId);
    if (!room) throw new Error("Room not found");
    const playerId = clientId || socketId;

    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      return this.reconnectPlayer(roomId, socketId, playerId);
    }

    if (room.status !== "lobby") throw new Error("Game already in progress");
    if (room.players.length >= room.settings.maxPlayers) {
      throw new Error("Pokój jest pełny.");
    }

    const newPlayer = { id: playerId, socketId, name: playerName, isReady: false, isOnline: true };
    room.players.push(newPlayer);
    this.playerRooms.set(socketId, room.id);
    this.socketPlayers.set(socketId, playerId);
    this.recordRoomAuditLog(room, "room_log", "player_joined", {
      actorPlayerId: playerId,
      details: { playerName, playerCount: room.players.length }
    });
    
    this.broadcastRoomUpdate(roomId);
    return room;
  }

  reconnectPlayer(roomId, socketId, clientId) {
    const normalizedRoomId = String(roomId || "").trim().toUpperCase();
    const room = this.rooms.get(normalizedRoomId);
    if (!room) throw new Error("Room not found");
    if (!clientId) throw new Error("Missing client id");
    if (room.status === "playing" && room.gameState?.gameOver) {
      throw new Error("Partia w tym pokoju jest już zakończona.");
    }

    const player = room.players.find(p => p.id === clientId);
    if (!player) throw new Error("Player session not found in this room");

    if (player.socketId && player.socketId !== socketId) {
      this.releasePlayerSocket(room.id, player);
    }
    player.socketId = socketId;
    player.isOnline = true;
    this.playerRooms.set(socketId, room.id);
    this.socketPlayers.set(socketId, clientId);
    this.recordRoomAuditLog(room, "connection_log", "player_reconnected", {
      actorPlayerId: clientId,
      details: { roomStatus: room.status }
    });

    if (room.gameState?.paused && room.gameState.pauseReason === "disconnect" && room.gameState.pausedPlayerId === clientId) {
      room.gameState.paused = false;
      room.gameState.pauseReason = null;
      room.gameState.pausedPlayerId = null;
      GameEngine.clearTurnEvents(room.gameState);
      GameEngine.addTurnEvent(room.gameState, {
        type: "game_resumed_disconnect",
        playerId: clientId
      });
      GameEngine.recordHistory(room.gameState, "player_reconnected", {
        playerId: clientId
      });
      GameEngine.recordAudit(room.gameState, "connection_log", "player_reconnected", {
        playerId: clientId,
        details: { resumedDisconnectPause: true }
      });
    }

    this.broadcastRoomUpdate(room.id);
    if (room.status === "playing") this.broadcastGameUpdate(room.id);
    return room;
  }

  leaveRoom(socketId) {
    const roomId = this.playerRooms.get(socketId);
    const playerId = this.getPlayerId(socketId);
    this.playerRooms.delete(socketId);
    this.socketPlayers.delete(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return room;

    const wasPlaying = room.status === "playing" && room.gameState;
    const gameAlreadyOver = Boolean(wasPlaying && room.gameState.gameOver);

    this.releasePlayerSocket(roomId, player);
    player.socketId = null;
    this.recordRoomAuditLog(room, "connection_log", "player_left", {
      actorPlayerId: playerId,
      details: { roomStatus: room.status, gameAlreadyOver }
    });

    if (wasPlaying && !gameAlreadyOver) {
      this.clearDisconnectPauseFor(room, playerId);
      GameEngine.removePlayerFromGame(room.gameState, playerId, { eventType: "player_left" });
      GameEngine.recordHistory(room.gameState, "player_left", {
        playerId,
        details: { reason: "player_left_room" }
      });
      const previousPlayerIds = room.players.map(p => p.id);
      room.players = room.players.filter(p => p.id !== playerId);

      if (room.players.length === 0) {
        this.archiveCurrentGameLogs(room, "all_players_left");
        this.rooms.delete(roomId);
        return null;
      }

      this.transferHostAfterLoss(room, playerId);
      if (!room.players.some(p => p.id === room.hostId)) {
        room.hostId = room.players.find(p => p.isOnline)?.id || room.players[0]?.id || null;
      }
      this.reconcileFirstPlayerState(room, { previousPlayerIds });
      this.finalizeGameMutation(roomId, room);
      return room;
    }

    if (wasPlaying && gameAlreadyOver) {
      player.isOnline = false;
      if (room.hostId === playerId) {
        const onlineHost = room.players.find(p => p.id !== playerId && p.isOnline);
        if (onlineHost) room.hostId = onlineHost.id;
      }
      this.broadcastRoomUpdate(roomId);
      this.broadcastGameUpdate(roomId);
      return room;
    }

    const previousPlayerIds = room.players.map(p => p.id);
    room.players = room.players.filter(p => p.id !== playerId);
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return null;
    }

    if (room.hostId === playerId) {
      room.hostId = room.players.find(p => p.isOnline)?.id || room.players[0]?.id || null;
    }
    this.reconcileFirstPlayerState(room, { previousPlayerIds });
    this.broadcastRoomUpdate(roomId);
    return room;
  }

  getPlayerId(socketId) {
    return this.socketPlayers.get(socketId) || socketId;
  }

  sendError(socketId, message) {
    this.io.to(socketId).emit(EVENTS.ERROR, { message });
  }

  getRoomForSocket(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) throw new Error("Player is not in a room.");
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found.");
    return { roomId, room, playerId: this.getPlayerId(socketId) };
  }

  assertHost(room, playerId) {
    if (room.hostId !== playerId) {
      throw new Error("Tylko host może wykonać tę akcję.");
    }
  }

  assertDoubleConfirmed(payload = {}) {
    if (!payload.hostOverrideConfirmed || !payload.hostOverrideRiskAccepted) {
      throw new Error("Ta akcja hosta wymaga dwóch potwierdzeń.");
    }
  }

  getRoomPlayer(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (!player) throw new Error("Player not found.");
    return player;
  }

  releasePlayerSocket(roomId, player) {
    if (!player?.socketId) return;
    this.playerRooms.delete(player.socketId);
    this.socketPlayers.delete(player.socketId);
    const liveSocket = this.io.sockets?.sockets?.get?.(player.socketId);
    liveSocket?.leave?.(roomId);
  }

  clearDisconnectPauseFor(room, playerId) {
    const state = room.gameState;
    if (
      state?.paused &&
      state.pauseReason === "disconnect" &&
      state.pausedPlayerId === playerId
    ) {
      state.paused = false;
      state.pauseReason = null;
      state.pausedPlayerId = null;
      state.pausedAt = null;
    }
  }

  pauseIfCurrentPlayerOffline(room) {
    const state = room.gameState;
    if (!state || state.gameOver || state.paused || state.turnOrder.length === 0) return false;

    const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
    const currentPlayer = room.players.find(p => p.id === currentPlayerId);
    if (!currentPlayer || currentPlayer.isOnline) return false;

    state.paused = true;
    state.pauseReason = "disconnect";
    state.pausedPlayerId = currentPlayerId;
    state.pausedAt = Date.now();
    GameEngine.addTurnEvent(state, {
      type: "game_paused_disconnect",
      playerId: currentPlayerId
    });
    GameEngine.recordHistory(state, "game_paused_disconnect", {
      playerId: currentPlayerId,
      details: { reason: "offline_current_player" }
    });
    return true;
  }

  transferHostAfterLoss(room, lostPlayerId) {
    if (room.hostId !== lostPlayerId) return;
    const state = room.gameState;
    const nextHost = room.players.find(player =>
      player.id !== lostPlayerId &&
      player.isOnline &&
      (!state || state.turnOrder.includes(player.id))
    ) || room.players.find(player => player.id !== lostPlayerId && player.isOnline);
    if (nextHost) {
      room.hostId = nextHost.id;
    }
  }

  resolveExpiredTurnTimer(roomId, room, now = Date.now()) {
    const state = room?.gameState;
    if (
      !room ||
      room.status !== "playing" ||
      !state ||
      state.gameOver
    ) {
      return false;
    }

    if (state.paused) {
      return this.resolveExpiredPauseTimer(roomId, room, now);
    }

    return false;
  }

  resolveExpiredPauseTimer(roomId, room, now = Date.now()) {
    const state = room?.gameState;
    if (!room || !state?.paused || state.gameOver) return false;
    if (state.settings?.disconnectPolicy !== DISCONNECT_POLICIES.AUTO_REMOVE_AFTER_LIMIT) {
      return false;
    }
    const pausedPlayerId = state.pausedPlayerId;
    const pausedAt = state.pausedAt || now;
    const deadlineAt = pausedAt + ROOM_LIMITS.DEFAULT_PAUSE_TIMEOUT_SECONDS * 1000;
    if (!pausedPlayerId || now < deadlineAt) return false;

    const targetPlayer = room.players.find(player => player.id === pausedPlayerId);
    if (targetPlayer) {
      this.releasePlayerSocket(roomId, targetPlayer);
    }
    const previousPlayerIds = room.players.map(player => player.id);
    room.players = room.players.filter(player => player.id !== pausedPlayerId);
    if (room.hostId === pausedPlayerId) {
      const nextHost = room.players.find(player => player.isOnline) || room.players[0];
      room.hostId = nextHost?.id || null;
    }
    this.reconcileFirstPlayerState(room, { previousPlayerIds });

    const pauseReason = state.pauseReason;
    state.paused = false;
    state.pauseReason = null;
    state.pausedPlayerId = null;
    state.pausedAt = null;

    GameEngine.removePlayerFromGame(state, pausedPlayerId, { eventType: "pause_timeout_loss" });
    GameEngine.recordHistory(state, "pause_timeout_loss", {
      playerId: pausedPlayerId,
      details: {
        reason: pauseReason,
        pausedAt,
        deadlineAt,
        timedOutAt: now
      }
    });
    GameEngine.recordAudit(state, "connection_log", "pause_timeout_loss", {
      playerId: pausedPlayerId,
      details: {
        reason: pauseReason,
        pausedAt,
        deadlineAt,
        timedOutAt: now
      },
      includeSnapshot: true
    });
    this.pauseIfCurrentPlayerOffline(room);
    GameEngine.refreshTurnTimer(state, true);
    this.recordCompletedGameStats(room);
    this.broadcastRoomUpdate(roomId);
    this.broadcastGameUpdate(roomId);
    return true;
  }

  checkExpiredTurnTimers(now = Date.now()) {
    for (const [roomId, room] of this.rooms.entries()) {
      this.resolveExpiredTurnTimer(roomId, room, now);
    }
  }

  finalizeGameMutation(roomId, room) {
    GameEngine.processAutomaticSkipEffects(room.gameState);
    this.pauseIfCurrentPlayerOffline(room);
    GameEngine.refreshTurnTimer(room.gameState);
    this.recordCompletedGameStats(room);
    this.broadcastRoomUpdate(roomId);
    this.broadcastGameUpdate(roomId);
  }

  ensureRoomStats(room) {
    if (!room.stats) {
      room.stats = { gamesPlayed: 0, wins: {} };
    }
    if (!room.stats.wins) room.stats.wins = {};
    room.stats.gamesPlayed = Math.max(0, Number.parseInt(room.stats.gamesPlayed, 10) || 0);
    return room.stats;
  }

  getGameNumberForStats(room) {
    return room?.gameNumber || room?.gameState?.moveHistory?.[0]?.details?.gameNumber || 1;
  }

  recordCompletedGameStats(room) {
    if (!room?.gameState?.gameOver) return false;

    const gameNumber = this.getGameNumberForStats(room);
    const gameMarker = String(gameNumber);
    if (room.lastStatsRecordedGameNumber === gameMarker) return false;

    const stats = this.ensureRoomStats(room);
    stats.gamesPlayed += 1;

    const winnerId = room.gameState.winnerId || null;
    if (winnerId) {
      stats.wins[winnerId] = (Number.parseInt(stats.wins[winnerId], 10) || 0) + 1;
    }

    room.lastStatsRecordedGameNumber = gameMarker;
    this.recordRoomAuditLog(room, "room_log", "game_stats_recorded", {
      targetPlayerId: winnerId,
      stateVersion: room.gameState.stateVersion || null,
      details: {
        gameNumber,
        gamesPlayed: stats.gamesPlayed,
        winnerId
      }
    });
    return true;
  }

  toggleReady(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    const playerId = this.getPlayerId(socketId);

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.isReady = !player.isReady;
      this.recordRoomAuditLog(room, "room_log", "ready_changed", {
        actorPlayerId: playerId,
        details: { isReady: player.isReady }
      });
      this.broadcastRoomUpdate(roomId);
    }
  }

  updateSettings(socketId, settings) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    const playerId = this.getPlayerId(socketId);
    
    if (room && room.hostId === playerId && room.status === "lobby") {
      if (Object.hasOwn(settings || {}, "roomName")) {
        room.name = this.normalizeRoomName(settings.roomName, room.name);
      }
      const sanitized = this.sanitizeSettings(settings, room);
      room.settings = { ...room.settings, ...sanitized };
      if (Object.hasOwn(settings || {}, "firstPlayerId")) {
        room.nextGameFirstPlayerId = sanitized.firstPlayerId;
      }
      this.reconcileFirstPlayerState(room);
      this.recordRoomAuditLog(room, "room_log", "settings_updated", {
        actorPlayerId: playerId,
        details: {
          roomName: room.name,
          changedSettings: sanitized
        }
      });
      this.broadcastRoomUpdate(roomId);
    }
  }

  handleRemovePlayer(socketId, payload = {}) {
    try {
      const { roomId, room, playerId } = this.getRoomForSocket(socketId);
      this.assertHost(room, playerId);
      this.assertDoubleConfirmed(payload);

      const targetPlayerId = payload.targetPlayerId;
      if (!targetPlayerId) throw new Error("Missing target player.");
      if (targetPlayerId === playerId) {
        throw new Error("Host nie może usunąć samego siebie. Najpierw przekaż hosta.");
      }

      const targetPlayer = this.getRoomPlayer(room, targetPlayerId);
      this.releasePlayerSocket(roomId, targetPlayer);
      const previousPlayerIds = room.players.map(p => p.id);
      room.players = room.players.filter(p => p.id !== targetPlayerId);
      this.reconcileFirstPlayerState(room, { previousPlayerIds });

      let stateVersion = null;
      if (room.status === "playing" && room.gameState) {
        this.clearDisconnectPauseFor(room, targetPlayerId);
        GameEngine.removePlayerFromGame(room.gameState, targetPlayerId);
        GameEngine.recordHistory(room.gameState, "host_removed_player", {
          playerId,
          details: { targetPlayerId }
        });
        stateVersion = room.gameState.stateVersion;
      }

      this.recordAdminLog(room, "host_removed_player", {
        actorPlayerId: playerId,
        targetPlayerId,
        stateVersion,
        details: { roomStatus: room.status }
      });

      if (room.players.length === 0) {
        this.rooms.delete(roomId);
        return;
      }

      if (room.status === "playing" && room.gameState) {
        this.finalizeGameMutation(roomId, room);
      } else {
        this.broadcastRoomUpdate(roomId);
      }
    } catch (err) {
      this.sendError(socketId, err.message);
    }
  }

  handleTransferHost(socketId, payload = {}) {
    try {
      const { roomId, room, playerId } = this.getRoomForSocket(socketId);
      this.assertHost(room, playerId);

      const targetPlayerId = payload.targetPlayerId;
      if (!targetPlayerId) throw new Error("Missing target player.");
      if (targetPlayerId === playerId) throw new Error("Ten gracz już jest hostem.");

      const targetPlayer = this.getRoomPlayer(room, targetPlayerId);
      if (!targetPlayer.isOnline) {
        throw new Error("Hosta można przekazać tylko graczowi online.");
      }

      room.hostId = targetPlayerId;
      let stateVersion = null;
      if (room.status === "playing" && room.gameState) {
        GameEngine.addTurnEvent(room.gameState, {
          type: "host_transferred",
          playerId,
          targetPlayerId
        });
        GameEngine.recordHistory(room.gameState, "host_transferred", {
          playerId,
          details: { targetPlayerId }
        });
        stateVersion = room.gameState.stateVersion;
      }

      this.recordAdminLog(room, "host_transferred", {
        actorPlayerId: playerId,
        targetPlayerId,
        stateVersion
      });

      this.broadcastRoomUpdate(roomId);
      if (room.status === "playing") this.broadcastGameUpdate(roomId);
    } catch (err) {
      this.sendError(socketId, err.message);
    }
  }

  startGame(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    const playerId = this.getPlayerId(socketId);
    
    if (room && room.hostId === playerId) {
      const allReady = room.players.every(p => p.isReady);
      if (room.players.length < ROOM_LIMITS.MIN_PLAYERS) {
        this.io.to(socketId).emit(EVENTS.ERROR, { message: "Do startu potrzeba co najmniej 2 graczy." });
        return;
      }
      if (!allReady) {
        this.io.to(socketId).emit(EVENTS.ERROR, { message: "Not all players are ready." });
        return;
      }
      if (room.players.length > room.settings.maxPlayers) {
        this.io.to(socketId).emit(EVENTS.ERROR, { message: "W pokoju jest więcej graczy niż ustawiony limit." });
        return;
      }

      room.status = "playing";
      const firstPlayerId = this.resolveStartingPlayerId(room);
      room.gameNumber = (room.gameNumber || 0) + 1;
      room.gameState = GameEngine.initializeGame(room.players, {
        ...room.settings,
        roomId,
        firstPlayerId,
        gameNumber: room.gameNumber
      });
      this.advanceNextGameFirstPlayer(room, firstPlayerId);
      GameEngine.refreshTurnTimer(room.gameState);
      this.recordRoomAuditLog(room, "room_log", "game_started", {
        actorPlayerId: playerId,
        stateVersion: room.gameState.stateVersion,
        details: {
          gameNumber: room.gameNumber,
          firstPlayerId,
          playerCount: room.players.length,
          settings: room.settings
        }
      });
      
      this.broadcastRoomUpdate(roomId);
      this.broadcastGameUpdate(roomId);
    }
  }

  handlePlayCards(socketId, payload) {
    // payload: { cardIds: string[], jokerDeclaration?: any, suitRequest?: string, rankRequest?: string }
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room && room.status === "playing") {
      try {
        if (this.resolveExpiredTurnTimer(roomId, room)) return;
        if (this.isGamePaused(room, socketId)) return;
        const playerId = this.getPlayerId(socketId);
        this.assertExpectedStateVersion(room.gameState, payload);
        const requestEffectBefore = this.snapshotRequestEffect(room.gameState.activeEffect);
        const playedCards = this.getPublicPlayedCards(room.gameState, playerId, payload);
        const newState = GameEngine.processPlayCards(room.gameState, playerId, payload);
        GameEngine.recordHistory(newState, "play_cards", {
          playerId,
          details: {
            cardCount: payload?.cardIds?.length || 0,
            playedCards,
            suitRequest: payload?.suitRequest || null,
            rankRequest: payload?.rankRequest || null,
            ...this.resolvedRequestDetails(requestEffectBefore, newState.activeEffect)
          }
        });
        room.gameState = newState;
        this.finalizeGameMutation(roomId, room);
      } catch (err) {
        this.recordRejectedGameAction(room, "play_cards", this.getPlayerId(socketId), err, payload);
        this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
      }
    }
  }

  handleDrawCard(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room && room.status === "playing") {
      try {
        if (this.resolveExpiredTurnTimer(roomId, room)) return;
        if (this.isGamePaused(room, socketId)) return;
        const playerId = this.getPlayerId(socketId);
        const acceptsPenalty = room.gameState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY;
        const penaltyAmount = acceptsPenalty ? room.gameState.activeEffect.amount : null;
        const penaltyDrawnBefore = acceptsPenalty ? GameEngine.getPenaltyDrawnCount(room.gameState) : 0;
        const requestEffectBefore = this.snapshotRequestEffect(room.gameState.activeEffect);
        const newState = GameEngine.processDrawCard(room.gameState, playerId);
        const penaltyStillActive = acceptsPenalty && newState.activeEffect?.type === EFFECT_TYPES.DRAW_PENALTY;
        const penaltyDrawnAfter = penaltyStillActive ? GameEngine.getPenaltyDrawnCount(newState) : penaltyAmount;
        const drawnCount = acceptsPenalty ? Math.max(0, penaltyDrawnAfter - penaltyDrawnBefore) : 1;
        GameEngine.recordHistory(newState, "draw_card", {
          playerId,
          details: {
            drawnCount,
            canPlayDrawnCard: Boolean(newState.hasDrawnCardThisTurn && newState.drawnCardInstanceId),
            ...(acceptsPenalty ? {
              activePenaltyAmount: penaltyAmount,
              penaltyDrawnCount: penaltyDrawnAfter,
              penaltyRemainingCount: Math.max(0, penaltyAmount - penaltyDrawnAfter),
              acceptedPenalty: !penaltyStillActive
            } : {}),
            ...this.resolvedRequestDetails(requestEffectBefore, newState.activeEffect)
          }
        });
        room.gameState = newState;
        this.finalizeGameMutation(roomId, room);
      } catch (err) {
        this.recordRejectedGameAction(room, "draw_card", this.getPlayerId(socketId), err);
        this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
      }
    }
  }

  handleAcceptPenalty(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room && room.status === "playing") {
      try {
        if (this.resolveExpiredTurnTimer(roomId, room)) return;
        if (this.isGamePaused(room, socketId)) return;
        const playerId = this.getPlayerId(socketId);
        const penaltyAmount = room.gameState.activeEffect?.amount || null;
        const alreadyDrewPenaltyCard = GameEngine.getPenaltyDrawnCount(room.gameState);
        const newState = GameEngine.processAcceptPenalty(room.gameState, playerId);
        GameEngine.recordHistory(newState, "accept_penalty", {
          playerId,
          details: { amount: penaltyAmount, drawnCount: Math.max(0, penaltyAmount - alreadyDrewPenaltyCard) }
        });
        room.gameState = newState;
        this.finalizeGameMutation(roomId, room);
      } catch (err) {
        this.recordRejectedGameAction(room, "accept_penalty", this.getPlayerId(socketId), err);
        this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
      }
    }
  }

  handleAcceptSkip(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room && room.status === "playing") {
      try {
        if (this.resolveExpiredTurnTimer(roomId, room)) return;
        if (this.isGamePaused(room, socketId)) return;
        const playerId = this.getPlayerId(socketId);
        const skipAmount = room.gameState.activeEffect?.amount || null;
        const newState = GameEngine.processAcceptSkip(room.gameState, playerId);
        GameEngine.recordHistory(newState, "accept_skip", {
          playerId,
          details: { amount: skipAmount }
        });
        room.gameState = newState;
        this.finalizeGameMutation(roomId, room);
      } catch (err) {
        this.recordRejectedGameAction(room, "accept_skip", this.getPlayerId(socketId), err);
        this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
      }
    }
  }

  handleDeclareMakao(socketId, payload = {}) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room && room.status === "playing") {
      try {
        if (this.resolveExpiredTurnTimer(roomId, room)) return;
        if (this.isGamePaused(room, socketId)) return;
        const playerId = this.getPlayerId(socketId);
        this.assertExpectedStateVersion(room.gameState, payload);
        const newState = GameEngine.processDeclareMakao(room.gameState, playerId);
        GameEngine.recordHistory(newState, "declare_makao", {
          playerId,
          details: {
            armed: Boolean(newState.makao?.[playerId]?.armed)
          }
        });
        room.gameState = newState;
        this.finalizeGameMutation(roomId, room);
      } catch (err) {
        this.recordRejectedGameAction(room, "declare_makao", this.getPlayerId(socketId), err, payload);
        this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
      }
    }
  }

  handleCatchMakao(socketId, payload) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room && room.status === "playing") {
      try {
        if (this.resolveExpiredTurnTimer(roomId, room)) return;
        if (this.isGamePaused(room, socketId)) return;
        const playerId = this.getPlayerId(socketId);
        this.assertExpectedStateVersion(room.gameState, payload);
        const penalty = room.gameState.settings?.makaoPenaltyCards ?? 5;
        const newState = GameEngine.processCatchMakao(room.gameState, playerId, payload?.targetPlayerId);
        GameEngine.recordHistory(newState, "catch_makao", {
          playerId,
          details: { targetPlayerId: payload?.targetPlayerId, amount: penalty }
        });
        room.gameState = newState;
        this.finalizeGameMutation(roomId, room);
      } catch (err) {
        this.recordRejectedGameAction(room, "catch_makao", this.getPlayerId(socketId), err, payload);
        this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
      }
    }
  }

  handlePassTurn(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room && room.status === "playing") {
      try {
        if (this.resolveExpiredTurnTimer(roomId, room)) return;
        if (this.isGamePaused(room, socketId)) return;
        const playerId = this.getPlayerId(socketId);
        const requestEffectBefore = this.snapshotRequestEffect(room.gameState.activeEffect);
        const newState = GameEngine.processPassTurn(room.gameState, playerId);
        GameEngine.recordHistory(newState, "pass_turn", {
          playerId,
          details: this.resolvedRequestDetails(requestEffectBefore, newState.activeEffect)
        });
        room.gameState = newState;
        this.finalizeGameMutation(roomId, room);
      } catch (err) {
        this.recordRejectedGameAction(room, "pass_turn", this.getPlayerId(socketId), err);
        this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
      }
    }
  }

  handlePauseGame(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "playing" || !room.gameState || room.gameState.gameOver) return;

    try {
      if (this.resolveExpiredTurnTimer(roomId, room)) return;
      const playerId = this.getPlayerId(socketId);
      const state = room.gameState;
      if (state.paused) {
        throw new Error("Gra jest już ⏸.");
      }

      state.paused = true;
      state.pauseReason = "manual";
      state.pausedPlayerId = playerId;
      state.pausedAt = Date.now();
      GameEngine.clearTurnEvents(state);
      GameEngine.addTurnEvent(state, {
        type: "game_paused_manual",
        playerId
      });
      GameEngine.recordHistory(state, "game_paused", {
        playerId,
        details: { reason: "manual" }
      });
      this.broadcastGameUpdate(roomId);
    } catch (err) {
      this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
    }
  }

  handleResumeGame(socketId, payload = {}) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "playing" || !room.gameState) return;

    try {
      const playerId = this.getPlayerId(socketId);
      const state = room.gameState;
      if (!state.paused) {
        throw new Error("Gra nie jest ⏸.");
      }
      if (state.pauseReason !== "manual") {
        throw new Error("To ⏸ zdejmie automatycznie powrót rozłączonego gracza.");
      }
      const isHostOverride = state.pausedPlayerId !== playerId && room.hostId === playerId;
      if (state.pausedPlayerId !== playerId && !isHostOverride) {
        throw new Error("Pauzę może zdjąć gracz, który ją założył, albo host.");
      }
      if (isHostOverride && (!payload.hostOverrideConfirmed || !payload.hostOverrideRiskAccepted)) {
        throw new Error("Wymuszone wznowienie przez hosta wymaga dwóch potwierdzeń.");
      }

      const pausedPlayerId = state.pausedPlayerId;
      state.paused = false;
      state.pauseReason = null;
      state.pausedPlayerId = null;
      state.pausedAt = null;
      GameEngine.clearTurnEvents(state);
      GameEngine.addTurnEvent(state, {
        type: "game_resumed_manual",
        playerId,
        pausedPlayerId
      });
      GameEngine.recordHistory(state, "game_resumed", {
        playerId,
        details: { pausedPlayerId, forcedByHost: isHostOverride }
      });
      if (isHostOverride) {
        this.recordAdminLog(room, "host_forced_resume", {
          actorPlayerId: playerId,
          targetPlayerId: pausedPlayerId,
          stateVersion: state.stateVersion,
          details: { reason: "manual_pause_override" }
        });
      }
      this.broadcastGameUpdate(roomId);
    } catch (err) {
      this.io.to(socketId).emit(EVENTS.ERROR, { message: err.message });
    }
  }

  handleHostEndGame(socketId, payload = {}) {
    try {
      const { roomId, room, playerId } = this.getRoomForSocket(socketId);
      this.assertHost(room, playerId);
      this.assertDoubleConfirmed(payload);
      if (room.status !== "playing" || !room.gameState) {
        throw new Error("Nie ma aktywnej partii do zakończenia.");
      }
      if (this.resolveExpiredTurnTimer(roomId, room)) return;

      GameEngine.finishGameByHost(room.gameState, playerId);
      GameEngine.recordHistory(room.gameState, "host_ended_game", {
        playerId,
        details: { reason: "host_admin" }
      });

      this.recordAdminLog(room, "host_ended_game", {
        actorPlayerId: playerId,
        stateVersion: room.gameState.stateVersion,
        details: { reason: "host_admin" }
      });

      this.recordCompletedGameStats(room);
      this.broadcastRoomUpdate(roomId);
      this.broadcastGameUpdate(roomId);
    } catch (err) {
      this.sendError(socketId, err.message);
    }
  }

  handleHostSkipOfflineTurn(socketId, payload = {}) {
    try {
      const { roomId, room, playerId } = this.getRoomForSocket(socketId);
      this.assertHost(room, playerId);
      this.assertDoubleConfirmed(payload);
      if (room.status !== "playing" || !room.gameState) {
        throw new Error("Nie ma aktywnej partii.");
      }

      const targetPlayerId = payload.targetPlayerId;
      const targetPlayer = this.getRoomPlayer(room, targetPlayerId);
      if (targetPlayer.isOnline) {
        throw new Error("Można pominąć tylko gracza offline.");
      }

      this.clearDisconnectPauseFor(room, targetPlayerId);
      GameEngine.forceSkipTurn(room.gameState, targetPlayerId);
      GameEngine.recordHistory(room.gameState, "host_skipped_offline", {
        playerId,
        details: { targetPlayerId }
      });
      this.recordAdminLog(room, "host_skipped_offline", {
        actorPlayerId: playerId,
        targetPlayerId,
        stateVersion: room.gameState.stateVersion
      });

      this.finalizeGameMutation(roomId, room);
    } catch (err) {
      this.sendError(socketId, err.message);
    }
  }

  handleHostForceAcceptEffect(socketId, payload = {}) {
    try {
      const { roomId, room, playerId } = this.getRoomForSocket(socketId);
      this.assertHost(room, playerId);
      this.assertDoubleConfirmed(payload);
      if (room.status !== "playing" || !room.gameState) {
        throw new Error("Nie ma aktywnej partii.");
      }

      const targetPlayerId = payload.targetPlayerId;
      const targetPlayer = this.getRoomPlayer(room, targetPlayerId);
      if (targetPlayer.isOnline) {
        throw new Error("Efekt można wymusić tylko dla gracza offline.");
      }

      this.clearDisconnectPauseFor(room, targetPlayerId);
      const details = GameEngine.forceAcceptActiveEffect(room.gameState, targetPlayerId);
      GameEngine.recordHistory(room.gameState, "host_forced_effect", {
        playerId,
        details: { targetPlayerId, ...details }
      });
      this.recordAdminLog(room, "host_forced_effect", {
        actorPlayerId: playerId,
        targetPlayerId,
        stateVersion: room.gameState.stateVersion,
        details
      });

      this.finalizeGameMutation(roomId, room);
    } catch (err) {
      this.sendError(socketId, err.message);
    }
  }

  handleReturnToLobby(socketId) {
    try {
      const { roomId, room, playerId } = this.getRoomForSocket(socketId);
      this.assertHost(room, playerId);
      if (room.status !== "playing" || !room.gameState?.gameOver) {
        throw new Error("Do lobby można wrócić dopiero po zakończonej partii.");
      }

      this.recordCompletedGameStats(room);
      this.archiveCurrentGameLogs(room, "return_to_lobby");
      room.status = "lobby";
      room.gameState = null;
      room.players.forEach(player => {
        player.isReady = player.id === room.hostId && player.isOnline;
      });
      this.reconcileFirstPlayerState(room);
      this.broadcastRoomUpdate(roomId);
    } catch (err) {
      this.sendError(socketId, err.message);
    }
  }

  handleDebugSeedGameState(socketId, payload = {}, callback = () => {}) {
    try {
      const { roomId, room, playerId } = this.getRoomForSocket(socketId);
      this.assertHost(room, playerId);

      const scenario = String(payload.scenario || "").trim();
      if (!scenario) throw new Error("Missing debug scenario.");
      const nodePlayerId = payload.nodePlayerId || playerId;
      const phonePlayerId = payload.phonePlayerId || room.players.find(p => p.id !== nodePlayerId)?.id;
      if (!room.players.some(p => p.id === nodePlayerId)) throw new Error("Debug node player not found.");
      if (!room.players.some(p => p.id === phonePlayerId)) throw new Error("Debug phone player not found.");

      room.players.forEach(player => {
        player.isReady = true;
      });
      room.status = "playing";
      room.gameNumber = (room.gameNumber || 0) + 1;
      room.gameState = this.createDebugLiveGameState(room, scenario, {
        actorPlayerId: playerId,
        nodePlayerId,
        phonePlayerId
      });

      this.recordRoomAuditLog(room, "debug_log", "debug_seed_game_state", {
        actorPlayerId: playerId,
        stateVersion: room.gameState.stateVersion,
        details: { scenario, nodePlayerId, phonePlayerId }
      });

      this.broadcastRoomUpdate(roomId);
      this.broadcastGameUpdate(roomId);
      callback?.({
        success: true,
        roomId,
        scenario,
        nodePlayerId,
        phonePlayerId,
        stateVersion: room.gameState.stateVersion
      });
    } catch (err) {
      callback?.({ success: false, error: err.message });
      this.sendError(socketId, err.message);
    }
  }

  createDebugLiveGameState(room, scenario, { actorPlayerId, nodePlayerId, phonePlayerId }) {
    const phoneCurrentScenarios = new Set([
      "phone_makao_ready",
      "phone_plain_play_ready",
      "phone_penalty_accept"
    ]);
    const currentPlayerId = phoneCurrentScenarios.has(scenario) ? phonePlayerId : nodePlayerId;
    const state = GameEngine.initializeGame(room.players, {
      ...room.settings,
      roomId: room.id,
      firstPlayerId: currentPlayerId,
      gameNumber: room.gameNumber
    });
    const now = Date.now();

    state.turnOrder = room.players.map(player => player.id);
    state.currentPlayerIndex = Math.max(0, state.turnOrder.indexOf(currentPlayerId));
    state.topCard = this.debugCard("live_top_8_diamonds", "8", "diamonds");
    state.discardPile = [
      this.debugCard("live_under_6_clubs", "6", "clubs"),
      this.debugCard("live_under_queen_hearts", "queen", "hearts")
    ];
    state.drawPile = this.debugDrawPile(`live_${scenario}`, 32);
    state.hands = Object.fromEntries(state.turnOrder.map(id => [id, this.debugDefaultHand(id)]));
    state.hands[nodePlayerId] = [
      this.debugCard("live_node_8_hearts", "8", "hearts"),
      this.debugCard("live_node_10_spades", "10", "spades"),
      this.debugCard("live_node_queen_clubs", "queen", "clubs")
    ];
    state.hands[phonePlayerId] = [
      this.debugCard("live_phone_5_diamonds", "5", "diamonds"),
      this.debugCard("live_phone_7_clubs", "7", "clubs"),
      this.debugCard("live_phone_9_spades", "9", "spades"),
      this.debugCard("live_phone_jack_hearts", "jack", "hearts"),
      this.debugCard("live_phone_king_clubs", "king", "clubs")
    ];
    state.activeEffect = null;
    state.skipTurns = {};
    state.turnEvents = [];
    state.finishedPlayers = [];
    state.gameOver = false;
    state.winnerId = null;
    state.makao = {};
    state.hasDrawnCardThisTurn = false;
    state.drawnCardInstanceId = null;
    state.privateDealLog = { debugScenario: scenario };
    state.auditLog = [];
    state.stateSnapshots = [];
    const getExtraPlayerId = () => {
      const extraPlayerId = state.turnOrder.find(id => id !== nodePlayerId && id !== phonePlayerId);
      if (!extraPlayerId) throw new Error(`Debug scenario ${scenario} requires a third player.`);
      return extraPlayerId;
    };

    if (scenario === "node_draw") {
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_draw_5_clubs", "5", "clubs"),
        this.debugCard("live_node_draw_10_spades", "10", "spades"),
        this.debugCard("live_node_draw_king_clubs", "king", "clubs")
      ];
      state.drawPile.push(this.debugCard("live_node_draw_card_ace_spades", "ace", "spades"));
    } else if (scenario === "node_makao_declare") {
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_makao_8_hearts", "8", "hearts"),
        this.debugCard("live_node_makao_10_spades", "10", "spades")
      ];
    } else if (scenario === "phone_makao_ready") {
      state.hands[phonePlayerId] = [
        this.debugCard("live_phone_makao_10_spades", "10", "spades")
      ];
      state.makao[phonePlayerId] = { declared: false, canBeCaughtAt: now + 30000 };
    } else if (scenario === "phone_plain_play_ready") {
      state.topCard = this.debugCard("live_phone_plain_top_8_diamonds", "8", "diamonds");
      state.hands[phonePlayerId] = [
        this.debugCard("live_phone_plain_8_spades", "8", "spades"),
        this.debugCard("live_phone_plain_10_clubs", "10", "clubs"),
        this.debugCard("live_phone_plain_queen_hearts", "queen", "hearts")
      ];
    } else if (scenario === "phone_penalty_accept") {
      state.topCard = this.debugCard("live_phone_penalty_top_2_hearts", "2", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 2,
        battleSuit: "hearts",
        direction: "next",
        targetPlayerId: phonePlayerId,
        sourceCards: ["live_phone_penalty_top_2_hearts"],
        canBeAccepted: true,
        canBeCountered: true
      };
      state.hands[phonePlayerId] = [
        this.debugCard("live_phone_penalty_9_clubs", "9", "clubs")
      ];
      state.drawPile.push(
        this.debugCard("live_phone_penalty_draw_king_spades", "king", "spades"),
        this.debugCard("live_phone_penalty_draw_5_diamonds", "5", "diamonds")
      );
    } else if (scenario === "phone_missing_makao_expired") {
      state.hands[phonePlayerId] = [
        this.debugCard("live_phone_missing_10_spades", "10", "spades")
      ];
      state.makao[phonePlayerId] = { declared: false, canBeCaughtAt: now - 1000 };
    } else if (scenario === "node_missing_makao_expired") {
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_missing_10_spades", "10", "spades")
      ];
      state.makao[nodePlayerId] = { declared: false, canBeCaughtAt: now - 1000 };
    } else if (scenario === "rule_penalty_war_counter") {
      state.topCard = this.debugCard("live_rule_top_2_hearts", "2", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 2,
        battleSuit: "hearts",
        direction: "next",
        targetPlayerId: nodePlayerId,
        sourceCards: ["live_rule_top_2_hearts"],
        canBeAccepted: true,
        canBeCountered: true
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_3_hearts", "3", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_penalty_multi_batch") {
      state.topCard = this.debugCard("live_rule_top_2_hearts", "2", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 2,
        battleSuit: "hearts",
        direction: "next",
        targetPlayerId: nodePlayerId,
        sourceCards: ["live_rule_top_2_hearts"],
        canBeAccepted: true,
        canBeCountered: true
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_2_hearts_a", "2", "hearts"),
        this.debugCard("live_node_rule_2_hearts_b", "2", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_penalty_accept_node") {
      state.topCard = this.debugCard("live_rule_top_3_hearts", "3", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 6,
        battleSuit: "hearts",
        direction: "next",
        targetPlayerId: nodePlayerId,
        sourceCards: ["live_rule_top_3_hearts"],
        canBeAccepted: true,
        canBeCountered: true
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_accept_3_hearts", "3", "hearts"),
        this.debugCard("live_node_rule_accept_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_pause_accept_node") {
      state.topCard = this.debugCard("live_rule_top_4_hearts", "4", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.SKIP_TURN,
        amount: 2,
        targetPlayerId: nodePlayerId,
        sourceCards: ["live_rule_top_4_hearts"]
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_accept_4_spades", "4", "spades"),
        this.debugCard("live_node_rule_accept_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_king_spades_previous_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_king_clubs", "king", "clubs");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_king_spades", "king", "spades"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_king_hearts_counter_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_king_hearts", "king", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 5,
        battleSuit: "hearts",
        direction: "next",
        targetPlayerId: nodePlayerId,
        sourceCards: ["live_rule_top_king_hearts"],
        canBeAccepted: true,
        canBeCountered: true
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_king_hearts", "king", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_last_battle_2_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_7_hearts", "7", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_2_hearts", "2", "hearts")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_battle_3_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_7_hearts", "7", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_3_hearts", "3", "hearts")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_king_hearts_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_king_clubs", "king", "clubs");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_king_hearts", "king", "hearts")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_king_spades_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_king_clubs", "king", "clubs");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_king_spades", "king", "spades")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_4_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_7_hearts", "7", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_4_hearts", "4", "hearts")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_joker_4_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_7_hearts", "7", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_joker_4", "joker")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_ace_request_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_ace_hearts", "ace", "hearts")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_ace_no_request_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_ace_no_hearts", "ace", "hearts")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_jack_request_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_jack_hearts", "jack", "hearts")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_last_jack_no_request_finish_3p") {
      getExtraPlayerId();
      state.topCard = this.debugCard("live_rule_top_last_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_last_jack_no_hearts", "jack", "hearts")
      ];
      state.makao[nodePlayerId] = { declared: true, declaredAt: now - 1000 };
    } else if (scenario === "rule_ace_request") {
      state.topCard = this.debugCard("live_rule_top_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_ace_hearts", "ace", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_ace_no_request") {
      state.topCard = this.debugCard("live_rule_top_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_ace_no_hearts", "ace", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_suit_request_draw_node") {
      state.topCard = this.debugCard("live_rule_top_ace_hearts", "ace", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.SUIT_REQUEST,
        requestedSuit: "spades",
        targetPlayerId: nodePlayerId,
        sourceCardId: "live_rule_top_ace_hearts"
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_request_draw_9_clubs", "9", "clubs")
      ];
      state.drawPile.push(this.debugCard("live_node_rule_request_draw_8_spades", "8", "spades"));
    } else if (scenario === "rule_jack_request") {
      state.topCard = this.debugCard("live_rule_top_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_jack_hearts", "jack", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_jack_no_request") {
      state.topCard = this.debugCard("live_rule_top_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_jack_no_hearts", "jack", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_rank_request_draw_node") {
      state.topCard = this.debugCard("live_rule_top_jack_hearts", "jack", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.RANK_REQUEST,
        requestedRank: "10",
        targetPlayerId: nodePlayerId,
        sourceCardId: "live_rule_top_jack_hearts"
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_rank_draw_9_clubs", "9", "clubs")
      ];
      state.drawPile.push(this.debugCard("live_node_rule_rank_draw_10_spades", "10", "spades"));
    } else if (scenario === "rule_pause_4") {
      state.topCard = this.debugCard("live_rule_top_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_4_hearts", "4", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_pause_multi_4_batch") {
      state.topCard = this.debugCard("live_rule_top_multi_4_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_4_hearts_a", "4", "hearts"),
        this.debugCard("live_node_rule_4_spades_b", "4", "spades"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_queen_clears_request") {
      state.topCard = this.debugCard("live_rule_top_ace_clubs", "ace", "clubs");
      state.activeEffect = {
        type: EFFECT_TYPES.SUIT_REQUEST,
        requestedSuit: "spades",
        targetPlayerId: nodePlayerId,
        sourceCardId: "live_rule_top_ace_clubs"
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_queen_diamonds", "queen", "diamonds"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_queen_clears_rank_request") {
      state.topCard = this.debugCard("live_rule_top_jack_hearts", "jack", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.RANK_REQUEST,
        requestedRank: "10",
        targetPlayerId: nodePlayerId,
        sourceCardId: "live_rule_top_jack_hearts"
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_queen_rank_diamonds", "queen", "diamonds"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_queen_blocked_by_penalty") {
      state.topCard = this.debugCard("live_rule_top_2_hearts", "2", "hearts");
      state.settings.queenVariant = QUEEN_VARIANTS.DEFENSIVE_NON_FUNCTIONAL;
      state.activeEffect = {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 2,
        battleSuit: "hearts",
        direction: "next",
        targetPlayerId: nodePlayerId,
        sourceCards: ["live_rule_top_2_hearts"],
        canBeAccepted: true,
        canBeCountered: true
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_queen_penalty_hearts", "queen", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_warsaw_queen_cancels_penalty") {
      state.topCard = this.debugCard("live_rule_top_3_hearts", "3", "hearts");
      state.settings.queenVariant = QUEEN_VARIANTS.WARSAW_PARDON;
      state.activeEffect = {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 3,
        battleSuit: "hearts",
        direction: "next",
        targetPlayerId: nodePlayerId,
        sourceCards: ["live_rule_top_3_hearts"],
        canBeAccepted: true,
        canBeCountered: true
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_warsaw_queen_hearts", "queen", "hearts"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_joker_battle_counter") {
      state.topCard = this.debugCard("live_rule_top_2_hearts", "2", "hearts");
      state.activeEffect = {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 2,
        battleSuit: "hearts",
        direction: "next",
        targetPlayerId: nodePlayerId,
        sourceCards: ["live_rule_top_2_hearts"],
        canBeAccepted: true,
        canBeCountered: true
      };
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_joker_battle", "joker"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_joker_suit_request") {
      state.topCard = this.debugCard("live_rule_top_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_joker_suit", "joker"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_joker_rank_request") {
      state.topCard = this.debugCard("live_rule_top_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_joker_rank", "joker"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario === "rule_joker_declaration") {
      state.topCard = this.debugCard("live_rule_top_8_hearts", "8", "hearts");
      state.hands[nodePlayerId] = [
        this.debugCard("live_node_rule_joker", "joker"),
        this.debugCard("live_node_rule_9_clubs", "9", "clubs")
      ];
    } else if (scenario !== "node_play") {
      throw new Error(`Unknown debug scenario: ${scenario}`);
    }

    state.stateVersion = 1;
    state.moveHistory = [{
      version: 1,
      type: "game_started",
      at: now,
      playerId: null,
      currentPlayerId,
      topCard: GameEngine.publicCard(state.topCard),
      activeEffect: null,
      details: {
        debugScenario: scenario,
        actorPlayerId,
        playerCount: room.players.length,
        gameNumber: room.gameNumber
      }
    }];
    GameEngine.refreshTurnTimer(state, true);
    return state;
  }

  debugCard(cardInstanceId, rank, suit = "hearts") {
    return { cardInstanceId, rank, suit, deckIndex: 90 };
  }

  debugDefaultHand(playerId) {
    return [
      this.debugCard(`live_${playerId}_5_hearts`, "5", "hearts"),
      this.debugCard(`live_${playerId}_7_diamonds`, "7", "diamonds"),
      this.debugCard(`live_${playerId}_9_clubs`, "9", "clubs")
    ];
  }

  debugDrawPile(prefix, count) {
    const ranks = ["5", "6", "7", "8", "9", "10", "jack", "queen", "king", "ace"];
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    return Array.from({ length: count }, (_unused, index) => {
      const rank = ranks[index % ranks.length];
      const suit = suits[index % suits.length];
      return this.debugCard(`${prefix}_draw_${index}_${rank}_${suit}`, rank, suit);
    });
  }

  recordRoomAuditLog(room, category, type, { actorPlayerId = null, targetPlayerId = null, stateVersion = null, details = {} } = {}) {
    if (!room) return null;
    if (!room.auditLog) room.auditLog = [];
    const at = Date.now();
    const entry = {
      id: `${at}_${Math.random().toString(36).slice(2)}`,
      category,
      type,
      at,
      actorPlayerId,
      targetPlayerId,
      stateVersion,
      details
    };
    room.auditLog.push(entry);
    room.auditLog = room.auditLog.slice(-ROOM_AUDIT_LOG_LIMIT);
    return entry;
  }

  archiveCurrentGameLogs(room, reason) {
    if (!room?.gameState) return null;
    if (!room.completedGameLogs) room.completedGameLogs = [];
    const state = room.gameState;
    const archived = {
      gameNumber: room.gameNumber || state.moveHistory?.[0]?.details?.gameNumber || 1,
      archivedAt: Date.now(),
      reason,
      moveHistory: [...(state.moveHistory || [])],
      auditLog: [...(state.auditLog || [])],
      stateSnapshots: [...(state.stateSnapshots || [])],
      privateDealLog: state.privateDealLog || null
    };
    room.completedGameLogs.push(archived);
    room.completedGameLogs = room.completedGameLogs.slice(-COMPLETED_GAME_LOG_LIMIT);
    this.recordRoomAuditLog(room, "cleanup_log", "game_logs_archived", {
      stateVersion: state.stateVersion || null,
      details: {
        reason,
        gameNumber: archived.gameNumber,
        publicHistoryCount: archived.moveHistory.length,
        auditLogCount: archived.auditLog.length,
        snapshotCount: archived.stateSnapshots.length
      }
    });
    return archived;
  }

  getPublicPlayedCards(state, playerId, payload = {}) {
    const hand = state?.hands?.[playerId] || [];
    const cardsById = new Map(hand.map(card => [card.cardInstanceId, card]));
    return (payload.cardIds || [])
      .map(cardId => {
        const card = cardsById.get(cardId);
        if (!card) return null;
        const declaration = payload.jokerDeclarations?.[cardId] || payload.jokerDeclaration;
        if (card.rank === "joker" && declaration?.rank && declaration?.suit) {
          return GameEngine.publicCard({
            ...card,
            jokerDeclaration: {
              rank: declaration.rank,
              suit: declaration.suit
            }
          });
        }
        return GameEngine.publicCard(card);
      })
      .filter(Boolean);
  }

  snapshotRequestEffect(effect) {
    if (
      !effect ||
      (effect.type !== EFFECT_TYPES.SUIT_REQUEST && effect.type !== EFFECT_TYPES.RANK_REQUEST)
    ) {
      return null;
    }
    return {
      type: effect.type,
      targetPlayerId: effect.targetPlayerId || null,
      requestedSuit: effect.requestedSuit || null,
      requestedRank: effect.requestedRank || null
    };
  }

  resolvedRequestDetails(effectBefore, effectAfter) {
    if (!effectBefore) return {};
    const sameRequestStillActive = effectAfter
      && effectAfter.type === effectBefore.type
      && (effectAfter.requestedSuit || null) === effectBefore.requestedSuit
      && (effectAfter.requestedRank || null) === effectBefore.requestedRank;
    if (sameRequestStillActive) return {};

    return {
      resolvedEffectType: effectBefore.type,
      resolvedSuitRequest: effectBefore.requestedSuit,
      resolvedRankRequest: effectBefore.requestedRank
    };
  }

  assertExpectedStateVersion(state, payload = {}) {
    if (!Object.hasOwn(payload || {}, "expectedStateVersion")) return;
    const expected = Number(payload.expectedStateVersion);
    if (!Number.isFinite(expected) || expected <= 0) return;
    const current = Number(state?.stateVersion || 0);
    if (current > 0 && expected !== current) {
      throw new Error("Stan gry zmienił się. Spróbuj ponownie.");
    }
  }

  recordRejectedGameAction(room, type, playerId, err, payload = {}) {
    if (!room?.gameState) return;
    GameEngine.recordAudit(room.gameState, "rule_validation_log", `${type}_rejected`, {
      playerId,
      details: {
        error: err.message,
        payload: {
          cardIds: Array.isArray(payload?.cardIds) ? [...payload.cardIds] : undefined,
          targetPlayerId: payload?.targetPlayerId,
          expectedStateVersion: payload?.expectedStateVersion,
          suitRequest: payload?.suitRequest,
          rankRequest: payload?.rankRequest,
          jokerDeclarations: payload?.jokerDeclarations ? { ...payload.jokerDeclarations } : undefined
        }
      }
    });
  }

  recordAdminLog(room, type, { actorPlayerId, targetPlayerId = null, stateVersion = null, details = {} } = {}) {
    if (!room.adminLog) room.adminLog = [];
    room.adminLog.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type,
      at: Date.now(),
      actorPlayerId,
      targetPlayerId,
      stateVersion,
      details
    });
    room.adminLog = room.adminLog.slice(-200);
    this.recordRoomAuditLog(room, "admin_log", type, {
      actorPlayerId,
      targetPlayerId,
      stateVersion,
      details
    });
    return room.adminLog.at(-1);
  }

  handleDisconnect(socketId) {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    const playerId = this.getPlayerId(socketId);
    
    if (room) {
      const wasPlaying = room.status === "playing";
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.isOnline = false;
        player.socketId = null;
        this.recordRoomAuditLog(room, "connection_log", "player_disconnected", {
          actorPlayerId: playerId,
          details: { roomStatus: room.status }
        });
      }
      this.playerRooms.delete(socketId);
      this.socketPlayers.delete(socketId);
      
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
      } else {
        if (room.hostId === playerId) {
          const onlineHost = room.players.find(p => p.isOnline);
          if (onlineHost) room.hostId = onlineHost.id;
        }
        if (wasPlaying && room.gameState) {
          this.markDisconnectedPlayer(room, playerId);
        }
        this.broadcastRoomUpdate(roomId);
        if (wasPlaying) this.broadcastGameUpdate(roomId);
      }
    }
  }

  markDisconnectedPlayer(room, playerId) {
    const state = room.gameState;
    const isCurrentPlayer = state.turnOrder[state.currentPlayerIndex] === playerId;
    const mustResolveEffect = state.activeEffect?.targetPlayerId === playerId;

    GameEngine.recordHistory(state, "player_disconnected", {
      playerId
    });
    GameEngine.recordAudit(state, "connection_log", "player_disconnected", {
      playerId,
      details: {
        wasCurrentPlayer: isCurrentPlayer,
        mustResolveEffect
      }
    });

    if (isCurrentPlayer || mustResolveEffect) {
      state.paused = true;
      state.pauseReason = "disconnect";
      state.pausedPlayerId = playerId;
      state.pausedAt = Date.now();
      GameEngine.addTurnEvent(state, {
        type: "game_paused_disconnect",
        playerId
      });
    }
  }

  isGamePaused(room, socketId) {
    if (!room.gameState?.paused) return false;
    const message = room.gameState.pauseReason === "disconnect"
      ? "Gra jest ⏸ do powrotu rozłączonego gracza."
      : "Gra jest ⏸. Najpierw ją wznówcie.";
    this.io.to(socketId).emit(EVENTS.ERROR, { message });
    return true;
  }

  eventForPlayer(event, playerId) {
    if (
      (event.type === "auto_draw_playable" || event.type === "auto_draw_pass") &&
      event.playerId !== playerId
    ) {
      const { drawnCard, ...publicEvent } = event;
      return publicEvent;
    }
    return event;
  }

  publicPlayers(room) {
    return room.players.map(({ socketId, ...player }) => player);
  }

  getPublicRoomStats(room) {
    const stats = this.ensureRoomStats(room);
    const wins = {};
    for (const [playerId, count] of Object.entries(stats.wins || {})) {
      const normalizedCount = Math.max(0, Number.parseInt(count, 10) || 0);
      if (normalizedCount > 0) wins[playerId] = normalizedCount;
    }
    return {
      gamesPlayed: stats.gamesPlayed,
      wins
    };
  }

  getPublicRoomInfo(room) {
    if (!room) return null;
    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      settings: room.settings,
      recommendedDeckCount: this.getRecommendedDeckCount(room),
      gameNumber: room.gameNumber || 0,
      lastFirstPlayerId: room.lastFirstPlayerId || null,
      nextGameFirstPlayerId: room.nextGameFirstPlayerId || null,
      status: room.status,
      gameOver: Boolean(room.gameState?.gameOver),
      winnerId: room.gameState?.winnerId || null,
      endReason: room.gameState?.endReason || null,
      stats: this.getPublicRoomStats(room),
      players: this.publicPlayers(room)
    };
  }

  broadcastRoomUpdate(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      // Pokaż graczom stan pokoju (bez pełnego gameState na tym etapie dla optymalizacji lobby)
      this.io.to(roomId).emit(EVENTS.ROOM_STATE_UPDATE, this.getPublicRoomInfo(room));
    }
  }

  broadcastGameUpdate(roomId) {
    const room = this.rooms.get(roomId);
    if (room && room.gameState) {
      // Każdy gracz powinien otrzymać tylko swoje karty z gameState.hands
      // Ale dla uproszczenia (trust-based system, lub wysyłanie odpowiedniego stanu do każdego gracza):
      
      const { hands, drawPile, discardPile, privateDealLog, auditLog, stateSnapshots, ...publicGameState } = room.gameState;
      const handCounts = {};
      for (const [pid, cards] of Object.entries(hands)) {
        handCounts[pid] = cards.length;
      }
      const players = this.publicPlayers(room);
      
      room.players.filter(p => p.socketId).forEach(p => {
        const playerState = {
          ...publicGameState,
          players,
          drawPileCount: drawPile?.length || 0,
          discardPileCount: discardPile?.length || 0,
          discardPileTail: (discardPile || [])
            .slice(-PUBLIC_DISCARD_PILE_TAIL_COUNT)
            .map(card => GameEngine.publicCard(card)),
          turnEvents: (publicGameState.turnEvents || []).map(event => this.eventForPlayer(event, p.id)),
          handCounts,
          myHand: hands[p.id] || []
        };
        this.io.to(p.socketId).emit(EVENTS.GAME_STATE_UPDATE, playerState);
      });
    }
  }
}
