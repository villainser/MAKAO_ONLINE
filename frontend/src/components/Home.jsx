import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import audioManager from '../audio/AudioManager.js';
import { parseInviteText } from '../inviteUtils.js';
import { addNativeInviteListener, getPendingNativeInviteText } from '../nativeBridge.js';

const AUDIO_ENABLED_STORAGE_KEY = 'makaoAudioEnabled';
const HAPTICS_ENABLED_STORAGE_KEY = 'makaoHapticsEnabled';
const KEY_SHIFT = '__shift__';
const KEY_BACKSPACE = '__backspace__';
const KEY_SPACE = '__space__';
const HOME_ENTRY_MODES = ['create', 'settings', 'join'];
const HOME_MENU_ANIMATION_ID = 'home-menu-card-development';
const HOME_MENU_MORPH_DURATION_MS = 620;
const HOME_MENU_QUEUE_RATE = 2.5;

const TEXT_KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  [KEY_SHIFT, 'z', 'x', 'c', 'v', 'b', 'n', 'm', KEY_BACKSPACE],
  [KEY_SPACE]
];

const CODE_KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', KEY_BACKSPACE]
];

const SERVER_KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', KEY_BACKSPACE],
  ['https://', 'http://', 'www.', '.pl', '.com'],
  ['.', ':', '/', '-', '_']
];

function getInitialInvite() {
  return parseInviteText(window.location.href);
}

function readEnabledSetting(storageKey) {
  try {
    return window.localStorage.getItem(storageKey) !== '0';
  } catch {
    return true;
  }
}

function saveEnabledSetting(storageKey, enabled) {
  try {
    window.localStorage.setItem(storageKey, enabled ? '1' : '0');
  } catch {
    // Local settings are optional in private or restricted browser modes.
  }
}

function isShiftableKey(key) {
  return typeof key === 'string' && key.length === 1 && key.toLowerCase() !== key.toUpperCase();
}

function isSpecialKey(key) {
  return key === KEY_SHIFT || key === KEY_BACKSPACE || key === KEY_SPACE;
}

function getKeyLabel(key, keyboardShift) {
  if (key === KEY_SHIFT) return 'Shift';
  if (key === KEY_BACKSPACE) return 'Backspace';
  if (key === KEY_SPACE) return 'Spacja';
  return keyboardShift && isShiftableKey(key) ? key.toLocaleUpperCase('pl-PL') : key;
}

function clampCursorIndex(value, index) {
  const safeValue = value || '';
  const numericIndex = Number.isFinite(index) ? index : safeValue.length;
  return Math.max(0, Math.min(safeValue.length, numericIndex));
}

