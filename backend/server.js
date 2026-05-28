import { Server } from "socket.io";
import http from "http";
import express from "express";
import cors from "cors";
import { RoomManager } from "./RoomManager.js";
import { EVENTS } from "./shared/constants.js";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager(io);

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on(EVENTS.CREATE_ROOM, (data, callback) => {
    try {
      const room = roomManager.createRoom(socket.id, data?.playerName || "Player 1", data?.clientId, {
        roomName: data?.roomName,
        settings: data?.settings
      });
      socket.join(room.id);
      callback({ success: true, room: roomManager.getPublicRoomInfo(room) });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on(EVENTS.JOIN_ROOM, (data, callback) => {
    try {
      const room = roomManager.joinRoom(data.roomId, socket.id, data.playerName, data.clientId);
      socket.join(room.id);
      callback({ success: true, room: roomManager.getPublicRoomInfo(room) });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on(EVENTS.LEAVE_ROOM, (_data, callback) => {
    try {
      const room = roomManager.leaveRoom(socket.id);
      callback?.({ success: true, room: room ? roomManager.getPublicRoomInfo(room) : null });
    } catch (err) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on(EVENTS.RECONNECT_SESSION, (data, callback) => {
    try {
      const room = roomManager.reconnectPlayer(data.roomId, socket.id, data.clientId);
      socket.join(room.id);
      callback({ success: true, room: roomManager.getPublicRoomInfo(room) });
    } catch (err) {
      callback({ success: false, error: err.message });
    }
  });

  socket.on(EVENTS.TOGGLE_READY, () => {
    roomManager.toggleReady(socket.id);
  });

  socket.on(EVENTS.UPDATE_SETTINGS, (settings) => {
    roomManager.updateSettings(socket.id, settings);
  });

  socket.on(EVENTS.REMOVE_PLAYER, (data) => {
    roomManager.handleRemovePlayer(socket.id, data);
  });

  socket.on(EVENTS.TRANSFER_HOST, (data) => {
    roomManager.handleTransferHost(socket.id, data);
  });

  socket.on(EVENTS.RETURN_TO_LOBBY, () => {
    roomManager.handleReturnToLobby(socket.id);
  });

  socket.on(EVENTS.START_GAME, () => {
    roomManager.startGame(socket.id);
  });

  socket.on(EVENTS.PLAY_CARDS, (data) => {
    roomManager.handlePlayCards(socket.id, data);
  });

  socket.on(EVENTS.DRAW_CARD, () => {
    roomManager.handleDrawCard(socket.id);
  });

  socket.on(EVENTS.ACCEPT_PENALTY, () => {
    roomManager.handleAcceptPenalty(socket.id);
  });

  socket.on(EVENTS.ACCEPT_SKIP, () => {
    roomManager.handleAcceptSkip(socket.id);
  });

  socket.on(EVENTS.DECLARE_MAKAO, (data) => {
    roomManager.handleDeclareMakao(socket.id, data);
  });

  socket.on(EVENTS.CATCH_MAKAO, (data) => {
    roomManager.handleCatchMakao(socket.id, data);
  });

  socket.on(EVENTS.PAUSE_GAME, () => {
    roomManager.handlePauseGame(socket.id);
  });

  socket.on(EVENTS.RESUME_GAME, (data) => {
    roomManager.handleResumeGame(socket.id, data);
  });

  socket.on(EVENTS.HOST_END_GAME, (data) => {
    roomManager.handleHostEndGame(socket.id, data);
  });

  socket.on(EVENTS.HOST_SKIP_OFFLINE_TURN, (data) => {
    roomManager.handleHostSkipOfflineTurn(socket.id, data);
  });

  socket.on(EVENTS.HOST_FORCE_ACCEPT_EFFECT, (data) => {
    roomManager.handleHostForceAcceptEffect(socket.id, data);
  });

  socket.on(EVENTS.PASS_TURN, () => {
    roomManager.handlePassTurn(socket.id);
  });

  if (process.env.MAKAO_ENABLE_TEST_HOOKS === "1") {
    socket.on(EVENTS.DEBUG_SEED_GAME_STATE, (data, callback) => {
      roomManager.handleDebugSeedGameState(socket.id, data, callback);
    });
  }

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    roomManager.handleDisconnect(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
