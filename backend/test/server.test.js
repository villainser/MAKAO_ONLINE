import assert from "node:assert/strict";
import test from "node:test";
import { EVENTS } from "../shared/constants.js";
import {
  createSafeResponder,
  normalizeSocketPayload,
  registerSocketHandlers,
  shutdownServer
} from "../server.js";

class MockSocket {
  constructor(id = "socket_test") {
    this.id = id;
    this.handlers = new Map();
    this.joined = [];
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  join(roomId) {
    this.joined.push(roomId);
  }

  trigger(event, ...args) {
    const handler = this.handlers.get(event);
    assert.equal(typeof handler, "function", `missing handler for ${event}`);
    return handler(...args);
  }
}

class MockIo {
  on(event, handler) {
    assert.equal(event, "connection");
    this.connectionHandler = handler;
  }

  connect(socket) {
    this.connectionHandler(socket);
  }
}

function createMockRoomManager() {
  const calls = [];
  const room = { id: "ROOM01", players: [] };
  const manager = {
    calls,
    createRoom: (...args) => (calls.push(["createRoom", ...args]), room),
    joinRoom: (...args) => (calls.push(["joinRoom", ...args]), room),
    leaveRoom: (...args) => (calls.push(["leaveRoom", ...args]), room),
    reconnectPlayer: (...args) => (calls.push(["reconnectPlayer", ...args]), room),
    getPublicRoomInfo: () => ({ id: room.id, players: [] }),
    takeResumeToken: () => null,
    sendError: (...args) => calls.push(["sendError", ...args])
  };

  const commandMethods = [
    "toggleReady",
    "updateSettings",
    "handleRemovePlayer",
    "handleTransferHost",
    "handleReturnToLobby",
    "startGame",
    "handlePlayCards",
    "handleDrawCard",
    "handleAcceptPenalty",
    "handleAcceptSkip",
    "handleDeclareMakao",
    "handleCatchMakao",
    "handlePauseGame",
    "handleResumeGame",
    "handleHostEndGame",
    "handleHostSkipOfflineTurn",
    "handleHostForceAcceptEffect",
    "handlePassTurn",
    "handleDisconnect"
  ];
  for (const method of commandMethods) {
    manager[method] = (...args) => calls.push([method, ...args]);
  }
  manager.handleReliableGameAction = (...args) => {
    calls.push(["handleReliableGameAction", ...args.slice(0, 2)]);
    args[2]?.({ success: false, code: "TEST" });
  };
  manager.handleDebugSeedGameState = (...args) => {
    calls.push(["handleDebugSeedGameState", ...args.slice(0, 2)]);
    args[2]?.({ success: true });
  };
  return manager;
}

test("socket boundary normalizes payloads and responders", () => {
  assert.deepEqual(normalizeSocketPayload(null), {});
  assert.deepEqual(normalizeSocketPayload(undefined), {});
  assert.deepEqual(normalizeSocketPayload("bad"), {});
  assert.deepEqual(normalizeSocketPayload(["bad"]), {});
  assert.deepEqual(normalizeSocketPayload({ ok: true }), { ok: true });
  assert.doesNotThrow(() => createSafeResponder(undefined)({ success: true }));
  assert.doesNotThrow(() => createSafeResponder("not a callback")({ success: true }));
  const responses = [];
  const respondOnce = createSafeResponder(response => responses.push(response));
  respondOnce({ success: true });
  respondOnce({ success: false });
  assert.deepEqual(responses, [{ success: true }]);
});

test("every public Socket.IO handler tolerates missing ACK and non-object payloads", () => {
  const io = new MockIo();
  const manager = createMockRoomManager();
  const socket = new MockSocket();
  registerSocketHandlers(io, manager, { enableTestHooks: true });
  io.connect(socket);

  const requestEvents = [
    EVENTS.CREATE_ROOM,
    EVENTS.JOIN_ROOM,
    EVENTS.LEAVE_ROOM,
    EVENTS.RECONNECT_SESSION,
    EVENTS.DEBUG_SEED_GAME_STATE
  ];
  const commandEvents = [
    EVENTS.TOGGLE_READY,
    EVENTS.UPDATE_SETTINGS,
    EVENTS.REMOVE_PLAYER,
    EVENTS.TRANSFER_HOST,
    EVENTS.RETURN_TO_LOBBY,
    EVENTS.START_GAME,
    EVENTS.GAME_ACTION,
    EVENTS.PLAY_CARDS,
    EVENTS.DRAW_CARD,
    EVENTS.ACCEPT_PENALTY,
    EVENTS.ACCEPT_SKIP,
    EVENTS.DECLARE_MAKAO,
    EVENTS.CATCH_MAKAO,
    EVENTS.PAUSE_GAME,
    EVENTS.RESUME_GAME,
    EVENTS.HOST_END_GAME,
    EVENTS.HOST_SKIP_OFFLINE_TURN,
    EVENTS.HOST_FORCE_ACCEPT_EFFECT,
    EVENTS.PASS_TURN
  ];

  for (const event of [...requestEvents, ...commandEvents]) {
    assert.doesNotThrow(() => socket.trigger(event));
    assert.doesNotThrow(() => socket.trigger(event, null));
    assert.doesNotThrow(() => socket.trigger(event, "bad payload", "bad ack"));
    assert.doesNotThrow(() => socket.trigger(event, ["bad payload"], 42));
  }
  assert.doesNotThrow(() => socket.trigger("disconnect", "transport close"));

  const playCalls = manager.calls.filter(([name]) => name === "handlePlayCards");
  assert.ok(playCalls.length > 0);
  assert.equal(playCalls.every(([, , payload]) => payload && typeof payload === "object" && !Array.isArray(payload)), true);
});

test("production socket surface exposes gameplay mutations only through reliable GAME_ACTION", () => {
  const io = new MockIo();
  const manager = createMockRoomManager();
  const socket = new MockSocket();
  registerSocketHandlers(io, manager);
  io.connect(socket);

  assert.equal(typeof socket.handlers.get(EVENTS.GAME_ACTION), "function");
  for (const legacyEvent of [
    EVENTS.PLAY_CARDS,
    EVENTS.DRAW_CARD,
    EVENTS.ACCEPT_PENALTY,
    EVENTS.ACCEPT_SKIP,
    EVENTS.DECLARE_MAKAO,
    EVENTS.CATCH_MAKAO,
    EVENTS.PAUSE_GAME,
    EVENTS.RESUME_GAME,
    EVENTS.PASS_TURN
  ]) {
    assert.equal(socket.handlers.has(legacyEvent), false, `${legacyEvent} must be opt-in`);
  }
});

test("test hooks explicitly retain legacy gameplay events for compatibility harnesses", () => {
  const io = new MockIo();
  const manager = createMockRoomManager();
  const socket = new MockSocket();
  registerSocketHandlers(io, manager, { enableTestHooks: true });
  io.connect(socket);

  assert.equal(typeof socket.handlers.get(EVENTS.PLAY_CARDS), "function");
  assert.equal(typeof socket.handlers.get(EVENTS.DRAW_CARD), "function");
  assert.equal(typeof socket.handlers.get(EVENTS.CATCH_MAKAO), "function");
});

test("request handler converts thrown errors to a safe optional ACK", () => {
  const io = new MockIo();
  const manager = createMockRoomManager();
  manager.createRoom = () => {
    throw new Error("controlled failure");
  };
  const socket = new MockSocket();
  registerSocketHandlers(io, manager);
  io.connect(socket);

  assert.doesNotThrow(() => socket.trigger(EVENTS.CREATE_ROOM));
  assert.doesNotThrow(() => socket.trigger(EVENTS.CREATE_ROOM, null, "not a callback"));

  let ack;
  socket.trigger(EVENTS.CREATE_ROOM, null, response => {
    ack = response;
  });
  assert.deepEqual(ack, { success: false, error: "controlled failure" });
});

test("command boundary catches asynchronous handler rejection", async () => {
  const io = new MockIo();
  const manager = createMockRoomManager();
  manager.handleReliableGameAction = async () => {
    throw new Error("async controlled failure");
  };
  const socket = new MockSocket();
  registerSocketHandlers(io, manager);
  io.connect(socket);

  let ack;
  socket.trigger(EVENTS.GAME_ACTION, {}, response => {
    ack = response;
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(ack, { success: false, error: "async controlled failure" });
});

test("graceful shutdown captures disconnect mutations before the final persistence flush", async () => {
  const order = [];
  const socketServer = {
    close(callback) {
      order.push("socket_close_started");
      queueMicrotask(() => {
        order.push("disconnect_mutation_finished");
        callback();
      });
    }
  };
  const httpServer = {
    listening: true,
    close(callback) {
      order.push("http_closed");
      callback();
    }
  };
  const manager = {
    async close() {
      order.push("persistence_flushed");
    }
  };

  await shutdownServer({ socketServer, httpServer, manager });

  assert.deepEqual(order, [
    "socket_close_started",
    "disconnect_mutation_finished",
    "http_closed",
    "persistence_flushed"
  ]);
});

test("token-capable create returns the token only at the private ACK top level", () => {
  const io = new MockIo();
  const manager = createMockRoomManager();
  manager.takeResumeToken = () => "private_resume_token";
  const socket = new MockSocket();
  registerSocketHandlers(io, manager);
  io.connect(socket);

  let ack;
  socket.trigger(EVENTS.CREATE_ROOM, {
    playerName: "Ala",
    clientId: "client_a",
    supportsResumeToken: true
  }, response => {
    ack = response;
  });

  assert.equal(ack.success, true);
  assert.equal(ack.resumeToken, "private_resume_token");
  assert.equal(JSON.stringify(ack.room).includes("private_resume_token"), false);
  const createCall = manager.calls.find(([name]) => name === "createRoom");
  assert.equal(createCall.at(-1).supportsResumeToken, true);
});
