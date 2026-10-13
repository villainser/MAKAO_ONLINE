#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { filterAppLogcat, findAppLogcatErrors } from './android_logcat_filter.mjs';

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AUTHORIZED_SERIAL = process.env.ANDROID_SERIAL || '';
const PACKAGE_NAME = 'pl.makao.zeznajomymi';
const MAIN_ACTIVITY = `${PACKAGE_NAME}/.MainActivity`;
const DEFAULT_CDP_PORT = 9222;

const EVENTS = {
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  ROOM_STATE_UPDATE: 'room_state_update',
  GAME_STATE_UPDATE: 'game_state_update',
  TOGGLE_READY: 'toggle_ready'
};

function usage() {
  return `Usage: node scripts/main_activity_hybrid_smoke.mjs [options]

Safe default: without --run this command only prints the execution contract.

Required runtime opt-in:
  --run                  Authorize the disposable two-player smoke on the selected device.

Options:
  --serial SERIAL        Must match ANDROID_SERIAL. Defaults to that variable.
  --cdp-port PORT        Local ADB WebView-debug port. Default: ${DEFAULT_CDP_PORT}.
  --server URL           Require the React Home server selector to match this origin.
                         If omitted, the runner reads the active server from Home.
  --out-dir DIR          Evidence directory. Default: output/android-smoke/
                         main-activity-hybrid-<stamp>-<serial>
  --timeout-ms N         UI/network timeout. Default: 15000.
  -h, --help             Show this help.

Prerequisites:
  1. Set ANDROID_SERIAL to a connected, authorized and unlocked device.
  2. The installed debuggable app is already open in ${MAIN_ACTIVITY} at fresh Home.
  3. Home has no persisted room/session. The runner refuses Lobby/game/resume state.
  4. frontend/node_modules contains playwright and socket.io-client.
  5. Do not operate the selected device while the opted-in smoke is running.

The runner does not build, install, uninstall, clear, force-stop or launch the app.
It creates only a fresh room, cleans that room through the tested UI, captures
device/WebView screenshots and scans package-scoped logcat without clearing it.`;
}

function parseArgs(argv) {
  const options = {
    run: false,
    serial: AUTHORIZED_SERIAL,
    cdpPort: DEFAULT_CDP_PORT,
    server: '',
    outDir: '',
    timeoutMs: 15000,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run') options.run = true;
    else if (arg === '--serial') options.serial = argv[++index] || '';
    else if (arg === '--cdp-port') options.cdpPort = Number(argv[++index]);
    else if (arg === '--server') options.server = argv[++index] || '';
    else if (arg === '--out-dir') options.outDir = argv[++index] || '';
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '-h' || arg === '--help') options.help = true;
    else throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
  }

  if (options.run && !options.help && !AUTHORIZED_SERIAL) {
    throw new Error('Set ANDROID_SERIAL to the intended device before using --run.');
  }
  if (options.serial !== AUTHORIZED_SERIAL) {
    throw new Error(`Refusing unauthorized device ${options.serial || '<empty>'}; expected ${AUTHORIZED_SERIAL}`);
  }
  if (!Number.isInteger(options.cdpPort) || options.cdpPort < 1024 || options.cdpPort > 65535) {
    throw new Error(`Invalid --cdp-port: ${options.cdpPort}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 5000 || options.timeoutMs > 120000) {
    throw new Error(`Invalid --timeout-ms: ${options.timeoutMs}`);
  }
  if (options.server) options.server = normalizeOrigin(options.server, '--server');

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  options.outDir = path.resolve(
    options.outDir || path.join(projectDir, 'output/android-smoke', `main-activity-hybrid-${stamp}-${options.serial}`)
  );
  return options;
}

function normalizeOrigin(value, label = 'server URL') {
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported ${label} protocol: ${parsed.protocol}`);
  }
  return parsed.origin;
}

function outputText(value) {
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value || '');
}

