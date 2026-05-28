#!/usr/bin/env node
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, "..");
const { io } = require(path.join(PROJECT_DIR, "frontend/node_modules/socket.io-client"));

const EVENTS = {
  CREATE_ROOM: "create_room",
  JOIN_ROOM: "join_room",
  LEAVE_ROOM: "leave_room",
  RECONNECT_SESSION: "reconnect_session",
  ROOM_STATE_UPDATE: "room_state_update",
  GAME_STATE_UPDATE: "game_state_update",
  TOGGLE_READY: "toggle_ready",
  UPDATE_SETTINGS: "update_settings",
  START_GAME: "start_game",
  RETURN_TO_LOBBY: "return_to_lobby",
  HOST_END_GAME: "host_end_game",
  PLAY_CARDS: "play_cards",
  DRAW_CARD: "draw_card",
  ACCEPT_PENALTY: "accept_penalty",
  ACCEPT_SKIP: "accept_skip",
  DECLARE_MAKAO: "declare_makao",
  CATCH_MAKAO: "catch_makao",
  ERROR: "error",
  DEBUG_SEED_GAME_STATE: "debug_seed_game_state"
};

const PACKAGE_NAME = "pl.makao.zeznajomymi";
const ACTIVITY_NAME = `${PACKAGE_NAME}/.MakaoNativeActivity`;
const ERROR_PATTERN = /FATAL EXCEPTION| E AndroidRuntime|UnsatisfiedLinkError|ClassNotFoundException|NoClassDefFoundError|NullPointerException|SecurityException|ANR|Mixed Content|TypeError|ReferenceError|ERR_/;

function parseArgs(argv) {
  const options = {
    server: "http://127.0.0.1:3101",
    androidServer: null,
    outDir: path.join(PROJECT_DIR, "output/android-smoke/live-two-client-smoke"),
    phoneName: "CodexPhoneLive",
    nodeName: "CodexNodeLive",
    waitSec: 5,
    relaunchBeforePhoneMakao: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--server") options.server = argv[++index];
    else if (arg === "--android-server") options.androidServer = argv[++index];
    else if (arg === "--out-dir") options.outDir = argv[++index];
    else if (arg === "--phone-name") options.phoneName = argv[++index];
    else if (arg === "--node-name") options.nodeName = argv[++index];
    else if (arg === "--wait-sec") options.waitSec = Number(argv[++index] || options.waitSec);
    else if (arg === "--relaunch-before-phone-makao") options.relaunchBeforePhoneMakao = true;
    else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: node scripts/live_two_client_smoke.mjs [options]

Options:
  --server URL          Local socket.io URL for the Node driver.
  --android-server URL Android-reachable backend URL passed to the native activity.
  --out-dir DIR        Directory for screenshots, logcat and summary files.
  --wait-sec N         Seconds to wait after Android launch. Default: 5.
  --relaunch-before-phone-makao
                       Relaunch native activity before the phone-side Makao tap.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  options.androidServer ||= options.server;
  options.outDir = path.resolve(options.outDir);
  return options;
}

const options = parseArgs(process.argv.slice(2));
fs.mkdirSync(options.outDir, { recursive: true });
const summaryFile = path.join(options.outDir, "driver-summary.txt");
const resultFile = path.join(options.outDir, "result.json");
fs.writeFileSync(summaryFile, "");
const visualChecks = [];

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(summaryFile, `${line}\n`);
}

function run(command, args, { encoding = "utf8", check = true } = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_DIR,
    encoding,
    maxBuffer: 20 * 1024 * 1024
  });
  if (check && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr || result.status}`);
  }
  return result.stdout;
}

function adb(args, opts = {}) {
  return run("adb", args, opts);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(label, predicate, timeoutMs = 15000, intervalMs = 150) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function emitAck(socket, event, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, response) => {
      if (err) {
        reject(new Error(`${event} ack timeout/error: ${err.message || err}`));
        return;
      }
      if (response?.success === false) {
        reject(new Error(`${event} failed: ${response.error || "unknown error"}`));
        return;
      }
      resolve(response);
    });
  });
}

function wakeDevice() {
  adb(["wait-for-device"]);
  adb(["shell", "svc", "power", "stayon", "true"], { check: false });
  adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], { check: false });
  adb(["shell", "wm", "dismiss-keyguard"], { check: false });
}

async function tapAndroid(label, xRatio, yRatio, referencePath) {
  wakeDevice();
  const { width, height } = pngDimensions(referencePath);
  const x = Math.max(1, Math.min(width - 1, Math.round(width * xRatio)));
  const y = Math.max(1, Math.min(height - 1, Math.round(height * yRatio)));
  log(`TAP ${label}: ${x},${y} (${xRatio.toFixed(3)},${yRatio.toFixed(3)})`);
  adb(["shell", "input", "tap", String(x), String(y)]);
}

async function tapAndroidUntil(label, xRatio, yRatio, referencePath, predicate, timeoutMs = 12000, intervalMs = 950) {
  const startedAt = Date.now();
  let attempt = 1;
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await tapAndroid(`${label}-${attempt}`, xRatio, yRatio, referencePath);
    attempt += 1;
    await sleep(intervalMs);
    if (predicate()) return;
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assertPngNotBlank(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 20000) {
    throw new Error(`Screenshot is suspiciously small: ${filePath} (${bytes.length} bytes)`);
  }
  const pngSignature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`Screenshot is not a PNG: ${filePath}`);
  }
  const stats = spawnSync("magick", [
    filePath,
    "-resize", "64x64!",
    "-colorspace", "Gray",
    "-format", "%[fx:mean] %[fx:standard_deviation]",
    "info:"
  ], { encoding: "utf8" });
  if (stats.status === 0 && stats.stdout.trim()) {
    const [meanRaw, deviationRaw] = stats.stdout.trim().split(/\s+/);
    const mean = Number(meanRaw);
    const deviation = Number(deviationRaw);
    if (Number.isFinite(mean) && Number.isFinite(deviation) && (mean < 0.018 || deviation < 0.0025)) {
      throw new Error(`Screenshot appears black/blank: ${filePath} (mean=${mean} deviation=${deviation})`);
    }
  }
}

function pngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`Cannot read PNG dimensions: ${filePath}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function cropGeometry(filePath, region) {
  const { width, height } = pngDimensions(filePath);
  const cropWidth = Math.max(1, Math.round(width * region.width));
  const cropHeight = Math.max(1, Math.round(height * region.height));
  const x = Math.max(0, Math.min(width - cropWidth, Math.round(width * region.x)));
  const y = Math.max(0, Math.min(height - cropHeight, Math.round(height * region.y)));
  return `${cropWidth}x${cropHeight}+${x}+${y}`;
}

function assertMagickAvailable() {
  const version = spawnSync("magick", ["-version"], { encoding: "utf8" });
  if (version.status !== 0) {
    throw new Error("ImageMagick `magick` is required for live visual assertions.");
  }
}

