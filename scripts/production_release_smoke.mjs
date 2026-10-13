#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { io } = require('../frontend/node_modules/socket.io-client');
const serverUrl = process.argv[2] || process.env.MAKAO_SERVER_URL;
if (!serverUrl) throw new Error('Provide the server URL as an argument or MAKAO_SERVER_URL');
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const hostId = `release_host_${suffix}`;
const guestId = `release_guest_${suffix}`;
const sockets = [];
let roomId = '';
let hostToken = '';
let guestToken = '';

function connect() {
  const socket = io(serverUrl, {
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
    timeout: 8_000
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 10_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function emitAck(socket, event, payload, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (error) return reject(error);
      if (!response?.success) return reject(new Error(response?.error || `${event} rejected`));
      resolve(response);
    });
  });
}

async function leave(socket, clientId, resumeToken, label) {
  if (!socket?.connected || !roomId) return null;
  return emitAck(socket, 'leave_room', {
    roomId,
    clientId,
    resumeToken,
    actionId: `release_leave_${label}_${suffix}`
  });
}

let host;
let guest;
try {
  host = await connect();
  guest = await connect();
  const created = await emitAck(host, 'create_room', {
    clientId: hostId,
    playerName: 'Release Host',
    roomName: 'Release smoke',
    supportsResumeToken: true
  });
  roomId = created.room.id;
  hostToken = created.resumeToken;
  assert.equal(typeof hostToken, 'string');
  assert.ok(hostToken.length >= 32);

  const joined = await emitAck(guest, 'join_room', {
    roomId,
    clientId: guestId,
    playerName: 'Release Guest',
    supportsResumeToken: true
  });
  guestToken = joined.resumeToken;
  assert.equal(joined.room.players.length, 2);
  assert.equal(typeof guestToken, 'string');
  assert.ok(guestToken.length >= 32);
  assert.equal(JSON.stringify(joined.room).includes(hostToken), false);
  assert.equal(JSON.stringify(joined.room).includes(guestToken), false);

  const guestLeave = await leave(guest, guestId, guestToken, 'guest');
  assert.equal(guestLeave.room.players.length, 1);
  guestToken = '';
  const hostLeave = await leave(host, hostId, hostToken, 'host');
  assert.equal(hostLeave.room, null);
  hostToken = '';
  console.log(JSON.stringify({ ok: true, serverUrl, roomId, transport: 'websocket', roomRemoved: true }, null, 2));
} finally {
  try {
    if (guestToken) await leave(guest, guestId, guestToken, 'guest_cleanup');
  } catch {}
  try {
    if (hostToken) await leave(host, hostId, hostToken, 'host_cleanup');
  } catch {}
  for (const socket of sockets) socket.close();
}