function runCommand(command, args, { encoding = 'utf8', check = true, maxBuffer = 60 * 1024 * 1024 } = {}) {
  const result = spawnSync(command, args, {
    cwd: projectDir,
    encoding,
    maxBuffer
  });
  if (result.error) throw result.error;
  if (check && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${outputText(result.stderr) || outputText(result.stdout)}`
    );
  }
  return result.stdout;
}

function adb(options, args, commandOptions = {}) {
  return runCommand('adb', ['-s', options.serial, ...args], commandOptions);
}

function adbText(options, args, commandOptions = {}) {
  return outputText(adb(options, args, commandOptions)).replace(/\r/g, '');
}

function log(message) {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(label, predicate, timeoutMs, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  const suffix = lastError ? `: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${label}${suffix}`);
}

function emitAck(socket, event, payload = {}, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (error) {
        reject(new Error(`${event}: ${error.message || error}`));
        return;
      }
      if (!response?.success) {
        reject(new Error(`${event}: ${response?.error || 'unsuccessful ACK'}`));
        return;
      }
      resolve(response);
    });
  });
}

function waitForRoom(socket, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(EVENTS.ROOM_STATE_UPDATE, handler);
      reject(new Error(`${EVENTS.ROOM_STATE_UPDATE} timeout`));
    }, timeoutMs);
    const handler = room => {
      if (!predicate(room)) return;
      clearTimeout(timer);
      socket.off(EVENTS.ROOM_STATE_UPDATE, handler);
      resolve(room);
    };
    socket.on(EVENTS.ROOM_STATE_UPDATE, handler);
  });
}

function parsePidList(raw) {
  return [...new Set(String(raw || '').trim().split(/\s+/).filter(value => /^\d+$/.test(value)))].sort();
}

function assertPng(filePath) {
  const bytes = fs.readFileSync(filePath);
  assert.ok(bytes.length >= 10000, `Screenshot is suspiciously small: ${filePath} (${bytes.length} bytes)`);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Screenshot is not PNG: ${filePath}`);
}

function getForegroundActivity(options) {
  return adbText(options, ['shell', 'dumpsys', 'activity', 'activities']);
}

function assertMainActivityForeground(options) {
  const activities = getForegroundActivity(options);
  const resumedLines = activities
    .split(/\n/)
    .filter(line => /mResumedActivity|topResumedActivity|ResumedActivity/.test(line));
  const isMainActivity = resumedLines.some(line =>
    line.includes(PACKAGE_NAME) && (line.includes('/.MainActivity') || line.includes(`${PACKAGE_NAME}.MainActivity`))
  );
  assert.ok(
    isMainActivity,
    `SAFE REFUSAL: ${MAIN_ACTIVITY} is not the foreground activity. Open the installed debug app manually at fresh Home first. `
      + `Observed: ${resumedLines.join(' | ') || 'no resumed activity'}`
  );
}

function findWebViewSocket(options, appPids) {
  const unixSockets = adbText(options, ['shell', 'cat', '/proc/net/unix']);
  const sockets = [...unixSockets.matchAll(/@(webview_devtools_remote[^\s]*)/g)].map(match => match[1]);
  for (const pid of appPids) {
    const exact = sockets.find(socketName => socketName === `webview_devtools_remote_${pid}`);
    if (exact) return exact;
  }
  const appScoped = sockets.filter(socketName => appPids.some(pid => socketName.endsWith(`_${pid}`)));
  if (appScoped.length === 1) return appScoped[0];
  throw new Error(
    `No unique debuggable WebView socket for ${PACKAGE_NAME} PID(s) ${appPids.join(', ')}. `
      + 'Install/open a debuggable build with WebView debugging enabled.'
  );
}

function ensureCdpForward(options, socketName) {
  const local = `tcp:${options.cdpPort}`;
  const remote = `localabstract:${socketName}`;
  const forwards = outputText(runCommand('adb', ['forward', '--list']));
  const collision = forwards
    .split(/\r?\n/)
    .map(line => line.trim().split(/\s+/))
    .find(parts => parts[1] === local);

  if (collision) {
    assert.deepEqual(
      collision.slice(0, 3),
      [options.serial, local, remote],
      `SAFE REFUSAL: ${local} is already forwarded elsewhere: ${collision.join(' ')}`
    );
    return false;
  }

  adb(options, ['forward', local, remote]);
  return true;
}

async function getLaunchConfig(page) {
  return page.evaluate(async () => {
    const plugin = window.Capacitor?.Plugins?.NativeGame;
    if (!plugin?.getLaunchConfig) throw new Error('NativeGame.getLaunchConfig is unavailable');
    return plugin.getLaunchConfig();
  });
}

function sanitizeLaunchConfig(config) {
  return {
    active: Boolean(config?.active),
    serverUrl: config?.serverUrl || '',
    roomId: config?.roomId || '',
    playerName: config?.playerName || '',
    clientIdPresent: Boolean(config?.clientId)
  };
}

async function shellProof(page) {
  return page.evaluate(async () => {
    const launchConfig = await window.Capacitor?.Plugins?.NativeGame?.getLaunchConfig?.();
    return {
      url: window.location.href,
      platform: window.Capacitor?.getPlatform?.() || '',
      home: Boolean(document.querySelector('.home-card')),
      lobby: Boolean(document.querySelector('main.lobby-screen')),
      gameScreen: Boolean(document.querySelector('main.game-screen')),
      nativeOverlay: Boolean(document.querySelector('main.native-table-overlay')),
      overlayClassHtml: document.documentElement.classList.contains('native-table-overlay-mode'),
      overlayClassBody: document.body.classList.contains('native-table-overlay-mode'),
      persistedRoomId: window.localStorage.getItem('makaoRoomId') || '',
      launchConfig: launchConfig || null
    };
  });
}

