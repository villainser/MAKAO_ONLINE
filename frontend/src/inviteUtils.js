const ROOM_CODE_LENGTH = 6;

function cleanRoomId(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

function trimTrailingUrlPunctuation(value) {
  return String(value || '').replace(/[)\].,;!?]+$/g, '');
}

function firstHttpUrl(value) {
  const match = String(value || '').match(/https?:\/\/[^\s<>"']+/i);
  return match ? trimTrailingUrlPunctuation(match[0]) : '';
}

function getLabeledValue(text, labels) {
  const labelPattern = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`^(?:${labelPattern})\\s*[:=-]\\s*(.+)$`, 'i');
  const lines = String(text || '').split(/\r?\n/);

  for (const line of lines) {
    const match = line.trim().match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return '';
}

function sanitizeRoomName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 64);
}

function parseUrlInvite(urlText) {
  if (!urlText) return null;

  try {
    const url = new URL(urlText);
    const roomId = cleanRoomId(
      url.searchParams.get('room')
        || url.searchParams.get('roomId')
        || url.searchParams.get('kod')
        || url.searchParams.get('code')
    );
    if (!roomId) return null;

    const inviteServerUrl = String(url.searchParams.get('server') || '').trim() || url.origin;

    return {
      roomId,
      roomName: sanitizeRoomName(
        url.searchParams.get('table')
          || url.searchParams.get('roomName')
          || url.searchParams.get('name')
      ),
      serverUrl: inviteServerUrl
    };
  } catch {
    return null;
  }
}

export function parseInviteText(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const urlInvite = parseUrlInvite(firstHttpUrl(raw) || raw);
  const labeledRoomId = cleanRoomId(getLabeledValue(raw, [
    'kod',
    'kod pokoju',
    'kod stolu',
    'kod stołu',
    'pokoj',
    'pokój',
    'room',
    'room id'
  ]));
  const fallbackRoomMatch = raw.toUpperCase().match(/\b[A-Z0-9]{6}\b/);
  const fallbackRoomId = cleanRoomId(fallbackRoomMatch?.[0]);
  const roomId = urlInvite?.roomId || labeledRoomId || fallbackRoomId;

  if (!roomId) return null;

  return {
    roomId,
    roomName: sanitizeRoomName(
      urlInvite?.roomName
        || getLabeledValue(raw, ['stol', 'stół', 'nazwa stolu', 'nazwa stołu', 'table'])
    ),
    serverUrl: String(
      urlInvite?.serverUrl
        || getLabeledValue(raw, ['serwer', 'server', 'adres', 'adres gry', 'adres zapraszajacego', 'adres zapraszającego'])
    ).trim()
  };
}

function getHttpOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {
    // Invalid or non-URL values are ignored by invite generation.
  }

  return '';
}

function isLocalInviteOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    const cleanHost = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return cleanHost === 'localhost'
      || cleanHost === '127.0.0.1'
      || cleanHost === '0.0.0.0'
      || cleanHost === '::1';
  } catch {
    return true;
  }
}

function getShareableOrigin(value) {
  const origin = getHttpOrigin(value);
  return origin && !isLocalInviteOrigin(origin) ? origin : '';
}

function getInviteServerUrl(serverUrl, appUrl) {
  const origin = getShareableOrigin(serverUrl) || getShareableOrigin(appUrl);
  if (!origin) throw new Error('Ustaw adres serwera przed utworzeniem zaproszenia.');
  return origin;
}

export function createInviteUrl({ appUrl, serverUrl, roomId, roomName }) {
  const inviteServerUrl = getInviteServerUrl(serverUrl, appUrl);
  const url = new URL(inviteServerUrl);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', cleanRoomId(roomId));
  url.searchParams.set('server', inviteServerUrl);
  if (sanitizeRoomName(roomName)) url.searchParams.set('table', sanitizeRoomName(roomName));
  return url.toString();
}

export function createInviteText({ appUrl, serverUrl, roomId, roomName }) {
  const cleanId = cleanRoomId(roomId);
  const tableName = sanitizeRoomName(roomName) || cleanId;
  const inviteServerUrl = getInviteServerUrl(serverUrl, appUrl);
  return [
    'Makao - zaproszenie do gry',
    `Stół: ${tableName}`,
    `Kod: ${cleanId}`,
    `Serwer: ${inviteServerUrl}`,
    `Link: ${createInviteUrl({ appUrl, serverUrl: inviteServerUrl, roomId: cleanId, roomName: tableName })}`,
    'Wklej link albo cały tekst w aplikacji Makao. Przed dołączeniem wpisz swój nick do gry.'
  ].join('\n');
}