function imageDifferenceMean(beforePath, afterPath, region) {
  const beforeSize = pngDimensions(beforePath);
  const afterSize = pngDimensions(afterPath);
  if (beforeSize.width !== afterSize.width || beforeSize.height !== afterSize.height) {
    throw new Error(`Cannot compare screenshots with different sizes: ${beforePath} vs ${afterPath}`);
  }
  const geometry = cropGeometry(beforePath, region);
  const result = spawnSync("magick", [
    beforePath,
    afterPath,
    "-compose", "Difference",
    "-composite",
    "-crop", geometry,
    "-colorspace", "Gray",
    "-format", "%[fx:mean]",
    "info:"
  ], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`ImageMagick crop compare failed for ${beforePath} vs ${afterPath}: ${result.stderr || result.status}`);
  }
  const mean = Number(result.stdout.trim());
  if (!Number.isFinite(mean)) {
    throw new Error(`Invalid crop difference mean: ${result.stdout}`);
  }
  return { mean, geometry };
}

function assertCropChanged(beforeLabel, afterLabel, region, label, minMean) {
  assertMagickAvailable();
  const beforePath = path.join(options.outDir, `${beforeLabel}.png`);
  const afterPath = path.join(options.outDir, `${afterLabel}.png`);
  const { mean, geometry } = imageDifferenceMean(beforePath, afterPath, region);
  if (mean < minMean) {
    throw new Error(`Visual assertion failed for ${label}: mean=${mean}, min=${minMean}, crop=${geometry}`);
  }
  const check = { label, ok: true, mean, minMean, crop: geometry, before: path.basename(beforePath), after: path.basename(afterPath) };
  visualChecks.push(check);
  log(`VISUAL PASS ${label}: mean=${mean.toFixed(5)} crop=${geometry}`);
}

function assertCleanLogcat(filePath) {
  const logcat = fs.readFileSync(filePath, "utf8");
  const matches = logcat.split("\n").filter(line => ERROR_PATTERN.test(line));
  if (matches.length > 0) {
    fs.writeFileSync(path.join(options.outDir, `errors-${path.basename(filePath)}`), matches.join("\n"));
    throw new Error(`App-level error pattern found in ${filePath}`);
  }
}

async function captureAndroid(label) {
  wakeDevice();
  await sleep(400);
  const pid = String(adb(["shell", "pidof", PACKAGE_NAME], { check: false })).trim();
  if (!pid) throw new Error("Native app process is not running");

  const logPath = path.join(options.outDir, `logcat-${label}.txt`);
  const screenPath = path.join(options.outDir, `${label}.png`);
  fs.writeFileSync(logPath, adb(["logcat", "-d"]));
  fs.writeFileSync(screenPath, adb(["exec-out", "screencap", "-p"], { encoding: null }));
  assertPngNotBlank(screenPath);
  assertCleanLogcat(logPath);
  log(`CAPTURE ${label}: ${screenPath}`);
  return screenPath;
}

function cardById(state, cardId) {
  return state?.myHand?.find(card => card.cardInstanceId === cardId);
}

function currentPlayerId(state) {
  return state?.currentPlayerId || state?.turnOrder?.[state?.currentPlayerIndex] || null;
}

function latestHistoryVersion(state) {
  return Math.max(0, ...(state?.moveHistory || []).map(entry => entry.version || 0));
}

function createSocketClient(label, tracker) {
  const socket = io(options.server, {
    reconnection: false,
    timeout: 7000
  });
  socket.on(EVENTS.ROOM_STATE_UPDATE, room => {
    tracker.room = room;
  });
  socket.on(EVENTS.GAME_STATE_UPDATE, state => {
    tracker.game = state;
  });
  socket.on(EVENTS.ERROR, payload => {
    const message = payload?.message || String(payload);
    tracker.errors.push(`${label}:${message}`);
    log(`SERVER ERROR ${label}: ${message}`);
  });
  return socket;
}

async function connectSocketClient(socket, label) {
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  log(`${label} socket connected: ${socket.id}`);
}

async function runFirstPlayerRotationSocketScenario() {
  const stamp = Date.now();
  const hostClientId = `rotation_host_${stamp}`;
  const secondClientId = `rotation_second_${stamp}`;
  const thirdClientId = `rotation_third_${stamp}`;
  const tracker = {
    room: null,
    game: null,
    errors: []
  };
  const host = createSocketClient("rotation-host", tracker);
  const second = createSocketClient("rotation-second", tracker);
  const third = createSocketClient("rotation-third", tracker);

  try {
    await Promise.all([
      connectSocketClient(host, "Rotation host"),
      connectSocketClient(second, "Rotation second"),
      connectSocketClient(third, "Rotation third")
    ]);

    const created = await emitAck(host, EVENTS.CREATE_ROOM, {
      playerName: "RotHost",
      clientId: hostClientId,
      roomName: "Codex rotation smoke",
      settings: { turnTimeLimitSeconds: 30 }
    });
    tracker.room = created.room;
    const roomId = created.room.id;
    log(`Rotation room created: ${roomId}`);

    await emitAck(second, EVENTS.JOIN_ROOM, {
      roomId,
      playerName: "RotSecond",
      clientId: secondClientId
    });
    await emitAck(third, EVENTS.JOIN_ROOM, {
      roomId,
      playerName: "RotThird",
      clientId: thirdClientId
    });
    await waitFor("rotation room has three players", () => tracker.room?.players?.length === 3);

    host.emit(EVENTS.UPDATE_SETTINGS, { firstPlayerId: secondClientId });
    await waitFor("rotation first-player selection", () =>
      tracker.room?.settings?.firstPlayerId === secondClientId &&
      tracker.room?.nextGameFirstPlayerId === secondClientId
    );

    second.emit(EVENTS.TOGGLE_READY);
    third.emit(EVENTS.TOGGLE_READY);
    await waitFor("rotation all players ready for game one", () =>
      tracker.room?.players?.every(player => player.isReady)
    );

    host.emit(EVENTS.START_GAME);
    await waitFor("rotation game one started by selected player", () =>
      tracker.room?.status === "playing" &&
      tracker.game?.moveHistory?.[0]?.details?.gameNumber === 1 &&
      tracker.game?.moveHistory?.[0]?.details?.firstPlayerId === secondClientId &&
      currentPlayerId(tracker.game) === secondClientId
    );
    assertCondition(tracker.room.nextGameFirstPlayerId === thirdClientId, `Game one did not rotate next starter to third player: ${tracker.room.nextGameFirstPlayerId}`);

    host.emit(EVENTS.HOST_END_GAME, {
      hostOverrideConfirmed: true,
      hostOverrideRiskAccepted: true
    });
    await waitFor("rotation game one host-ended", () =>
      tracker.game?.gameOver === true &&
      tracker.game?.endReason === "host_admin"
    );

    host.emit(EVENTS.RETURN_TO_LOBBY);
    await waitFor("rotation returned to lobby", () =>
      tracker.room?.status === "lobby" &&
      tracker.room?.gameOver === false &&
      tracker.room?.nextGameFirstPlayerId === thirdClientId
    );
    assertCondition(tracker.room.players.find(player => player.id === hostClientId)?.isReady === true, "Host should be ready after returning to lobby.");
    assertCondition(tracker.room.players.find(player => player.id === secondClientId)?.isReady === false, "Second player should need to ready again after returning to lobby.");
    assertCondition(tracker.room.players.find(player => player.id === thirdClientId)?.isReady === false, "Third player should need to ready again after returning to lobby.");

    second.emit(EVENTS.TOGGLE_READY);
    third.emit(EVENTS.TOGGLE_READY);
    await waitFor("rotation all players ready for game two", () =>
      tracker.room?.players?.every(player => player.isReady)
    );

    host.emit(EVENTS.START_GAME);
    await waitFor("rotation game two started by rotated player", () =>
      tracker.room?.status === "playing" &&
      tracker.game?.moveHistory?.[0]?.details?.gameNumber === 2 &&
      tracker.game?.moveHistory?.[0]?.details?.firstPlayerId === thirdClientId &&
      currentPlayerId(tracker.game) === thirdClientId
    );
    assertCondition(tracker.room.nextGameFirstPlayerId === hostClientId, `Game two did not rotate next starter to host: ${tracker.room.nextGameFirstPlayerId}`);
    assertCondition(tracker.errors.length === 0, `Rotation socket scenario emitted errors: ${tracker.errors.join("; ")}`);

    log("RULE PASS first_player_rotation_socket");
    return {
      scenario: "first_player_rotation_socket",
      ok: true,
      roomId,
      firstGameStarter: secondClientId,
      secondGameStarter: thirdClientId,
      nextGameFirstPlayerId: tracker.room.nextGameFirstPlayerId
    };
  } finally {
    host.disconnect();
    second.disconnect();
    third.disconnect();
  }
}

