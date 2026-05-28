import { EVENTS, FIRST_PLAYER_MODES, QUEEN_VARIANTS, ROOM_LIMITS, TURN_TIME_LIMIT_OPTIONS } from '../shared/constants';
import { useMemo, useState } from 'react';

const QUEEN_VARIANT_DETAILS = {
  [QUEEN_VARIANTS.DEFENSIVE_NON_FUNCTIONAL]: {
    label: 'Domyślna',
    description: 'Dama na wszystko, wszystko na damę. Dama przerywa żądania asa i waleta, ale nie chroni przed karami z 2, 3 i króli.',
    consequence: 'Przy aktywnej karze trzeba dobrać albo przebić legalną kartą bitewną.'
  },
  [QUEEN_VARIANTS.WARSAW_PARDON]: {
    label: 'Warszawska',
    description: 'Dama na wszystko, wszystko na damę. Dama pik i dama kier anulują aktywną karę brania kart.',
    consequence: 'Pozostałe damy nie anulują kary, a żadna dama nie zdejmuje ⏸ z 4.'
  }
};

function Lobby({ socket, room, socketId, onLeaveRoom }) {
  const [pendingHostAction, setPendingHostAction] = useState(null);
  const [roomNameDraftState, setRoomNameDraftState] = useState({
    source: room.name || '',
    value: room.name || ''
  });
  const [turnLimitDraftState, setTurnLimitDraftState] = useState({
    source: room.settings.turnTimeLimitSeconds,
    value: String(room.settings.turnTimeLimitSeconds || 60),
    mode: null
  });
  const [copyStatus, setCopyStatus] = useState('');
  const [showLobbySettings, setShowLobbySettings] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const isHost = room.hostId === socketId;
  const me = room.players.find(p => p.id === socketId);
  const serverRoomName = room.name || '';
  const roomNameDraft = roomNameDraftState.source === serverRoomName
    ? roomNameDraftState.value
    : serverRoomName;
  const setRoomNameDraft = (value) => {
    setRoomNameDraftState({ source: serverRoomName, value });
  };
  const serverTurnLimit = room.settings.turnTimeLimitSeconds;
  const turnLimitDraft = turnLimitDraftState.source === serverTurnLimit
    ? turnLimitDraftState
    : {
        source: serverTurnLimit,
        value: String(serverTurnLimit || 60),
        mode: null
      };
  const customTurnLimit = turnLimitDraft.value;
  const setCustomTurnLimit = (value) => {
    setTurnLimitDraftState({ ...turnLimitDraft, value });
  };
  const setTurnLimitMode = (mode) => {
    setTurnLimitDraftState({ ...turnLimitDraft, mode });
  };
  const readyCount = room.players.filter(p => p.isReady).length;
  const hasEnoughPlayers = room.players.length >= ROOM_LIMITS.MIN_PLAYERS;
  const allPlayersReady = room.players.length > 0 && room.players.every(p => p.isReady);
  const canStartGame = isHost && hasEnoughPlayers && allPlayersReady;
  const lobbyStatusText = hasEnoughPlayers
    ? `${readyCount}/${room.players.length} gotowych`
    : 'Czekam na gracza';
  const roomStats = room.stats || {};
  const winsByPlayer = roomStats.wins || {};
  const gamesPlayed = Number.parseInt(roomStats.gamesPlayed, 10) || 0;
  const getPlayerWins = (playerId) => Number.parseInt(winsByPlayer[playerId], 10) || 0;
  const statsLeader = room.players.reduce((leader, player) => {
    const wins = getPlayerWins(player.id);
    if (wins <= 0 || (leader && wins <= leader.wins)) return leader;
    return { name: player.name || 'Gracz', wins };
  }, null);
  const lobbyStatsText = statsLeader
    ? `Partie: ${gamesPlayed} · lider ${statsLeader.name}: ${statsLeader.wins}`
    : `Partie: ${gamesPlayed}`;
  const startButtonLabel = !hasEnoughPlayers
    ? 'Czekam'
    : (isStartingGame ? 'Rozdajemy...' : 'Start');
  const nextFirstPlayer = room.players.find(p => p.id === room.nextGameFirstPlayerId);
  const turnLimitValue = TURN_TIME_LIMIT_OPTIONS.includes(room.settings.turnTimeLimitSeconds)
    ? String(room.settings.turnTimeLimitSeconds)
    : 'custom';
  const selectedTurnLimitValue = turnLimitDraft.mode || turnLimitValue;
  const queenVariantInfo = QUEEN_VARIANT_DETAILS[room.settings.queenVariant]
    || QUEEN_VARIANT_DETAILS[QUEEN_VARIANTS.DEFENSIVE_NON_FUNCTIONAL];
  const firstPlayerSelection = room.settings.firstPlayerMode === FIRST_PLAYER_MODES.RANDOM_EACH_GAME
    ? FIRST_PLAYER_MODES.RANDOM_EACH_GAME
    : (room.nextGameFirstPlayerId || room.settings.firstPlayerId || FIRST_PLAYER_MODES.RANDOM_EACH_GAME);
  const emptySeatCount = Math.max(0, room.settings.maxPlayers - room.players.length);
  const startButtonClassName = [
    'btn',
    'lobby-start',
    canStartGame ? 'lobby-start-ready' : 'lobby-start-locked',
    isStartingGame ? 'lobby-start-dealing' : ''
  ].filter(Boolean).join(' ');
  const lobbyTableStageClassName = [
    'lobby-table-stage',
    hasEnoughPlayers ? 'lobby-table-readying' : 'lobby-table-waiting'
  ].join(' ');
  const inviteUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room.id);
    return url.toString();
  }, [room.id]);

  const toggleReady = () => {
    socket.emit(EVENTS.TOGGLE_READY);
  };

  const startGame = () => {
    if (!canStartGame || isStartingGame) return;
    setIsStartingGame(true);
    socket.emit(EVENTS.START_GAME);
    window.setTimeout(() => setIsStartingGame(false), 1400);
  };

  const updateSettings = (key, value) => {
    socket.emit(EVENTS.UPDATE_SETTINGS, { [key]: value });
  };

  const updateNumberSetting = (key, value, min, max) => {
    if (!isHost) return;
    updateSettings(key, Math.max(min, Math.min(max, value)));
  };

  const chooseTurnLimit = (value) => {
    if (!isHost) return;
    if (value === 'custom') {
      setTurnLimitMode('custom');
      return;
    }
    setTurnLimitMode(null);
    updateSettings('turnTimeLimitSeconds', parseInt(value, 10));
  };

  const updateRoomName = () => {
    if (!isHost) return;
    const nextName = roomNameDraft.trim();
    if (nextName && nextName !== room.name) {
      updateSettings('roomName', nextName);
    } else {
      setRoomNameDraft(room.name || '');
    }
  };

  const formatTurnLimit = (seconds) => {
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(label);
      window.setTimeout(() => setCopyStatus(''), 1600);
    } catch {
      setCopyStatus('Nie udało się skopiować');
      window.setTimeout(() => setCopyStatus(''), 1800);
    }
  };

  const shareInvite = async () => {
    if (!navigator.share) {
      copyText(inviteUrl, 'Link skopiowany');
      return;
    }
    try {
      await navigator.share({
        title: room.name || 'Makao',
        text: `Dołącz do pokoju Makao ${room.id}`,
        url: inviteUrl
      });
    } catch {
      // Anulowanie systemowego arkusza udostępniania nie wymaga komunikatu.
    }
  };

  const applyCustomTurnLimit = () => {
    updateSettings('turnTimeLimitSeconds', parseInt(customTurnLimit, 10));
    setTurnLimitMode(null);
  };

  const updateFirstPlayer = (value) => {
    if (value === FIRST_PLAYER_MODES.RANDOM_EACH_GAME) {
      socket.emit(EVENTS.UPDATE_SETTINGS, {
        firstPlayerMode: FIRST_PLAYER_MODES.RANDOM_EACH_GAME
      });
      return;
    }
    socket.emit(EVENTS.UPDATE_SETTINGS, {
      firstPlayerId: value
    });
  };

  const transferHost = (targetPlayerId) => {
    socket.emit(EVENTS.TRANSFER_HOST, { targetPlayerId });
  };

  const requestRemovePlayer = (targetPlayerId) => {
    setPendingHostAction({
      step: 1,
      event: EVENTS.REMOVE_PLAYER,
      targetPlayerId,
      title: 'Usunąć gracza?',
      confirmTitle: 'Potwierdź usunięcie',
      body: `${room.players.find(p => p.id === targetPlayerId)?.name || 'Gracz'} zostanie usunięty z pokoju. Akcja trafi do logu administracyjnego.`,
      confirmLabel: 'Usuń gracza'
    });
  };

  const confirmPendingHostAction = () => {
    if (pendingHostAction.step === 1) {
      setPendingHostAction({ ...pendingHostAction, step: 2 });
      return;
    }

    socket.emit(pendingHostAction.event, {
      targetPlayerId: pendingHostAction.targetPlayerId,
      hostOverrideConfirmed: true,
      hostOverrideRiskAccepted: true
    });
    setPendingHostAction(null);
  };

  return (
    <main className="lobby-screen">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">Pokój</p>
          <h1>{room.name || room.id}</h1>
          <p className="room-code">Kod: {room.id}</p>
        </div>
        <div className="lobby-header-actions">
          <button 
            className="btn btn-secondary" 
            onClick={() => copyText(room.id, 'Kod skopiowany')}
            title="Skopiuj kod pokoju do schowka"
          >
            Kod
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={() => copyText(inviteUrl, 'Link skopiowany')}
            title="Skopiuj link zaproszenia do schowka"
          >
            Link
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onLeaveRoom}
            title="Opuść pokój na tym urządzeniu"
          >
            Wyjdź
          </button>
          <button
            className="btn btn-secondary lobby-settings-button"
            type="button"
            onClick={() => setShowLobbySettings(true)}
            aria-label="Ustawienia pokoju"
            title="Ustawienia pokoju"
          >
            ⚙
          </button>
        </div>
      </header>

      <section className={lobbyTableStageClassName} aria-label="Stół w lobby">
        <div className="lobby-table-oval">
          <div className={isStartingGame ? 'lobby-deal-preview lobby-deal-preview-active' : 'lobby-deal-preview'}>
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="lobby-table-code">{room.id}</span>
          <span className="lobby-table-count" aria-live="polite">{lobbyStatusText}</span>
          <span className="lobby-table-stats" aria-live="polite">{lobbyStatsText}</span>
        </div>

        <ul className="player-list lobby-seat-list">
          {room.players.map(p => (
            <li
              key={p.id}
              className={`lobby-seat lobby-seat-${room.players.indexOf(p) + 1} ${p.isReady ? 'lobby-seat-ready' : 'lobby-seat-waiting'}`}
            >
              <div className="player-main">
                <span>
                  {p.name}
                  {p.id === room.hostId && <small className="host-seat-badge">H</small>}
                </span>
                <span className="lobby-seat-meta">
                  <span className={p.isReady ? 'status-ready' : 'status-waiting'}>
                    {p.isReady ? 'Gotowy' : 'Czeka'}
                  </span>
                  <small className="lobby-seat-wins">W: {getPlayerWins(p.id)}</small>
                </span>
              </div>
              {isHost && p.id !== socketId && (
                <div className="player-actions">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => transferHost(p.id)}
                    disabled={!p.isOnline}
                  >
                    Host
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => requestRemovePlayer(p.id)}
                  >
                    Usuń
                  </button>
                </div>
              )}
            </li>
          ))}
          {Array.from({ length: emptySeatCount }).map((_, index) => {
            const seatNumber = room.players.length + index + 1;
            return (
              <li key={`empty-${seatNumber}`} className={`lobby-seat lobby-seat-empty lobby-seat-${seatNumber}`}>
                <div className="player-main">
                  <span>Wolne</span>
                  <span>+</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="lobby-action-dock" aria-label="Akcje lobby">
        <button className="btn" onClick={toggleReady}>
          {me?.isReady ? 'Anuluj gotowość' : 'Jestem gotowy'}
        </button>

        <div className="lobby-invite-dock">
          <button className="btn btn-secondary" type="button" onClick={shareInvite}>
            Udostępnij
          </button>
          <span>{copyStatus || `Kod ${room.id}`}</span>
        </div>
      </section>

      {isHost && (
        <button 
          className={startButtonClassName}
          onClick={startGame} 
          disabled={!canStartGame || isStartingGame}
        >
          {startButtonLabel}
        </button>
      )}

      {showLobbySettings && (
        <div className="modal-backdrop" onClick={() => setShowLobbySettings(false)}>
          <div className="glass-panel modal-sheet lobby-settings-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="lobby-settings-head">
              <h3>Ustawienia stołu</h3>
              <button className="btn btn-secondary" type="button" onClick={() => setShowLobbySettings(false)} aria-label="Zamknij ustawienia">
                X
              </button>
            </div>
            <div className="settings-table">
              <section className="settings-card settings-card-wide">
                <div className="settings-card-head">
                  <span>Nazwa stołu</span>
                  <strong>{room.id}</strong>
                </div>
                <input
                  type="text"
                  value={roomNameDraft}
                  onChange={(e) => setRoomNameDraft(e.target.value)}
                  onBlur={updateRoomName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  maxLength={ROOM_LIMITS.MAX_ROOM_NAME_LENGTH}
                  disabled={!isHost}
                />
              </section>

              <section className="settings-card">
                <div className="settings-card-head">
                  <span>Gracze</span>
                  <strong>{room.settings.maxPlayers}</strong>
                </div>
                <div className="settings-stepper" aria-label="Limit graczy">
                  <button
                    type="button"
                    onClick={() => updateNumberSetting('maxPlayers', room.settings.maxPlayers - 1, ROOM_LIMITS.MIN_PLAYERS, ROOM_LIMITS.MAX_PLAYERS)}
                    disabled={!isHost || room.settings.maxPlayers <= ROOM_LIMITS.MIN_PLAYERS}
                  >
                    -
                  </button>
                  <span>{room.players.length}/{room.settings.maxPlayers}</span>
                  <button
                    type="button"
                    onClick={() => updateNumberSetting('maxPlayers', room.settings.maxPlayers + 1, ROOM_LIMITS.MIN_PLAYERS, ROOM_LIMITS.MAX_PLAYERS)}
                    disabled={!isHost || room.settings.maxPlayers >= ROOM_LIMITS.MAX_PLAYERS}
                  >
                    +
                  </button>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-head">
                  <span>Talie</span>
                  <strong>{room.settings.deckCount}</strong>
                </div>
                <div className="settings-stepper" aria-label="Liczba talii">
                  <button
                    type="button"
                    onClick={() => updateNumberSetting('deckCount', room.settings.deckCount - 1, ROOM_LIMITS.MIN_DECKS, ROOM_LIMITS.MAX_DECKS)}
                    disabled={!isHost || room.settings.deckCount <= ROOM_LIMITS.MIN_DECKS}
                  >
                    -
                  </button>
                  <span>{room.recommendedDeckCount === room.settings.deckCount ? 'OK' : `Sugeruj ${room.recommendedDeckCount}`}</span>
                  <button
                    type="button"
                    onClick={() => updateNumberSetting('deckCount', room.settings.deckCount + 1, ROOM_LIMITS.MIN_DECKS, ROOM_LIMITS.MAX_DECKS)}
                    disabled={!isHost || room.settings.deckCount >= ROOM_LIMITS.MAX_DECKS}
                  >
                    +
                  </button>
                </div>
                {isHost && room.settings.deckCount !== room.recommendedDeckCount && (
                  <button className="settings-inline-action" type="button" onClick={() => updateSettings('deckCount', room.recommendedDeckCount)}>
                    Ustaw sugerowane
                  </button>
                )}
              </section>

              <section className="settings-card settings-card-wide">
                <div className="settings-card-head">
                  <span>Czas tury</span>
                  <strong>{formatTurnLimit(room.settings.turnTimeLimitSeconds)}</strong>
                </div>
                <div className="settings-segments" role="group" aria-label="Limit czasu tury">
                  {TURN_TIME_LIMIT_OPTIONS.map(seconds => {
                    const value = String(seconds);
                    return (
                      <button
                        key={seconds}
                        type="button"
                        className={selectedTurnLimitValue === value ? 'settings-segment settings-segment-active' : 'settings-segment'}
                        onClick={() => chooseTurnLimit(value)}
                        disabled={!isHost}
                      >
                        {formatTurnLimit(seconds)}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={selectedTurnLimitValue === 'custom' ? 'settings-segment settings-segment-active' : 'settings-segment'}
                    onClick={() => chooseTurnLimit('custom')}
                    disabled={!isHost}
                  >
                    Własny
                  </button>
                </div>
                {selectedTurnLimitValue === 'custom' && (
                  <div className="custom-turn-limit settings-custom-row">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={ROOM_LIMITS.MIN_CUSTOM_TURN_LIMIT_SECONDS}
                      max={ROOM_LIMITS.MAX_CUSTOM_TURN_LIMIT_SECONDS}
                      step="5"
                      value={customTurnLimit}
                      onChange={e => setCustomTurnLimit(e.target.value)}
                      disabled={!isHost}
                      aria-label="Własny limit czasu tury w sekundach"
                    />
                    <button className="btn btn-secondary" type="button" onClick={applyCustomTurnLimit} disabled={!isHost}>
                      Ustaw
                    </button>
                  </div>
                )}
              </section>

              <section className="settings-card">
                <div className="settings-card-head">
                  <span>Jokery</span>
                  <strong>{room.settings.useJokers ? 'Tak' : 'Nie'}</strong>
                </div>
                <button
                  type="button"
                  className={room.settings.useJokers ? 'settings-toggle-chip settings-toggle-chip-on' : 'settings-toggle-chip'}
                  onClick={() => updateSettings('useJokers', !room.settings.useJokers)}
                  disabled={!isHost}
                  aria-pressed={room.settings.useJokers}
                >
                  {room.settings.useJokers ? 'W talii' : 'Wyłączone'}
                </button>
              </section>

              <section className="settings-card settings-card-wide">
                <div className="settings-card-head">
                  <span>Dama</span>
                  <strong>{queenVariantInfo.label}</strong>
                </div>
                <div className="settings-segments settings-segments-two" role="group" aria-label="Wariant Damy">
                  {Object.entries(QUEEN_VARIANT_DETAILS).map(([value, details]) => (
                    <button
                      key={value}
                      type="button"
                      className={room.settings.queenVariant === value ? 'settings-segment settings-segment-active' : 'settings-segment'}
                      onClick={() => updateSettings('queenVariant', value)}
                      disabled={!isHost}
                    >
                      {details.label}
                    </button>
                  ))}
                </div>
                <p className="settings-rule-note">{queenVariantInfo.consequence}</p>
              </section>

              <section className="settings-card settings-card-wide">
                <div className="settings-card-head">
                  <span>Zaczyna</span>
                  <strong>
                    {firstPlayerSelection === FIRST_PLAYER_MODES.RANDOM_EACH_GAME
                      ? 'Los'
                      : nextFirstPlayer?.name || 'Gracz'}
                  </strong>
                </div>
                <div className="settings-player-grid" role="group" aria-label="Kto zaczyna">
                  <button
                    type="button"
                    className={firstPlayerSelection === FIRST_PLAYER_MODES.RANDOM_EACH_GAME ? 'settings-player-chip settings-player-chip-active' : 'settings-player-chip'}
                    onClick={() => updateFirstPlayer(FIRST_PLAYER_MODES.RANDOM_EACH_GAME)}
                    disabled={!isHost}
                  >
                    Losuj
                  </button>
                  {room.players.map(player => (
                    <button
                      key={player.id}
                      type="button"
                      className={firstPlayerSelection === player.id ? 'settings-player-chip settings-player-chip-active' : 'settings-player-chip'}
                      onClick={() => updateFirstPlayer(player.id)}
                      disabled={!isHost}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {pendingHostAction && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-sheet">
            <h3>{pendingHostAction.step === 1 ? pendingHostAction.title : pendingHostAction.confirmTitle}</h3>
            <p>{pendingHostAction.body}</p>
            <button className="btn btn-danger" type="button" onClick={confirmPendingHostAction}>
              {pendingHostAction.step === 1 ? 'Potwierdź' : pendingHostAction.confirmLabel}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setPendingHostAction(null)}>
              Anuluj
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default Lobby;