function getCanvasFontForElement(element) {
  const style = window.getComputedStyle(element);
  return `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function getCaretIndexFromPointer(event, value) {
  const textElement = event.currentTarget.querySelector('.home-input-editable-text');
  const safeValue = value || '';
  if (!textElement || !safeValue) return 0;

  const rect = textElement.getBoundingClientRect();
  const x = Math.max(0, event.clientX - rect.left + textElement.scrollLeft);
  const canvas = getCaretIndexFromPointer.canvas || document.createElement('canvas');
  getCaretIndexFromPointer.canvas = canvas;
  const context = canvas.getContext('2d');
  context.font = getCanvasFontForElement(textElement);

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= safeValue.length; index += 1) {
    const distance = Math.abs(context.measureText(safeValue.slice(0, index)).width - x);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function getServerStatusLabel(connectionStatus) {
  return {
    connected: 'Połączono',
    connecting: 'Łączenie',
    disconnected: 'Rozłączono',
    error: 'Błąd połączenia'
  }[connectionStatus] || 'Łączenie';
}

function cleanRoomId(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function getEntryDirection(entryMode, previousEntryMode) {
  const currentIndex = HOME_ENTRY_MODES.indexOf(entryMode);
  const previousIndex = HOME_ENTRY_MODES.indexOf(previousEntryMode);
  return currentIndex >= previousIndex ? 'forward' : 'backward';
}

function accelerateHomeMenuAnimation(animation) {
  if (!animation || !['running', 'pending'].includes(animation.playState)) return;
  if (typeof animation.updatePlaybackRate !== 'function') return;
  if (animation.playbackRate < HOME_MENU_QUEUE_RATE) {
    animation.updatePlaybackRate(HOME_MENU_QUEUE_RATE);
  }
}

function ServerSelector({
  serverUrl,
  defaultServerUrl,
  connectionStatus,
  onServerUrlChange,
  onServerUrlReset,
  onOpenInput
}) {
  const [serverInput, setServerInput] = useState(serverUrl);
  const serverStatusLabel = getServerStatusLabel(connectionStatus);

  const openServerEditor = () => {
    onOpenInput({
      id: 'server',
      title: 'Serwer',
      value: serverInput,
      placeholder: defaultServerUrl,
      maxLength: 96,
      keyRows: SERVER_KEY_ROWS,
      allowShift: false,
      transform: (value) => value.toLowerCase().replace(/\s+/g, '').slice(0, 96),
      onCommit: setServerInput
    });
  };

  return (
    <section className="server-panel" aria-label="Serwer gry">
      <div className="server-row">
        <span>Serwer</span>
        <strong className={`server-status server-status-${connectionStatus}`}>{serverStatusLabel}</strong>
      </div>
      <button
        className={serverInput ? 'home-value-button home-value-filled server-value-button' : 'home-value-button server-value-button'}
        type="button"
        onClick={openServerEditor}
      >
        {serverInput || defaultServerUrl}
      </button>
      <div className="server-actions">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => onServerUrlChange(serverInput)}
          disabled={!serverInput.trim() || serverInput.trim() === serverUrl}
        >
          Ustaw
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onServerUrlReset}
          disabled={serverUrl === defaultServerUrl}
        >
          Domyślny
        </button>
      </div>
    </section>
  );
}

function Home({
  onCreateRoom,
  onJoinRoom,
  serverUrl,
  defaultServerUrl,
  connectionStatus,
  sessionNotice,
  onServerUrlChange,
  onServerUrlReset
}) {
  const autoJoinedInviteRef = useRef('');
  const appliedInviteServerRef = useRef('');
  const inviteTextAreaRef = useRef(null);
  const homeCardRef = useRef(null);
  const homeMenuAnimationRef = useRef(null);
  const queuedEntryModeRef = useRef(null);
  const homeTabRefs = useRef({});
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState(() => {
    const initialInvite = getInitialInvite();
    const params = new URLSearchParams(window.location.search);
    return initialInvite?.roomId || (params.get('room') || '').trim().toUpperCase();
  });
  const [roomName, setRoomName] = useState('');
  const [entryMode, setEntryMode] = useState(() => (roomId ? 'join' : 'create'));
  const [entryDirection, setEntryDirection] = useState('forward');
  const entryModeRef = useRef(entryMode);
  const [pendingInvite, setPendingInvite] = useState(getInitialInvite);
  const [inviteDraft, setInviteDraft] = useState('');
  const [inviteStatus, setInviteStatus] = useState(() => (
    getInitialInvite() ? 'Zaproszenie wczytane. Wpisz swój nick do gry.' : ''
  ));
  const [textEditor, setTextEditor] = useState(null);
  const [keyboardShift, setKeyboardShift] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(() => readEnabledSetting(AUDIO_ENABLED_STORAGE_KEY));
  const [hapticsEnabled, setHapticsEnabled] = useState(() => readEnabledSetting(HAPTICS_ENABLED_STORAGE_KEY));

  const canUseServer = connectionStatus === 'connected';
  const roomCodeSlots = Array.from({ length: 6 }, (_, index) => roomId[index] || '');

  useEffect(() => () => {
    queuedEntryModeRef.current = null;
    const animation = homeMenuAnimationRef.current;
    homeMenuAnimationRef.current = null;
    animation?.cancel();
  }, []);

  const selectEntryMode = useCallback(function runEntryModeTransition(nextEntryMode, { focus = false } = {}) {
    if (!HOME_ENTRY_MODES.includes(nextEntryMode)) return;

    if (homeMenuAnimationRef.current) {
      queuedEntryModeRef.current = nextEntryMode === entryModeRef.current
        ? null
        : { nextEntryMode, focus };
      if (focus) {
        homeTabRefs.current[nextEntryMode]?.focus({ preventScroll: true });
      }
      accelerateHomeMenuAnimation(homeMenuAnimationRef.current);
      return;
    }

    if (nextEntryMode === entryModeRef.current) {
      if (focus) homeTabRefs.current[nextEntryMode]?.focus({ preventScroll: true });
      return;
    }

    const commitMode = () => {
      flushSync(() => {
        setEntryDirection(getEntryDirection(nextEntryMode, entryModeRef.current));
        entryModeRef.current = nextEntryMode;
        setEntryMode(nextEntryMode);
      });
      if (focus) {
        homeTabRefs.current[nextEntryMode]?.focus({ preventScroll: true });
      }
    };
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const card = homeCardRef.current;
    if (reduceMotion || !card || typeof card.animate !== 'function') {
      commitMode();
      return;
    }

    const fromRect = card.getBoundingClientRect();
    commitMode();
    const toRect = card.getBoundingClientRect();
    const fromCenterX = fromRect.left + (fromRect.width / 2);
    const fromCenterY = fromRect.top + (fromRect.height / 2);
    const toCenterX = toRect.left + (toRect.width / 2);
    const toCenterY = toRect.top + (toRect.height / 2);
    const fromTransform = `translate3d(${fromCenterX - toCenterX}px, ${fromCenterY - toCenterY}px, 0) scale(${fromRect.width / toRect.width}, ${fromRect.height / toRect.height})`;

    let animation;
    try {
      animation = card.animate([
        { transform: fromTransform },
        { transform: 'translate3d(0, 0, 0) scale(1, 1)' }
      ], {
        duration: HOME_MENU_MORPH_DURATION_MS,
        easing: 'cubic-bezier(0.3, 0.45, 0.35, 1)',
        fill: 'both'
      });
      animation.id = HOME_MENU_ANIMATION_ID;
    } catch {
      animation?.cancel();
      return;
    }

    homeMenuAnimationRef.current = animation;
    animation.finished.catch(() => {}).finally(() => {
      if (homeMenuAnimationRef.current !== animation) return;
      homeMenuAnimationRef.current = null;
      animation.cancel();
      const queued = queuedEntryModeRef.current;
      queuedEntryModeRef.current = null;
      if (queued && queued.nextEntryMode !== entryModeRef.current) {
        runEntryModeTransition(queued.nextEntryMode, { focus: queued.focus });
      }
    });
  }, []);

  const handleEntryTabKeyDown = (event, currentMode) => {
    const currentIndex = HOME_ENTRY_MODES.indexOf(currentMode);
    let nextIndex = null;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % HOME_ENTRY_MODES.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + HOME_ENTRY_MODES.length) % HOME_ENTRY_MODES.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = HOME_ENTRY_MODES.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    selectEntryMode(HOME_ENTRY_MODES[nextIndex], { focus: true });
  };

  const applyInvite = useCallback((invite, status = 'Zaproszenie wczytane. Wpisz swój nick do gry.') => {
    if (!invite?.roomId) {
      setInviteStatus('Nie rozpoznano zaproszenia.');
      return;
    }
    setPendingInvite({
      ...invite,
      appliedAt: Date.now()
    });
    setRoomId(cleanRoomId(invite.roomId));
    selectEntryMode('join');
    setInviteStatus(status);
    autoJoinedInviteRef.current = '';
  }, [selectEntryMode]);

  const applyInviteText = useCallback((text, status = 'Zaproszenie wczytane. Wpisz swój nick do gry.') => {
    const invite = parseInviteText(text);
    if (!invite) {
      setInviteStatus('Nie rozpoznano zaproszenia.');
      return false;
    }
    applyInvite(invite, status);
    return true;
  }, [applyInvite]);

  const handleInviteDraftChange = (event) => {
    const nextValue = event.target.value.slice(0, 1200);
    setInviteDraft(nextValue);
    if (!nextValue.trim()) {
      setInviteStatus(pendingInvite ? inviteStatus : '');
      return;
    }
    const invite = parseInviteText(nextValue);
    if (invite) {
      applyInvite(invite);
    } else if (nextValue.trim().length >= 6) {
      setInviteStatus('Nie rozpoznano zaproszenia.');
    }
  };

  const handleExternalInviteText = useCallback((text) => {
    const nextText = String(text || '').trim();
    if (!nextText) return;
    setInviteDraft(nextText);
    const applied = applyInviteText(nextText, 'Zaproszenie wczytane z Androida. Wpisz swój nick do gry.');
    if (!applied) selectEntryMode('join');
  }, [applyInviteText, selectEntryMode]);

  const pasteInviteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setInviteStatus('Wklej link w polu zaproszenia.');
        inviteTextAreaRef.current?.focus();
        return;
      }
      const text = await navigator.clipboard.readText();
      setInviteDraft(text);
      applyInviteText(text);
    } catch {
      setInviteStatus('Brak dostępu do schowka. Wklej link w polu.');
      inviteTextAreaRef.current?.focus();
    }
  };

  const openTextEditor = (config) => {
    const value = config.value || '';
    setKeyboardShift(false);
    setTextEditor({
      keyRows: TEXT_KEY_ROWS,
      transform: (value) => value.slice(0, config.maxLength || 24),
      ...config,
      value,
      cursorIndex: value.length
    });
  };

  const commitTextEditor = (value) => {
    if (!textEditor) return;
    const nextValue = textEditor.transform ? textEditor.transform(value) : value;
    textEditor.onCommit(nextValue);
    setTextEditor(null);
  };

  const updateEditorValue = (updater, cursorUpdater) => {
    setTextEditor((current) => {
      if (!current) return current;
      const previousCursor = clampCursorIndex(current.value, current.cursorIndex);
      const rawValue = typeof updater === 'function' ? updater(current.value, previousCursor) : updater;
      const transformed = current.transform ? current.transform(rawValue) : rawValue;
      const nextCursor = typeof cursorUpdater === 'function'
        ? cursorUpdater({ previousValue: current.value, previousCursor, rawValue, transformed })
        : cursorUpdater;
      return {
        ...current,
        value: transformed,
        cursorIndex: clampCursorIndex(transformed, nextCursor ?? transformed.length)
      };
    });
  };

  const appendEditorKey = (key) => {
    const nextKey = keyboardShift && isShiftableKey(key) ? key.toLocaleUpperCase('pl-PL') : key;
    updateEditorValue(
      (value, cursorIndex) => `${value.slice(0, cursorIndex)}${nextKey}${value.slice(cursorIndex)}`.slice(0, textEditor?.maxLength || 96),
      ({ previousCursor, transformed }) => Math.min(previousCursor + nextKey.length, transformed.length)
    );
    if (keyboardShift && isShiftableKey(key)) {
      setKeyboardShift(false);
    }
  };

  const setEditorCursor = (cursorIndex) => {
    setTextEditor((current) => {
      if (!current) return current;
      return { ...current, cursorIndex: clampCursorIndex(current.value, cursorIndex) };
    });
  };

  const setEditorCursorFromPointer = (event) => {
    if (!textEditor || textEditor.id === 'roomcode') return;
    event.preventDefault();
    setEditorCursor(getCaretIndexFromPointer(event, textEditor.value));
  };

  const handleKeyboardKey = (key) => {
    if (key === KEY_SHIFT) {
      setKeyboardShift(value => !value);
      return;
    }
    if (key === KEY_BACKSPACE) {
      updateEditorValue(
        (value, cursorIndex) => (cursorIndex > 0 ? `${value.slice(0, cursorIndex - 1)}${value.slice(cursorIndex)}` : value),
        ({ previousCursor }) => Math.max(0, previousCursor - 1)
      );
      return;
    }
    if (key === KEY_SPACE) {
      if (textEditor?.allowSpace) {
        appendEditorKey(' ');
      }
      return;
    }
    appendEditorKey(key);
  };

  const playAudioToggleFeedback = (enabled) => {
    audioManager.setMuted(false);
    if (enabled) {
      audioManager.resume();
      window.setTimeout(() => {
        audioManager.playSound('turn_ping', { volume: 0.72 });
      }, 0);
      return;
    }
    audioManager.playSound('card_land', { volume: 0.38, playbackRate: 0.86 });
    window.setTimeout(() => audioManager.setMuted(true), 120);
  };

  const playHapticsToggleFeedback = (enabled) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.(enabled ? [18, 34, 18] : [10]);
  };

  const toggleAudio = () => {
    setAudioEnabled((enabled) => {
      const nextEnabled = !enabled;
      playAudioToggleFeedback(nextEnabled);
      return nextEnabled;
    });
  };

  const toggleHaptics = () => {
    setHapticsEnabled((enabled) => {
      const nextEnabled = !enabled;
      playHapticsToggleFeedback(nextEnabled);
      return nextEnabled;
    });
  };

  useEffect(() => {
    if (!textEditor) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setTextEditor(null);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        commitTextEditor(textEditor.value);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        updateEditorValue(
          (value, cursorIndex) => (cursorIndex > 0 ? `${value.slice(0, cursorIndex - 1)}${value.slice(cursorIndex)}` : value),
          ({ previousCursor }) => Math.max(0, previousCursor - 1)
        );
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setEditorCursor((textEditor.cursorIndex ?? textEditor.value.length) - 1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setEditorCursor((textEditor.cursorIndex ?? textEditor.value.length) + 1);
        return;
      }
      if (event.key === ' ' && textEditor.allowSpace) {
        event.preventDefault();
        appendEditorKey(' ');
        return;
      }
      if (event.key.length === 1) {
        event.preventDefault();
        appendEditorKey(event.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  useEffect(() => {
    audioManager.setMuted(!audioEnabled);
    saveEnabledSetting(AUDIO_ENABLED_STORAGE_KEY, audioEnabled);
  }, [audioEnabled]);

  useEffect(() => {
    saveEnabledSetting(HAPTICS_ENABLED_STORAGE_KEY, hapticsEnabled);
  }, [hapticsEnabled]);

  useEffect(() => {
    if (!pendingInvite?.serverUrl) return;
    const inviteServerKey = `${pendingInvite.appliedAt || 'initial'}:${pendingInvite.serverUrl}`;
    if (appliedInviteServerRef.current === inviteServerKey) return;
    appliedInviteServerRef.current = inviteServerKey;
    onServerUrlChange(pendingInvite.serverUrl);
  }, [onServerUrlChange, pendingInvite?.appliedAt, pendingInvite?.serverUrl]);

  useEffect(() => {
    if (!pendingInvite?.roomId) return;
    const cleanName = playerName.trim();
    const cleanInviteRoomId = cleanRoomId(roomId);
    if (!cleanName || cleanInviteRoomId.length !== 6 || !canUseServer) return;

    const joinKey = `${pendingInvite.appliedAt || 'initial'}:${serverUrl}:${cleanInviteRoomId}:${cleanName}`;
    if (autoJoinedInviteRef.current === joinKey) return;
    autoJoinedInviteRef.current = joinKey;
    onJoinRoom(cleanName, cleanInviteRoomId);
  }, [canUseServer, onJoinRoom, pendingInvite, playerName, roomId, serverUrl]);

  useEffect(() => {
    let cancelled = false;
    getPendingNativeInviteText()
      .then((text) => {
        if (!cancelled) handleExternalInviteText(text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [handleExternalInviteText]);

  useEffect(() => addNativeInviteListener(handleExternalInviteText), [handleExternalInviteText]);

  const openPlayerEditor = () => openTextEditor({
    id: 'player',
    title: 'Pseudonim',
    value: playerName,
    placeholder: 'Pseudonim',
    maxLength: 40,
    allowSpace: true,
    transform: (value) => value.replace(/\s+/g, ' ').slice(0, 40),
    onCommit: setPlayerName
  });
  const hasJoinRoomCode = roomId.length === 6;
  const hasPlayerName = Boolean(playerName.trim());
  const joinPrimaryLabel = !hasJoinRoomCode
    ? 'Użyj linku'
    : (!hasPlayerName ? 'Wpisz nick' : 'Dołącz');
  const joinPrimaryDisabled = hasJoinRoomCode && hasPlayerName && !canUseServer;
  const handleJoinPrimaryAction = () => {
    if (!hasJoinRoomCode) {
      if (inviteDraft.trim()) {
        applyInviteText(inviteDraft);
        return;
      }
      setInviteStatus('Wklej link w polu zaproszenia.');
      inviteTextAreaRef.current?.focus();
      return;
    }
    if (!hasPlayerName) {
      openPlayerEditor();
      return;
    }
    onJoinRoom(playerName, roomId);
  };
  const canUseShift = textEditor?.allowShift !== false && Boolean(textEditor?.keyRows?.some(row => row.some(isShiftableKey)));
  const visibleKeyRows = textEditor?.keyRows
    ?.map(row => row.filter((key) => {
      if (key === KEY_SHIFT) return canUseShift;
      if (key === KEY_SPACE) return Boolean(textEditor.allowSpace);
      return true;
    }))
    .filter(row => row.length > 0) || [];
  const editorCursorIndex = clampCursorIndex(textEditor?.value || '', textEditor?.cursorIndex);

  return (
    <main className="home-screen home-start-screen">
      <section className="home-hero">
        <div className="home-table-scene" aria-hidden="true">
          <span className="home-floating-card home-floating-card-1" />
          <span className="home-floating-card home-floating-card-2" />
          <span className="home-floating-card home-floating-card-3" />
        </div>
        <h1>MAKAO</h1>
      </section>
      
      <div className="home-card-stage">
      <form
        ref={homeCardRef}
        className={`glass-panel home-card home-card-${entryMode}`}
        data-entry-direction={entryDirection}
        onSubmit={(event) => event.preventDefault()}
      >
        <span
          className="home-card-surface"
          aria-hidden="true"
        />
        <div className="home-menu-tabs" role="tablist" aria-label="Menu startowe">
          <button
            type="button"
            role="tab"
            id="home-tab-create"
            aria-controls="home-panel-create"
            aria-selected={entryMode === 'create'}
            tabIndex={entryMode === 'create' ? 0 : -1}
            ref={(element) => { homeTabRefs.current.create = element; }}
            className={entryMode === 'create' ? 'home-menu-button home-menu-active' : 'home-menu-button'}
            onClick={() => selectEntryMode('create')}
            onKeyDown={(event) => handleEntryTabKeyDown(event, 'create')}
          >
            Nowa gra
          </button>
          <button
            type="button"
            role="tab"
            id="home-tab-settings"
            aria-controls="home-panel-settings"
            aria-selected={entryMode === 'settings'}
            tabIndex={entryMode === 'settings' ? 0 : -1}
            ref={(element) => { homeTabRefs.current.settings = element; }}
            className={entryMode === 'settings' ? 'home-menu-button home-menu-active' : 'home-menu-button'}
            onClick={() => selectEntryMode('settings')}
            onKeyDown={(event) => handleEntryTabKeyDown(event, 'settings')}
          >
            Ustawienia
          </button>
          <button
            type="button"
            role="tab"
            id="home-tab-join"
            aria-controls="home-panel-join"
            aria-selected={entryMode === 'join'}
            tabIndex={entryMode === 'join' ? 0 : -1}
            ref={(element) => { homeTabRefs.current.join = element; }}
            className={entryMode === 'join' ? 'home-menu-button home-menu-active' : 'home-menu-button'}
            onClick={() => selectEntryMode('join')}
            onKeyDown={(event) => handleEntryTabKeyDown(event, 'join')}
          >
            Dołącz
          </button>
        </div>

        <div className="home-card-body">
        {sessionNotice && (
          <div className="home-session-notice" role="status">
            {sessionNotice}
          </div>
        )}

        <div
          key={entryMode}
          id={`home-panel-${entryMode}`}
          className="home-mode-content"
          role="tabpanel"
          aria-labelledby={`home-tab-${entryMode}`}
          data-entry-direction={entryDirection}
        >
        {entryMode !== 'settings' && (
          <div className="home-field home-field-name">
            <span>Pseudonim</span>
            <button
              className={playerName ? 'home-value-button home-value-filled' : 'home-value-button'}
              type="button"
              onClick={openPlayerEditor}
            >
              {playerName || 'Pseudonim'}
            </button>
          </div>
        )}

        {entryMode === 'create' ? (
          <section className="home-entry-panel" aria-label="Nowy stół">
            <div className="home-field">
              <span>Nazwa stołu</span>
              <button
                className={roomName ? 'home-value-button home-value-filled' : 'home-value-button'}
                type="button"
                onClick={() => openTextEditor({
                  id: 'roomname',
                  title: 'Nazwa stołu',
                  value: roomName,
                  placeholder: 'Nazwa stołu',
                  maxLength: 32,
                  allowSpace: true,
                  transform: (value) => value.replace(/\s+/g, ' ').slice(0, 32),
                  onCommit: setRoomName
                })}
              >
                {roomName || 'Nazwa stołu'}
              </button>
            </div>

            <button
              className="btn home-primary-action"
              type="button"
              onClick={() => onCreateRoom(playerName, { roomName })}
              disabled={!playerName || !canUseServer}
            >
              Stwórz stół
            </button>
          </section>
        ) : entryMode === 'join' ? (
          <section className="home-entry-panel" aria-label="Dołącz kodem">
            <div className="home-field home-code-field">
              <span>Kod stołu</span>
              <button
                className={roomId ? 'home-value-button home-value-filled home-code-value' : 'home-value-button home-code-value'}
                type="button"
                aria-label={roomId ? `Kod stołu ${roomId}` : 'Wpisz kod stołu'}
                onClick={() => openTextEditor({
                  id: 'roomcode',
                  title: 'Kod stołu',
                  value: roomId,
                  placeholder: 'Kod pokoju',
                  maxLength: 6,
                  keyRows: CODE_KEY_ROWS,
                  allowShift: false,
                  transform: cleanRoomId,
                  onCommit: (value) => {
                    setRoomId(value);
                    setPendingInvite(null);
                    setInviteDraft('');
                    setInviteStatus('');
                    autoJoinedInviteRef.current = '';
                  }
                })}
              >
                <span className="room-code-slots" aria-hidden="true">
                  {roomCodeSlots.map((char, index) => (
                    <span key={index} className={char ? 'room-code-slot room-code-slot-filled' : 'room-code-slot'}>
                      {char}
                    </span>
                  ))}
                </span>
              </button>
            </div>

            {!pendingInvite && (
              <textarea
                ref={inviteTextAreaRef}
                className="home-invite-textarea"
                value={inviteDraft}
                onChange={handleInviteDraftChange}
                placeholder="Link albo kod zaproszenia"
                aria-label="Link albo kod zaproszenia"
                rows={2}
                spellCheck="false"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
              />
            )}

            {pendingInvite ? (
              <div className="home-invite-panel home-invite-panel-active" role="status">
                <strong>{pendingInvite.roomName || `Stół ${pendingInvite.roomId}`}</strong>
                <span>{inviteStatus || 'Wpisz swój nick do gry.'}</span>
                {pendingInvite.serverUrl && <small>{pendingInvite.serverUrl}</small>}
              </div>
            ) : inviteStatus ? (
              <p className="home-invite-feedback" role="status">{inviteStatus}</p>
            ) : null}

            <div className="home-join-actions">
              <button
                className="btn home-primary-action"
                type="button"
                onClick={handleJoinPrimaryAction}
                disabled={joinPrimaryDisabled}
              >
                {joinPrimaryLabel}
              </button>
              <button
                className="btn btn-secondary home-clipboard-action"
                type="button"
                onClick={pasteInviteFromClipboard}
              >
                Schowek
              </button>
            </div>
          </section>
        ) : (
          <section className="home-entry-panel home-settings-page" aria-label="Ustawienia">
            <div className="home-field home-field-name">
              <span>Pseudonim</span>
              <button
                className={playerName ? 'home-value-button home-value-filled' : 'home-value-button'}
                type="button"
                onClick={openPlayerEditor}
              >
                {playerName || 'Pseudonim'}
              </button>
            </div>
            <div className="home-setting-toggles" aria-label="Ustawienia gry">
              <button
                className={audioEnabled ? 'home-setting-toggle home-setting-toggle-on' : 'home-setting-toggle'}
                type="button"
                onClick={toggleAudio}
              >
                <span>Dźwięk</span>
                <strong>{audioEnabled ? 'Włączony' : 'Wyłączony'}</strong>
              </button>
              <button
                className={hapticsEnabled ? 'home-setting-toggle home-setting-toggle-on' : 'home-setting-toggle'}
                type="button"
                onClick={toggleHaptics}
              >
                <span>Wibracje</span>
                <strong>{hapticsEnabled ? 'Włączone' : 'Wyłączone'}</strong>
              </button>
            </div>
            <ServerSelector
              key={serverUrl}
              serverUrl={serverUrl}
              defaultServerUrl={defaultServerUrl}
              connectionStatus={connectionStatus}
              onServerUrlChange={onServerUrlChange}
              onServerUrlReset={onServerUrlReset}
              onOpenInput={openTextEditor}
            />
          </section>
        )}
        </div>
        {entryMode === 'join' && !sessionNotice && (
          <span className="home-card-breathing-room" aria-hidden="true" />
        )}
        </div>
      </form>
      </div>

      {textEditor && (
        <div className="home-input-backdrop" role="dialog" aria-modal="true" aria-label={textEditor.title}>
          <div className="glass-panel home-input-panel">
            <div className="home-input-head">
              <span>{textEditor.title}</span>
              <strong className="home-input-counter">
                {textEditor.value.length}/{textEditor.maxLength || 96}
              </strong>
            </div>
            <div className={`home-input-display home-input-display-${textEditor.id}`}>
              {textEditor.id === 'roomcode' ? (
                <div className="home-input-code-slots" aria-label={textEditor.value || textEditor.placeholder}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} className={textEditor.value[index] ? 'room-code-slot room-code-slot-filled' : 'room-code-slot'}>
                      {textEditor.value[index] || ''}
                    </span>
                  ))}
                </div>
              ) : (
                <button
                  className={textEditor.value ? 'home-input-editable home-input-value' : 'home-input-editable home-input-placeholder'}
                  type="button"
                  role="textbox"
                  aria-label={textEditor.title}
                  aria-readonly="true"
                  onPointerDown={setEditorCursorFromPointer}
                >
                  {textEditor.value ? (
                    <span className="home-input-editable-text">
                      {textEditor.value.slice(0, editorCursorIndex)}
                      <span className="home-input-caret" aria-hidden="true" />
                      {textEditor.value.slice(editorCursorIndex)}
                    </span>
                  ) : (
                    <span className="home-input-editable-text">
                      <span className="home-input-caret home-input-caret-empty" aria-hidden="true" />
                      {textEditor.placeholder}
                    </span>
                  )}
                </button>
              )}
              {textEditor.value && (
                <button className="home-input-clear" type="button" aria-label="Wyczyść" onClick={() => updateEditorValue('', 0)}>
                  ×
                </button>
              )}
            </div>

            <div className="game-keyboard" aria-label="Klawiatura">
              {visibleKeyRows.map((row, rowIndex) => (
                <div
                  className="game-key-row"
                  key={`${textEditor.id}-${rowIndex}`}
                >
                  {row.map((key) => (
                    <button
                      className={[
                        'game-key',
                        key.length > 1 && !isSpecialKey(key) ? 'game-key-token' : '',
                        key === KEY_SHIFT ? 'game-key-shift' : '',
                        key === KEY_SHIFT && keyboardShift ? 'game-key-shift-active' : '',
                        key === KEY_BACKSPACE ? 'game-key-backspace' : '',
                        key === KEY_SPACE ? 'game-key-space' : ''
                      ].filter(Boolean).join(' ')}
                      type="button"
                      key={key}
                      aria-pressed={key === KEY_SHIFT ? keyboardShift : undefined}
                      onClick={() => handleKeyboardKey(key)}
                    >
                      {getKeyLabel(key, keyboardShift)}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="home-input-actions">
              <button className="game-key game-key-wide" type="button" onClick={() => setTextEditor(null)}>
                Zamknij
              </button>
              <button className="game-key game-key-wide game-key-primary" type="button" onClick={() => commitTextEditor(textEditor.value)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default Home;
