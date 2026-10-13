#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(projectDir, "backend");
const { io } = require(path.join(projectDir, "frontend/node_modules/socket.io-client"));

const EVENTS = {
  CREATE_ROOM: "create_room",
  JOIN_ROOM: "join_room",
  RECONNECT_SESSION: "reconnect_session",
  ROOM_STATE_UPDATE: "room_state_update",
  GAME_STATE_UPDATE: "game_state_update",
  GAME_ACTION: "game_action",
  LEAVE_ROOM: "leave_room",
  DEBUG_SEED_GAME_STATE: "debug_seed_game_state"
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function withTimeout(promise, label, timeoutMs = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeoutMs))
  ]);
}

function waitForEvent(emitter, event, predicate = () => true, timeoutMs = 8000) {
  return withTimeout(new Promise(resolve => {
    const handler = payload => {
      if (!predicate(payload)) return;
      emitter.off(event, handler);
      resolve(payload);
    };
    emitter.on(event, handler);
  }), event, timeoutMs);
}

function emitAck(socket, event, payload = {}, timeoutMs = 8000) {
  return withTimeout(new Promise((resolve, reject) => {
    socket.emit(event, payload, response => {
      if (response?.success === false) {
        reject(new Error(`${event}: ${response.error || response.code || "odrzucono"}`));
        return;
      }
      resolve(response);
    });
  }), `${event} ACK`, timeoutMs);
}

function connectClient(serverUrl) {
  const socket = io(serverUrl, { reconnection: false, timeout: 5000, forceNew: true });
  return withTimeout(new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  }), "socket connect", 8000);
}

function startBackend(port, stateFile) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(port),
      MAKAO_ENABLE_TEST_HOOKS: "1",
      MAKAO_STATE_FILE: stateFile
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk; });
  child.stderr.on("data", chunk => { logs += chunk; });
  child.readLogs = () => logs;
  return withTimeout(new Promise((resolve, reject) => {
    const onData = chunk => {
      if (!String(chunk).includes("Server listening")) return;
      child.stdout.off("data", onData);
      resolve(child);
    };
    child.stdout.on("data", onData);
    child.once("exit", code => reject(new Error(`Backend zakończył się kodem ${code}:\n${logs}`)));
  }), "backend start", 8000);
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  await withTimeout(exited, "backend stop", 5000);
}

const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "makao-reliable-smoke-"));
const stateFile = path.join(temporaryDir, "rooms.json");
const port = Number(process.env.MAKAO_RELIABILITY_SMOKE_PORT || 31991);
const serverUrl = `http://127.0.0.1:${port}`;
const hostId = `smoke_host_${Date.now()}`;
const guestId = `smoke_guest_${Date.now()}`;
let backend = null;
const sockets = [];

try {
  backend = await startBackend(port, stateFile);
  const host = await connectClient(serverUrl);
  const guest = await connectClient(serverUrl);
  sockets.push(host, guest);

  const created = await emitAck(host, EVENTS.CREATE_ROOM, {
    playerName: "Host smoke",
    clientId: hostId,
    supportsResumeToken: true
  });
  const roomId = created.room.id;
  const hostResumeToken = created.resumeToken;
  assert.equal(typeof hostResumeToken, "string");
  const joined = await emitAck(guest, EVENTS.JOIN_ROOM, {
    roomId,
    playerName: "Gość smoke",
    clientId: guestId,
    supportsResumeToken: true
  });
  const guestResumeToken = joined.resumeToken;
  assert.equal(typeof guestResumeToken, "string");

  const seededStatePromise = waitForEvent(host, EVENTS.GAME_STATE_UPDATE, state =>
    state?.topCard?.cardInstanceId === "live_top_8_diamonds"
  );
  const seedAck = await emitAck(host, EVENTS.DEBUG_SEED_GAME_STATE, {
    scenario: "node_play",
    nodePlayerId: hostId,
    phonePlayerId: guestId
  });
  const seededState = await seededStatePromise;
  const originalVersion = seedAck.stateVersion;
  assert.equal(seededState.myHand.some(card => card.cardInstanceId === "live_node_8_hearts"), true);

  const hostDisconnected = waitForEvent(host, "disconnect");
  const guestDisconnected = waitForEvent(guest, "disconnect");
  await stopBackend(backend);
  backend = null;
  await Promise.all([hostDisconnected, guestDisconnected]);

  const action = {
    actionId: `smoke-play-${Date.now()}`,
    actionType: "play_cards",
    roomId,
    playerId: hostId,
    expectedStateVersion: originalVersion,
    data: { cardIds: ["live_node_8_hearts"] }
  };

  backend = await startBackend(port, stateFile);
  const hostAfterRestart = await connectClient(serverUrl);
  const guestAfterRestart = await connectClient(serverUrl);
  sockets.push(hostAfterRestart, guestAfterRestart);

  let hostState = null;
  let guestState = null;
  hostAfterRestart.on(EVENTS.GAME_STATE_UPDATE, state => { hostState = state; });
  guestAfterRestart.on(EVENTS.GAME_STATE_UPDATE, state => { guestState = state; });
  await emitAck(hostAfterRestart, EVENTS.RECONNECT_SESSION, {
    roomId,
    clientId: hostId,
    resumeToken: hostResumeToken
  });
  await emitAck(guestAfterRestart, EVENTS.RECONNECT_SESSION, {
    roomId,
    clientId: guestId,
    resumeToken: guestResumeToken
  });

  const accepted = await emitAck(hostAfterRestart, EVENTS.GAME_ACTION, action);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.duplicate, false);
  await sleep(100);
  assert.equal(hostState.topCard.cardInstanceId, "live_node_8_hearts");
  assert.equal(guestState.topCard.cardInstanceId, "live_node_8_hearts");
  assert.equal(hostState.myHand.some(card => card.cardInstanceId === "live_node_8_hearts"), false);
  assert.equal(hostState.stateVersion, guestState.stateVersion);

  const acceptedVersion = hostState.stateVersion;
  const duplicate = await emitAck(hostAfterRestart, EVENTS.GAME_ACTION, action);
  assert.equal(duplicate.duplicate, true);
  await sleep(100);
  assert.equal(hostState.stateVersion, acceptedVersion);
  assert.equal(guestState.stateVersion, acceptedVersion);

  guestAfterRestart.disconnect();
  await sleep(100);
  const courier = await connectClient(serverUrl);
  sockets.push(courier);
  const gameOverPromise = waitForEvent(hostAfterRestart, EVENTS.GAME_STATE_UPDATE, state => state?.gameOver === true);
  const leaveAck = await emitAck(courier, EVENTS.LEAVE_ROOM, {
    actionId: `smoke-leave-${Date.now()}`,
    roomId,
    clientId: guestId,
    resumeToken: guestResumeToken
  });
  assert.equal(leaveAck.success, true);
  const finalState = await gameOverPromise;
  assert.equal(finalState.winnerId, hostId);

  console.log(JSON.stringify({
    ok: true,
    roomId,
    originalVersion,
    acceptedVersion,
    duplicateIgnored: true,
    resignationDelivered: true
  }, null, 2));
} catch (error) {
  if (backend?.readLogs) console.error(backend.readLogs());
  throw error;
} finally {
  for (const socket of sockets) socket.disconnect();
  await stopBackend(backend);
  await rm(temporaryDir, { recursive: true, force: true });
}
