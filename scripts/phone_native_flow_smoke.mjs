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
  ROOM_STATE_UPDATE: "room_state_update",
  GAME_STATE_UPDATE: "game_state_update",
  PLAY_CARDS: "play_cards",
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
    outDir: path.join(PROJECT_DIR, "output/android-smoke/phone-native-flow-smoke"),
    phoneName: "CodexPhoneNativeFlow",
    nodeName: "CodexNodeNativeFlow",
    waitSec: 5,
    dragAttempts: 5,
    relaunchBeforePlay: true
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--server") options.server = argv[++index];
    else if (arg === "--android-server") options.androidServer = argv[++index];
    else if (arg === "--out-dir") options.outDir = argv[++index];
    else if (arg === "--phone-name") options.phoneName = argv[++index];
    else if (arg === "--node-name") options.nodeName = argv[++index];
    else if (arg === "--wait-sec") options.waitSec = Number(argv[++index] || options.waitSec);
    else if (arg === "--drag-attempts") options.dragAttempts = Number(argv[++index] || options.dragAttempts);
    else if (arg === "--no-relaunch-before-play") options.relaunchBeforePlay = false;
    else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: node scripts/phone_native_flow_smoke.mjs [options]

Options:
  --server URL          Local socket.io URL for the Node host driver.
  --android-server URL Android-reachable backend URL passed to the native activity.
  --out-dir DIR        Directory for before/after screenshots, logcat and result.json.
  --wait-sec N         Seconds to wait after Android launch. Default: 5.
  --drag-attempts N    Card-drag attempts before failing. Default: 5.
  --no-relaunch-before-play
                       Keep the same native activity instance between penalty draw and card drag.
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
const resultFile = path.join(options.outDir, "result.json");
const summaryFile = path.join(options.outDir, "driver-summary.txt");
fs.writeFileSync(summaryFile, "");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(summaryFile, `${line}\n`);
}

