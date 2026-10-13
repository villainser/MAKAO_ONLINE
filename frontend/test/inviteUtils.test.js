import assert from 'node:assert/strict';
import test from 'node:test';
import { createInviteText, createInviteUrl, parseInviteText } from '../src/inviteUtils.js';

const TEST_SERVER_URL = 'https://game.example';

test('invite text contains and parses table name, room code and server address', () => {
  const inviteText = createInviteText({
    appUrl: 'https://makao.example/app',
    serverUrl: 'https://gra.example',
    roomId: 'ab12cd',
    roomName: 'Sobotni stolik'
  });

  const parsed = parseInviteText(inviteText);

  assert.equal(parsed.roomId, 'AB12CD');
  assert.equal(parsed.roomName, 'Sobotni stolik');
  assert.equal(parsed.serverUrl, 'https://gra.example');
});

test('invite link carries room, server and table query params', () => {
  const inviteUrl = createInviteUrl({
    appUrl: 'capacitor://localhost',
    serverUrl: 'https://gra.example',
    roomId: 'QW12ER',
    roomName: 'Stół testowy'
  });

  const parsed = parseInviteText(inviteUrl);

  assert.equal(inviteUrl.startsWith('https://gra.example/'), true);
  assert.equal(parsed.roomId, 'QW12ER');
  assert.equal(parsed.roomName, 'Stół testowy');
  assert.equal(parsed.serverUrl, 'https://gra.example');
});

test('local preview origin is replaced with the production invite origin', () => {
  const inviteUrl = createInviteUrl({
    appUrl: 'http://127.0.0.1:4173',
    serverUrl: TEST_SERVER_URL,
    roomId: 'LO12CA',
    roomName: 'Bez localhost'
  });

  const parsed = parseInviteText(inviteUrl);

  assert.equal(inviteUrl.startsWith(`${TEST_SERVER_URL}/`), true);
  assert.equal(inviteUrl.includes('127.0.0.1'), false);
  assert.equal(parsed.serverUrl, TEST_SERVER_URL);
  assert.equal(parsed.roomId, 'LO12CA');
});

test('invite without explicit server uses the current public app origin', () => {
  const inviteText = createInviteText({
    appUrl: TEST_SERVER_URL,
    roomId: 'PR0D01',
    roomName: 'Produkcja'
  });

  const parsed = parseInviteText(inviteText);

  assert.match(inviteText, new RegExp(`Serwer: ${TEST_SERVER_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.equal(parsed.serverUrl, TEST_SERVER_URL);
  assert.equal(parsed.roomId, 'PR0D01');
});

test('plain production link without server query uses link origin as server', () => {
  const parsed = parseInviteText(`${TEST_SERVER_URL}/?room=AB12CD&table=Stol`);

  assert.equal(parsed.roomId, 'AB12CD');
  assert.equal(parsed.serverUrl, TEST_SERVER_URL);
});

test('plain room code is accepted as a minimal invitation', () => {
  const parsed = parseInviteText('q1w2e3');

  assert.equal(parsed.roomId, 'Q1W2E3');
  assert.equal(parsed.roomName, '');
  assert.equal(parsed.serverUrl, '');
});

 test('local-only invite requires an explicitly configured public server', () => {
  assert.throws(() => createInviteUrl({appUrl: 'http://localhost:5173', roomId: 'ABC123'}), /Ustaw adres serwera/);
});
test('invite follows a different deployment domain without a source change', () => {
  assert.equal(new URL(createInviteUrl({appUrl: 'https://another.example/app', roomId: 'ABC123'})).origin, 'https://another.example');
});
