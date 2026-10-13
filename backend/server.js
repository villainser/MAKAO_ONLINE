import { Server } from "socket.io";
import http from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";
import { RoomManager } from "./RoomManager.js";
import { EVENTS } from "./shared/constants.js";

export function normalizeSocketPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function createSafeResponder(callback) {
  if (typeof callback !== "function") return () => {};
  let responded = false;
  return (response) => {
    if (responded) return;
    responded = true;
    try {
      callback(response);
    } catch (err) {
      console.error("Socket ACK callback failed:", err);
    }
  };
}

function getSocketInvocation(rawData, rawCallback) {
  const callback = typeof rawCallback === "function"
    ? rawCallback
    : (typeof rawData === "function" ? rawData : null);
  return {
    data: normalizeSocketPayload(rawData),
    respond: createSafeResponder(callback),
    hasResponder: Boolean(callback)
  };
}

export function registerSocketHandlers(io, roomManager, options = {}) {
  const enableTestHooks = options.enableTestHooks === true;
  const enableLegacyGameActions = options.enableLegacyGameActions === true || enableTestHooks;

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    const invokeSafely = (handler, onError) => {
      try {
        const result = handler();
        if (result && typeof result.then === "function") {
          result.catch(onError);
        }
      } catch (err) {
        onError(err);
      }
    };

    const onRequest = (event, handler) => {
      socket.on(event, (rawData, rawCallback) => {
        const { data, respond } = getSocketInvocation(rawData, rawCallback);
        invokeSafely(() => handler(data, respond), (err) => {
          respond({
            success: false,
            error: err?.message || "Request failed.",
            ...(err?.code ? { code: err.code } : {})
          });
        });
      });
    };

    const onCommand = (event, handler) => {
      socket.on(event, (rawData, rawCallback) => {
        const { data, respond, hasResponder } = getSocketInvocation(rawData, rawCallback);
        invokeSafely(() => handler(data, respond), (err) => {
          const error = err?.message || "Request failed.";
          if (hasResponder) {
            respond({ success: false, error, ...(err?.code ? { code: err.code } : {}) });
          } else {
            roomManager.sendError?.(socket.id, error);
          }
        });
      });
    };

    onRequest(EVENTS.CREATE_ROOM, (data, respond) => {
      const room = roomManager.createRoom(
        socket.id,
        data.playerName || "Player 1",
        data.clientId,
        {
          roomName: data.roomName,
          settings: data.settings,
          supportsResumeToken: data.supportsResumeToken === true
        }
      );
      socket.join(room.id);
      const resumeToken = roomManager.takeResumeToken?.(socket.id) || null;
      respond({
        success: true,
        room: roomManager.getPublicRoomInfo(room),
        ...(resumeToken ? { resumeToken } : {})
      });
    });

    onRequest(EVENTS.JOIN_ROOM, (data, respond) => {
      const room = roomManager.joinRoom(data.roomId, socket.id, data.playerName, data.clientId, {
        supportsResumeToken: data.supportsResumeToken === true,
        resumeToken: data.resumeToken
      });
      socket.join(room.id);
      const resumeToken = roomManager.takeResumeToken?.(socket.id) || null;
      respond({
        success: true,
        room: roomManager.getPublicRoomInfo(room),
        ...(resumeToken ? { resumeToken } : {})
      });
    });

    onRequest(EVENTS.LEAVE_ROOM, (data, respond) => {
      const room = roomManager.leaveRoom(socket.id, data);
      respond({ success: true, room: room ? roomManager.getPublicRoomInfo(room) : null });
    });

    onRequest(EVENTS.RECONNECT_SESSION, (data, respond) => {
      const room = roomManager.reconnectPlayer(data.roomId, socket.id, data.clientId, {
        supportsResumeToken: data.supportsResumeToken === true,
        resumeToken: data.resumeToken
      });
      socket.join(room.id);
      const resumeToken = roomManager.takeResumeToken?.(socket.id) || null;
      respond({
        success: true,
        room: roomManager.getPublicRoomInfo(room),
        ...(resumeToken ? { resumeToken } : {})
      });
    });

    onCommand(EVENTS.TOGGLE_READY, () => roomManager.toggleReady(socket.id));
    onCommand(EVENTS.UPDATE_SETTINGS, data => roomManager.updateSettings(socket.id, data));
    onCommand(EVENTS.REMOVE_PLAYER, data => roomManager.handleRemovePlayer(socket.id, data));
    onCommand(EVENTS.TRANSFER_HOST, data => roomManager.handleTransferHost(socket.id, data));
    onCommand(EVENTS.RETURN_TO_LOBBY, () => roomManager.handleReturnToLobby(socket.id));
    onCommand(EVENTS.START_GAME, () => roomManager.startGame(socket.id));
    onCommand(
      EVENTS.GAME_ACTION,
      (data, respond) => roomManager.handleReliableGameAction(socket.id, data, respond)
    );
    onCommand(EVENTS.HOST_END_GAME, data => roomManager.handleHostEndGame(socket.id, data));
    onCommand(EVENTS.HOST_SKIP_OFFLINE_TURN, data => roomManager.handleHostSkipOfflineTurn(socket.id, data));
    onCommand(EVENTS.HOST_FORCE_ACCEPT_EFFECT, data => roomManager.handleHostForceAcceptEffect(socket.id, data));

    // Legacy gameplay events remain available only to explicitly enabled test/compatibility harnesses.
    // Production clients must use GAME_ACTION so mutations receive an actionId, versioned ACK and deduplication.
    if (enableLegacyGameActions) {
      onCommand(EVENTS.PLAY_CARDS, data => roomManager.handlePlayCards(socket.id, data));
      onCommand(EVENTS.DRAW_CARD, data => roomManager.handleDrawCard(socket.id, data));
      onCommand(EVENTS.ACCEPT_PENALTY, data => roomManager.handleAcceptPenalty(socket.id, data));
      onCommand(EVENTS.ACCEPT_SKIP, data => roomManager.handleAcceptSkip(socket.id, data));
      onCommand(EVENTS.DECLARE_MAKAO, data => roomManager.handleDeclareMakao(socket.id, data));
      onCommand(EVENTS.CATCH_MAKAO, data => roomManager.handleCatchMakao(socket.id, data));
      onCommand(EVENTS.PAUSE_GAME, data => roomManager.handlePauseGame(socket.id, data));
      onCommand(EVENTS.RESUME_GAME, data => roomManager.handleResumeGame(socket.id, data));
      onCommand(EVENTS.PASS_TURN, data => roomManager.handlePassTurn(socket.id, data));
    }

    if (enableTestHooks) {
      onRequest(EVENTS.DEBUG_SEED_GAME_STATE, (data, respond) => {
        roomManager.handleDebugSeedGameState(socket.id, data, respond);
      });
    }

    socket.on("disconnect", () => {
      try {
        console.log(`User disconnected: ${socket.id}`);
        roomManager.handleDisconnect(socket.id);
      } catch (err) {
        console.error(`Disconnect handler failed for ${socket.id}:`, err);
      }
    });
  });
}