async function instrumentNativeCalls(page) {
  return page.evaluate(() => {
    const capacitor = window.Capacitor;
    const original = capacitor?.nativePromise;
    if (typeof original !== 'function') {
      return { enabled: false, reason: 'Capacitor.nativePromise is unavailable' };
    }
    if (window.__makaoMainActivityHybridSmoke) {
      return { enabled: false, reason: 'hybrid smoke instrumentation already exists' };
    }

    const calls = [];
    const wrapped = function wrappedNativePromise(pluginName, methodName, options) {
      calls.push({
        pluginName: String(pluginName || ''),
        methodName: String(methodName || ''),
        options: {
          serverUrl: options?.serverUrl || '',
          roomId: options?.roomId || '',
          playerName: options?.playerName || '',
          hasClientId: Boolean(options?.clientId),
          hasResumeToken: Boolean(options?.resumeToken),
          active: typeof options?.active === 'boolean' ? options.active : undefined,
          command: options?.command || ''
        },
        at: performance.now()
      });
      return original.call(this, pluginName, methodName, options);
    };

    try {
      capacitor.nativePromise = wrapped;
    } catch (error) {
      return { enabled: false, reason: String(error) };
    }
    if (capacitor.nativePromise !== wrapped) {
      return { enabled: false, reason: 'Capacitor.nativePromise is not writable' };
    }

    window.__makaoMainActivityHybridSmoke = { calls, original, wrapped };
    return { enabled: true, reason: '' };
  });
}

async function readNativeCalls(page) {
  return page.evaluate(() => window.__makaoMainActivityHybridSmoke?.calls || []);
}

async function restoreNativeCalls(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => {
    const instrumentation = window.__makaoMainActivityHybridSmoke;
    if (!instrumentation) return;
    if (window.Capacitor?.nativePromise === instrumentation.wrapped) {
      window.Capacitor.nativePromise = instrumentation.original;
    }
    delete window.__makaoMainActivityHybridSmoke;
  }).catch(() => {});
}

function appSurfaceViewLines(options) {
  return adbText(options, ['shell', 'dumpsys', 'SurfaceFlinger', '--list'])
    .split(/\n/)
    .filter(line => /SurfaceView/i.test(line) && line.includes(PACKAGE_NAME) && /MainActivity/.test(line));
}

async function captureStage(options, page, label, evidence) {
  const devicePath = path.join(options.outDir, `${label}-device.png`);
  const webViewPath = path.join(options.outDir, `${label}-webview.png`);
  const domPath = path.join(options.outDir, `${label}-dom.json`);

  fs.writeFileSync(devicePath, adb(options, ['exec-out', 'screencap', '-p'], { encoding: null }));
  assertPng(devicePath);
  await page.screenshot({ path: webViewPath });
  assertPng(webViewPath);
  const domProof = await shellProof(page);
  domProof.launchConfig = sanitizeLaunchConfig(domProof.launchConfig);
  fs.writeFileSync(domPath, `${JSON.stringify(domProof, null, 2)}\n`);

  evidence.push(devicePath, webViewPath, domPath);
  log(`Captured ${label}`);
}

