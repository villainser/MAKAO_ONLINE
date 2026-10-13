import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENTS } from './shared/constants.js';

export const PENDING_GAME_ACTIONS_STORAGE_KEY = 'makaoPendingGameActionsV1';
const ACTION_ACK_TIMEOUT_MS = 6000;
const ACTION_RETRY_DELAY_MS = 800;

export function createReliableActionId() {
  return window.crypto?.randomUUID?.()
    || `action_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function readPendingGameActions(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_GAME_ACTIONS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(action => action?.actionId && action?.actionType) : [];
  } catch {
    return [];
  }
}

export function writePendingGameActions(actions, storage = window.localStorage) {
  try {
    if (actions.length === 0) {
      storage.removeItem(PENDING_GAME_ACTIONS_STORAGE_KEY);
      return;
    }
    storage.setItem(PENDING_GAME_ACTIONS_STORAGE_KEY, JSON.stringify(actions));
  } catch {
    // The in-memory queue still protects the current session when storage is unavailable.
  }
}

export function replacePendingActionsForSession(allActions, roomId, playerId, sessionActions) {
  return [
    ...allActions.filter(action => action.roomId !== roomId || action.playerId !== playerId),
    ...sessionActions
  ];
}

export function clearPendingGameActionsForSession(
  roomId,
  playerId,
  storage = window.localStorage
) {
  const normalizedRoomId = String(roomId || '').trim().toUpperCase();
  const normalizedPlayerId = String(playerId || '').trim();
  if (!normalizedRoomId || !normalizedPlayerId) return;
  const remaining = readPendingGameActions(storage).filter(action => (
    String(action.roomId || '').trim().toUpperCase() !== normalizedRoomId
    || String(action.playerId || '').trim() !== normalizedPlayerId
  ));
  writePendingGameActions(remaining, storage);
}

export function shouldRetryReliableAction(response) {
  return response?.retryable === true && response?.code === 'PERSISTENCE_FAILED';
}

export function useReliableGameActions({ socket, roomId, playerId, stateVersion }) {
  const [pendingActions, setPendingActions] = useState(() =>
    readPendingGameActions().filter(action => action.roomId === roomId && action.playerId === playerId)
  );
  const queueRef = useRef(pendingActions);
  const sendingActionIdRef = useRef(null);
  const callbacksRef = useRef(new Map());
  const retryTimerRef = useRef(null);
  const latestStateVersionRef = useRef(Number(stateVersion || 0));
  const flushRef = useRef(() => {});

  const saveQueue = useCallback((nextQueue) => {
    queueRef.current = nextQueue;
    setPendingActions(nextQueue);
    const allActions = readPendingGameActions();
    writePendingGameActions(replacePendingActionsForSession(allActions, roomId, playerId, nextQueue));
  }, [roomId, playerId]);

  const scheduleRetry = useCallback(() => {
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = window.setTimeout(() => flushRef.current(), ACTION_RETRY_DELAY_MS);
  }, []);

  const flush = useCallback(() => {
    if (!socket?.connected || sendingActionIdRef.current) return;
    const action = queueRef.current[0];
    if (!action) return;

    const queuedVersion = Number(action.expectedStateVersion || 0);
    const envelope = {
      ...action,
      expectedStateVersion: queuedVersion > 0 ? queuedVersion : latestStateVersionRef.current
    };
    sendingActionIdRef.current = action.actionId;

    socket.timeout(ACTION_ACK_TIMEOUT_MS).emit(EVENTS.GAME_ACTION, envelope, (timeoutError, response) => {
      if (sendingActionIdRef.current === action.actionId) sendingActionIdRef.current = null;

      if (timeoutError || !response) {
        scheduleRetry();
        return;
      }

      if (response.success) {
        const nextQueue = queueRef.current.filter(item => item.actionId !== action.actionId);
        saveQueue(nextQueue);
        callbacksRef.current.get(action.actionId)?.onAccepted?.(response);
        callbacksRef.current.delete(action.actionId);
        scheduleRetry();
        return;
      }

      if (shouldRetryReliableAction(response)) {
        scheduleRetry();
        return;
      }

      const nextQueue = queueRef.current.filter(item => item.actionId !== action.actionId);
      saveQueue(nextQueue);
      callbacksRef.current.get(action.actionId)?.onRejected?.(response);
      callbacksRef.current.delete(action.actionId);
      scheduleRetry();
    });
  }, [saveQueue, scheduleRetry, socket]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    latestStateVersionRef.current = Number(stateVersion || 0);
    flushRef.current();
  }, [stateVersion]);

  useEffect(() => {
    const handleConnect = () => flushRef.current();
    const handleDisconnect = () => {
      sendingActionIdRef.current = null;
      window.clearTimeout(retryTimerRef.current);
    };
    socket?.on('connect', handleConnect);
    socket?.on('disconnect', handleDisconnect);
    flushRef.current();

    return () => {
      socket?.off('connect', handleConnect);
      socket?.off('disconnect', handleDisconnect);
      window.clearTimeout(retryTimerRef.current);
    };
  }, [socket]);

  const submitReliableAction = useCallback((actionType, data = {}, callbacks = {}) => {
    if (!actionType || queueRef.current.length > 0) return null;
    const action = {
      actionId: createReliableActionId(),
      actionType,
      roomId,
      playerId,
      expectedStateVersion: latestStateVersionRef.current,
      data,
      createdAt: Date.now(),
      retryCount: 0
    };
    callbacksRef.current.set(action.actionId, callbacks);
    saveQueue([...queueRef.current, action]);
    window.setTimeout(() => flushRef.current(), 0);
    return action.actionId;
  }, [playerId, roomId, saveQueue]);

  return {
    submitReliableAction,
    pendingAction: pendingActions[0] || null,
    hasPendingAction: pendingActions.length > 0
  };
}
