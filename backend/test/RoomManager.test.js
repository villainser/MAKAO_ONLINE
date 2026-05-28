import assert from "node:assert/strict";
import test from "node:test";
import { RoomManager } from "../RoomManager.js";
import { DISCONNECT_POLICIES, EFFECT_TYPES, EVENTS, FIRST_PLAYER_MODES, ROOM_LIMITS } from "../shared/constants.js";

class MockIo {
  constructor() {
    this.emitted = [];
  }

  to(target) {
    return {
      emit: (event, payload) => {
        this.emitted.push({ target, event, payload });
      }
    };
  }
}

function card(id, rank, suit = "hearts") {
  return { cardInstanceId: id, rank, suit, deckIndex: 0 };
}

function makaoPenaltyDrawPile(prefix) {
  return [
    card(`${prefix}_5_clubs`, "5", "clubs"),
    card(`${prefix}_6_clubs`, "6", "clubs"),
    card(`${prefix}_7_clubs`, "7", "clubs"),
    card(`${prefix}_8_clubs`, "8", "clubs"),
    card(`${prefix}_9_clubs`, "9", "clubs")
  ];
}

function startTwoPlayerRoom() {
  const io = new MockIo();
  const manager = new RoomManager(io, { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");
  manager.toggleReady("socket_b_1");
  manager.startGame("socket_a_1");
  return { io, manager, room: manager.rooms.get(room.id) };
}

function startThreePlayerRoom() {
  const io = new MockIo();
  const manager = new RoomManager(io, { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");
  manager.joinRoom(room.id, "socket_c_1", "Celina", "client_c");
  manager.toggleReady("socket_b_1");
  manager.toggleReady("socket_c_1");
  manager.startGame("socket_a_1");
  return { io, manager, room: manager.rooms.get(room.id) };
}

function collectRoomGameCards(state) {
  return [
    ...Object.values(state.hands).flat(),
    ...state.drawPile,
    state.topCard
  ].filter(Boolean);
}

test("room creation exposes lobby metadata and sanitized settings", () => {
  const manager = new RoomManager(new MockIo());
  const room = manager.createRoom("socket_a_1", "Ala", "client_a", {
    roomName: "  Wieczorne   Makao  ",
    settings: {
      maxPlayers: 9,
      deckCount: 12,
      turnTimeLimitSeconds: 7
    }
  });

  assert.equal(room.name, "Wieczorne Makao");
  assert.equal(room.settings.maxPlayers, ROOM_LIMITS.MAX_PLAYERS);
  assert.equal(room.settings.deckCount, ROOM_LIMITS.MAX_DECKS);
  assert.equal(room.settings.turnTimeLimitSeconds, ROOM_LIMITS.MIN_CUSTOM_TURN_LIMIT_SECONDS);

  const publicRoom = manager.getPublicRoomInfo(room);
  assert.equal(publicRoom.name, "Wieczorne Makao");
  assert.equal(publicRoom.recommendedDeckCount, 1);
  assert.deepEqual(publicRoom.stats, { gamesPlayed: 0, wins: {} });
  assert.equal(publicRoom.adminLog, undefined);
  assert.equal(publicRoom.players[0].socketId, undefined);
});

test("single-player lobby cannot start a game", () => {
  const io = new MockIo();
  const manager = new RoomManager(io, { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");

  manager.startGame("socket_a_1");

  assert.equal(room.status, "lobby");
  assert.equal(room.gameState, null);
  assert.deepEqual(io.emitted.at(-1), {
    target: "socket_a_1",
    event: EVENTS.ERROR,
    payload: { message: "Do startu potrzeba co najmniej 2 graczy." }
  });
});

test("debug live seed creates deterministic two-client Makao catch state", () => {
  const io = new MockIo();
  const manager = new RoomManager(io, { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");

  let ack = null;
  manager.handleDebugSeedGameState("socket_a_1", {
    scenario: "phone_missing_makao_expired",
    nodePlayerId: "client_a",
    phonePlayerId: "client_b"
  }, response => {
    ack = response;
  });

  assert.equal(ack.success, true);
  assert.equal(room.status, "playing");
  assert.equal(room.gameState.hands.client_b.length, 1);
  assert.equal(room.gameState.makao.client_b.declared, false);
  assert.ok(room.gameState.makao.client_b.canBeCaughtAt < Date.now());
  assert.equal(room.gameState.topCard.rank, "8");
  assert.equal(room.gameState.topCard.suit, "diamonds");
  assert.ok(io.emitted.some(entry => entry.event === EVENTS.GAME_STATE_UPDATE && entry.target === "socket_b_1"));
});

test("debug live seed creates phone-side Makao declaration state", () => {
  const io = new MockIo();
  const manager = new RoomManager(io, { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");

  let ack = null;
  manager.handleDebugSeedGameState("socket_a_1", {
    scenario: "phone_makao_ready",
    nodePlayerId: "client_a",
    phonePlayerId: "client_b"
  }, response => {
    ack = response;
  });

  assert.equal(ack.success, true);
  assert.equal(room.status, "playing");
  assert.equal(room.gameState.turnOrder[room.gameState.currentPlayerIndex], "client_b");
  assert.equal(room.gameState.hands.client_b.length, 1);
  assert.equal(room.gameState.makao.client_b.declared, false);
  assert.ok(room.gameState.makao.client_b.canBeCaughtAt > Date.now() + 25000);
  assert.equal(room.gameState.moveHistory[0].details.debugScenario, "phone_makao_ready");
});

test("host can update lobby room name, player limit, turn timer and first player", () => {
  const io = new MockIo();
  const manager = new RoomManager(io);
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");
  manager.joinRoom(room.id, "socket_c_1", "Celina", "client_c");

  manager.updateSettings("socket_a_1", {
    roomName: "Test Makao",
    maxPlayers: 2,
    turnTimeLimitSeconds: 75,
    firstPlayerId: "client_b"
  });

  assert.equal(room.name, "Test Makao");
  assert.equal(room.settings.maxPlayers, 3);
  assert.equal(room.settings.turnTimeLimitSeconds, 75);
  assert.equal(room.settings.firstPlayerMode, FIRST_PLAYER_MODES.HOST_SELECTED_THEN_ROTATE);
  assert.equal(room.settings.firstPlayerId, "client_b");
  assert.equal(room.nextGameFirstPlayerId, "client_b");

  const publicRoom = io.emitted.filter(entry => entry.event === EVENTS.ROOM_STATE_UPDATE).at(-1).payload;
  assert.equal(publicRoom.name, "Test Makao");
  assert.equal(publicRoom.settings.maxPlayers, 3);
  assert.equal(publicRoom.nextGameFirstPlayerId, "client_b");
  assert.equal(publicRoom.recommendedDeckCount, 1);
});

test("room supports up to eight players and recommends three decks for eight ready players", () => {
  const manager = new RoomManager(new MockIo());
  const room = manager.createRoom("socket_a_1", "Ala", "client_a", {
    settings: { maxPlayers: 8 }
  });

  for (let i = 2; i <= 8; i += 1) {
    manager.joinRoom(room.id, `socket_${i}_1`, `Gracz ${i}`, `client_${i}`);
    manager.toggleReady(`socket_${i}_1`);
  }

  assert.equal(room.players.length, 8);
  assert.equal(room.settings.maxPlayers, 8);
  assert.equal(manager.getRecommendedDeckCount(room), 3);
  assert.throws(
    () => manager.joinRoom(room.id, "socket_9_1", "Gracz 9", "client_9"),
    /pełny/
  );
});

test("eight-player room can start a three-deck game and broadcast private hands", () => {
  const io = new MockIo();
  const manager = new RoomManager(io);
  const room = manager.createRoom("socket_1", "Gracz 1", "client_1", {
    settings: {
      maxPlayers: 8,
      deckCount: 3
    }
  });

  for (let i = 2; i <= 8; i += 1) {
    manager.joinRoom(room.id, `socket_${i}`, `Gracz ${i}`, `client_${i}`);
    manager.toggleReady(`socket_${i}`);
  }

  manager.startGame("socket_1");

  assert.equal(room.status, "playing");
  assert.equal(room.gameState.settings.deckCount, 3);
  assert.equal(room.gameState.turnOrder.length, 8);
  assert.equal(room.gameState.moveHistory[0].details.playerCount, 8);
  assert.equal(room.gameState.moveHistory[0].details.deckCount, 3);

  const allCards = collectRoomGameCards(room.gameState);
  const ids = allCards.map(item => item.cardInstanceId);
  assert.equal(allCards.length, 156);
  assert.equal(new Set(ids).size, 156);

  const gameUpdates = io.emitted.filter(entry => entry.event === EVENTS.GAME_STATE_UPDATE);
  assert.equal(gameUpdates.length, 8);
  assert.deepEqual(
    gameUpdates.map(entry => entry.target).sort(),
    Array.from({ length: 8 }, (_, index) => `socket_${index + 1}`).sort()
  );
  for (const update of gameUpdates) {
    assert.equal(update.payload.turnOrder.length, 8);
    assert.equal(Object.keys(update.payload.handCounts).length, 8);
    assert.equal(update.payload.players.length, 8);
    assert.equal(update.payload.players[0].name, "Gracz 1");
    assert.equal(update.payload.players[0].socketId, undefined);
    assert.equal(update.payload.hands, undefined);
    assert.equal(update.payload.drawPile, undefined);
    assert.equal(update.payload.drawPileCount, room.gameState.drawPile.length);
    assert.equal(update.payload.discardPileCount, room.gameState.discardPile.length);
    assert.ok(update.payload.myHand.length >= 5);
  }
});

test("non-host cannot update lobby settings", () => {
  const manager = new RoomManager(new MockIo());
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");

  manager.updateSettings("socket_b_1", {
    roomName: "Nie moje",
    maxPlayers: 6,
    turnTimeLimitSeconds: 60
  });

  assert.notEqual(room.name, "Nie moje");
  assert.equal(room.settings.maxPlayers, 4);
  assert.equal(room.settings.turnTimeLimitSeconds, ROOM_LIMITS.DEFAULT_TURN_LIMIT_SECONDS);
});

test("joining over the configured player limit is rejected", () => {
  const manager = new RoomManager(new MockIo());
  const room = manager.createRoom("socket_a_1", "Ala", "client_a", {
    settings: { maxPlayers: 2 }
  });

  manager.joinRoom(room.id.toLowerCase(), "socket_b_1", "Bartek", "client_b");

  assert.throws(
    () => manager.joinRoom(room.id, "socket_c_1", "Celina", "client_c"),
    /pełny/
  );
  assert.equal(manager.playerRooms.get("socket_b_1"), room.id);
});

test("turn timer is initialized when the room has a turn limit", () => {
  const manager = new RoomManager(new MockIo());
  const room = manager.createRoom("socket_a_1", "Ala", "client_a", {
    settings: { turnTimeLimitSeconds: 30 }
  });
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");
  manager.toggleReady("socket_b_1");
  manager.startGame("socket_a_1");

  assert.equal(room.gameState.settings.turnTimeLimitSeconds, 30);
  assert.equal(room.gameState.turnTimerPlayerId, room.gameState.turnOrder[room.gameState.currentPlayerIndex]);
  assert.ok(room.gameState.turnStartedAt > 0);
  assert.ok(room.gameState.turnDeadlineAt >= room.gameState.turnStartedAt + 30000);
});

test("turn timer settings support no limit and cap custom values", () => {
  const manager = new RoomManager(new MockIo(), { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a", {
    settings: { turnTimeLimitSeconds: 0 }
  });

  assert.equal(room.settings.turnTimeLimitSeconds, 0);

  manager.updateSettings("socket_a_1", { turnTimeLimitSeconds: 999 });
  assert.equal(room.settings.turnTimeLimitSeconds, ROOM_LIMITS.MAX_CUSTOM_TURN_LIMIT_SECONDS);

  manager.updateSettings("socket_a_1", { turnTimeLimitSeconds: -30 });
  assert.equal(room.settings.turnTimeLimitSeconds, 0);
});

test("selected first player starts the game and then rotates to next lobby game", () => {
  const io = new MockIo();
  const manager = new RoomManager(io, { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");
  manager.joinRoom(room.id, "socket_c_1", "Celina", "client_c");
  manager.toggleReady("socket_b_1");
  manager.toggleReady("socket_c_1");

  manager.updateSettings("socket_a_1", { firstPlayerId: "client_b" });
  manager.startGame("socket_a_1");

  assert.equal(room.status, "playing");
  assert.equal(room.gameNumber, 1);
  assert.equal(room.gameState.turnOrder[room.gameState.currentPlayerIndex], "client_b");
  assert.equal(room.gameState.moveHistory[0].details.firstPlayerId, "client_b");
  assert.equal(room.nextGameFirstPlayerId, "client_c");

  room.gameState.gameOver = true;
  room.gameState.winnerId = "client_b";
  manager.handleReturnToLobby("socket_a_1");

  assert.equal(room.status, "lobby");
  assert.equal(room.gameState, null);
  assert.deepEqual(room.players.map(player => [player.id, player.isReady]), [
    ["client_a", true],
    ["client_b", false],
    ["client_c", false]
  ]);
  assert.equal(room.nextGameFirstPlayerId, "client_c");

  manager.toggleReady("socket_b_1");
  manager.toggleReady("socket_c_1");
  manager.startGame("socket_a_1");

  assert.equal(room.gameNumber, 2);
  assert.equal(room.gameState.turnOrder[room.gameState.currentPlayerIndex], "client_c");
  assert.equal(room.nextGameFirstPlayerId, "client_a");
});

test("room stats count finished games and winner totals once", () => {
  const { io, manager, room } = startTwoPlayerRoom();

  room.gameState.gameOver = true;
  room.gameState.winnerId = "client_b";
  manager.finalizeGameMutation(room.id, room);
  manager.finalizeGameMutation(room.id, room);

  assert.equal(room.stats.gamesPlayed, 1);
  assert.equal(room.stats.wins.client_b, 1);

  const firstPublicStats = io.emitted
    .filter(entry => entry.event === EVENTS.ROOM_STATE_UPDATE)
    .at(-1)
    .payload.stats;
  assert.deepEqual(firstPublicStats, {
    gamesPlayed: 1,
    wins: { client_b: 1 }
  });

  manager.handleReturnToLobby("socket_a_1");
  manager.toggleReady("socket_b_1");
  manager.startGame("socket_a_1");
  room.gameState.gameOver = true;
  room.gameState.winnerId = "client_a";
  manager.handleReturnToLobby("socket_a_1");

  assert.deepEqual(room.stats, {
    gamesPlayed: 2,
    wins: {
      client_b: 1,
      client_a: 1
    }
  });
  assert.deepEqual(manager.getPublicRoomInfo(room).stats, room.stats);
});

test("first-player rotation advances past a scheduled starter who leaves", () => {
  const manager = new RoomManager(new MockIo(), { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");
  manager.joinRoom(room.id, "socket_c_1", "Celina", "client_c");
  manager.joinRoom(room.id, "socket_d_1", "Darek", "client_d");

  manager.updateSettings("socket_a_1", { firstPlayerId: "client_b" });
  manager.leaveRoom("socket_b_1");

  assert.equal(room.settings.firstPlayerId, "client_c");
  assert.equal(room.nextGameFirstPlayerId, "client_c");

  manager.toggleReady("socket_c_1");
  manager.toggleReady("socket_d_1");
  manager.startGame("socket_a_1");

  assert.equal(room.gameState.turnOrder[room.gameState.currentPlayerIndex], "client_c");
  assert.equal(room.nextGameFirstPlayerId, "client_d");
});

test("next lobby game starts after the rotated starter when that starter leaves", () => {
  const manager = new RoomManager(new MockIo(), { enableTurnTimerMonitor: false });
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");
  manager.joinRoom(room.id, "socket_c_1", "Celina", "client_c");
  manager.joinRoom(room.id, "socket_d_1", "Darek", "client_d");
  manager.toggleReady("socket_b_1");
  manager.toggleReady("socket_c_1");
  manager.toggleReady("socket_d_1");

  manager.updateSettings("socket_a_1", { firstPlayerId: "client_b" });
  manager.startGame("socket_a_1");

  assert.equal(room.nextGameFirstPlayerId, "client_c");

  room.gameState.gameOver = true;
  room.gameState.winnerId = "client_b";
  manager.handleReturnToLobby("socket_a_1");
  manager.leaveRoom("socket_c_1");

  assert.equal(room.settings.firstPlayerId, "client_b");
  assert.equal(room.nextGameFirstPlayerId, "client_d");

  manager.toggleReady("socket_b_1");
  manager.toggleReady("socket_d_1");
  manager.startGame("socket_a_1");

  assert.equal(room.gameNumber, 2);
  assert.equal(room.gameState.turnOrder[room.gameState.currentPlayerIndex], "client_d");
  assert.equal(room.nextGameFirstPlayerId, "client_a");
});

test("return to lobby is host-only and only after game over", () => {
  const { io, manager, room } = startTwoPlayerRoom();

  manager.handleReturnToLobby("socket_b_1");
  assert.equal(room.status, "playing");
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /Tylko host/);

  manager.handleReturnToLobby("socket_a_1");
  assert.equal(room.status, "playing");
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /zakończonej partii/);
});

test("private deal log is not included in public game updates", () => {
  const { io, room } = startTwoPlayerRoom();
  const gameUpdate = io.emitted
    .filter(entry => entry.event === EVENTS.GAME_STATE_UPDATE)
    .at(-1);

  assert.ok(room.gameState.privateDealLog);
  assert.ok(room.gameState.auditLog.length > 0);
  assert.ok(room.gameState.stateSnapshots.length > 0);
  assert.equal(gameUpdate.payload.privateDealLog, undefined);
  assert.equal(gameUpdate.payload.auditLog, undefined);
  assert.equal(gameUpdate.payload.stateSnapshots, undefined);
  assert.equal(gameUpdate.payload.drawPile, undefined);
  assert.equal(gameUpdate.payload.hands, undefined);
});

test("public move history records played cards without leaking card instance ids", () => {
  const { io, manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.currentPlayerIndex = state.turnOrder.indexOf("client_a");
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.discardPile = [
    card("old_5_spades", "5", "spades"),
    card("old_6_diamonds", "6", "diamonds")
  ];
  state.activeEffect = null;
  state.hands.client_a = [
    card("client_a_7_clubs", "7", "clubs"),
    card("client_a_8_hearts", "8", "hearts")
  ];
  state.hands.client_b = [
    card("client_b_7_spades", "7", "spades"),
    card("client_b_9_clubs", "9", "clubs")
  ];

  manager.handlePlayCards("socket_a_1", {
    cardIds: ["client_a_7_clubs"]
  });

  const history = state.moveHistory.at(-1);
  assert.equal(history.type, "play_cards");
  assert.deepEqual(history.details.playedCards, [{ rank: "7", suit: "clubs" }]);
  assert.equal(history.details.playedCards[0].cardInstanceId, undefined);

  const gameUpdate = io.emitted
    .filter(entry => entry.event === EVENTS.GAME_STATE_UPDATE && entry.target === "socket_b_1")
    .at(-1);
  assert.deepEqual(gameUpdate.payload.moveHistory.at(-1).details.playedCards, [{ rank: "7", suit: "clubs" }]);
  assert.deepEqual(gameUpdate.payload.discardPileTail, [
    { rank: "6", suit: "diamonds" },
    { rank: "7", suit: "hearts" }
  ]);
  assert.equal(gameUpdate.payload.discardPileTail[0].cardInstanceId, undefined);
});

test("stale play requests cannot consume several stored pauses from one client state", () => {
  const { io, manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.currentPlayerIndex = state.turnOrder.indexOf("client_a");
  state.topCard = card("top_7_spades", "7", "spades");
  state.discardPile = [];
  state.activeEffect = null;
  state.skipTurns = {};
  state.hands.client_a = [
    card("client_a_4_hearts", "4", "hearts"),
    card("client_a_4_diamonds", "4", "diamonds"),
    card("client_a_4_clubs", "4", "clubs"),
    card("client_a_4_spades", "4", "spades"),
    card("client_a_8_clubs", "8", "clubs"),
    card("client_a_8_hearts", "8", "hearts"),
    card("client_a_8_diamonds", "8", "diamonds"),
    card("client_a_9_spades", "9", "spades")
  ];
  state.hands.client_b = [
    card("client_b_9_clubs", "9", "clubs"),
    card("client_b_10_hearts", "10", "hearts")
  ];

  manager.handlePlayCards("socket_a_1", {
    expectedStateVersion: state.stateVersion,
    cardIds: ["client_a_4_hearts", "client_a_4_diamonds", "client_a_4_clubs", "client_a_4_spades"]
  });

  assert.equal(state.activeEffect, null);
  assert.equal(state.skipTurns.client_b, 3);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_a");

  const versionAfterFours = state.stateVersion;
  manager.handlePlayCards("socket_a_1", {
    expectedStateVersion: versionAfterFours,
    cardIds: ["client_a_8_clubs", "client_a_8_hearts", "client_a_8_diamonds"]
  });

  assert.equal(state.skipTurns.client_b, 2);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_a");
  assert.equal(state.moveHistory.at(-1).type, "play_cards");
  assert.equal(state.moveHistory.at(-1).details.cardCount, 3);

  const versionAfterBatch = state.stateVersion;
  manager.handlePlayCards("socket_a_1", {
    expectedStateVersion: versionAfterFours,
    cardIds: ["client_a_9_spades"]
  });

  assert.equal(state.stateVersion, versionAfterBatch);
  assert.equal(state.skipTurns.client_b, 2);
  assert.equal(state.moveHistory.at(-1).details.cardCount, 3);
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /Stan gry zmienił/);
});

test("public move history keeps passed requests active and marks answered requests as resolved", () => {
  const suitCase = startTwoPlayerRoom();
  suitCase.room.gameState.turnOrder = ["client_a", "client_b"];
  suitCase.room.gameState.currentPlayerIndex = 0;
  suitCase.room.gameState.topCard = card("top_ace_hearts", "ace", "hearts");
  suitCase.room.gameState.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    targetPlayerId: "client_a"
  };
  suitCase.room.gameState.hands.client_a = [card("client_a_9_clubs", "9", "clubs")];
  suitCase.room.gameState.drawPile = [card("draw_8_clubs", "8", "clubs")];

  suitCase.manager.handleDrawCard("socket_a_1");

  assert.equal(suitCase.room.gameState.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(suitCase.room.gameState.activeEffect.requestedSuit, "spades");
  assert.equal(suitCase.room.gameState.activeEffect.targetPlayerId, "client_b");
  assert.equal(suitCase.room.gameState.moveHistory.at(-1).type, "draw_card");
  assert.equal(suitCase.room.gameState.moveHistory.at(-1).details.resolvedEffectType, undefined);
  assert.equal(suitCase.room.gameState.moveHistory.at(-1).details.resolvedSuitRequest, undefined);
  assert.equal(suitCase.room.gameState.moveHistory.at(-1).details.canPlayDrawnCard, false);

  const rankCase = startTwoPlayerRoom();
  rankCase.room.gameState.turnOrder = ["client_a", "client_b"];
  rankCase.room.gameState.currentPlayerIndex = 0;
  rankCase.room.gameState.topCard = card("top_jack_hearts", "jack", "hearts");
  rankCase.room.gameState.activeEffect = {
    type: EFFECT_TYPES.RANK_REQUEST,
    requestedRank: "10",
    requesterPlayerId: "client_b",
    targetPlayerId: "client_a"
  };
  rankCase.room.gameState.hands.client_a = [
    card("client_a_10_clubs", "10", "clubs"),
    card("client_a_9_hearts", "9", "hearts")
  ];
  rankCase.room.gameState.hands.client_b = [
    card("client_b_10_diamonds", "10", "diamonds"),
    card("client_b_9_clubs", "9", "clubs")
  ];

  rankCase.manager.handlePlayCards("socket_a_1", {
    cardIds: ["client_a_10_clubs"]
  });

  assert.equal(rankCase.room.gameState.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(rankCase.room.gameState.activeEffect.requestedRank, "10");
  assert.equal(rankCase.room.gameState.activeEffect.targetPlayerId, "client_b");
  assert.equal(rankCase.room.gameState.moveHistory.at(-1).type, "play_cards");
  assert.equal(rankCase.room.gameState.moveHistory.at(-1).details.resolvedEffectType, undefined);
  assert.equal(rankCase.room.gameState.moveHistory.at(-1).details.resolvedRankRequest, undefined);
  assert.deepEqual(rankCase.room.gameState.moveHistory.at(-1).details.playedCards, [{ rank: "10", suit: "clubs" }]);

  rankCase.manager.handlePlayCards("socket_b_1", {
    cardIds: ["client_b_10_diamonds"]
  });

  assert.equal(rankCase.room.gameState.activeEffect, null);
  assert.equal(rankCase.room.gameState.moveHistory.at(-1).type, "play_cards");
  assert.equal(rankCase.room.gameState.moveHistory.at(-1).details.resolvedEffectType, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(rankCase.room.gameState.moveHistory.at(-1).details.resolvedRankRequest, "10");
  assert.deepEqual(rankCase.room.gameState.moveHistory.at(-1).details.playedCards, [{ rank: "10", suit: "diamonds" }]);
});

test("draw penalty history records manual one-card penalty draws", () => {
  const { manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_hearts", "3", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "hearts",
    targetPlayerId: "client_a"
  };
  state.hands.client_a = [card("client_a_9_spades", "9", "spades")];
  state.drawPile = [
    card("draw_third", "6", "clubs"),
    card("draw_second_answer_too_late", "3", "hearts"),
    card("draw_first", "9", "diamonds")
  ];

  manager.handleDrawCard("socket_a_1");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.penaltyDrawnCount, 1);
  assert.equal(state.moveHistory.at(-1).type, "draw_card");
  assert.equal(state.moveHistory.at(-1).details.drawnCount, 1);
  assert.equal(state.moveHistory.at(-1).details.acceptedPenalty, false);
  assert.equal(state.moveHistory.at(-1).details.penaltyRemainingCount, 2);

  manager.handleDrawCard("socket_a_1");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.penaltyDrawnCount, 2);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.drawnCardInstanceId, null);
  assert.equal(state.moveHistory.at(-1).type, "draw_card");
  assert.equal(state.moveHistory.at(-1).details.canPlayDrawnCard, false);
  assert.equal(state.moveHistory.at(-1).details.penaltyRemainingCount, 1);

  manager.handleDrawCard("socket_a_1");

  assert.equal(state.activeEffect, null);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_b");
  assert.equal(state.moveHistory.at(-1).type, "draw_card");
  assert.equal(state.moveHistory.at(-1).details.drawnCount, 1);
  assert.equal(state.moveHistory.at(-1).details.acceptedPenalty, true);
  assert.equal(state.moveHistory.at(-1).details.penaltyRemainingCount, 0);
});

test("rejected game actions are written to private rule validation log only", () => {
  const { io, manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.currentPlayerIndex = state.turnOrder.indexOf("client_a");
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.activeEffect = null;
  state.hands.client_a = [card("client_a_9_spades", "9", "spades")];

  manager.handlePlayCards("socket_a_1", {
    cardIds: ["client_a_9_spades"]
  });

  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  const rejection = state.auditLog.at(-1);
  assert.equal(rejection.category, "rule_validation_log");
  assert.equal(rejection.type, "play_cards_rejected");
  assert.match(rejection.details.error, /cannot be played/);

  const gameUpdate = io.emitted
    .filter(entry => entry.event === EVENTS.GAME_STATE_UPDATE)
    .at(-1);
  assert.notEqual(gameUpdate?.payload?.auditLog, state.auditLog);
});

test("returning to lobby archives completed game logs privately", () => {
  const { manager, room } = startTwoPlayerRoom();

  manager.handleHostEndGame("socket_a_1", {
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });
  const publicHistoryCount = room.gameState.moveHistory.length;
  const auditLogCount = room.gameState.auditLog.length;

  manager.handleReturnToLobby("socket_a_1");

  assert.equal(room.status, "lobby");
  assert.equal(room.gameState, null);
  assert.equal(room.completedGameLogs.length, 1);
  assert.equal(room.completedGameLogs[0].moveHistory.length, publicHistoryCount);
  assert.equal(room.completedGameLogs[0].auditLog.length, auditLogCount);
  assert.equal(room.auditLog.at(-1).category, "cleanup_log");
  assert.equal(room.auditLog.at(-1).type, "game_logs_archived");
});

test("expired visible turn timer does not remove an active player", () => {
  const { io, manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  const now = Date.now();
  state.currentPlayerIndex = state.turnOrder.indexOf("client_a");
  state.activeEffect = null;
  state.turnTimerPlayerId = "client_a";
  state.turnStartedAt = now - 301000;
  state.turnDeadlineAt = now - 1000;

  manager.checkExpiredTurnTimers(now);

  assert.equal(state.gameOver, false);
  assert.deepEqual(state.turnOrder, ["client_a", "client_b"]);
  assert.ok(state.hands.client_a);
  assert.equal(room.hostId, "client_a");
  assert.equal(state.moveHistory.some(entry => entry.type === "turn_timeout_loss"), false);

  const gameUpdates = io.emitted.filter(entry => entry.event === EVENTS.GAME_STATE_UPDATE);
  assert.equal(gameUpdates.some(entry => entry.payload.gameOver === true), false);
});

test("expired visible turn timer does not block a manual pause", () => {
  const { manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  const now = Date.now();
  state.currentPlayerIndex = state.turnOrder.indexOf("client_a");
  state.activeEffect = null;
  state.turnTimerPlayerId = "client_a";
  state.turnStartedAt = now - 301000;
  state.turnDeadlineAt = now - 1;

  manager.handlePauseGame("socket_a_1");

  assert.equal(state.gameOver, false);
  assert.equal(state.paused, true);
  assert.equal(state.pauseReason, "manual");
  assert.equal(state.pausedPlayerId, "client_a");
});

test("expired manual pause waits for host decision by default", () => {
  const { manager, room } = startTwoPlayerRoom();

  const state = room.gameState;
  const now = Date.now();
  manager.handlePauseGame("socket_a_1");
  state.pausedAt = now - 301000;

  manager.checkExpiredTurnTimers(now);

  assert.equal(state.paused, true);
  assert.equal(state.gameOver, false);
  assert.deepEqual(state.turnOrder, ["client_a", "client_b"]);
  assert.equal(room.players.some(player => player.id === "client_a"), true);
  assert.notEqual(state.moveHistory.at(-1)?.type, "pause_timeout_loss");
});

test("reconnect keeps a player in an active game and restores their hand", () => {
  const { io, manager, room: activeRoom } = startTwoPlayerRoom();
  const roomId = activeRoom.id;
  activeRoom.gameState.currentPlayerIndex = activeRoom.gameState.turnOrder.indexOf("client_a");
  const handBefore = activeRoom.gameState.hands.client_a.map(card => card.cardInstanceId);

  manager.handleDisconnect("socket_a_1");

  assert.equal(activeRoom.players.find(p => p.id === "client_a").isOnline, false);
  assert.deepEqual(activeRoom.gameState.hands.client_a.map(card => card.cardInstanceId), handBefore);
  assert.equal(activeRoom.gameState.paused, true);
  assert.equal(activeRoom.gameState.pausedPlayerId, "client_a");

  manager.reconnectPlayer(roomId, "socket_a_2", "client_a");

  assert.equal(activeRoom.players.find(p => p.id === "client_a").isOnline, true);
  assert.equal(activeRoom.gameState.paused, false);
  assert.equal(activeRoom.gameState.pausedPlayerId, null);
  assert.equal(activeRoom.gameState.turnEvents.at(-1).type, "game_resumed_disconnect");

  const reconnectUpdate = io.emitted
    .filter(entry => entry.target === "socket_a_2" && entry.event === EVENTS.GAME_STATE_UPDATE)
    .at(-1);

  assert.ok(reconnectUpdate);
  assert.deepEqual(reconnectUpdate.payload.myHand.map(card => card.cardInstanceId), handBefore);
});

test("offline non-current player pauses the room when their turn is reached", () => {
  const { manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.client_a = [
    card("client_a_7_clubs", "7", "clubs"),
    card("client_a_8_hearts", "8", "hearts"),
    card("client_a_9_hearts", "9", "hearts")
  ];
  state.hands.client_b = [card("client_b_10_spades", "10", "spades")];
  state.activeEffect = null;
  state.paused = false;

  manager.handleDisconnect("socket_b_1");

  assert.equal(state.paused, false);
  assert.equal(room.players.find(player => player.id === "client_b").isOnline, false);

  manager.handlePlayCards("socket_a_1", { cardIds: ["client_a_7_clubs"] });

  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_b");
  assert.equal(state.paused, true);
  assert.equal(state.pauseReason, "disconnect");
  assert.equal(state.pausedPlayerId, "client_b");
  assert.equal(state.turnEvents.at(-1).type, "game_paused_disconnect");
  assert.equal(state.moveHistory.at(-1).type, "game_paused_disconnect");

  const timeoutAt = state.pausedAt + ROOM_LIMITS.DEFAULT_PAUSE_TIMEOUT_SECONDS * 1000 + 1;
  manager.resolveExpiredTurnTimer(room.id, room, timeoutAt);

  assert.deepEqual(room.players.map(player => player.id), ["client_a", "client_b"]);
  assert.deepEqual(state.turnOrder, ["client_a", "client_b"]);
  assert.equal(state.paused, true);
  assert.equal(state.gameOver, false);
  assert.notEqual(state.moveHistory.at(-1).type, "pause_timeout_loss");
});

test("pause timeout re-pauses when the next current player is also offline", () => {
  const { manager, room } = startThreePlayerRoom();
  const state = room.gameState;
  state.settings.disconnectPolicy = DISCONNECT_POLICIES.AUTO_REMOVE_AFTER_LIMIT;
  state.turnOrder = ["client_a", "client_b", "client_c"];
  state.currentPlayerIndex = state.turnOrder.indexOf("client_b");
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.client_a = [card("client_a_7_clubs", "7", "clubs")];
  state.hands.client_b = [card("client_b_8_spades", "8", "spades")];
  state.hands.client_c = [card("client_c_9_spades", "9", "spades")];
  state.activeEffect = null;
  state.paused = false;
  state.pauseReason = null;
  state.pausedPlayerId = null;
  state.pausedAt = null;

  manager.handleDisconnect("socket_c_1");
  assert.equal(state.paused, false);
  assert.equal(room.players.find(player => player.id === "client_c").isOnline, false);

  manager.handleDisconnect("socket_b_1");
  assert.equal(state.paused, true);
  assert.equal(state.pausedPlayerId, "client_b");

  const firstTimeoutAt = state.pausedAt + ROOM_LIMITS.DEFAULT_PAUSE_TIMEOUT_SECONDS * 1000 + 1;
  manager.resolveExpiredTurnTimer(room.id, room, firstTimeoutAt);

  assert.deepEqual(room.players.map(player => player.id), ["client_a", "client_c"]);
  assert.deepEqual(state.turnOrder, ["client_a", "client_c"]);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_c");
  assert.equal(state.paused, true);
  assert.equal(state.pauseReason, "disconnect");
  assert.equal(state.pausedPlayerId, "client_c");
  assert.equal(state.moveHistory.some(entry => entry.type === "pause_timeout_loss" && entry.playerId === "client_b"), true);
  assert.equal(state.moveHistory.at(-1).type, "game_paused_disconnect");
  assert.equal(state.gameOver, false);

  const secondTimeoutAt = state.pausedAt + ROOM_LIMITS.DEFAULT_PAUSE_TIMEOUT_SECONDS * 1000 + 1;
  manager.resolveExpiredTurnTimer(room.id, room, secondTimeoutAt);

  assert.deepEqual(room.players.map(player => player.id), ["client_a"]);
  assert.deepEqual(state.turnOrder, ["client_a"]);
  assert.equal(state.gameOver, true);
  assert.equal(state.winnerId, "client_a");
  assert.equal(state.moveHistory.at(-1).type, "pause_timeout_loss");
});

test("server does not auto-draw for a player with no legal card after a turn change", () => {
  const { manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.client_a = [
    card("client_a_7_clubs", "7", "clubs"),
    card("client_a_8_hearts", "8", "hearts"),
    card("client_a_9_hearts", "9", "hearts")
  ];
  state.hands.client_b = [card("client_b_10_spades", "10", "spades")];
  state.drawPile = [card("draw_5_diamonds", "5", "diamonds")];
  state.activeEffect = null;
  state.hasDrawnCardThisTurn = false;
  state.drawnCardInstanceId = null;

  manager.handlePlayCards("socket_a_1", { cardIds: ["client_a_7_clubs"] });

  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_b");
  assert.equal(state.hands.client_b.length, 1);
  assert.equal(state.drawPile.length, 1);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.turnEvents.some(event => event.type.startsWith("auto_draw")), false);
});

test("server auto-resolves a Joker declared as 4 when the target cannot answer", () => {
  const { manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.client_a = [
    card("client_a_joker", "joker"),
    card("client_a_8_hearts", "8", "hearts")
  ];
  state.hands.client_b = [card("client_b_10_spades", "10", "spades")];
  state.drawPile = [card("draw_5_diamonds", "5", "diamonds")];
  state.activeEffect = null;
  state.skipTurns = {};
  state.hasDrawnCardThisTurn = false;
  state.drawnCardInstanceId = null;

  manager.handlePlayCards("socket_a_1", {
    cardIds: ["client_a_joker"],
    jokerDeclarations: {
      client_a_joker: { rank: "4", suit: "hearts" }
    }
  });

  assert.equal(state.topCard.rank, "joker");
  assert.deepEqual(state.topCard.jokerDeclaration, { rank: "4", suit: "hearts" });
  assert.equal(state.activeEffect, null);
  assert.equal(state.skipTurns.client_b, 0);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_a");
  assert.equal(state.hands.client_b.length, 1);
  assert.equal(state.drawPile.length, 1);
  assert.equal(state.turnEvents.at(-1).type, "skip_finished");
  assert.equal(state.turnEvents.at(-1).pausedPlayerId, "client_b");
});

test("server keeps a 4 pause active when the target can answer with another 4", () => {
  const { manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.client_a = [
    card("client_a_4_hearts", "4", "hearts"),
    card("client_a_8_hearts", "8", "hearts")
  ];
  state.hands.client_b = [
    card("client_b_4_spades", "4", "spades"),
    card("client_b_10_spades", "10", "spades")
  ];
  state.activeEffect = null;
  state.skipTurns = {};
  state.hasDrawnCardThisTurn = false;
  state.drawnCardInstanceId = null;

  manager.handlePlayCards("socket_a_1", {
    cardIds: ["client_a_4_hearts"]
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SKIP_TURN);
  assert.equal(state.activeEffect.amount, 1);
  assert.equal(state.activeEffect.targetPlayerId, "client_b");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_b");
  assert.equal(state.skipTurns.client_b, undefined);
});

test("other player can catch missing Makao after grace window and target draws five cards", () => {
  const { io, manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_8_diamonds", "8", "diamonds");
  state.hands.client_a = [
    card("client_a_8_hearts", "8", "hearts"),
    card("client_a_9_hearts", "9", "hearts")
  ];
  state.hands.client_b = [card("client_b_10_spades", "10", "spades")];
  state.drawPile = makaoPenaltyDrawPile("catch_penalty");
  state.activeEffect = null;
  state.hasDrawnCardThisTurn = false;
  state.drawnCardInstanceId = null;

  manager.handlePlayCards("socket_a_1", { cardIds: ["client_a_8_hearts"] });
  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_b");
  assert.equal(state.hands.client_a.length, 1);
  assert.equal(state.makao.client_a.declared, false);

  state.makao.client_a.canBeCaughtAt = 1;
  manager.handleCatchMakao("socket_b_1", { targetPlayerId: "client_a" });

  assert.equal(state.hands.client_a.length, 6);
  assert.equal(state.drawPile.length, 0);
  assert.equal(state.makao.client_a, undefined);
  assert.equal(state.turnEvents.at(-1).type, "makao_caught");
  assert.equal(state.turnEvents.at(-1).catcherId, "client_b");
  assert.equal(state.turnEvents.at(-1).amount, 5);
  assert.equal(state.moveHistory.at(-1).type, "catch_makao");
  assert.deepEqual(state.moveHistory.at(-1).details, {
    targetPlayerId: "client_a",
    amount: 5
  });

  const targetUpdate = io.emitted
    .filter(entry => entry.event === EVENTS.GAME_STATE_UPDATE && entry.target === "socket_a_1")
    .at(-1);
  assert.equal(targetUpdate.payload.myHand.length, 6);
  assert.equal(targetUpdate.payload.handCounts.client_a, 6);
});

test("stale catch Makao request cannot override a processed declaration", () => {
  const { io, manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_8_diamonds", "8", "diamonds");
  state.hands.client_a = [
    card("client_a_8_hearts", "8", "hearts"),
    card("client_a_9_hearts", "9", "hearts")
  ];
  state.hands.client_b = [card("client_b_10_spades", "10", "spades")];
  state.drawPile = makaoPenaltyDrawPile("stale_catch_penalty");
  state.activeEffect = null;
  state.hasDrawnCardThisTurn = false;
  state.drawnCardInstanceId = null;

  manager.handlePlayCards("socket_a_1", { cardIds: ["client_a_8_hearts"] });
  const missingVersion = state.stateVersion;
  state.makao.client_a.canBeCaughtAt = 1;

  manager.handleDeclareMakao("socket_a_1", { expectedStateVersion: missingVersion });
  assert.equal(state.makao.client_a.declared, true);

  manager.handleCatchMakao("socket_b_1", {
    targetPlayerId: "client_a",
    expectedStateVersion: missingVersion
  });

  assert.equal(state.hands.client_a.length, 1);
  assert.equal(state.makao.client_a.declared, true);
  assert.equal(state.moveHistory.at(-1).type, "declare_makao");
  const errorEvent = io.emitted.filter(entry => entry.event === EVENTS.ERROR).at(-1);
  assert.match(errorEvent.payload.message, /Stan gry zmienił się/);
});

test("expired missing Makao catch window becomes safe when turn returns", () => {
  const { manager, room } = startTwoPlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_8_diamonds", "8", "diamonds");
  state.hands.client_a = [
    card("client_a_8_hearts", "8", "hearts"),
    card("client_a_9_hearts", "9", "hearts")
  ];
  state.hands.client_b = [
    card("client_b_8_spades", "8", "spades"),
    card("client_b_10_spades", "10", "spades")
  ];
  state.drawPile = makaoPenaltyDrawPile("auto_penalty");
  state.activeEffect = null;
  state.hasDrawnCardThisTurn = false;
  state.drawnCardInstanceId = null;

  manager.handlePlayCards("socket_a_1", { cardIds: ["client_a_8_hearts"] });
  state.makao.client_a.canBeCaughtAt = 1;
  state.makao.client_a.catchUntil = 1;
  manager.handlePlayCards("socket_b_1", { cardIds: ["client_b_8_spades"] });

  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_a");
  assert.equal(state.hands.client_a.length, 1);
  assert.equal(state.drawPile.length, 5);
  assert.equal(state.makao.client_a.declared, true);
  assert.equal(state.makao.client_a.autoSafeAfterCatchWindow, true);
  assert.equal(state.turnEvents.at(-1).type, "makao_uncaught");
  assert.equal(state.moveHistory.at(-1).type, "play_cards");
  assert.equal(state.moveHistory.at(-1).currentPlayerId, "client_a");
});

test("reconnect rejects finished game sessions", () => {
  const { manager, room } = startTwoPlayerRoom();
  room.gameState.gameOver = true;
  room.gameState.winnerId = "client_a";

  manager.handleDisconnect("socket_b_1");

  assert.throws(
    () => manager.reconnectPlayer(room.id, "socket_b_2", "client_b"),
    /zakończona/
  );
  assert.equal(manager.playerRooms.has("socket_b_2"), false);
  assert.equal(manager.socketPlayers.has("socket_b_2"), false);
});

test("guest can leave a lobby room and is removed from the room", () => {
  const io = new MockIo();
  const manager = new RoomManager(io);
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");

  manager.leaveRoom("socket_b_1");

  assert.deepEqual(room.players.map(player => player.id), ["client_a"]);
  assert.equal(manager.playerRooms.has("socket_b_1"), false);
  assert.equal(manager.socketPlayers.has("socket_b_1"), false);
  assert.equal(io.emitted.at(-1).event, EVENTS.ROOM_STATE_UPDATE);
  assert.deepEqual(io.emitted.at(-1).payload.players.map(player => player.id), ["client_a"]);
});

test("guest can abandon an active two-player game and does not keep a reconnect session", () => {
  const { manager, room } = startTwoPlayerRoom();

  manager.leaveRoom("socket_b_1");

  assert.deepEqual(room.players.map(player => player.id), ["client_a"]);
  assert.equal(manager.playerRooms.has("socket_b_1"), false);
  assert.equal(manager.socketPlayers.has("socket_b_1"), false);
  assert.equal(room.gameState.gameOver, true);
  assert.equal(room.gameState.winnerId, "client_a");
  assert.equal(room.gameState.turnEvents.at(-2).type, "player_left");
  assert.equal(room.gameState.moveHistory.at(-1).type, "player_left");
  assert.throws(
    () => manager.reconnectPlayer(room.id, "socket_b_2", "client_b"),
    /zakończona/
  );
});

test("manual pause blocks game actions until the pausing player resumes", () => {
  const { io, manager, room } = startTwoPlayerRoom();

  manager.handlePauseGame("socket_b_1");

  assert.equal(room.gameState.paused, true);
  assert.equal(room.gameState.pauseReason, "manual");
  assert.equal(room.gameState.pausedPlayerId, "client_b");
  assert.equal(room.gameState.turnEvents.at(-1).type, "game_paused_manual");
  assert.equal(room.gameState.moveHistory.at(-1).type, "game_paused");

  const versionAfterPause = room.gameState.stateVersion;
  manager.handleDrawCard("socket_a_1");

  assert.equal(room.gameState.stateVersion, versionAfterPause);
  assert.equal(room.gameState.paused, true);
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /⏸/);

  manager.handleResumeGame("socket_b_1");

  assert.equal(room.gameState.paused, false);
  assert.equal(room.gameState.pauseReason, null);
  assert.equal(room.gameState.pausedPlayerId, null);
  assert.equal(room.gameState.turnEvents.at(-1).type, "game_resumed_manual");
  assert.equal(room.gameState.moveHistory.at(-1).type, "game_resumed");
});

test("only pause owner or host can resume a manual pause", () => {
  const { io, manager, room } = startTwoPlayerRoom();

  manager.handlePauseGame("socket_a_1");
  manager.handleResumeGame("socket_b_1");

  assert.equal(room.gameState.paused, true);
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /host/);

  manager.handleResumeGame("socket_a_1");

  assert.equal(room.gameState.paused, false);
});

test("host override of another player's manual pause requires double confirmation", () => {
  const { io, manager, room } = startTwoPlayerRoom();

  manager.handlePauseGame("socket_b_1");
  manager.handleResumeGame("socket_a_1");

  assert.equal(room.gameState.paused, true);
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /dwóch potwierdzeń/);
  assert.deepEqual(room.adminLog, []);
});

test("confirmed host override resumes manual pause and writes admin log", () => {
  const { io, manager, room } = startTwoPlayerRoom();

  manager.handlePauseGame("socket_b_1");
  manager.handleResumeGame("socket_a_1", {
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.equal(room.gameState.paused, false);
  assert.equal(room.gameState.moveHistory.at(-1).type, "game_resumed");
  assert.equal(room.gameState.moveHistory.at(-1).details.forcedByHost, true);
  assert.equal(room.adminLog.length, 1);
  assert.equal(room.adminLog[0].type, "host_forced_resume");
  assert.equal(room.adminLog[0].actorPlayerId, "client_a");
  assert.equal(room.adminLog[0].targetPlayerId, "client_b");
  assert.equal(room.adminLog[0].stateVersion, room.gameState.stateVersion);

  const publicRoomUpdate = io.emitted
    .filter(entry => entry.event === EVENTS.ROOM_STATE_UPDATE)
    .at(-1);
  assert.equal(publicRoomUpdate.payload.adminLog, undefined);
});

test("host can transfer host role to an online player", () => {
  const { manager, room } = startTwoPlayerRoom();

  manager.handleTransferHost("socket_a_1", { targetPlayerId: "client_b" });

  assert.equal(room.hostId, "client_b");
  assert.equal(room.adminLog.at(-1).type, "host_transferred");
  assert.equal(room.adminLog.at(-1).actorPlayerId, "client_a");
  assert.equal(room.adminLog.at(-1).targetPlayerId, "client_b");
});

test("removing a player requires double confirmation", () => {
  const io = new MockIo();
  const manager = new RoomManager(io);
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");

  manager.handleRemovePlayer("socket_a_1", { targetPlayerId: "client_b" });

  assert.equal(room.players.length, 2);
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /dwóch potwierdzeń/);
  assert.deepEqual(room.adminLog, []);
});

test("host can remove a lobby player after double confirmation", () => {
  const io = new MockIo();
  const manager = new RoomManager(io);
  const room = manager.createRoom("socket_a_1", "Ala", "client_a");
  manager.joinRoom(room.id, "socket_b_1", "Bartek", "client_b");

  manager.handleRemovePlayer("socket_a_1", {
    targetPlayerId: "client_b",
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.deepEqual(room.players.map(p => p.id), ["client_a"]);
  assert.equal(manager.playerRooms.has("socket_b_1"), false);
  assert.equal(room.adminLog.at(-1).type, "host_removed_player");
  assert.equal(room.adminLog.at(-1).stateVersion, null);
});

test("host can remove an active player and finish a two-player game", () => {
  const { manager, room } = startTwoPlayerRoom();

  manager.handleRemovePlayer("socket_a_1", {
    targetPlayerId: "client_b",
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.deepEqual(room.players.map(p => p.id), ["client_a"]);
  assert.equal(room.gameState.hands.client_b, undefined);
  assert.equal(room.gameState.gameOver, true);
  assert.equal(room.gameState.winnerId, "client_a");
  assert.equal(room.gameState.moveHistory.at(-1).type, "host_removed_player");
  assert.equal(room.adminLog.at(-1).type, "host_removed_player");
  assert.equal(room.adminLog.at(-1).stateVersion, room.gameState.stateVersion);
});

test("host manual game end requires double confirmation and writes admin log", () => {
  const { io, manager, room } = startTwoPlayerRoom();

  manager.handleHostEndGame("socket_a_1", {});

  assert.equal(room.gameState.gameOver, false);
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /dwóch potwierdzeń/);

  manager.handleHostEndGame("socket_a_1", {
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.equal(room.gameState.gameOver, true);
  assert.equal(room.gameState.winnerId, null);
  assert.equal(room.gameState.endReason, "host_admin");
  assert.equal(room.gameState.moveHistory.at(-1).type, "host_ended_game");
  assert.equal(room.adminLog.at(-1).type, "host_ended_game");
});

test("host can skip an offline current player after double confirmation", () => {
  const { io, manager, room } = startTwoPlayerRoom();
  room.gameState.currentPlayerIndex = room.gameState.turnOrder.indexOf("client_b");
  room.gameState.topCard = card("top_7_hearts", "7", "hearts");
  room.gameState.hands.client_a = [card("client_a_7_clubs", "7", "clubs")];
  room.gameState.hands.client_b = [card("client_b_8_spades", "8", "spades")];
  room.gameState.activeEffect = null;

  manager.handleDisconnect("socket_b_1");
  assert.equal(room.gameState.paused, true);
  assert.equal(room.gameState.pausedPlayerId, "client_b");

  manager.handleHostSkipOfflineTurn("socket_a_1", { targetPlayerId: "client_b" });

  assert.equal(room.gameState.paused, true);
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /dwóch potwierdzeń/);

  manager.handleHostSkipOfflineTurn("socket_a_1", {
    targetPlayerId: "client_b",
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.equal(room.gameState.paused, false);
  assert.equal(room.gameState.turnOrder[room.gameState.currentPlayerIndex], "client_a");
  assert.equal(room.gameState.moveHistory.at(-1).type, "host_skipped_offline");
  assert.equal(room.adminLog.at(-1).type, "host_skipped_offline");
});

test("disconnect pauses when an offline non-current player is the active effect target", () => {
  const effects = [
    {
      label: "draw_penalty",
      activeEffect: {
        type: EFFECT_TYPES.DRAW_PENALTY,
        amount: 3,
        battleSuit: "hearts",
        targetPlayerId: "client_b"
      }
    },
    {
      label: "suit_request",
      activeEffect: {
        type: EFFECT_TYPES.SUIT_REQUEST,
        requestedSuit: "spades",
        targetPlayerId: "client_b"
      }
    },
    {
      label: "rank_request",
      activeEffect: {
        type: EFFECT_TYPES.RANK_REQUEST,
        requestedRank: "10",
        targetPlayerId: "client_b"
      }
    }
  ];

  for (const { label, activeEffect } of effects) {
    const { manager, room } = startTwoPlayerRoom();
    const state = room.gameState;
    state.turnOrder = ["client_a", "client_b"];
    state.currentPlayerIndex = state.turnOrder.indexOf("client_a");
    state.activeEffect = activeEffect;
    state.paused = false;
    state.pauseReason = null;
    state.pausedPlayerId = null;
    state.pausedAt = null;

    manager.handleDisconnect("socket_b_1");

    assert.equal(state.turnOrder[state.currentPlayerIndex], "client_a", label);
    assert.equal(state.paused, true, label);
    assert.equal(state.pauseReason, "disconnect", label);
    assert.equal(state.pausedPlayerId, "client_b", label);
    assert.ok(state.pausedAt, label);
    assert.equal(state.activeEffect.type, activeEffect.type, label);
    assert.equal(state.turnEvents.at(-1).type, "game_paused_disconnect", label);
    assert.equal(state.turnEvents.at(-1).playerId, "client_b", label);
    assert.equal(state.moveHistory.at(-1).type, "player_disconnected", label);
    assert.equal(state.moveHistory.at(-1).playerId, "client_b", label);

    const auditEntry = state.auditLog.at(-1);
    assert.equal(auditEntry.category, "connection_log", label);
    assert.equal(auditEntry.type, "player_disconnected", label);
    assert.equal(auditEntry.playerId, "client_b", label);
    assert.equal(auditEntry.details.wasCurrentPlayer, false, label);
    assert.equal(auditEntry.details.mustResolveEffect, true, label);
  }
});

test("host can force an offline player to accept a draw penalty", () => {
  const { manager, room } = startTwoPlayerRoom();
  room.gameState.currentPlayerIndex = room.gameState.turnOrder.indexOf("client_b");
  room.gameState.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "hearts",
    targetPlayerId: "client_b"
  };
  room.gameState.drawPile = [
    { cardInstanceId: "draw_1", rank: "5", suit: "clubs", deckIndex: 0 },
    { cardInstanceId: "draw_2", rank: "6", suit: "clubs", deckIndex: 0 },
    { cardInstanceId: "draw_3", rank: "7", suit: "clubs", deckIndex: 0 }
  ];
  const beforeHand = room.gameState.hands.client_b.length;

  manager.handleDisconnect("socket_b_1");
  manager.handleHostForceAcceptEffect("socket_a_1", {
    targetPlayerId: "client_b",
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.equal(room.gameState.paused, false);
  assert.equal(room.gameState.activeEffect, null);
  assert.equal(room.gameState.hands.client_b.length, beforeHand + 3);
  assert.equal(room.gameState.turnOrder[room.gameState.currentPlayerIndex], "client_a");
  assert.equal(room.gameState.moveHistory.at(-1).type, "host_forced_effect");
  assert.deepEqual(room.gameState.moveHistory.at(-1).details, {
    targetPlayerId: "client_b",
    effectType: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3
  });
  assert.equal(room.adminLog.at(-1).type, "host_forced_effect");
});

test("host forced active-effect resolution requires double confirmation", () => {
  const { io, manager, room } = startTwoPlayerRoom();
  room.gameState.currentPlayerIndex = room.gameState.turnOrder.indexOf("client_b");
  room.gameState.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "client_b"
  };

  manager.handleDisconnect("socket_b_1");
  manager.handleHostForceAcceptEffect("socket_a_1", {
    targetPlayerId: "client_b"
  });

  assert.equal(room.gameState.paused, true);
  assert.equal(room.gameState.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(io.emitted.at(-1).event, EVENTS.ERROR);
  assert.match(io.emitted.at(-1).payload.message, /dwóch potwierdzeń/);
  assert.deepEqual(room.adminLog, []);
});

test("host can force an offline player to accept suit and rank requests", () => {
  const suitCase = startTwoPlayerRoom();
  suitCase.room.gameState.currentPlayerIndex = suitCase.room.gameState.turnOrder.indexOf("client_b");
  suitCase.room.gameState.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    targetPlayerId: "client_b"
  };
  suitCase.room.gameState.drawPile = [card("suit_request_draw", "8", "spades")];
  const suitHandBefore = suitCase.room.gameState.hands.client_b.length;

  suitCase.manager.handleDisconnect("socket_b_1");
  suitCase.manager.handleHostForceAcceptEffect("socket_a_1", {
    targetPlayerId: "client_b",
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.equal(suitCase.room.gameState.paused, false);
  assert.equal(suitCase.room.gameState.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(suitCase.room.gameState.activeEffect.requestedSuit, "spades");
  assert.equal(suitCase.room.gameState.activeEffect.targetPlayerId, "client_a");
  assert.equal(suitCase.room.gameState.hands.client_b.length, suitHandBefore + 1);
  assert.equal(suitCase.room.gameState.turnOrder[suitCase.room.gameState.currentPlayerIndex], "client_a");
  assert.deepEqual(suitCase.room.gameState.moveHistory.at(-1).details, {
    targetPlayerId: "client_b",
    effectType: EFFECT_TYPES.SUIT_REQUEST,
    amount: 1
  });
  assert.equal(suitCase.room.adminLog.at(-1).type, "host_forced_effect");

  const rankCase = startTwoPlayerRoom();
  rankCase.room.gameState.currentPlayerIndex = rankCase.room.gameState.turnOrder.indexOf("client_b");
  rankCase.room.gameState.activeEffect = {
    type: EFFECT_TYPES.RANK_REQUEST,
    requestedRank: "10",
    targetPlayerId: "client_b"
  };
  rankCase.room.gameState.drawPile = [card("rank_request_draw", "10", "clubs")];
  const rankHandBefore = rankCase.room.gameState.hands.client_b.length;

  rankCase.manager.handleDisconnect("socket_b_1");
  rankCase.manager.handleHostForceAcceptEffect("socket_a_1", {
    targetPlayerId: "client_b",
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.equal(rankCase.room.gameState.paused, false);
  assert.equal(rankCase.room.gameState.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(rankCase.room.gameState.activeEffect.requestedRank, "10");
  assert.equal(rankCase.room.gameState.activeEffect.targetPlayerId, "client_a");
  assert.equal(rankCase.room.gameState.hands.client_b.length, rankHandBefore + 1);
  assert.equal(rankCase.room.gameState.turnOrder[rankCase.room.gameState.currentPlayerIndex], "client_a");
  assert.deepEqual(rankCase.room.gameState.moveHistory.at(-1).details, {
    targetPlayerId: "client_b",
    effectType: EFFECT_TYPES.RANK_REQUEST,
    amount: 1
  });
  assert.equal(rankCase.room.adminLog.at(-1).type, "host_forced_effect");
});

test("host forced offline pause resolution re-pauses if the next current player is offline", () => {
  const { manager, room } = startThreePlayerRoom();
  const state = room.gameState;
  state.turnOrder = ["client_a", "client_b", "client_c"];
  state.currentPlayerIndex = state.turnOrder.indexOf("client_b");
  state.activeEffect = {
    type: EFFECT_TYPES.SKIP_TURN,
    amount: 2,
    targetPlayerId: "client_b"
  };
  state.skipTurns = {};
  state.paused = false;
  state.pauseReason = null;
  state.pausedPlayerId = null;
  state.pausedAt = null;
  state.topCard = card("top_4_hearts", "4", "hearts");
  state.hands.client_a = [card("client_a_7_clubs", "7", "clubs")];
  state.hands.client_b = [card("client_b_9_spades", "9", "spades")];
  state.hands.client_c = [card("client_c_10_spades", "10", "spades")];

  manager.handleDisconnect("socket_c_1");
  assert.equal(state.paused, false);
  manager.handleDisconnect("socket_b_1");
  assert.equal(state.paused, true);
  assert.equal(state.pausedPlayerId, "client_b");

  manager.handleHostForceAcceptEffect("socket_a_1", {
    targetPlayerId: "client_b",
    hostOverrideConfirmed: true,
    hostOverrideRiskAccepted: true
  });

  assert.equal(state.activeEffect, null);
  assert.equal(state.skipTurns.client_b, 1);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "client_c");
  assert.equal(state.paused, true);
  assert.equal(state.pauseReason, "disconnect");
  assert.equal(state.pausedPlayerId, "client_c");
  assert.equal(state.moveHistory.at(-1).type, "game_paused_disconnect");
  assert.equal(state.moveHistory.at(-2).type, "host_forced_effect");
  assert.deepEqual(state.moveHistory.at(-2).details, {
    targetPlayerId: "client_b",
    effectType: EFFECT_TYPES.SKIP_TURN,
    amount: 2
  });
  assert.equal(room.adminLog.at(-1).type, "host_forced_effect");
});