export const app = express();
app.disable("x-powered-by");
app.use(cors());

export const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

export const roomManager = new RoomManager(io, {
  stateFile: process.env.MAKAO_STATE_FILE || null
});

registerSocketHandlers(io, roomManager, {
  enableTestHooks: process.env.MAKAO_ENABLE_TEST_HOOKS === "1",
  enableLegacyGameActions: process.env.MAKAO_ENABLE_LEGACY_GAME_ACTIONS === "1"
});

export function startServer(port = process.env.PORT || 3001) {
  if (server.listening) return server;
  return server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

function closeCallbackTarget(target) {
  if (!target || typeof target.close !== "function") return Promise.resolve();
  return new Promise((resolveClose, rejectClose) => {
    try {
      target.close((error) => {
        if (error instanceof Error) {
          rejectClose(error);
        } else {
          resolveClose();
        }
      });
    } catch (err) {
      rejectClose(err);
    }
  });
}

export async function shutdownServer({
  socketServer = io,
  httpServer = server,
  manager = roomManager
} = {}) {
  await closeCallbackTarget(socketServer);
  if (httpServer?.listening) {
    await closeCallbackTarget(httpServer);
  }
  await manager?.close?.();
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  startServer();
  let signalShutdown = null;
  const handleShutdownSignal = (signal) => {
    if (signalShutdown) return;
    console.log(`Received ${signal}; flushing room state before shutdown.`);
    signalShutdown = shutdownServer()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((err) => {
        console.error("Graceful shutdown failed:", err);
        process.exitCode = 1;
      });
  };
  process.on("SIGINT", handleShutdownSignal);
  process.on("SIGTERM", handleShutdownSignal);
}
