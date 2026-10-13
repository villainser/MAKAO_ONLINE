#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { io } = require(path.join(projectDir, 'frontend/node_modules/socket.io-client'));
const { chromium } = require(path.join(projectDir, 'frontend/node_modules/playwright'));
const backendPort = Number(process.env.MAKAO_SESSION_UI_BACKEND_PORT || 31992);
const frontendPort = Number(process.env.MAKAO_SESSION_UI_FRONTEND_PORT || 4174);
const serverUrl = `http://127.0.0.1:${backendPort}`;
const appUrl = `http://127.0.0.1:${frontendPort}`;
const outputDir = path.join(projectDir, 'output/session-recovery-ui');
const temporaryDir = await mkdtemp(path.join(os.tmpdir(), 'makao-session-ui-'));
const children = [];
const sockets = [];

const EVENTS = {
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  TOGGLE_READY: 'toggle_ready',
  START_GAME: 'start_game',
  ROOM_STATE_UPDATE: 'room_state_update',
  GAME_STATE_UPDATE: 'game_state_update',
  LEAVE_ROOM: 'leave_room'
};

function waitForOutput(child, pattern, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label}\n${output}`)), timeoutMs);
    const onData = chunk => {
      output += String(chunk);
      if (!pattern.test(output)) return;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      resolve();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`${label} zakończył się kodem ${code}\n${output}`));
    });
  });
}

async function waitForHttp(url, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Serwer developerski może już wypisać adres, zanim zacznie przyjmować połączenia.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout HTTP: ${url}`);
}

function start(command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  children.push(child);
  return child;
}

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout: ${event}`));
    }, timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function emitAck(socket, event, payload = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (error) return reject(error);
      if (response?.success === false) return reject(new Error(response.error || event));
      resolve(response);
    });
  });
}

function connect() {
  const socket = io(serverUrl, { forceNew: true, reconnection: false });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
}

let browser;
try {
  await mkdir(outputDir, { recursive: true });
  const backend = start('node', ['server.js'], path.join(projectDir, 'backend'), {
    PORT: String(backendPort),
    MAKAO_STATE_FILE: path.join(temporaryDir, 'rooms.json')
  });
  await waitForOutput(backend, /Server listening/, 'backend');

  start(
    'python3',
    ['-m', 'http.server', String(frontendPort), '--bind', '127.0.0.1', '--directory', path.join(projectDir, 'frontend/dist')],
    projectDir
  );
  await waitForHttp(appUrl);

  const suffix = Date.now();
  const hostId = `ui_host_${suffix}`;
  const guestId = `ui_guest_${suffix}`;
  const host = await connect();
  const guest = await connect();
  const created = await emitAck(host, EVENTS.CREATE_ROOM, {
    clientId: hostId,
    playerName: 'Ala'
  });
  const roomId = created.room.id;
  await emitAck(guest, EVENTS.JOIN_ROOM, {
    roomId,
    clientId: guestId,
    playerName: 'Bartek'
  });

  const bothReady = waitForEvent(host, EVENTS.ROOM_STATE_UPDATE, room =>
    room?.players?.length === 2 && room.players.every(player => player.isReady)
  );
  guest.emit(EVENTS.TOGGLE_READY);
  await bothReady;
  const gameStarted = waitForEvent(host, EVENTS.GAME_STATE_UPDATE, state => state?.stateVersion === 1);
  host.emit(EVENTS.START_GAME);
  await gameStarted;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(({ roomId: savedRoomId, clientId, savedServerUrl }) => {
    localStorage.setItem('makaoRoomId', savedRoomId);
    localStorage.setItem('makaoClientId', clientId);
    localStorage.setItem('makaoServerUrl', savedServerUrl);
  }, { roomId, clientId: hostId, savedServerUrl: serverUrl });
  const page = await context.newPage();
  const errors = [];
  const requestFailures = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('requestfailed', request => {
    requestFailures.push(`${request.url()} — ${request.failure()?.errorText || 'request failed'}`);
  });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Menu gry' }).waitFor();

  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.getByRole('button', { name: 'Menu gry' }).click();
  await page.getByRole('button', { name: 'Odśwież stan sesji' }).waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputDir, 'refresh-menu.png'), fullPage: true });
  await page.getByRole('button', { name: 'Odśwież stan sesji' }).click();
  await page.getByText('Pobrano aktualny stan sesji z serwera.').waitFor();
  const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(after.roomId, before.roomId);
  assert.deepEqual(after.hand.map(card => card.id), before.hand.map(card => card.id));
  assert.equal(after.topCard, before.topCard);

  await emitAck(guest, EVENTS.LEAVE_ROOM, {
    roomId,
    clientId: guestId,
    actionId: `ui-leave-${suffix}`
  });
  await page.getByText('Bartek opuścił pokój. Partia została zakończona.').waitFor();
  await page.getByRole('button', { name: 'Czekaj w pokoju' }).waitFor();
  await page.getByRole('button', { name: 'Opuść pokój' }).waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, 'player-left-choices.png'), fullPage: true });
  assert.equal(await page.evaluate(() => localStorage.getItem('makaoRoomId')), roomId);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Czekaj w pokoju' }).waitFor();
  await page.getByRole('button', { name: 'Opuść pokój' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('makaoRoomId')), roomId);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputDir, 'game-over-reload.png'), fullPage: true });

  await page.getByRole('button', { name: 'Czekaj w pokoju' }).click();
  await page.locator('.lobby-screen').waitFor();
  await page.getByRole('button', { name: 'Ustawienia pokoju' }).click();
  const noTurnLimitButton = page.getByRole('button', { name: 'Bez limitu' });
  await noTurnLimitButton.waitFor();
  assert.match(await noTurnLimitButton.getAttribute('class'), /settings-segment-active/);
  const multiCardToggle = page.getByRole('button', {
    name: 'Pozwól zagrywać kilka kart tej samej wartości w jednym ruchu'
  });
  await multiCardToggle.waitFor();
  assert.equal(await multiCardToggle.getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputDir, 'allow-multiple-default-on.png'), fullPage: true });
  await multiCardToggle.click();
  await page.waitForFunction(() => {
    const toggle = document.querySelector('[aria-label="Pozwól zagrywać kilka kart tej samej wartości w jednym ruchu"]');
    return toggle?.getAttribute('aria-pressed') === 'false';
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, 'allow-multiple-off.png'), fullPage: true });
  const actionableConsoleErrors = errors.filter(error => !error.includes('Failed to load resource'));
  assert.deepEqual(actionableConsoleErrors, []);
  assert.deepEqual(requestFailures, []);

  console.log(JSON.stringify({
    ok: true,
    roomId,
    refreshPreservedHand: true,
    refreshPreservedTopCard: true,
    playerLeftChoicesVisible: true,
    gameOverSurvivedReload: true,
    waitInRoomReturnedToLobby: true,
    noTurnLimitIsLabeledAndSelected: true,
    allowMultipleDefaultOnAndToggleWorked: true,
    screenshots: [
      path.join(outputDir, 'refresh-menu.png'),
      path.join(outputDir, 'player-left-choices.png'),
      path.join(outputDir, 'game-over-reload.png'),
      path.join(outputDir, 'allow-multiple-default-on.png'),
      path.join(outputDir, 'allow-multiple-off.png')
    ]
  }, null, 2));
} finally {
  for (const socket of sockets) socket.disconnect();
  if (browser) await browser.close();
  for (const child of children.reverse()) await stopChild(child);
  await rm(temporaryDir, { recursive: true, force: true });
}