function run(command, args, { encoding = "utf8", check = true } = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_DIR,
    encoding,
    maxBuffer: 30 * 1024 * 1024
  });
  if (check && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : result.stdout;
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout || result.status}`);
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
  adb(["shell", "input", "keyevent", "82"], { check: false });
}

function assertToolAvailable(command, args, message) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(message);
}

function assertMagickAvailable() {
  assertToolAvailable("magick", ["-version"], "ImageMagick `magick` is required to derive gesture coordinates from screenshots.");
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

function parseConnectedComponents(raw) {
  const linePattern = /^\s*(\d+):\s+(\d+)x(\d+)\+(\d+)\+(\d+)\s+([0-9.]+),([0-9.]+)\s+(\d+)\s+gray(?:a)?\((\d+)/;
  return raw.split("\n").map(line => {
    const match = line.match(linePattern);
    if (!match) return null;
    return {
      id: Number(match[1]),
      width: Number(match[2]),
      height: Number(match[3]),
      x: Number(match[4]),
      y: Number(match[5]),
      cx: Number(match[6]),
      cy: Number(match[7]),
      area: Number(match[8]),
      gray: Number(match[9])
    };
  }).filter(Boolean);
}

function connectedComponents(filePath, threshold = "70%") {
  assertMagickAvailable();
  const raw = run("magick", [
    filePath,
    "-colorspace", "Gray",
    "-threshold", threshold,
    "-define", "connected-components:verbose=true",
    "-connected-components", "8",
    "null:"
  ]);
  return parseConnectedComponents(raw);
}

function centerOf(box, xRatio = 0.5, yRatio = 0.5) {
  return {
    x: Math.round(box.x + box.width * xRatio),
    y: Math.round(box.y + box.height * yRatio)
  };
}

function clampPoint(point, dimensions) {
  return {
    x: Math.max(1, Math.min(dimensions.width - 1, Math.round(point.x))),
    y: Math.max(1, Math.min(dimensions.height - 1, Math.round(point.y)))
  };
}

function deriveLayoutFromScreenshot(filePath) {
  const dimensions = pngDimensions(filePath);
  const bright = connectedComponents(filePath)
    .filter(component => component.gray === 255 && component.area >= 900)
    .sort((a, b) => b.area - a.area);

  const hand = bright.find(component =>
    component.y > dimensions.height * 0.55 &&
    component.x > dimensions.width * 0.18 &&
    component.x + component.width < dimensions.width * 0.86 &&
    component.height > dimensions.height * 0.14
  );
  if (!hand) throw new Error(`Could not derive local hand coordinates from ${filePath}`);

  const tablePiles = bright
    .filter(component =>
      component.y > dimensions.height * 0.20 &&
      component.y < dimensions.height * 0.65 &&
      component.x > dimensions.width * 0.20 &&
      component.x + component.width < dimensions.width * 0.84 &&
      component.height > dimensions.height * 0.16 &&
      component.area > 5000
    )
    .sort((a, b) => a.x - b.x);
  if (tablePiles.length < 2) {
    throw new Error(`Could not derive draw/discard pile coordinates from ${filePath}`);
  }

  const deck = tablePiles[0];
  const discard = tablePiles[tablePiles.length - 1];
  const layout = {
    screenshot: path.basename(filePath),
    dimensions,
    boxes: {
      deck,
      discard,
      hand
    },
    points: {
      deckPullStart: clampPoint(centerOf(deck, 0.50, 0.52), dimensions),
      deckPullEnd: clampPoint(centerOf(hand, 0.50, 0.63), dimensions),
      discardDrop: clampPoint(centerOf(discard, 0.68, 0.49), dimensions),
      firstHandCard: clampPoint(centerOf(hand, 0.21, 0.49), dimensions),
      handCenter: clampPoint(centerOf(hand, 0.50, 0.57), dimensions)
    }
  };
  log(`LAYOUT ${path.basename(filePath)}: ${JSON.stringify(layout.points)}`);
  return layout;
}

function cardDragCandidates(layout) {
  const { hand, discard } = layout.boxes;
  const { dimensions } = layout;
  const endPoints = [
    centerOf(discard, 0.68, 0.49),
    centerOf(discard, 0.62, 0.52),
    centerOf(discard, 0.74, 0.46)
  ].map(point => clampPoint(point, dimensions));
  const startRatios = [
    [0.21, 0.49],
    [0.26, 0.55],
    [0.17, 0.55],
    [0.34, 0.52],
    [0.50, 0.52]
  ];
  return startRatios.flatMap(([xRatio, yRatio], index) => {
    const start = clampPoint(centerOf(hand, xRatio, yRatio), dimensions);
    const end = endPoints[index % endPoints.length];
    return [
      { start, end, durationMs: 720, note: `hand-${xRatio}-${yRatio}` },
      { start, end, durationMs: 430, note: `flick-${xRatio}-${yRatio}` }
    ];
  }).slice(0, Math.max(1, options.dragAttempts));
}

async function swipeAndroid(label, start, end, durationMs = 650) {
  wakeDevice();
  log(`SWIPE ${label}: ${start.x},${start.y} -> ${end.x},${end.y} (${durationMs}ms)`);
  adb([
    "shell", "input", "swipe",
    String(start.x), String(start.y),
    String(end.x), String(end.y),
    String(durationMs)
  ]);
}

function latestHistoryVersion(state) {
  return Math.max(0, ...(state?.moveHistory || []).map(entry => entry.version || 0));
}

function topCardKey(card) {
  if (!card) return "null";
  const declaration = card.jokerDeclaration ? `:${card.jokerDeclaration.rank}:${card.jokerDeclaration.suit}` : "";
  return `${card.cardInstanceId || ""}:${card.rank || ""}:${card.suit || ""}${declaration}`;
}

async function main() {
  assertMagickAvailable();
  log(`Server: ${options.server}`);
  log(`Android server: ${options.androidServer}`);
  log(`Output: ${options.outDir}`);

  const live = {
    room: null,
    game: null,
    errors: []
  };
  const nodeClientId = `native_flow_node_${Date.now()}`;
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
    roomName: "Codex native phone flow smoke",
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

  const results = [];

  async function runPenaltyDeckPull() {
    const version = await seed("phone_penalty_accept");
    const beforeHandCount = live.game?.handCounts?.[phonePlayerId];
    assertCondition(beforeHandCount === 1, `phone_penalty_accept expected phone hand count 1, got ${beforeHandCount}`);
    const beforePath = await captureAndroid("01-penalty-before");
    const layout = deriveLayoutFromScreenshot(beforePath);
    await swipeAndroid("phone penalty deck pull", layout.points.deckPullStart, layout.points.deckPullEnd, 760);
    await waitFor("phone accepted draw penalty by deck pull", () =>
      live.game?.moveHistory?.some(entry =>
        entry.version > version &&
        entry.type === "accept_penalty" &&
        entry.playerId === phonePlayerId
      ) &&
      live.game?.handCounts?.[phonePlayerId] === beforeHandCount + 2 &&
      !live.game?.activeEffect,
      16000
    );
    await sleep(1100);
    await captureAndroid("02-penalty-after");
    const afterHandCount = live.game.handCounts[phonePlayerId];
    assertCondition(afterHandCount === beforeHandCount + 2, `Penalty draw count mismatch: expected ${beforeHandCount + 2}, got ${afterHandCount}`);
    results.push({
      scenario: "phone_penalty_accept_deck_pull",
      ok: true,
      beforeHandCount,
      afterHandCount,
      coordinates: layout.points
    });
  }

  async function runPlainCardDrag() {
    const version = await seed("phone_plain_play_ready");
    const beforeHandCount = live.game?.handCounts?.[phonePlayerId];
    const beforeTopCard = live.game?.topCard;
    assertCondition(beforeHandCount === 3, `phone_plain_play_ready expected phone hand count 3, got ${beforeHandCount}`);
    const beforePath = await captureAndroid("03-play-before");
    const layout = deriveLayoutFromScreenshot(beforePath);
    const candidates = cardDragCandidates(layout);
    const errorsBefore = live.errors.length;
    let played = false;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      await swipeAndroid(`phone card drag ${index + 1} ${candidate.note}`, candidate.start, candidate.end, candidate.durationMs);
      try {
        await waitFor(`phone play_cards after drag ${index + 1}`, () =>
          live.game?.moveHistory?.some(entry =>
            entry.version > version &&
            entry.type === EVENTS.PLAY_CARDS &&
            entry.playerId === phonePlayerId
          ) &&
          topCardKey(live.game?.topCard) !== topCardKey(beforeTopCard),
          4200,
          180
        );
        played = true;
        break;
      } catch (err) {
        log(`Drag attempt ${index + 1} did not play a card: ${err.message}`);
      }
    }
    if (!played) {
      const newErrors = live.errors.slice(errorsBefore);
      throw new Error(`Card drag attempts did not produce phone play_cards. Server errors: ${newErrors.join("; ") || "none"}`);
    }
    await sleep(1100);
    await captureAndroid("04-play-after");
    const afterHandCount = live.game.handCounts[phonePlayerId];
    assertCondition(afterHandCount < beforeHandCount, `Phone hand count did not decrease after play: before ${beforeHandCount}, after ${afterHandCount}`);
    assertCondition(topCardKey(live.game.topCard) !== topCardKey(beforeTopCard), "Phone card drag did not change topCard.");
    results.push({
      scenario: "phone_plain_play_ready_card_drag",
      ok: true,
      beforeHandCount,
      afterHandCount,
      beforeTopCard,
      afterTopCard: live.game.topCard,
      coordinates: {
        layout: layout.points,
        attempts: candidates
      }
    });
  }

  await runPenaltyDeckPull();
  if (options.relaunchBeforePlay) {
    await relaunchPhoneClient("03");
  } else {
    log("Continuing to phone-side card drag without native activity relaunch");
  }
  await runPlainCardDrag();

  const result = {
    ok: true,
    roomId,
    nodePlayerId: nodeClientId,
    phonePlayerId,
    relaunchBeforePlay: options.relaunchBeforePlay,
    results,
    serverErrors: live.errors,
    outDir: options.outDir
  };
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  log(`DONE ${JSON.stringify(result)}`);
  socket.disconnect();
}

main().catch(err => {
  const result = { ok: false, error: err.stack || err.message, outDir: options.outDir };
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  log(`FAIL ${err.stack || err.message}`);
  process.exit(1);
});
