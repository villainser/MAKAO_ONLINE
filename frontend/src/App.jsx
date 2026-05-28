import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { io } from 'socket.io-client';
import Home from './components/Home';
import Lobby from './components/Lobby';
import Game from './components/Game';
import './App.css';
import { EFFECT_TYPES, EVENTS } from './shared/constants';
import audioManager from './audio/AudioManager.js';

const customServerStorageKey = 'makaoServerUrl';
const roomStorageKey = 'makaoRoomId';
const serverPrefsVersionStorageKey = 'makaoServerPrefsVersion';
const currentAndroidServerPrefsVersion = '2026-05-27-default-server-reset';

const defaultServerUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : window.location.origin;
const bundledServerUrl = import.meta.env.VITE_SERVER_URL || defaultServerUrl;
const nativeGameBridge = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  ? registerPlugin('NativeGame')
  : null;
const isAndroidNativeShell = Boolean(nativeGameBridge);
const overlaySuitMeta = {
  hearts: { label: 'Kier', symbol: '♥', tone: 'red' },
  diamonds: { label: 'Karo', symbol: '♦', tone: 'red' },
  clubs: { label: 'Trefl', symbol: '♣', tone: 'black' },
  spades: { label: 'Pik', symbol: '♠', tone: 'black' }
};
const overlayRankLabels = {
  jack: 'Walet',
  queen: 'Dama',
  king: 'Król',
  ace: 'As',
  non_battle_king: 'Król karo/trefl'
};

function getOverlaySuitLabel(suit) {
  const meta = overlaySuitMeta[suit];
  return meta ? `${meta.symbol} ${meta.label}` : suit;
}

function getOverlayRankLabel(rank) {
  return overlayRankLabels[rank] || String(rank || '').toUpperCase();
}

function getOverlayActiveEffect(effect) {
  if (!effect?.type) return null;

  if (effect.type === EFFECT_TYPES.SUIT_REQUEST) {
    return {
      label: 'Żądanie',
      value: getOverlaySuitLabel(effect.requestedSuit)
    };
  }

  if (effect.type === EFFECT_TYPES.RANK_REQUEST) {
    return {
      label: 'Żądanie',
      value: getOverlayRankLabel(effect.requestedRank)
    };
  }

  if (effect.type === EFFECT_TYPES.DRAW_PENALTY) {
    return {
      label: 'Kara',
      value: `+${effect.amount || 1}`
    };
  }

  if (effect.type === EFFECT_TYPES.SKIP_TURN) {
    return {
      label: 'Pauza',
      value: `${effect.amount || 1}`
    };
  }

  return null;
}

function compactOverlayToastMessage(message) {
  const clean = String(message || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  if (clean.length <= 48) return clean;
  return `${clean.slice(0, 45).trim()}...`;
}

function normalizeServerUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return bundledServerUrl;
  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  const hostPart = trimmed.split('/')[0].split(':')[0];
  const defaultProtocol = /^(localhost|\d{1,3}(?:\.\d{1,3}){3})$/i.test(hostPart) ? 'http' : 'https';
  const candidate = hasProtocol ? trimmed : `${defaultProtocol}://${trimmed}`;

  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return candidate;
  }
}

function getInitialServerUrl() {
  if (isAndroidNativeShell) {
    const storedVersion = window.localStorage.getItem(serverPrefsVersionStorageKey);
    if (storedVersion !== currentAndroidServerPrefsVersion) {
      window.localStorage.removeItem(customServerStorageKey);
      window.localStorage.removeItem(roomStorageKey);
      window.localStorage.setItem(serverPrefsVersionStorageKey, currentAndroidServerPrefsVersion);
    }
  }
  const saved = window.localStorage.getItem(customServerStorageKey);
  return saved ? normalizeServerUrl(saved) : bundledServerUrl;
}