async function main() {
  log(`Server: ${options.server}`);
  log(`Android server: ${options.androidServer}`);
  log(`Output: ${options.outDir}`);

  const results = [];
  results.push(await runFirstPlayerRotationSocketScenario());

  const live = {
    room: null,
    game: null,
    errors: []
  };
  const nodeClientId = `live_node_${Date.now()}`;
  const socket = io(options.server, {
    reconnection: false,
    timeout: 7000
  });

  socket.on(EVENTS.ROOM_STATE_UPDATE, room => {
    live.room = room;
  });
  socket.on(EVENTS.GAME_STATE_UPDATE, state => {
    live.game = state;
  });
  socket.on(EVENTS.ERROR, payload => {
    const message = payload?.message || String(payload);
    live.errors.push(message);
    log(`SERVER ERROR: ${message}`);
  });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  log(`Node socket connected: ${socket.id}`);

  const created = await emitAck(socket, EVENTS.CREATE_ROOM, {
    playerName: options.nodeName,
    clientId: nodeClientId,
    roomName: "Codex live native smoke",
    settings: {
      turnTimeLimitSeconds: 30,
      firstPlayerId: nodeClientId
    }
  });
  live.room = created.room;
  const roomId = created.room.id;
  log(`Created room: ${roomId}`);

  wakeDevice();
  adb(["logcat", "-c"], { check: false });
  adb([
    "shell", "am", "start", "-S", "-n", ACTIVITY_NAME,
    "--es", "serverUrl", options.androidServer,
    "--es", "roomId", roomId,
    "--es", "playerName", options.phoneName
  ]);
  await sleep(options.waitSec * 1000);
  await waitFor("phone joining room", () => live.room?.players?.some(player => player.name === options.phoneName), 20000);
  const phonePlayer = live.room.players.find(player => player.name === options.phoneName);
  let phonePlayerId = phonePlayer.id;
  log(`Phone joined as ${phonePlayerId}`);
  await captureAndroid("00-phone-joined");

  const extraClientId = `live_extra_${Date.now()}`;
  let extraSocket = null;
  function createExtraSocket(label) {
    const nextSocket = io(options.server, {
      reconnection: false,
      timeout: 7000
    });
    nextSocket.on(EVENTS.ERROR, payload => {
      const message = payload?.message || String(payload);
      live.errors.push(`${label}:${message}`);
      log(`SERVER ERROR ${label}: ${message}`);
    });
    return nextSocket;
  }

  async function waitForSocketConnect(clientSocket, label) {
    await new Promise((resolve, reject) => {
      clientSocket.once("connect", resolve);
      clientSocket.once("connect_error", reject);
    });
    log(`${label} socket connected: ${clientSocket.id}`);
  }

  async function joinExtraClient() {
    if (extraSocket) return;
    extraSocket = createExtraSocket("extra");
    await waitForSocketConnect(extraSocket, "Extra Node");
    await emitAck(extraSocket, EVENTS.JOIN_ROOM, {
      roomId,
      playerName: "CodexExtraLive",
      clientId: extraClientId
    });
    await waitFor("extra Node client joining room", () =>
      live.room?.players?.some(player => player.id === extraClientId),
      10000
    );
    log(`Extra Node player joined as ${extraClientId}`);
  }

  async function reconnectExtraClient() {
    if (extraSocket?.connected) return;
    extraSocket = createExtraSocket("extra-reconnect");
    await waitForSocketConnect(extraSocket, "Extra reconnect Node");
    await emitAck(extraSocket, EVENTS.RECONNECT_SESSION, {
      roomId,
      clientId: extraClientId
    });
    await waitFor("extra Node client reconnecting", () =>
      live.room?.players?.some(player => player.id === extraClientId && player.isOnline !== false),
      10000
    );
    log(`Extra Node player reconnected as ${extraClientId}`);
  }

  async function leaveExtraClient() {
    if (!extraSocket) return;
    await emitAck(extraSocket, EVENTS.LEAVE_ROOM, {});
    await waitFor("extra Node client leaving room", () =>
      !live.room?.players?.some(player => player.id === extraClientId),
      10000
    );
    extraSocket.disconnect();
    extraSocket = null;
    log(`Extra Node player left: ${extraClientId}`);
  }

  async function relaunchPhoneClient(label) {
    wakeDevice();
    adb(["logcat", "-c"], { check: false });
    adb([
      "shell", "am", "start", "-S", "-n", ACTIVITY_NAME,
      "--es", "serverUrl", options.androidServer,
      "--es", "roomId", roomId,
      "--es", "playerName", options.phoneName
    ]);
    await sleep(options.waitSec * 1000);
    await waitFor(`${label} phone reconnecting`, () =>
      live.room?.players?.some(player => player.name === options.phoneName && player.isOnline !== false),
      20000
    );
    const phoneCandidates = live.room.players.filter(player => player.name === options.phoneName);
    const rejoinedPhone = phoneCandidates.find(player => player.isOnline !== false) || phoneCandidates.at(-1);
    if (!rejoinedPhone) throw new Error("Phone player missing after relaunch.");
    phonePlayerId = rejoinedPhone.id;
    log(`Phone relaunched as ${phonePlayerId}`);
    await captureAndroid(`${label}-phone-rejoined`);
  }

  async function seed(scenario) {
    const response = await emitAck(socket, EVENTS.DEBUG_SEED_GAME_STATE, {
      scenario,
      nodePlayerId: nodeClientId,
      phonePlayerId
    });
    await waitFor(`debug seed ${scenario}`, () =>
      live.game?.moveHistory?.[0]?.details?.debugScenario === scenario
    );
    log(`Seeded ${scenario} at version ${response.stateVersion}`);
    return latestHistoryVersion(live.game);
  }

  async function runNodePlayDrawScenario() {
    const version = await seed("node_play");
    await captureAndroid("01-opponent-play-before");
    const card = cardById(live.game, "live_node_8_hearts");
    if (!card) throw new Error("Seeded opponent play card missing from Node hand");
    socket.emit(EVENTS.PLAY_CARDS, { cardIds: [card.cardInstanceId] });
    await waitFor("opponent play history", () =>
      live.game?.moveHistory?.some(entry => entry.version > version && entry.type === "play_cards")
    );
    await sleep(1300);
    await captureAndroid("02-opponent-play-after");
    assertCondition(live.game.topCard?.cardInstanceId === "live_node_8_hearts", "Opponent play did not promote the expected 8 hearts to topCard.");
    assertCropChanged(
      "01-opponent-play-before",
      "02-opponent-play-after",
      { x: 0.52, y: 0.22, width: 0.25, height: 0.42 },
      "stack changes after opponent play",
      0.035
    );
    results.push({ scenario: "opponent_play", ok: true, topCard: live.game.topCard });

    const drawVersion = await seed("node_draw");
    const before = live.game.myHand.length;
    await captureAndroid("03-opponent-draw-before");
    socket.emit(EVENTS.DRAW_CARD);
    await waitFor("opponent draw history", () =>
      live.game?.moveHistory?.some(entry => entry.version > drawVersion && entry.type === "draw_card") &&
      live.game?.myHand?.length >= before + 1
    );
    await sleep(1000);
    await captureAndroid("03-opponent-draw-after");
    assertCondition(live.game.myHand.length === before + 1, `Opponent draw count mismatch: expected ${before + 1}, got ${live.game.myHand.length}.`);
    assertCropChanged(
      "03-opponent-draw-before",
      "03-opponent-draw-after",
      { x: 0.36, y: 0.05, width: 0.30, height: 0.20 },
      "opponent seat changes after draw",
      0.006
    );
    results.push({ scenario: "opponent_draw", ok: true, nodeHandCount: live.game.myHand.length });
  }

  async function runMakaoDeclareScenario() {
    const version = await seed("node_makao_declare");
    await captureAndroid("04-makao-before-declare");
    const card = cardById(live.game, "live_node_makao_8_hearts");
    if (!card) throw new Error("Seeded Makao play card missing from Node hand");
    socket.emit(EVENTS.PLAY_CARDS, { cardIds: [card.cardInstanceId] });
    await waitFor("missing Makao after play", () =>
      live.game?.moveHistory?.some(entry => entry.version > version && entry.type === "play_cards") &&
      live.game?.handCounts?.[nodeClientId] === 1 &&
      live.game?.makao?.[nodeClientId]?.declared === false
    );
    socket.emit(EVENTS.DECLARE_MAKAO);
    await waitFor("Makao declaration", () => live.game?.makao?.[nodeClientId]?.declared === true);
    await sleep(1000);
    await captureAndroid("04-makao-declared");
    assertCropChanged(
      "04-makao-before-declare",
      "04-makao-declared",
      { x: 0.34, y: 0.04, width: 0.36, height: 0.24 },
      "Makao declaration updates opponent status",
      0.008
    );
    results.push({ scenario: "makao_declare", ok: true });
  }

  async function runPhoneMakaoDeclareTapScenario() {
    const version = await seed("phone_makao_ready");
    const beforePath = await captureAndroid("07-phone-makao-before");
    const phoneMakaoDeclared = () =>
      live.game?.moveHistory?.some(entry =>
        entry.version > version &&
        entry.type === "declare_makao" &&
        entry.playerId === phonePlayerId
      ) &&
      live.game?.makao?.[phonePlayerId]?.declared === true;
    await tapAndroidUntil("07-phone-makao-button", 0.791, 0.652, beforePath, phoneMakaoDeclared);
    await sleep(800);
    await captureAndroid("07-phone-makao-declared");
    assertCropChanged(
      "07-phone-makao-before",
      "07-phone-makao-declared",
      { x: 0.68, y: 0.58, width: 0.22, height: 0.15 },
      "phone tap Makao hides Makao button",
      0.012
    );
    results.push({ scenario: "phone_tap_declare_makao", ok: true });
  }

  async function runRuleScenario({ scenario, cardId, payload = {}, assertState }) {
    const version = await seed(scenario);
    const card = cardById(live.game, cardId);
    if (!card) throw new Error(`Seeded rule card missing for ${scenario}: ${cardId}`);
    socket.emit(EVENTS.PLAY_CARDS, { cardIds: [card.cardInstanceId], ...payload });
    await waitFor(`rule scenario ${scenario}`, () =>
      live.game?.moveHistory?.some(entry => entry.version > version && entry.type === "play_cards")
    );
    assertState(live.game);
    results.push({
      scenario,
      ok: true,
      topCard: live.game.topCard,
      activeEffect: live.game.activeEffect || null,
      currentPlayerId: currentPlayerId(live.game)
    });
    log(`RULE PASS ${scenario}`);
  }

  async function runRejectedRuleScenario({ scenario, cardId, payload = {}, errorPattern, assertState }) {
    const version = await seed(scenario);
    const card = cardById(live.game, cardId);
    if (!card) throw new Error(`Seeded rejected-rule card missing for ${scenario}: ${cardId}`);
    const errorsBefore = live.errors.length;
    socket.emit(EVENTS.PLAY_CARDS, { cardIds: [card.cardInstanceId], ...payload });
    await waitFor(`rejected rule scenario ${scenario}`, () => live.errors.length > errorsBefore);
    const newErrors = live.errors.slice(errorsBefore);
    const message = newErrors.at(-1) || "";
    if (errorPattern && !errorPattern.test(message)) {
      throw new Error(`Unexpected rejection for ${scenario}: ${message}`);
    }
    live.errors.splice(errorsBefore, newErrors.length);
    assertCondition(!live.game?.moveHistory?.some(entry => entry.version > version && entry.type === "play_cards"), `${scenario} unexpectedly recorded play_cards.`);
    assertState(live.game, message);
    results.push({
      scenario,
      ok: true,
      rejected: true,
      error: message,
      topCard: live.game.topCard,
      activeEffect: live.game.activeEffect || null,
      currentPlayerId: currentPlayerId(live.game)
    });
    log(`RULE PASS ${scenario} rejected with: ${message}`);
  }

  async function runRuleSocketActionScenario({ scenario, event, expectedMoveType, assertState }) {
    const version = await seed(scenario);
    socket.emit(event);
    await waitFor(`rule socket action ${scenario}`, () =>
      live.game?.moveHistory?.some(entry => entry.version > version && entry.type === expectedMoveType)
    );
    assertState(live.game);
    results.push({
      scenario,
      ok: true,
      activeEffect: live.game.activeEffect || null,
      currentPlayerId: currentPlayerId(live.game),
      handCount: live.game.myHand.length,
      skipTurns: live.game.skipTurns || {}
    });
    log(`RULE PASS ${scenario}`);
  }

  async function runRuleScenarios() {
    await runRuleScenario({
      scenario: "rule_penalty_war_counter",
      cardId: "live_node_rule_3_hearts",
      assertState: state => {
        assertCondition(state.activeEffect?.type === "draw_penalty", "Penalty counter did not keep draw_penalty active.");
        assertCondition(state.activeEffect.amount === 5, `Penalty counter amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "hearts", `Penalty counter suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Penalty counter did not retarget the phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_penalty_multi_batch",
      cardId: "live_node_rule_2_hearts_a",
      payload: { cardIds: ["live_node_rule_2_hearts_a", "live_node_rule_2_hearts_b"] },
      assertState: state => {
        assertCondition(state.activeEffect?.type === "draw_penalty", "Penalty batch did not keep draw_penalty active.");
        assertCondition(state.activeEffect.amount === 6, `Penalty batch amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "hearts", `Penalty batch suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Penalty batch did not retarget the phone player.");
        assertCondition(state.topCard?.cardInstanceId === "live_node_rule_2_hearts_b", "Penalty batch did not leave the last selected card on top.");
      }
    });

    await runRuleSocketActionScenario({
      scenario: "rule_penalty_accept_node",
      event: EVENTS.ACCEPT_PENALTY,
      expectedMoveType: "accept_penalty",
      assertState: state => {
        assertCondition(!state.activeEffect, "Accepting a penalty should clear activeEffect.");
        assertCondition(state.myHand.length === 8, `Accept penalty hand count mismatch: ${state.myHand.length}`);
        assertCondition(currentPlayerId(state) === phonePlayerId, "Accepting a penalty did not advance to the phone player.");
        const history = state.moveHistory.find(entry => entry.version > 1 && entry.type === "accept_penalty");
        assertCondition(history?.details?.amount === 6, `Accept penalty history amount mismatch: ${history?.details?.amount}`);
        assertCondition(history?.details?.drawnCount === 6, `Accept penalty drawnCount mismatch: ${history?.details?.drawnCount}`);
      }
    });

    await runRuleSocketActionScenario({
      scenario: "rule_pause_accept_node",
      event: EVENTS.ACCEPT_SKIP,
      expectedMoveType: "accept_skip",
      assertState: state => {
        assertCondition(!state.activeEffect, "Accepting a pause should clear activeEffect.");
        assertCondition(state.skipTurns?.[nodeClientId] === 1, `Accept pause future skip count mismatch: ${state.skipTurns?.[nodeClientId]}`);
        assertCondition(currentPlayerId(state) === phonePlayerId, "Accepting a pause did not advance to the phone player.");
        const history = state.moveHistory.find(entry => entry.version > 1 && entry.type === "accept_skip");
        assertCondition(history?.details?.amount === 2, `Accept skip history amount mismatch: ${history?.details?.amount}`);
      }
    });

    await runRuleScenario({
      scenario: "rule_king_spades_previous_3p",
      cardId: "live_node_rule_king_spades",
      assertState: state => {
        assertCondition(state.activeEffect?.type === "draw_penalty", "King spades did not create draw_penalty.");
        assertCondition(state.activeEffect.amount === 5, `King spades amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "spades", `King spades suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.direction === "previous", `King spades direction mismatch: ${state.activeEffect.direction}`);
        assertCondition(state.activeEffect.targetPlayerId === extraClientId, "King spades in 3p did not target the previous extra player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_king_hearts_counter_3p",
      cardId: "live_node_rule_king_hearts",
      assertState: state => {
        assertCondition(state.activeEffect?.type === "draw_penalty", "King hearts counter did not keep draw_penalty active.");
        assertCondition(state.activeEffect.amount === 10, `King hearts counter amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "hearts", `King hearts counter suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.direction === "next", `King hearts counter direction mismatch: ${state.activeEffect.direction}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "King hearts counter did not retarget the next phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_battle_2_finish_3p",
      cardId: "live_node_rule_last_2_hearts",
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last battle 2 did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last battle 2.");
        assertCondition(state.activeEffect?.type === "draw_penalty", "Last battle 2 did not leave draw_penalty active.");
        assertCondition(state.activeEffect.amount === 2, `Last battle 2 amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "hearts", `Last battle 2 suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Last battle 2 did not target the next remaining phone player.");
        assertCondition(currentPlayerId(state) === phonePlayerId, "Last battle 2 did not make the next remaining player current.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_battle_3_finish_3p",
      cardId: "live_node_rule_last_3_hearts",
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last battle 3 did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last battle 3.");
        assertCondition(state.activeEffect?.type === "draw_penalty", "Last battle 3 did not leave draw_penalty active.");
        assertCondition(state.activeEffect.amount === 3, `Last battle 3 amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "hearts", `Last battle 3 suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Last battle 3 did not target the next remaining phone player.");
        assertCondition(currentPlayerId(state) === phonePlayerId, "Last battle 3 did not make the next remaining player current.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_king_hearts_finish_3p",
      cardId: "live_node_rule_last_king_hearts",
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last king hearts did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last king hearts.");
        assertCondition(state.activeEffect?.type === "draw_penalty", "Last king hearts did not leave draw_penalty active.");
        assertCondition(state.activeEffect.amount === 5, `Last king hearts amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "hearts", `Last king hearts suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.direction === "next", `Last king hearts direction mismatch: ${state.activeEffect.direction}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Last king hearts did not target the next remaining phone player.");
        assertCondition(currentPlayerId(state) === phonePlayerId, "Last king hearts did not make the next remaining player current.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_king_spades_finish_3p",
      cardId: "live_node_rule_last_king_spades",
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last king spades did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder.");
        assertCondition(state.activeEffect?.type === "draw_penalty", "Last king spades did not leave draw_penalty active.");
        assertCondition(state.activeEffect.amount === 5, `Last king spades amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "spades", `Last king spades suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.direction === "previous", `Last king spades direction mismatch: ${state.activeEffect.direction}`);
        assertCondition(state.activeEffect.targetPlayerId === extraClientId, "Last king spades did not target the previous remaining extra player.");
        assertCondition(currentPlayerId(state) === extraClientId, "Last king spades did not make the previous remaining player current.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_4_finish_3p",
      cardId: "live_node_rule_last_4_hearts",
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last 4 did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last 4.");
        assertCondition(!state.activeEffect, "Last 4 should auto-resolve when the next player cannot answer.");
        assertCondition(state.skipTurns?.[phonePlayerId] === 0, `Last 4 skip should be consumed immediately: ${state.skipTurns?.[phonePlayerId]}`);
        assertCondition(currentPlayerId(state) === extraClientId, "Last 4 did not skip the next remaining phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_joker_4_finish_3p",
      cardId: "live_node_rule_last_joker_4",
      payload: {
        jokerDeclarations: {
          live_node_rule_last_joker_4: { rank: "4", suit: "hearts" }
        }
      },
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last Joker as 4 did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last Joker as 4.");
        assertCondition(state.topCard?.rank === "joker", "Last Joker as 4 should leave the physical Joker on top.");
        assertCondition(state.topCard?.jokerDeclaration?.rank === "4", "Last Joker declared rank mismatch.");
        assertCondition(!state.activeEffect, "Last Joker as 4 should auto-resolve when the next player cannot answer.");
        assertCondition(state.skipTurns?.[phonePlayerId] === 0, `Last Joker as 4 skip should be consumed immediately: ${state.skipTurns?.[phonePlayerId]}`);
        assertCondition(currentPlayerId(state) === extraClientId, "Last Joker as 4 did not skip the next remaining phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_ace_request_finish_3p",
      cardId: "live_node_rule_last_ace_hearts",
      payload: { suitRequest: "clubs" },
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last ace with request did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last ace request.");
        assertCondition(state.activeEffect?.type === "suit_request", "Last ace request did not leave suit_request active.");
        assertCondition(state.activeEffect.requestedSuit === "clubs", `Last ace requested suit mismatch: ${state.activeEffect.requestedSuit}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Last ace request did not target the next remaining phone player.");
        assertCondition(currentPlayerId(state) === phonePlayerId, "Last ace request did not make the next remaining player current.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_ace_no_request_finish_3p",
      cardId: "live_node_rule_last_ace_no_hearts",
      payload: { suitRequest: "none" },
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last ace with no request did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last ace no-request.");
        assertCondition(!state.activeEffect, "Last ace with no request should leave activeEffect empty.");
        assertCondition(state.topCard?.cardInstanceId === "live_node_rule_last_ace_no_hearts", "Last ace no-request did not stay on top.");
        assertCondition(currentPlayerId(state) === phonePlayerId, "Last ace no-request did not make the next remaining player current.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_jack_request_finish_3p",
      cardId: "live_node_rule_last_jack_hearts",
      payload: { rankRequest: "10" },
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last jack with request did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last jack request.");
        assertCondition(state.activeEffect?.type === "rank_request", "Last jack request did not leave rank_request active.");
        assertCondition(state.activeEffect.requestedRank === "10", `Last jack requested rank mismatch: ${state.activeEffect.requestedRank}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Last jack request did not target the next remaining phone player.");
        assertCondition(currentPlayerId(state) === phonePlayerId, "Last jack request did not make the next remaining player current.");
      }
    });

    await runRuleScenario({
      scenario: "rule_last_jack_no_request_finish_3p",
      cardId: "live_node_rule_last_jack_no_hearts",
      payload: { rankRequest: "none" },
      assertState: state => {
        assertCondition(state.finishedPlayers?.some(player => player.playerId === nodeClientId), "Last jack with no request did not finish the Node player.");
        assertCondition(!state.turnOrder?.includes(nodeClientId), "Finished Node player stayed in turnOrder after last jack no-request.");
        assertCondition(!state.activeEffect, "Last jack with no request should leave activeEffect empty.");
        assertCondition(state.topCard?.cardInstanceId === "live_node_rule_last_jack_no_hearts", "Last jack no-request did not stay on top.");
        assertCondition(currentPlayerId(state) === phonePlayerId, "Last jack no-request did not make the next remaining player current.");
      }
    });

    await runRuleScenario({
      scenario: "rule_ace_request",
      cardId: "live_node_rule_ace_hearts",
      payload: { suitRequest: "spades" },
      assertState: state => {
        assertCondition(state.activeEffect?.type === "suit_request", "Ace request did not create suit_request.");
        assertCondition(state.activeEffect.requestedSuit === "spades", `Ace requested suit mismatch: ${state.activeEffect.requestedSuit}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Ace request did not target the phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_ace_no_request",
      cardId: "live_node_rule_ace_no_hearts",
      payload: { suitRequest: "none" },
      assertState: state => {
        assertCondition(!state.activeEffect, "Ace with no request should leave activeEffect empty.");
      }
    });

    await runRuleSocketActionScenario({
      scenario: "rule_suit_request_draw_node",
      event: EVENTS.DRAW_CARD,
      expectedMoveType: "draw_card",
      assertState: state => {
        assertCondition(!state.activeEffect, "Drawing during a suit request should clear activeEffect.");
        assertCondition(state.myHand.length === 2, `Suit request draw hand count mismatch: ${state.myHand.length}`);
        assertCondition(!state.hasDrawnCardThisTurn, "Suit request draw should not leave a playable drawn-card decision.");
        assertCondition(!state.drawnCardInstanceId, `Suit request draw should clear drawnCardInstanceId: ${state.drawnCardInstanceId}`);
        assertCondition(currentPlayerId(state) === phonePlayerId, "Suit request draw did not advance to the phone player.");
        const history = state.moveHistory.find(entry => entry.version > 1 && entry.type === "draw_card");
        assertCondition(history?.details?.canPlayDrawnCard === false, "Suit request draw history should mark canPlayDrawnCard=false.");
      }
    });

    await runRuleScenario({
      scenario: "rule_jack_request",
      cardId: "live_node_rule_jack_hearts",
      payload: { rankRequest: "10" },
      assertState: state => {
        assertCondition(state.activeEffect?.type === "rank_request", "Jack request did not create rank_request.");
        assertCondition(state.activeEffect.requestedRank === "10", `Jack requested rank mismatch: ${state.activeEffect.requestedRank}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Jack request did not target the phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_jack_no_request",
      cardId: "live_node_rule_jack_no_hearts",
      payload: { rankRequest: "none" },
      assertState: state => {
        assertCondition(!state.activeEffect, "Jack with no request should leave activeEffect empty.");
      }
    });

    await runRuleSocketActionScenario({
      scenario: "rule_rank_request_draw_node",
      event: EVENTS.DRAW_CARD,
      expectedMoveType: "draw_card",
      assertState: state => {
        assertCondition(!state.activeEffect, "Drawing during a rank request should clear activeEffect.");
        assertCondition(state.myHand.length === 2, `Rank request draw hand count mismatch: ${state.myHand.length}`);
        assertCondition(!state.hasDrawnCardThisTurn, "Rank request draw should not leave a playable drawn-card decision.");
        assertCondition(!state.drawnCardInstanceId, `Rank request draw should clear drawnCardInstanceId: ${state.drawnCardInstanceId}`);
        assertCondition(currentPlayerId(state) === phonePlayerId, "Rank request draw did not advance to the phone player.");
        const history = state.moveHistory.find(entry => entry.version > 1 && entry.type === "draw_card");
        assertCondition(history?.details?.canPlayDrawnCard === false, "Rank request draw history should mark canPlayDrawnCard=false.");
      }
    });

    await runRuleScenario({
      scenario: "rule_pause_4",
      cardId: "live_node_rule_4_hearts",
      assertState: state => {
        assertCondition(!state.activeEffect, "Card 4 should auto-resolve when the phone player cannot answer.");
        assertCondition(state.skipTurns?.[phonePlayerId] === 0, `Card 4 skip should be consumed immediately: ${state.skipTurns?.[phonePlayerId]}`);
        assertCondition(currentPlayerId(state) === extraClientId, "Card 4 did not skip the phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_pause_multi_4_batch",
      cardId: "live_node_rule_4_hearts_a",
      payload: { cardIds: ["live_node_rule_4_hearts_a", "live_node_rule_4_spades_b"] },
      assertState: state => {
        assertCondition(!state.activeEffect, "Multi-card 4 batch should auto-resolve when the phone player cannot answer.");
        assertCondition(state.skipTurns?.[phonePlayerId] === 1, `Multi-card 4 should leave one future phone pause: ${state.skipTurns?.[phonePlayerId]}`);
        assertCondition(currentPlayerId(state) === extraClientId, "Multi-card 4 batch did not skip the phone player.");
        assertCondition(state.topCard?.cardInstanceId === "live_node_rule_4_spades_b", "Multi-card 4 batch did not leave the last selected card on top.");
      }
    });

    await runRuleScenario({
      scenario: "rule_queen_clears_request",
      cardId: "live_node_rule_queen_diamonds",
      assertState: state => {
        assertCondition(!state.activeEffect, "Queen should clear the active suit request.");
        assertCondition(state.topCard?.rank === "queen", "Queen request-clear scenario did not leave queen on top.");
      }
    });

    await runRuleScenario({
      scenario: "rule_queen_clears_rank_request",
      cardId: "live_node_rule_queen_rank_diamonds",
      assertState: state => {
        assertCondition(!state.activeEffect, "Queen should clear the active rank request.");
        assertCondition(state.topCard?.rank === "queen", "Queen rank-request-clear scenario did not leave queen on top.");
      }
    });

    await runRejectedRuleScenario({
      scenario: "rule_queen_blocked_by_penalty",
      cardId: "live_node_rule_queen_penalty_hearts",
      errorPattern: /current top card|active penalty|penalty/i,
      assertState: state => {
        assertCondition(state.activeEffect?.type === "draw_penalty", "Rejected queen penalty scenario lost the active draw penalty.");
        assertCondition(state.activeEffect.amount === 2, `Rejected queen penalty amount mismatch: ${state.activeEffect?.amount}`);
        assertCondition(state.activeEffect.targetPlayerId === nodeClientId, "Rejected queen penalty target changed unexpectedly.");
        assertCondition(state.topCard?.cardInstanceId === "live_rule_top_2_hearts", "Rejected queen penalty changed top card.");
      }
    });

    await runRuleScenario({
      scenario: "rule_warsaw_queen_cancels_penalty",
      cardId: "live_node_rule_warsaw_queen_hearts",
      assertState: state => {
        assertCondition(state.settings?.queenVariant === "warsaw_pardon", `Warsaw queen scenario variant mismatch: ${state.settings?.queenVariant}`);
        assertCondition(!state.activeEffect, "Warsaw queen should cancel the active draw penalty.");
        assertCondition(state.topCard?.rank === "queen", "Warsaw queen scenario did not leave queen on top.");
        assertCondition(state.topCard?.suit === "hearts", `Warsaw queen suit mismatch: ${state.topCard?.suit}`);
        assertCondition(currentPlayerId(state) === phonePlayerId, "Warsaw queen scenario did not advance to the phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_joker_battle_counter",
      cardId: "live_node_rule_joker_battle",
      payload: {
        jokerDeclarations: {
          live_node_rule_joker_battle: { rank: "3", suit: "hearts" }
        }
      },
      assertState: state => {
        assertCondition(state.topCard?.rank === "joker", "Joker battle counter should leave the physical Joker on top.");
        assertCondition(state.topCard?.jokerDeclaration?.rank === "3", "Joker battle declared rank mismatch.");
        assertCondition(state.topCard?.jokerDeclaration?.suit === "hearts", "Joker battle declared suit mismatch.");
        assertCondition(state.activeEffect?.type === "draw_penalty", "Joker battle counter did not keep draw_penalty active.");
        assertCondition(state.activeEffect.amount === 5, `Joker battle counter amount mismatch: ${state.activeEffect.amount}`);
        assertCondition(state.activeEffect.battleSuit === "hearts", `Joker battle counter suit mismatch: ${state.activeEffect.battleSuit}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Joker battle counter did not retarget the phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_joker_suit_request",
      cardId: "live_node_rule_joker_suit",
      payload: {
        jokerDeclarations: {
          live_node_rule_joker_suit: { rank: "ace", suit: "hearts" }
        },
        suitRequest: "clubs"
      },
      assertState: state => {
        assertCondition(state.topCard?.rank === "joker", "Joker-as-ace should leave the physical Joker on top.");
        assertCondition(state.topCard?.jokerDeclaration?.rank === "ace", "Joker-as-ace declared rank mismatch.");
        assertCondition(state.activeEffect?.type === "suit_request", "Joker-as-ace did not create suit_request.");
        assertCondition(state.activeEffect.requestedSuit === "clubs", `Joker-as-ace requested suit mismatch: ${state.activeEffect.requestedSuit}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Joker-as-ace did not target the phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_joker_rank_request",
      cardId: "live_node_rule_joker_rank",
      payload: {
        jokerDeclarations: {
          live_node_rule_joker_rank: { rank: "jack", suit: "hearts" }
        },
        rankRequest: "10"
      },
      assertState: state => {
        assertCondition(state.topCard?.rank === "joker", "Joker-as-jack should leave the physical Joker on top.");
        assertCondition(state.topCard?.jokerDeclaration?.rank === "jack", "Joker-as-jack declared rank mismatch.");
        assertCondition(state.activeEffect?.type === "rank_request", "Joker-as-jack did not create rank_request.");
        assertCondition(state.activeEffect.requestedRank === "10", `Joker-as-jack requested rank mismatch: ${state.activeEffect.requestedRank}`);
        assertCondition(state.activeEffect.targetPlayerId === phonePlayerId, "Joker-as-jack did not target the phone player.");
      }
    });

    await runRuleScenario({
      scenario: "rule_joker_declaration",
      cardId: "live_node_rule_joker",
      payload: {
        jokerDeclarations: {
          live_node_rule_joker: { rank: "8", suit: "spades" }
        }
      },
      assertState: state => {
        assertCondition(state.topCard?.rank === "joker", "Joker declaration should leave the physical Joker on top.");
        assertCondition(state.topCard?.jokerDeclaration?.rank === "8", "Joker declared rank mismatch.");
        assertCondition(state.topCard?.jokerDeclaration?.suit === "spades", "Joker declared suit mismatch.");
        assertCondition(!state.activeEffect, "Joker declared as a plain 8 should not create an active effect.");
      }
    });
  }

  async function runDisconnectBeforeBlockingTurnScenario() {
    const version = await seed("rule_king_spades_previous_3p");
    const handBefore = live.game.myHand.map(card => card.cardInstanceId);
    extraSocket.disconnect();
    await waitFor("extra Node client marked offline", () =>
      live.room?.players?.some(player => player.id === extraClientId && player.isOnline === false),
      10000
    );
    await sleep(250);
    assertCondition(live.game?.paused !== true, "Disconnecting a non-current, non-blocking player should not pause immediately.");
    assertCondition(!live.game?.moveHistory?.some(entry => entry.version > version && entry.type === "turn_timeout_loss"), "Disconnect scenario recorded a turn_timeout_loss.");

    const card = cardById(live.game, "live_node_rule_king_spades");
    if (!card) throw new Error("Seeded disconnect scenario card missing: live_node_rule_king_spades");
    socket.emit(EVENTS.PLAY_CARDS, { cardIds: [card.cardInstanceId] });
    await waitFor("offline extra blocking pause", () =>
      live.game?.moveHistory?.some(entry => entry.version > version && entry.type === "game_paused_disconnect" && entry.playerId === extraClientId) &&
      live.game?.paused === true &&
      live.game?.pauseReason === "disconnect" &&
      live.game?.pausedPlayerId === extraClientId,
      10000
    );
    assertCondition(live.game.activeEffect?.type === "draw_penalty", "Offline blocking player scenario lost the draw penalty.");
    assertCondition(live.game.activeEffect.targetPlayerId === extraClientId, "Offline blocking player is not the active effect target.");
    assertCondition(currentPlayerId(live.game) === extraClientId, "Offline blocking player is not current after the targeting move.");
    assertCondition(!live.game.moveHistory.some(entry => entry.version > version && entry.type === "turn_timeout_loss"), "Offline blocking path used ordinary turn timeout instead of disconnect pause.");

    const pausedAtVersion = latestHistoryVersion(live.game);
    await reconnectExtraClient();
    await waitFor("disconnect pause cleared by reconnect", () =>
      live.game?.moveHistory?.some(entry => entry.version > pausedAtVersion && entry.type === "player_reconnected" && entry.playerId === extraClientId) &&
      live.game?.paused !== true &&
      live.room?.players?.some(player => player.id === extraClientId && player.isOnline !== false),
      10000
    );
    assertCondition(live.game.activeEffect?.targetPlayerId === extraClientId, "Reconnect should preserve the blocking active effect target.");
    assertCondition(currentPlayerId(live.game) === extraClientId, "Reconnect should preserve the blocking player's turn.");
    assertCondition(!live.game.moveHistory.some(entry => entry.version > version && entry.type === "pause_timeout_loss"), "Reconnect scenario removed the offline player instead of resuming.");

    results.push({
      scenario: "disconnect_before_blocking_turn_reconnect",
      ok: true,
      extraPlayerId: extraClientId,
      handBefore,
      pausedPlayerId: extraClientId,
      activeEffect: live.game.activeEffect,
      currentPlayerId: currentPlayerId(live.game)
    });
    log("RULE PASS disconnect_before_blocking_turn_reconnect");

    await seed("node_play");
  }

  async function runCatchScenario() {
    const version = await seed("phone_missing_makao_expired");
    const before = live.game.handCounts[phonePlayerId];
    await captureAndroid("05-makao-catch-before");
    socket.emit(EVENTS.CATCH_MAKAO, { targetPlayerId: phonePlayerId });
    await waitFor("Makao catch", () =>
      live.game?.moveHistory?.some(entry => entry.version > version && entry.type === "catch_makao") &&
      live.game?.handCounts?.[phonePlayerId] >= before + 5
    );
    await sleep(1000);
    await captureAndroid("05-makao-caught");
    assertCondition(live.game.handCounts[phonePlayerId] === before + 5, `Catch penalty count mismatch: expected ${before + 5}, got ${live.game.handCounts[phonePlayerId]}.`);
    assertCropChanged(
      "05-makao-catch-before",
      "05-makao-caught",
      { x: 0.24, y: 0.68, width: 0.56, height: 0.30 },
      "phone hand changes after Makao catch penalty",
      0.04
    );
    results.push({ scenario: "catch_makao", ok: true, phoneHandCount: live.game.handCounts[phonePlayerId] });
  }

  async function runPhoneCatchTapScenario() {
    const version = await seed("node_missing_makao_expired");
    const before = live.game.myHand.length;
    const beforePath = await captureAndroid("06-phone-catch-node-before");
    const phoneCatchApplied = () =>
      live.game?.moveHistory?.some(entry =>
        entry.version > version &&
        entry.type === "catch_makao" &&
        entry.details?.targetPlayerId === nodeClientId
      ) &&
      live.game?.myHand?.length >= before + 5;
    await tapAndroidUntil("06-phone-catch-node", 0.553, 0.244, beforePath, phoneCatchApplied);
    await sleep(1000);
    await captureAndroid("06-phone-catch-node-after");
    assertCondition(live.game.myHand.length === before + 5, `Phone catch tap penalty count mismatch: expected ${before + 5}, got ${live.game.myHand.length}.`);
    assertCropChanged(
      "06-phone-catch-node-before",
      "06-phone-catch-node-after",
      { x: 0.34, y: 0.04, width: 0.36, height: 0.24 },
      "phone tap catch changes opponent status",
      0.01
    );
    results.push({ scenario: "phone_tap_catch_makao", ok: true, nodeHandCount: live.game.myHand.length });
  }

  async function runAutoPenaltyScenario() {
    const version = await seed("node_missing_makao_expired");
    const before = live.game.myHand.length;
    await captureAndroid("08-makao-auto-penalty-before");
    socket.emit(EVENTS.DRAW_CARD);
    await waitFor("expired Makao penalty", () =>
      live.game?.moveHistory?.some(entry => entry.version > version && entry.type === "draw_card") &&
      live.game?.myHand?.length >= before + 5
    );
    await sleep(1000);
    await captureAndroid("08-makao-auto-penalty");
    assertCropChanged(
      "08-makao-auto-penalty-before",
      "08-makao-auto-penalty",
      { x: 0.34, y: 0.04, width: 0.36, height: 0.24 },
      "opponent status changes after expired Makao penalty",
      0.02
    );
    results.push({ scenario: "makao_auto_penalty", ok: true, nodeHandCount: live.game.myHand.length });
  }

  await joinExtraClient();
  await runRuleScenarios();
  await runDisconnectBeforeBlockingTurnScenario();
  await leaveExtraClient();
  await runNodePlayDrawScenario();
  await runMakaoDeclareScenario();
  await runCatchScenario();
  await runPhoneCatchTapScenario();
  if (options.relaunchBeforePhoneMakao) {
    await relaunchPhoneClient("07");
  } else {
    log("Continuing to phone-side Makao declaration without native activity relaunch");
  }
  await runPhoneMakaoDeclareTapScenario();
  await runAutoPenaltyScenario();

  if (live.errors.length > 0) {
    throw new Error(`Server emitted ${live.errors.length} error(s): ${live.errors.join("; ")}`);
  }

  const result = {
    ok: true,
    roomId,
    nodePlayerId: nodeClientId,
    phonePlayerId,
    extraPlayerId: extraClientId,
    relaunchBeforePhoneMakao: options.relaunchBeforePhoneMakao,
    results,
    visualChecks,
    outDir: options.outDir
  };
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  log(`DONE ${JSON.stringify(result)}`);
  extraSocket?.disconnect();
  socket.disconnect();
}

main().catch(err => {
  const result = { ok: false, error: err.message, outDir: options.outDir };
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  log(`FAIL ${err.stack || err.message}`);
  process.exit(1);
});