async function readHomeServer(page, timeoutMs) {
  const settingsTab = page.getByRole('tab', { name: 'Ustawienia', exact: true });
  await settingsTab.click();
  await page.waitForFunction(() =>
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() === 'Ustawienia'
  , null, { timeout: timeoutMs });
  const serverButton = page.locator('.server-value-button');
  await serverButton.waitFor({ state: 'visible', timeout: timeoutMs });
  const serverUrl = normalizeOrigin(await serverButton.innerText(), 'Home server selector');

  await page.getByRole('tab', { name: 'Nowa gra', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() === 'Nowa gra'
  , null, { timeout: timeoutMs });
  await page.getByRole('button', { name: 'Stwórz stół', exact: true }).waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForTimeout(700);
  return serverUrl;
}

function captureLogcat(options, since, knownPids) {
  const raw = adbText(options, ['logcat', '-d', '-v', 'threadtime', '-T', since]);
  for (const match of raw.matchAll(new RegExp(`Process: ${PACKAGE_NAME.replace(/\./g, '\\.')}, PID: (\\d+)`, 'g'))) {
    knownPids.add(match[1]);
  }
  for (const pid of parsePidList(adbText(options, ['shell', 'pidof', PACKAGE_NAME], { check: false }))) {
    knownPids.add(pid);
  }

  const filtered = filterAppLogcat(raw, {
    packageName: PACKAGE_NAME,
    pids: [...knownPids]
  });
  const errors = findAppLogcatErrors(filtered).filter(line => {
    const informationalCapacitorConsole = /\s[VDI]\s+Capacitor\/Console:/.test(line)
      && !/Mixed Content|TypeError|ReferenceError|\bERR_|Uncaught|Exception|\bError\b/.test(line);
    return !informationalCapacitorConsole;
  });
  const logPath = path.join(options.outDir, 'logcat-app.txt');
  const errorPath = path.join(options.outDir, 'logcat-errors.txt');
  fs.writeFileSync(logPath, filtered);
  fs.writeFileSync(errorPath, errors.length ? `${errors.join('\n')}\n` : '');
  return { errors, logPath, errorPath };
}

async function safeCleanupTestRoom(state) {
  const { options, page } = state;
  if (!page || page.isClosed()) return;

  if (!state.roomId && state.roomCreationAttempted) {
    const candidate = await page.evaluate(() => window.localStorage.getItem('makaoRoomId') || '').catch(() => '');
    if (/^[A-Z0-9]{6}$/.test(candidate)) state.roomId = candidate;
  }
  const roomId = state.roomId;
  if (!roomId) return;

  try {
    const ownership = await page.evaluate(async expectedRoomId => {
      const config = await window.Capacitor?.Plugins?.NativeGame?.getLaunchConfig?.();
      const roomCode = document.querySelector('.room-code')?.textContent || '';
      const overlayCode = document.querySelector('.native-table-overlay-chip strong')?.textContent || '';
      return {
        launchActive: Boolean(config?.active),
        launchRoomId: config?.roomId || '',
        persistedRoomId: window.localStorage.getItem('makaoRoomId') || '',
        lobbyMatches: roomCode.includes(expectedRoomId),
        overlayMatches: overlayCode.includes(expectedRoomId)
      };
    }, roomId);

    if (ownership.launchActive && ownership.launchRoomId === roomId) {
      await page.evaluate(() => window.Capacitor.Plugins.NativeGame.sendCommand({
        command: 'leave_room',
        payload: { source: 'hybrid_smoke_cleanup' }
      }));
      await page.locator('.home-card').waitFor({ state: 'visible', timeout: options.timeoutMs });
      await waitFor('fallback hybrid cleanup', async () => !(await getLaunchConfig(page))?.active, options.timeoutMs);
      state.roomCleaned = true;
      return;
    }

    if (ownership.lobbyMatches && ownership.persistedRoomId === roomId) {
      const leaveButton = page.getByRole('button', { name: 'Wyjdź', exact: true });
      if (await leaveButton.count()) {
        await leaveButton.click();
        await page.locator('.home-card').waitFor({ state: 'visible', timeout: options.timeoutMs });
        const cleanedRoomId = await page.evaluate(() => window.localStorage.getItem('makaoRoomId') || '');
        assert.equal(cleanedRoomId, '', 'Lobby cleanup left the disposable room persisted');
        state.roomCleaned = true;
      }
      return;
    }

    if (ownership.persistedRoomId === roomId || ownership.overlayMatches) {
      state.cleanupWarnings.push('Owned test room remained in an unrecognized UI state; no blind device input was sent.');
    }
  } catch (error) {
    state.cleanupWarnings.push(`UI cleanup failed: ${error.message}`);
  }
}

async function runSmoke(options) {
  const { chromium } = require(path.join(projectDir, 'frontend/node_modules/playwright'));
  const { io } = require(path.join(projectDir, 'frontend/node_modules/socket.io-client'));

  fs.mkdirSync(options.outDir, { recursive: true });
  const resultPath = path.join(options.outDir, 'result.json');
  const state = {
    options,
    browser: null,
    page: null,
    guest: null,
    guestId: '',
    roomId: '',
    roomCreationAttempted: false,
    roomCleaned: false,
    createdForward: false,
    instrumentation: { enabled: false, reason: 'not attempted' },
    cleanupWarnings: [],
    evidence: [],
    consoleErrors: [],
    liveRoom: null,
    liveGame: null,
    initialPids: [],
    knownPids: new Set(),
    logcatSince: '',
    proof: {}
  };
  let primaryError = null;

  try {
    const adbVersion = outputText(runCommand('adb', ['version']));
    assert.match(adbVersion, /Android Debug Bridge/, 'adb is unavailable');
    const deviceRows = outputText(runCommand('adb', ['devices']))
      .split(/\r?\n/)
      .map(line => line.trim().split(/\s+/));
    const device = deviceRows.find(parts => parts[0] === options.serial);
    assert.equal(device?.[1], 'device', `Selected device ${options.serial} is not connected and authorized`);
    assertMainActivityForeground(options);

    const initialPids = parsePidList(adbText(options, ['shell', 'pidof', PACKAGE_NAME], { check: false }));
    assert.equal(initialPids.length, 1, `Expected one running ${PACKAGE_NAME} process, got: ${initialPids.join(', ') || 'none'}`);
    state.initialPids = initialPids;
    initialPids.forEach(pid => state.knownPids.add(pid));
    state.logcatSince = adbText(options, ['shell', 'date', '+%m-%d %H:%M:%S.000']).trim();

    const socketName = findWebViewSocket(options, initialPids);
    state.createdForward = ensureCdpForward(options, socketName);
    state.browser = await chromium.connectOverCDP(`http://127.0.0.1:${options.cdpPort}`);
    const pages = state.browser.contexts().flatMap(context => context.pages());
    state.page = pages.find(page => /^https?:\/\/localhost(?::\d+)?\//.test(page.url())) || pages[0];
    assert.ok(state.page, 'Android MainActivity WebView page was not exposed over CDP');

    state.page.on('console', message => {
      if (message.type() === 'error') state.consoleErrors.push(message.text());
    });
    state.page.on('pageerror', error => state.consoleErrors.push(String(error)));

    await state.page.waitForFunction(() => document.readyState !== 'loading' && Boolean(document.querySelector('#root')), null, {
      timeout: options.timeoutMs
    });
    await sleep(300);
    const initial = await shellProof(state.page);
    assert.equal(initial.platform, 'android', 'CDP page is not the Android Capacitor shell');
    assert.equal(initial.lobby, false, 'SAFE REFUSAL: current React session is already in Lobby');
    assert.equal(initial.gameScreen, false, 'SAFE REFUSAL: current session is already in React gameplay');
    assert.equal(initial.nativeOverlay, false, 'SAFE REFUSAL: current session is already in native gameplay');
    assert.equal(initial.persistedRoomId, '', `SAFE REFUSAL: persisted room ${initial.persistedRoomId} must be left manually first`);
    assert.equal(initial.launchConfig?.active, false, 'SAFE REFUSAL: MainActivity already reports an active native table');
    assert.equal(initial.home, true, 'React Home is not active after the safe session checks');

    const activeServer = await readHomeServer(state.page, options.timeoutMs);
    if (options.server) {
      assert.equal(activeServer, options.server, `Home uses ${activeServer}, not requested ${options.server}`);
    }
    state.proof.serverUrl = activeServer;
    state.instrumentation = await instrumentNativeCalls(state.page);
    await captureStage(options, state.page, '01-react-home', state.evidence);

    const homeProof = await shellProof(state.page);
    assert.equal(homeProof.home, true, 'Home left React before room creation');
    assert.equal(homeProof.gameScreen, false, 'React Game rendered on Home');
    assert.equal(homeProof.nativeOverlay, false, 'Native overlay rendered on Home');
    assert.equal(homeProof.launchConfig.active, false, 'Native launch config was active on Home');
    const homeOpenCalls = (await readNativeCalls(state.page))
      .filter(call => call.pluginName === 'NativeGame' && call.methodName === 'open');
    if (state.instrumentation.enabled) assert.equal(homeOpenCalls.length, 0, 'NativeGame.open ran on Home');
    state.proof.home = {
      reactHome: homeProof.home,
      reactGameScreen: homeProof.gameScreen,
      nativeOverlay: homeProof.nativeOverlay,
      nativeOpenCalls: homeOpenCalls.length,
      launchConfig: sanitizeLaunchConfig(homeProof.launchConfig)
    };

    await state.page.getByRole('button', { name: 'Pseudonim', exact: true }).click();
    await state.page.getByRole('dialog', { name: 'Pseudonim', exact: true }).waitFor({ timeout: options.timeoutMs });
    await state.page.keyboard.type('PixelHybridQA');
    await state.page.keyboard.press('Enter');
    await state.page.getByRole('button', { name: 'PixelHybridQA', exact: true }).waitFor({ timeout: options.timeoutMs });
    await state.page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Stwórz stół');
      return button && !button.disabled;
    }, null, { timeout: options.timeoutMs });
    state.roomCreationAttempted = true;
    await state.page.getByRole('button', { name: 'Stwórz stół', exact: true }).click();
    await state.page.locator('.lobby-screen').waitFor({ state: 'visible', timeout: options.timeoutMs });

    const roomText = await state.page.locator('.room-code').innerText();
    const persistedRoomId = await state.page.evaluate(() => window.localStorage.getItem('makaoRoomId') || '');
    state.roomId = roomText.match(/[A-Z0-9]{6}/)?.[0] || persistedRoomId;
    assert.match(state.roomId, /^[A-Z0-9]{6}$/, `Cannot parse fresh room from: ${roomText}`);
    const suffix = Date.now();
    state.guestId = `hybrid_smoke_guest_${suffix}`;
    log(`Created disposable room ${state.roomId}`);

    state.guest = io(activeServer, { forceNew: true, reconnection: false, timeout: 9000 });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Guest socket connect timeout')), options.timeoutMs);
      state.guest.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      state.guest.once('connect_error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
    state.guest.on(EVENTS.ROOM_STATE_UPDATE, room => { state.liveRoom = room; });
    state.guest.on(EVENTS.GAME_STATE_UPDATE, game => { state.liveGame = game; });

    const joined = await emitAck(state.guest, EVENTS.JOIN_ROOM, {
      roomId: state.roomId,
      playerName: 'NodeHybridQA',
      clientId: state.guestId,
      supportsResumeToken: true
    });
    state.liveRoom = joined.room || state.liveRoom;
    await state.page.getByText('NodeHybridQA', { exact: true }).waitFor({ timeout: options.timeoutMs });

    const guestReady = waitForRoom(
      state.guest,
      room => room?.id === state.roomId && room.players?.find(player => player.id === state.guestId)?.isReady,
      options.timeoutMs
    );
    state.guest.emit(EVENTS.TOGGLE_READY);
    state.liveRoom = await guestReady;

    const hostReady = state.page.getByRole('button', { name: 'Jestem gotowy', exact: true });
    if (await hostReady.count()) await hostReady.click();
    await state.page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Start');
      return button && !button.disabled;
    }, null, { timeout: options.timeoutMs });

    const lobbyProof = await shellProof(state.page);
    assert.equal(lobbyProof.home, false, 'Home remained mounted in Lobby');
    assert.equal(lobbyProof.lobby, true, 'React Lobby is missing');
    assert.equal(lobbyProof.gameScreen, false, 'React Game rendered in Lobby');
    assert.equal(lobbyProof.nativeOverlay, false, 'Native overlay rendered in Lobby');
    assert.equal(lobbyProof.launchConfig.active, false, 'Native launch config was active in Lobby');
    const lobbyOpenCalls = (await readNativeCalls(state.page))
      .filter(call => call.pluginName === 'NativeGame' && call.methodName === 'open');
    if (state.instrumentation.enabled) assert.equal(lobbyOpenCalls.length, 0, 'NativeGame.open ran in Lobby');
    state.proof.lobby = {
      reactLobby: lobbyProof.lobby,
      reactGameScreen: lobbyProof.gameScreen,
      nativeOverlay: lobbyProof.nativeOverlay,
      nativeOpenCalls: lobbyOpenCalls.length,
      launchConfig: sanitizeLaunchConfig(lobbyProof.launchConfig)
    };
    await sleep(300);
    await captureStage(options, state.page, '02-react-lobby', state.evidence);

    await state.page.getByRole('button', { name: 'Start', exact: true }).click();
    await state.page.locator('main.native-table-overlay').waitFor({ state: 'visible', timeout: options.timeoutMs });
    await waitFor('MainActivity hybrid launch config', async () => (await getLaunchConfig(state.page))?.active, options.timeoutMs);
    await waitFor(
      'guest gameplay mirror',
      () => state.liveRoom?.status === 'playing' && Boolean(state.liveGame),
      options.timeoutMs
    );
    await sleep(900);

    const gameplayProof = await shellProof(state.page);
    const gameplayConfig = sanitizeLaunchConfig(gameplayProof.launchConfig);
    assert.equal(gameplayProof.home, false, 'Home remained mounted during gameplay');
    assert.equal(gameplayProof.lobby, false, 'Lobby remained mounted during gameplay');
    assert.equal(gameplayProof.gameScreen, false, 'React main.game-screen rendered in Android hybrid gameplay');
    assert.equal(gameplayProof.nativeOverlay, true, 'React native-table-overlay is missing');
    assert.equal(gameplayProof.overlayClassHtml, true, 'HTML native overlay mode class is missing');
    assert.equal(gameplayProof.overlayClassBody, true, 'Body native overlay mode class is missing');
    assert.equal(gameplayConfig.active, true, 'MainActivity launch config is not active');
    assert.equal(gameplayConfig.roomId, state.roomId, 'MainActivity launch config has the wrong room');
    assert.equal(normalizeOrigin(gameplayConfig.serverUrl, 'native launch server'), activeServer, 'Native launch uses the wrong server');
    assert.equal(gameplayConfig.playerName, 'PixelHybridQA', 'Native launch uses the wrong player name');
    assert.equal(gameplayConfig.clientIdPresent, true, 'Native launch config is missing the client ID');

    const gameplayCalls = await readNativeCalls(state.page);
    const gameplayOpenCalls = gameplayCalls.filter(call => call.pluginName === 'NativeGame' && call.methodName === 'open');
    if (state.instrumentation.enabled) {
      assert.equal(gameplayOpenCalls.length, 1, `Expected exactly one NativeGame.open call, got ${gameplayOpenCalls.length}`);
      assert.equal(gameplayOpenCalls[0].options.roomId, state.roomId, 'NativeGame.open received the wrong room');
    }

    const gameplaySurfaces = appSurfaceViewLines(options);
    assert.ok(gameplaySurfaces.length > 0, 'No package-owned LibGDX SurfaceView is active in MainActivity');
    state.proof.gameplay = {
      launchConfig: gameplayConfig,
      nativeOpenInterception: state.instrumentation,
      nativeOpenCalls: gameplayOpenCalls.length,
      surfaceViews: gameplaySurfaces
    };
    await captureStage(options, state.page, '03-native-gameplay', state.evidence);

    adb(options, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    const leaveDialog = state.page.getByRole('dialog', { name: 'Zrezygnować z partii?', exact: true });
    await leaveDialog.waitFor({ state: 'visible', timeout: options.timeoutMs });
    await sleep(250);
    assert.equal(await state.page.locator('main.game-screen').count(), 0, 'React Game appeared behind the Back confirmation');
    assert.equal(await state.page.locator('main.native-table-overlay').count(), 1, 'Native overlay disappeared behind Back confirmation');
    await captureStage(options, state.page, '04-android-back-confirm', state.evidence);

    await leaveDialog.getByRole('button', { name: 'ANULUJ', exact: true }).click();
    await leaveDialog.waitFor({ state: 'hidden', timeout: options.timeoutMs });
    await sleep(300);

    const afterCancelProof = await shellProof(state.page);
    const afterCancelConfig = sanitizeLaunchConfig(afterCancelProof.launchConfig);
    const overlaySnapshot = await state.page.evaluate(() => window.Capacitor.Plugins.NativeGame.getOverlaySnapshot());
    const afterCancelCalls = await readNativeCalls(state.page);
    const afterCancelOpenCalls = afterCancelCalls.filter(call => call.pluginName === 'NativeGame' && call.methodName === 'open');
    const afterCancelSurfaces = appSurfaceViewLines(options);

    assert.equal(afterCancelProof.gameScreen, false, 'Cancel returned to React Game');
    assert.equal(afterCancelProof.nativeOverlay, true, 'Cancel removed the React native overlay');
    assert.equal(afterCancelConfig.active, true, 'Cancel stopped the MainActivity native table');
    assert.equal(afterCancelConfig.roomId, state.roomId, 'Cancel changed the active native room');
    assert.equal(overlaySnapshot?.active, true, 'Cancel deactivated the native overlay snapshot');
    assert.notEqual(overlaySnapshot?.event?.type, 'confirm_leave', 'Cancel did not clear the sticky leave confirmation');
    if (state.instrumentation.enabled) {
      assert.equal(afterCancelOpenCalls.length, 1, 'Cancel relaunched NativeGame.open');
    }
    assert.ok(afterCancelSurfaces.length > 0, 'Cancel removed the LibGDX SurfaceView');
    assert.equal(state.liveRoom?.id, state.roomId, 'Guest lost the disposable room after cancel');
    assert.equal(state.liveRoom?.status, 'playing', 'Cancel did not preserve server gameplay');
    assert.ok(state.liveGame, 'Guest did not receive a gameplay state');
    assert.equal(state.liveGame.gameOver, false, 'Cancel ended the game');

    state.proof.androidBackCancel = {
      prompt: 'Zrezygnować z partii?',
      launchConfig: afterCancelConfig,
      nativeOpenCalls: afterCancelOpenCalls.length,
      overlaySnapshotActive: Boolean(overlaySnapshot?.active),
      surfaceViews: afterCancelSurfaces,
      roomStatus: state.liveRoom?.status || ''
    };
    await captureStage(options, state.page, '05-cancel-preserves-game', state.evidence);

    assert.deepEqual(state.consoleErrors, [], `WebView console/page errors: ${state.consoleErrors.join(' | ')}`);

    adb(options, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await leaveDialog.waitFor({ state: 'visible', timeout: options.timeoutMs });
    await leaveDialog.getByRole('button', { name: 'REZYGNUJ', exact: true }).click();
    await state.page.locator('.home-card').waitFor({ state: 'visible', timeout: options.timeoutMs });
    await waitFor('hybrid launch cleanup', async () => !(await getLaunchConfig(state.page))?.active, options.timeoutMs);
    const cleanupProof = await shellProof(state.page);
    assert.equal(cleanupProof.home, true, 'Cleanup did not return to React Home');
    assert.equal(cleanupProof.nativeOverlay, false, 'Cleanup left the native overlay mounted');
    assert.equal(cleanupProof.gameScreen, false, 'Cleanup returned through React Game');
    assert.equal(cleanupProof.persistedRoomId, '', 'Cleanup left the disposable room persisted');
    state.proof.cleanup = {
      reactHome: cleanupProof.home,
      nativeOverlay: cleanupProof.nativeOverlay,
      reactGameScreen: cleanupProof.gameScreen,
      persistedRoomId: cleanupProof.persistedRoomId,
      launchConfig: sanitizeLaunchConfig(cleanupProof.launchConfig)
    };
    state.roomCleaned = true;

    if (state.guest?.connected) {
      await emitAck(state.guest, EVENTS.LEAVE_ROOM, {
        roomId: state.roomId,
        clientId: state.guestId,
        actionId: `hybrid-smoke-cleanup-${Date.now()}`
      }).catch(error => state.cleanupWarnings.push(`Guest cleanup ACK: ${error.message}`));
      state.guest.disconnect();
    }
  } catch (error) {
    primaryError = error;
  } finally {
    if (!state.roomCleaned) await safeCleanupTestRoom(state);
    if (state.guest?.connected) {
      if (state.roomId && state.guestId) {
        await emitAck(state.guest, EVENTS.LEAVE_ROOM, {
          roomId: state.roomId,
          clientId: state.guestId,
          actionId: `hybrid-smoke-finally-${Date.now()}`
        }, 4000).catch(() => {});
      }
      state.guest.disconnect();
    }

    if (state.consoleErrors.length > 0) {
      const consoleError = new Error(`WebView console/page errors: ${state.consoleErrors.join(' | ')}`);
      if (!primaryError) primaryError = consoleError;
      else state.cleanupWarnings.push(`Console verification also failed: ${consoleError.message}`);
    }

    let logcatResult = { errors: [], logPath: '', errorPath: '' };
    if (state.logcatSince) {
      try {
        const finalPids = parsePidList(adbText(options, ['shell', 'pidof', PACKAGE_NAME], { check: false }));
        finalPids.forEach(pid => state.knownPids.add(pid));
        logcatResult = captureLogcat(options, state.logcatSince, state.knownPids);
        assert.deepEqual(
          finalPids,
          state.initialPids,
          `App process did not remain stable: initial ${state.initialPids.join(', ')}, final ${finalPids.join(', ') || 'not running'}`
        );
        if (logcatResult.errors.length > 0) {
          throw new Error(`Strict package logcat scan found ${logcatResult.errors.length} actionable error line(s)`);
        }
      } catch (error) {
        if (!primaryError) primaryError = error;
        else state.cleanupWarnings.push(`Logcat verification also failed: ${error.message}`);
      }
    }

    await restoreNativeCalls(state.page);
    if (state.browser) await state.browser.close().catch(() => {});
    if (state.createdForward) {
      adb(options, ['forward', '--remove', `tcp:${options.cdpPort}`], { check: false });
    }

    const result = {
      ok: !primaryError,
      device: options.serial,
      packageName: PACKAGE_NAME,
      activity: MAIN_ACTIVITY,
      roomId: state.roomId,
      roomCreated: Boolean(state.roomId),
      serverUrl: state.proof.serverUrl || '',
      assertions: state.proof,
      interception: state.instrumentation,
      roomCleaned: !state.roomId || state.roomCleaned,
      consoleErrors: state.consoleErrors,
      logcat: {
        file: logcatResult.logPath,
        errorsFile: logcatResult.errorPath,
        actionableErrors: logcatResult.errors.length
      },
      screenshotsAndDom: state.evidence,
      cleanupWarnings: state.cleanupWarnings,
      error: primaryError?.message || ''
    };
    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    log(`Result: ${resultPath}`);
  }

  if (primaryError) throw primaryError;
  console.log(fs.readFileSync(resultPath, 'utf8').trim());
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}

if (options) {
  if (options.help) {
    console.log(usage());
  } else if (!options.run) {
    console.log(`${usage()}\n\nDry run only. Add --run after confirming the prerequisites above.`);
  } else {
    await runSmoke(options).catch(error => {
      console.error(`FAIL: ${error.stack || error.message}`);
      process.exitCode = 1;
    });
  }
}