function getClientId() {
  const existing = window.localStorage.getItem('makaoClientId');
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() || `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem('makaoClientId', next);
  return next;
}

const clientId = getClientId();

function NativeTableOverlay({
  room,
  gameState,
  socketId,
  connectionStatus,
  nativeLaunchError,
  onFallbackLeave
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [overlayToasts, setOverlayToasts] = useState([]);
  const [choicePopup, setChoicePopup] = useState(null);
  const [overlayGameOver, setOverlayGameOver] = useState(null);
  const [overlayTurnStatus, setOverlayTurnStatus] = useState(null);
  const menuButtonRef = useRef(null);
  const menuPanelRef = useRef(null);
  const confirmLeavePanelRef = useRef(null);
  const choicePanelRef = useRef(null);
  const gameOverPanelRef = useRef(null);
  const errorPanelRef = useRef(null);
  const overlayToastTimersRef = useRef(new Map());

  const players = gameState?.players?.length ? gameState.players : room?.players || [];
  const stateCurrentPlayerId = gameState?.turnOrder?.[gameState?.currentPlayerIndex];
  const currentPlayerId = overlayTurnStatus?.currentPlayerId || stateCurrentPlayerId;
  const currentPlayerName = overlayTurnStatus?.currentPlayerName || players.find(player => player.id === currentPlayerId)?.name || 'Gracz';
  const stateWinnerName = players.find(player => player.id === gameState?.winnerId)?.name || 'Gracz';
  const isHost = room?.hostId === socketId;
  const isGameOver = Boolean(overlayTurnStatus?.gameOver || gameState?.gameOver);
  const gameOverPayload = isGameOver
    ? {
        winnerId: gameState?.winnerId || '',
        winnerName: stateWinnerName,
        didWin: Boolean(gameState?.winnerId && gameState.winnerId === socketId),
        canReturnLobby: isHost
      }
    : overlayGameOver;
  const overlayGameOverOpen = Boolean(gameOverPayload);
  const didWin = Boolean(gameOverPayload?.didWin);
  const winnerName = gameOverPayload?.winnerName || stateWinnerName;
  const canReturnLobby = gameOverPayload?.canReturnLobby ?? isHost;
  const overlayMenuOpen = menuOpen && !overlayGameOverOpen;
  const overlayConfirmLeaveOpen = confirmLeaveOpen && !overlayGameOverOpen;
  const overlayChoicePopup = overlayGameOverOpen ? null : choicePopup;
  const overlayTopVisible = !overlayChoicePopup;
  const isMyTurn = overlayTurnStatus
    ? Boolean(overlayTurnStatus.isMyTurn)
    : Boolean(currentPlayerId && currentPlayerId === socketId);
  const turnStatusText = isGameOver
    ? 'Partia zakończona'
    : (overlayTurnStatus?.paused || gameState?.paused || gameState?.pauseReason)
      ? 'Gra wstrzymana'
      : isMyTurn
        ? 'Twoja tura'
        : `Tura: ${currentPlayerName}`;
  const activeEffect = getOverlayActiveEffect(gameState?.activeEffect);
  const choiceBackdropClassName = overlayChoicePopup
    ? [
        'native-table-overlay-choice-backdrop',
        `native-table-overlay-choice-backdrop-${overlayChoicePopup.kind}`,
        overlayChoicePopup.kind === 'request'
          ? `native-table-overlay-choice-backdrop-request-${overlayChoicePopup.requestType}`
          : ''
      ].filter(Boolean).join(' ')
    : '';

  const reportHitRegions = useCallback(() => {
    if (!nativeGameBridge?.setOverlayHitRegions) return;
    const nodes = [
      menuButtonRef.current,
      overlayMenuOpen ? menuPanelRef.current : null,
      overlayConfirmLeaveOpen ? confirmLeavePanelRef.current : null,
      overlayChoicePopup ? choicePanelRef.current : null,
      overlayGameOverOpen ? gameOverPanelRef.current : null,
      nativeLaunchError ? errorPanelRef.current : null
    ].filter(Boolean);
    const rects = nodes
      .map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => ({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }));

    nativeGameBridge.setOverlayHitRegions({
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      rects
    }).catch(() => {});
  }, [overlayMenuOpen, overlayConfirmLeaveOpen, overlayChoicePopup, overlayGameOverOpen, nativeLaunchError]);

  useEffect(() => {
    document.documentElement.classList.add('native-table-overlay-mode');
    document.body.classList.add('native-table-overlay-mode');
    return () => {
      document.documentElement.classList.remove('native-table-overlay-mode');
      document.body.classList.remove('native-table-overlay-mode');
      nativeGameBridge?.setOverlayHitRegions?.({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        rects: []
      }).catch(() => {});
    };
  }, []);

  useLayoutEffect(() => {
    reportHitRegions();
    const frame = window.requestAnimationFrame(reportHitRegions);
    const timer = window.setTimeout(reportHitRegions, 80);
    window.addEventListener('resize', reportHitRegions);
    window.visualViewport?.addEventListener('resize', reportHitRegions);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener('resize', reportHitRegions);
      window.visualViewport?.removeEventListener('resize', reportHitRegions);
    };
  }, [reportHitRegions]);

  const sendOverlayCommand = useCallback((command, payload = {}) => {
    if (!nativeGameBridge?.sendCommand) return Promise.reject(new Error('Native bridge unavailable'));
    return nativeGameBridge.sendCommand({ command, payload });
  }, []);

  const pushOverlayToast = useCallback((payload = {}) => {
    const message = compactOverlayToastMessage(payload.message);
    if (!message) return;

    const level = ['error', 'warning', 'info'].includes(payload.level) ? payload.level : 'info';
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'Stół';
    const durationMs = Number.isFinite(payload.durationMs) ? Math.max(1200, payload.durationMs) : 3000;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setOverlayToasts(prev => [
      ...prev.slice(-2),
      { id, type: level, title, message }
    ]);

    const timer = window.setTimeout(() => {
      overlayToastTimersRef.current.delete(id);
      setOverlayToasts(prev => prev.filter(item => item.id !== id));
    }, durationMs);
    overlayToastTimersRef.current.set(id, timer);
  }, []);

  const cancelChoiceFromOverlay = useCallback(() => {
    setChoicePopup(null);
    sendOverlayCommand('dismiss_popup', { source: 'react_overlay' }).catch(() => {});
  }, [sendOverlayCommand]);

  const chooseRequestFromOverlay = useCallback((value) => {
    if (!choicePopup || choicePopup.kind !== 'request') return;
    const command = choicePopup.requestType === 'suit' ? 'choose_suit_request' : 'choose_rank_request';
    setChoicePopup(null);
    sendOverlayCommand(command, { value, source: 'react_overlay' }).catch(() => {
      pushOverlayToast({
        level: 'error',
        title: 'Błąd wyboru',
        message: 'Nie udało się wysłać żądania.'
      });
    });
  }, [choicePopup, sendOverlayCommand, pushOverlayToast]);

  const updateJokerDraft = useCallback((patch) => {
    setChoicePopup(prev => {
      if (!prev || prev.kind !== 'joker') return prev;
      return { ...prev, ...patch };
    });
  }, []);

  const confirmJokerFromOverlay = useCallback(() => {
    if (!choicePopup || choicePopup.kind !== 'joker') return;
    if (!choicePopup.selectedRank || !choicePopup.selectedSuit) {
      pushOverlayToast({
        level: 'warning',
        title: 'Joker',
        message: 'Wybierz wartość i kolor.'
      });
      return;
    }
    setChoicePopup(null);
    sendOverlayCommand('choose_joker', {
      rank: choicePopup.selectedRank,
      suit: choicePopup.selectedSuit,
      source: 'react_overlay'
    }).catch(() => {
      pushOverlayToast({
        level: 'error',
        title: 'Błąd wyboru',
        message: 'Nie udało się wysłać jokera.'
      });
    });
  }, [choicePopup, sendOverlayCommand, pushOverlayToast]);

  const handleHybridOverlayEvent = useCallback((event) => {
    if (event?.type === 'toast') {
      pushOverlayToast(event.payload || {});
      return;
    }
    if (event?.type === 'confirm_leave') {
      setMenuOpen(false);
      setChoicePopup(null);
      setConfirmLeaveOpen(true);
      return;
    }
    if (event?.type === 'turn_status') {
      const payload = event.payload || {};
      setOverlayTurnStatus({
        currentPlayerId: payload.currentPlayerId || '',
        currentPlayerName: payload.currentPlayerName || '',
        isMyTurn: Boolean(payload.isMyTurn),
        gameOver: Boolean(payload.gameOver),
        paused: Boolean(payload.paused)
      });
      return;
    }
    if (event?.type === 'request_choice_open') {
      const payload = event.payload || {};
      const options = Array.isArray(payload.options) ? payload.options : [];
      setMenuOpen(false);
      setConfirmLeaveOpen(false);
      setChoicePopup({
        kind: 'request',
        requestType: payload.requestType === 'suit' ? 'suit' : 'rank',
        options,
        allowNone: payload.allowNone !== false
      });
      return;
    }
    if (event?.type === 'joker_choice_open') {
      const payload = event.payload || {};
      setMenuOpen(false);
      setConfirmLeaveOpen(false);
      setChoicePopup({
        kind: 'joker',
        ranks: Array.isArray(payload.ranks) ? payload.ranks : [],
        suits: Array.isArray(payload.suits) ? payload.suits : [],
        selectedRank: payload.selectedRank || '',
        selectedSuit: payload.selectedSuit || '',
        rankLocked: Boolean(payload.rankLocked),
        jokerCount: Number(payload.jokerCount) || 1,
        cardCount: Number(payload.cardCount) || 1
      });
      return;
    }
    if (event?.type === 'request_choice_close') {
      setChoicePopup(prev => (prev?.kind === 'request' ? null : prev));
      return;
    }
    if (event?.type === 'joker_choice_close') {
      setChoicePopup(prev => (prev?.kind === 'joker' ? null : prev));
      return;
    }
    if (event?.type === 'game_over') {
      const payload = event.payload || {};
      setMenuOpen(false);
      setConfirmLeaveOpen(false);
      setChoicePopup(null);
      setOverlayGameOver({
        winnerId: payload.winnerId || '',
        winnerName: payload.winnerName || '',
        didWin: Boolean(payload.didWin),
        canReturnLobby: Boolean(payload.canReturnLobby)
      });
    }
  }, [pushOverlayToast]);

  useEffect(() => {
    if (!nativeGameBridge?.addListener) return undefined;
    let listenerHandle = null;
    let cancelled = false;
    const listener = nativeGameBridge.addListener('hybridOverlayEvent', handleHybridOverlayEvent);

    Promise.resolve(listener)
      .then((handle) => {
        if (cancelled) {
          handle?.remove?.();
          return;
        }
        listenerHandle = handle;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (listenerHandle?.remove) {
        listenerHandle.remove();
      } else {
        Promise.resolve(listener)
          .then(handle => handle?.remove?.())
          .catch(() => {});
      }
    };
  }, [handleHybridOverlayEvent]);

  useEffect(() => {
    if (!nativeGameBridge?.getOverlaySnapshot) return undefined;
    let cancelled = false;
    nativeGameBridge.getOverlaySnapshot()
      .then((snapshot) => {
        if (!cancelled && snapshot?.active && snapshot.event) {
          handleHybridOverlayEvent(snapshot.event);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [handleHybridOverlayEvent]);

  useEffect(() => () => {
    overlayToastTimersRef.current.forEach(timer => window.clearTimeout(timer));
    overlayToastTimersRef.current.clear();
  }, []);

  const requestLeaveFromOverlay = () => {
    setMenuOpen(false);
    setConfirmLeaveOpen(true);
  };

  const cancelLeaveFromOverlay = () => {
    setConfirmLeaveOpen(false);
    sendOverlayCommand('cancel_leave', { source: 'react_overlay' }).catch(() => {});
  };

  const confirmLeaveFromOverlay = () => {
    setConfirmLeaveOpen(false);
    sendOverlayCommand('leave_room', { source: 'react_overlay' }).catch(() => {
      onFallbackLeave();
    });
  };

  const returnToLobbyFromOverlay = () => {
    setMenuOpen(false);
    setConfirmLeaveOpen(false);
    sendOverlayCommand('return_lobby', { source: 'react_overlay' }).catch(() => {
      pushOverlayToast({
        level: 'error',
        title: 'Lobby',
        message: 'Nie udało się wrócić do lobby.'
      });
    });
  };

  return (
    <main className="native-table-overlay" aria-label="Panel stołu">
      {overlayTopVisible && (
        <section className="native-table-overlay-top" aria-live="polite">
          <div className="native-table-overlay-chip">
            <strong>Pokój {room.id}</strong>
            <span>{connectionStatus === 'connected' ? 'Online' : 'Łączenie'}</span>
          </div>
          <div className="native-table-overlay-turn-stack" aria-live="polite">
            <div className={isMyTurn ? 'native-table-overlay-turn-status native-table-overlay-turn-status-active' : 'native-table-overlay-turn-status'}>
              {turnStatusText}
            </div>
            {activeEffect && (
              <div className="native-table-overlay-effect-badge">
                <span>{activeEffect.label}</span>
                <strong>{activeEffect.value}</strong>
              </div>
            )}
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            className="native-table-overlay-menu-button"
            onClick={() => setMenuOpen(open => !open)}
            aria-expanded={overlayMenuOpen}
            aria-label="Menu stołu"
          >
            MENU
          </button>
        </section>
      )}

      {overlayMenuOpen && (
        <section ref={menuPanelRef} className="native-table-overlay-menu" aria-label="Menu stołu">
          <div>
            <strong>Stół {room.id}</strong>
            <span>{players.length} graczy</span>
          </div>
          <button type="button" className="native-table-overlay-danger" onClick={requestLeaveFromOverlay}>
            REZYGNUJ
          </button>
          <button type="button" className="native-table-overlay-secondary" onClick={() => setMenuOpen(false)}>
            ZAMKNIJ
          </button>
        </section>
      )}

      {overlayConfirmLeaveOpen && (
        <section
          className="native-table-overlay-confirm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="native-table-leave-title"
        >
          <div ref={confirmLeavePanelRef} className="native-table-overlay-confirm">
            <div className="native-table-overlay-confirm-copy">
              <strong id="native-table-leave-title">Zrezygnować z partii?</strong>
              <span>Wyjście ze stołu.</span>
            </div>
            <div className="native-table-overlay-confirm-actions">
              <button type="button" className="native-table-overlay-secondary" onClick={cancelLeaveFromOverlay}>
                ANULUJ
              </button>
              <button type="button" className="native-table-overlay-danger" onClick={confirmLeaveFromOverlay}>
                REZYGNUJ
              </button>
            </div>
          </div>
        </section>
      )}

      {overlayChoicePopup && (
        <section
          className={choiceBackdropClassName}
          role="dialog"
          aria-modal="true"
          aria-labelledby="native-table-choice-title"
        >
          <div ref={choicePanelRef} className="native-table-overlay-choice">
            {overlayChoicePopup.kind === 'request' && (
              <>
                <div className="native-table-overlay-choice-copy">
                  <strong id="native-table-choice-title">
                    {overlayChoicePopup.requestType === 'suit' ? 'Wybierz kolor' : 'Wybierz wartość'}
                  </strong>
                  <span>
                    {overlayChoicePopup.requestType === 'suit'
                      ? 'As'
                      : 'Walet'}
                  </span>
                </div>
                <div
                  className={`native-table-overlay-choice-grid ${overlayChoicePopup.requestType === 'suit' ? 'native-table-overlay-suit-grid' : ''}`}
                  aria-label={overlayChoicePopup.requestType === 'suit' ? 'Kolor żądania' : 'Wartość żądania'}
                >
                  {overlayChoicePopup.options.map(option => {
                    const suitMeta = overlaySuitMeta[option];
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`native-table-overlay-choice-button ${suitMeta ? `native-table-overlay-choice-${suitMeta.tone}` : ''}`}
                        onClick={() => chooseRequestFromOverlay(option)}
                      >
                        {overlayChoicePopup.requestType === 'suit' ? getOverlaySuitLabel(option) : getOverlayRankLabel(option)}
                      </button>
                    );
                  })}
                </div>
                <div className="native-table-overlay-choice-actions">
                  {overlayChoicePopup.allowNone && (
                    <button type="button" className="native-table-overlay-secondary" onClick={() => chooseRequestFromOverlay('none')}>
                      BEZ ŻĄDANIA
                    </button>
                  )}
                  <button type="button" className="native-table-overlay-danger" onClick={cancelChoiceFromOverlay}>
                    ANULUJ
                  </button>
                </div>
              </>
            )}

            {overlayChoicePopup.kind === 'joker' && (
              <>
                <div className="native-table-overlay-choice-copy">
                  <strong id="native-table-choice-title">
                    {overlayChoicePopup.jokerCount > 1 ? `Jokery (${overlayChoicePopup.jokerCount})` : 'Joker'}
                  </strong>
                  <span>Deklaracja</span>
                </div>
                <div className="native-table-overlay-choice-label">Wartość</div>
                <div className="native-table-overlay-joker-rank-grid" aria-label="Wartość jokera">
                  {overlayChoicePopup.ranks.map(rank => (
                    <button
                      key={rank}
                      type="button"
                      className={overlayChoicePopup.selectedRank === rank ? 'native-table-overlay-choice-button native-table-overlay-choice-selected' : 'native-table-overlay-choice-button'}
                      onClick={() => updateJokerDraft({ selectedRank: rank })}
                      disabled={overlayChoicePopup.rankLocked && overlayChoicePopup.selectedRank !== rank}
                      aria-pressed={overlayChoicePopup.selectedRank === rank}
                    >
                      {getOverlayRankLabel(rank)}
                    </button>
                  ))}
                </div>
                <div className="native-table-overlay-choice-label">Kolor</div>
                <div className="native-table-overlay-choice-grid native-table-overlay-suit-grid" aria-label="Kolor jokera">
                  {overlayChoicePopup.suits.map(suit => {
                    const suitMeta = overlaySuitMeta[suit];
                    return (
                      <button
                        key={suit}
                        type="button"
                        className={[
                          'native-table-overlay-choice-button',
                          suitMeta ? `native-table-overlay-choice-${suitMeta.tone}` : '',
                          overlayChoicePopup.selectedSuit === suit ? 'native-table-overlay-choice-selected' : ''
                        ].filter(Boolean).join(' ')}
                        onClick={() => updateJokerDraft({ selectedSuit: suit })}
                        aria-pressed={overlayChoicePopup.selectedSuit === suit}
                      >
                        {getOverlaySuitLabel(suit)}
                      </button>
                    );
                  })}
                </div>
                <div className="native-table-overlay-choice-actions">
                  <button type="button" className="native-table-overlay-secondary" onClick={cancelChoiceFromOverlay}>
                    ANULUJ
                  </button>
                  <button type="button" className="native-table-overlay-menu-button" onClick={confirmJokerFromOverlay}>
                    ZAGRAJ
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {overlayGameOverOpen && (
        <section
          className="native-table-overlay-game-over-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="native-table-game-over-title"
        >
          <div ref={gameOverPanelRef} className="native-table-overlay-game-over">
            <div className="native-table-overlay-game-over-copy">
              <strong id="native-table-game-over-title">
                {didWin ? 'Wygrałeś' : 'Koniec gry'}
              </strong>
              <span>
                {gameState?.winnerId
                  ? (didWin ? `Zwycięzca: ${winnerName}` : `Wygrał: ${winnerName}`)
                  : 'Partia zakończona.'}
              </span>
              {!canReturnLobby && <small>Czeka host.</small>}
            </div>
            <div className="native-table-overlay-game-over-actions">
              {canReturnLobby && (
                <button type="button" className="native-table-overlay-menu-button" onClick={returnToLobbyFromOverlay}>
                  KOLEJNA PARTIA
                </button>
              )}
              <button type="button" className="native-table-overlay-secondary" onClick={confirmLeaveFromOverlay}>
                WYJDŹ
              </button>
            </div>
          </div>
        </section>
      )}

      {nativeLaunchError && (
        <section ref={errorPanelRef} className="native-table-overlay-error" role="alert">
          <strong>Błąd stołu</strong>
          <span>{nativeLaunchError}</span>
          <button type="button" className="native-table-overlay-secondary" onClick={onFallbackLeave}>
            WRÓĆ
          </button>
        </section>
      )}

      {overlayToasts.length > 0 && (
        <div className="native-table-overlay-toasts" aria-live="polite" aria-label="Powiadomienia stołu">
          {overlayToasts.map(toast => (
            <section
              key={toast.id}
              className={`app-notification app-notification-${toast.type}`}
              role={toast.type === 'error' ? 'alert' : 'status'}
            >
              <div>
                <strong>{toast.title}</strong>
                <span>{toast.message}</span>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function App() {
  const [serverUrl, setServerUrl] = useState(getInitialServerUrl);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [room, setRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [socketId, setSocketId] = useState(() => clientId);
  const [sessionNotice, setSessionNotice] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [nativeLaunchError, setNativeLaunchError] = useState('');
  const nativeLaunchKeyRef = useRef('');
  const socket = useMemo(() => io(serverUrl, { autoConnect: false }), [serverUrl]);

  const pushNotification = useCallback(({ type = 'info', title = 'Makao', message }) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setNotifications(prev => [
      ...prev.slice(-2),
      { id, type, title, message }
    ]);
    window.setTimeout(() => {
      setNotifications(prev => prev.filter(item => item.id !== id));
    }, 4200);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(item => item.id !== id));
  }, []);

  useEffect(() => {
    audioManager.preloadAll();
  }, []);

  useEffect(() => {
    const activeSocket = socket;
    activeSocket.connect();

    activeSocket.on('connect', () => {
      setConnectionStatus('connected');
      setSocketId(clientId);
      const roomId = window.localStorage.getItem(roomStorageKey);
      if (roomId) {
        activeSocket.emit(EVENTS.RECONNECT_SESSION, { roomId, clientId }, (response) => {
          if (response?.success && response.room) {
            setSessionNotice('');
            window.localStorage.setItem(roomStorageKey, response.room.id);
            setRoom(response.room);
          } else {
            window.localStorage.removeItem(roomStorageKey);
            setRoom(null);
            setGameState(null);
            setSessionNotice('Poprzednia sesja jest zakończona albo niedostępna.');
          }
        });
      }
    });

    activeSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    activeSocket.on('connect_error', () => {
      setConnectionStatus('error');
    });

    activeSocket.on(EVENTS.ROOM_STATE_UPDATE, (roomData) => {
      setRoom(roomData);
      if (roomData.status === 'playing' && roomData.gameOver) {
        window.localStorage.removeItem(roomStorageKey);
      } else {
        window.localStorage.setItem(roomStorageKey, roomData.id);
      }
      setGameState(prev => {
        if (roomData.status !== 'playing') return null;

        const previousGameNumber = prev?.moveHistory?.[0]?.details?.gameNumber;
        if (previousGameNumber && roomData.gameNumber && previousGameNumber !== roomData.gameNumber) {
          return null;
        }

        return prev;
      });
    });

    activeSocket.on(EVENTS.GAME_STATE_UPDATE, (stateData) => {
      setGameState(stateData);
      if (stateData.gameOver) {
        window.localStorage.removeItem(roomStorageKey);
      }
    });

    activeSocket.on(EVENTS.ERROR, (error) => {
      audioManager.playSound('illegal_move');
      pushNotification({
        type: 'error',
        title: 'Błąd ruchu',
        message: error.message || 'Serwer odrzucił akcję.'
      });
    });

    return () => {
      activeSocket.removeAllListeners();
      activeSocket.disconnect();
    };
  }, [socket, pushNotification]);

  const updateServerUrl = (value) => {
    const nextServerUrl = normalizeServerUrl(value);
    if (nextServerUrl === serverUrl) return;

    if (nextServerUrl === bundledServerUrl) {
      window.localStorage.removeItem(customServerStorageKey);
    } else {
      window.localStorage.setItem(customServerStorageKey, nextServerUrl);
    }
    if (isAndroidNativeShell) {
      window.localStorage.setItem(serverPrefsVersionStorageKey, currentAndroidServerPrefsVersion);
    }
    window.localStorage.removeItem(roomStorageKey);
    setConnectionStatus('connecting');
    setSocketId(clientId);
    setSessionNotice('');
    setRoom(null);
    setGameState(null);
    setServerUrl(nextServerUrl);
  };

  const resetServerUrl = () => {
    updateServerUrl(bundledServerUrl);
  };

  const handleCreateRoom = (name, options = {}) => {
    if (!socket?.connected) {
      pushNotification({
        type: 'warning',
        title: 'Brak połączenia',
        message: `Serwer: ${serverUrl}`
      });
      return;
    }
    socket.emit(EVENTS.CREATE_ROOM, {
      playerName: name,
      clientId,
      roomName: options.roomName
    }, (response) => {
      if (response?.success) {
        setSocketId(clientId);
        setSessionNotice('');
        window.localStorage.setItem(roomStorageKey, response.room.id);
        setRoom(response.room);
      } else {
        pushNotification({
          type: 'error',
          title: 'Nie można utworzyć pokoju',
          message: response?.error || 'Brak odpowiedzi serwera.'
        });
      }
    });
  };

  const handleJoinRoom = (name, roomId) => {
    if (!socket?.connected) {
      pushNotification({
        type: 'warning',
        title: 'Brak połączenia',
        message: `Serwer: ${serverUrl}`
      });
      return;
    }
    socket.emit(EVENTS.JOIN_ROOM, { playerName: name, roomId, clientId }, (response) => {
      if (response?.success) {
        setSocketId(clientId);
        setSessionNotice('');
        window.localStorage.setItem(roomStorageKey, response.room.id);
        setRoom(response.room);
      } else {
        pushNotification({
          type: 'error',
          title: 'Nie można dołączyć',
          message: response?.error || 'Brak odpowiedzi serwera.'
        });
      }
    });
  };

  const handleLeaveRoom = () => {
    const leavingRoomId = room?.id || window.localStorage.getItem(roomStorageKey);
    if (socket?.connected && leavingRoomId) {
      socket.emit(EVENTS.LEAVE_ROOM, { roomId: leavingRoomId, clientId }, () => {});
    }
    window.localStorage.removeItem(roomStorageKey);
    setSocketId(clientId);
    setRoom(null);
    setGameState(null);
    setSessionNotice('Sesja porzucona.');
  };

  useEffect(() => {
    if (!nativeGameBridge || room?.status !== 'playing' || !gameState || !room?.id) return;

    const launchKey = `${room.id}:${room.gameNumber || gameState.gameNumber || 'current'}`;
    if (nativeLaunchKeyRef.current === launchKey) return;
    nativeLaunchKeyRef.current = launchKey;

    const playerName = room.players?.find(player => player.id === clientId)?.name || 'Gracz';
    setNativeLaunchError('');
    nativeGameBridge.open({
      serverUrl,
      roomId: room.id,
      playerName,
      clientId
    }).then((result) => {
      nativeLaunchKeyRef.current = '';
      if (result?.returnLobby) {
        socket.emit(EVENTS.RECONNECT_SESSION, { roomId: room.id, clientId }, (response) => {
          if (response?.success && response.room) {
            window.localStorage.setItem(roomStorageKey, response.room.id);
            setSocketId(clientId);
            setRoom(response.room);
            setGameState(null);
            setSessionNotice('');
            return;
          }
          window.localStorage.removeItem(roomStorageKey);
          setSocketId(clientId);
          setRoom(null);
          setGameState(null);
          setSessionNotice('Stół jest zakończony albo niedostępny.');
        });
        return;
      }
      if (result?.leftRoom) {
        window.localStorage.removeItem(roomStorageKey);
        setSocketId(clientId);
        setRoom(null);
        setGameState(null);
        setSessionNotice('Sesja porzucona.');
        return;
      }
      socket.emit(EVENTS.LEAVE_ROOM, { roomId: room.id, clientId }, () => {});
      window.localStorage.removeItem(roomStorageKey);
      setSocketId(clientId);
      setRoom(null);
      setGameState(null);
      setSessionNotice('Stół zamknięty.');
    }).catch((error) => {
      nativeLaunchKeyRef.current = '';
      setNativeLaunchError('Android nie uruchomił natywnego widoku gry.');
      console.error('Native game launch failed', error);
      pushNotification({
        type: 'error',
        title: 'Nie można otworzyć stołu',
        message: 'Android nie uruchomił natywnego widoku gry.'
      });
    });
  }, [room, gameState, serverUrl, socket, pushNotification]);

  const notificationLayer = notifications.length > 0 && (
    <div className="app-notifications" aria-live="polite" aria-label="Powiadomienia">
      {notifications.map(notification => (
        <section
          key={notification.id}
          className={`app-notification app-notification-${notification.type}`}
          role={notification.type === 'error' ? 'alert' : 'status'}
        >
          <div>
            <strong>{notification.title}</strong>
            {notification.message && <span>{notification.message}</span>}
          </div>
          <button
            type="button"
            className="app-notification-close"
            onClick={() => dismissNotification(notification.id)}
            aria-label="Zamknij powiadomienie"
          >
            X
          </button>
        </section>
      ))}
    </div>
  );

  if (!room) {
    return (
      <>
        <Home
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          serverUrl={serverUrl}
          defaultServerUrl={bundledServerUrl}
          connectionStatus={connectionStatus}
          sessionNotice={sessionNotice}
          onServerUrlChange={updateServerUrl}
          onServerUrlReset={resetServerUrl}
        />
        {notificationLayer}
      </>
    );
  }

  if (room.status === 'lobby') {
    return (
      <>
        <Lobby socket={socket} room={room} socketId={socketId} onLeaveRoom={handleLeaveRoom} />
        {notificationLayer}
      </>
    );
  }

  if (room.status === 'playing' && gameState) {
    if (isAndroidNativeShell) {
      return (
        <>
          <NativeTableOverlay
            room={room}
            gameState={gameState}
            socketId={socketId}
            connectionStatus={connectionStatus}
            nativeLaunchError={nativeLaunchError}
            onFallbackLeave={handleLeaveRoom}
          />
          {notificationLayer}
        </>
      );
    }

    return (
      <>
        <Game socket={socket} room={room} gameState={gameState} socketId={socketId} onLeaveRoom={handleLeaveRoom} />
        {notificationLayer}
      </>
    );
  }

  return (
    <>
      <div className="loading">Rozdawanie kart...</div>
      {notificationLayer}
    </>
  );
}

export default App;
