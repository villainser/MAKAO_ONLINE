package pl.makao.zeznajomymi.gdx.net;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import io.socket.client.Ack;
import io.socket.client.IO;
import io.socket.client.Socket;
import pl.makao.zeznajomymi.gdx.model.MakaoCard;
import pl.makao.zeznajomymi.gdx.model.MakaoGameState;
import pl.makao.zeznajomymi.gdx.model.MakaoPlayer;
import pl.makao.zeznajomymi.gdx.model.MakaoRoomState;
import pl.makao.zeznajomymi.gdx.rules.NativeReliableActionRules;

public final class NativeGameClient {
    public interface Listener {
        void onStatus(String message);
        void onRoomState(MakaoRoomState roomState);
        void onGameState(MakaoGameState gameState);
        void onError(String message);
        void onSessionRefreshResult(boolean success, String message);
        void onLeaveConfirmed();
    }

    private static final String EVENT_CREATE_ROOM = "create_room";
    private static final String EVENT_JOIN_ROOM = "join_room";
    private static final String EVENT_RECONNECT_SESSION = "reconnect_session";
    private static final String EVENT_LEAVE_ROOM = "leave_room";
    private static final String EVENT_ROOM_STATE_UPDATE = "room_state_update";
    private static final String EVENT_GAME_STATE_UPDATE = "game_state_update";
    private static final String EVENT_GAME_ACTION = "game_action";
    private static final String EVENT_TOGGLE_READY = "toggle_ready";
    private static final String EVENT_UPDATE_SETTINGS = "update_settings";
    private static final String EVENT_RETURN_TO_LOBBY = "return_to_lobby";
    private static final String EVENT_START_GAME = "start_game";
    private static final String EVENT_PLAY_CARDS = "play_cards";
    private static final String EVENT_DRAW_CARD = "draw_card";
    private static final String EVENT_ACCEPT_SKIP = "accept_skip";
    private static final String EVENT_PASS_TURN = "pass_turn";
    private static final String EVENT_DECLARE_MAKAO = "declare_makao";
    private static final String EVENT_CATCH_MAKAO = "catch_makao";
    private static final String EVENT_ERROR = "error";
    private static final String STATUS_MOMENT = "Chwileczkę…";
    private static final String STATUS_RETURNING_TO_TABLE = "Wracamy do stołu…";

    private final NativeGameConfig config;
    private final Listener listener;
    private final NativeSessionPersistence persistence;
    private final ScheduledExecutorService retryExecutor = Executors.newSingleThreadScheduledExecutor();
    private Socket socket;
    private MakaoRoomState roomState;
    private boolean connectRequested;
    private volatile PendingGameAction pendingGameAction;
    private volatile PendingLeave pendingLeave;
    private volatile boolean gameActionAwaitingAck;
    private volatile boolean leaveAwaitingAck;
    private volatile boolean sessionRefreshAwaitingAck;
    private volatile int authoritativeStateVersion;
    private volatile String resumeToken;
    private volatile String resumeTokenRoomId;

    public NativeGameClient(NativeGameConfig config, Listener listener) {
        this(config, listener, null);
    }

    public NativeGameClient(
        NativeGameConfig config,
        Listener listener,
        NativeSessionPersistence persistence
    ) {
        this.config = config;
        this.listener = listener;
        this.persistence = persistence;
        restoreSessionState();
    }

    private void restoreSessionState() {
        String roomId = cleanRoomId(config.roomId);
        if (roomId == null) return;

        resumeTokenRoomId = roomId;
        resumeToken = clean(config.resumeToken);
        if (resumeToken == null && persistence != null) {
            resumeToken = clean(persistence.loadResumeToken(config.serverUrl, roomId, config.clientId));
        } else if (resumeToken != null && persistence != null) {
            persistence.saveResumeToken(config.serverUrl, roomId, config.clientId, resumeToken);
        }

        if (persistence == null) return;
        NativeSessionPersistence.PendingAction storedAction = persistence.loadPendingAction(
            config.serverUrl,
            roomId,
            config.clientId
        );
        if (storedAction != null) {
            try {
                pendingGameAction = new PendingGameAction(
                    storedAction.actionId,
                    storedAction.actionType,
                    new JSONObject(storedAction.payloadJson),
                    storedAction.expectedStateVersion,
                    roomId
                );
            } catch (JSONException ignored) {
                persistence.clearPendingAction(config.serverUrl, roomId, config.clientId);
            }
        }

        NativeSessionPersistence.PendingLeave storedLeave = persistence.loadPendingLeave(
            config.serverUrl,
            roomId,
            config.clientId
        );
        if (storedLeave != null) {
            pendingLeave = new PendingLeave(
                storedLeave.actionId,
                storedLeave.roomId,
                storedLeave.clientId,
                storedLeave.resumeToken
            );
        }
    }

    public void connect() {
        if (connectRequested && socket != null) return;
        connectRequested = true;
        try {
            IO.Options options = IO.Options.builder()
                .setReconnection(true)
                .setTimeout(7000)
                .build();
            socket = IO.socket(new URI(config.serverUrl), options);
        } catch (URISyntaxException err) {
            listener.onError("Nieprawidłowy adres serwera: " + config.serverUrl);
            return;
        }

        socket.on(Socket.EVENT_CONNECT, args -> {
            listener.onStatus(config.roomId == null ? "Połączono" : STATUS_RETURNING_TO_TABLE);
            gameActionAwaitingAck = false;
            leaveAwaitingAck = false;
            if (pendingLeave != null) {
                sendPendingLeave();
                return;
            }
            if (config.roomId != null) {
                if (config.reconnectSession) {
                    reconnectSession(config.roomId);
                } else {
                    joinRoom(config.roomId);
                }
            } else {
                listener.onStatus("Dotknij talii, aby utworzyć pokój");
            }
        });
        socket.on(Socket.EVENT_DISCONNECT, args -> {
            gameActionAwaitingAck = false;
            leaveAwaitingAck = false;
            if (sessionRefreshAwaitingAck) {
                sessionRefreshAwaitingAck = false;
                listener.onSessionRefreshResult(false, "Straciliśmy połączenie. Spróbuj ponownie.");
            }
            listener.onStatus(STATUS_RETURNING_TO_TABLE);
        });
        socket.on(Socket.EVENT_CONNECT_ERROR, args -> listener.onError("Nie udało się połączyć. Spróbuj ponownie."));
        socket.on(EVENT_ROOM_STATE_UPDATE, args -> {
            JSONObject payload = firstJson(args);
            if (payload == null) return;
            roomState = MakaoRoomState.fromJson(payload);
            listener.onRoomState(roomState);
        });
        socket.on(EVENT_GAME_STATE_UPDATE, args -> {
            JSONObject payload = firstJson(args);
            if (payload == null) return;
            MakaoGameState state = MakaoGameState.fromJson(payload, config.clientId);
            authoritativeStateVersion = state.stateVersion;
            if (roomState != null) {
                state.roomId = roomState.id;
                state.allowMultipleCards = state.allowMultipleCards && roomState.allowMultipleCards;
                mergeRoomPlayers(state);
                state.currentPlayerName = state.resolvePlayerName(state.currentPlayerId);
                state.statusText = state.buildStatusText();
            }
            listener.onGameState(state);
            PendingGameAction pending = pendingGameAction;
            if (pending != null && !gameActionAwaitingAck) {
                sendPendingGameAction();
            }
        });
        socket.on(EVENT_ERROR, args -> {
            JSONObject payload = firstJson(args);
            String message = payload == null ? firstArgLabel(args) : payload.optString("message", "Ruch nie został przyjęty.");
            listener.onError(message);
        });
        socket.connect();
    }

    private void mergeRoomPlayers(MakaoGameState state) {
        if (state == null || roomState == null) return;
        for (MakaoPlayer roomPlayer : roomState.players) {
            int existingIndex = findPlayerIndex(state, roomPlayer.id);
            if (existingIndex < 0) {
                state.players.add(roomPlayer);
            } else if (hasBetterDisplayName(roomPlayer, state.players.get(existingIndex))) {
                state.players.set(existingIndex, roomPlayer);
            }
        }
    }

    private int findPlayerIndex(MakaoGameState state, String playerId) {
        if (state == null || playerId == null || playerId.isEmpty()) return -1;
        for (int i = 0; i < state.players.size(); i++) {
            MakaoPlayer player = state.players.get(i);
            if (player != null && playerId.equals(player.id)) return i;
        }
        return -1;
    }

    private boolean hasBetterDisplayName(MakaoPlayer candidate, MakaoPlayer current) {
        if (candidate == null || current == null) return false;
        return isRealDisplayName(candidate) && !isRealDisplayName(current);
    }

    private boolean isRealDisplayName(MakaoPlayer player) {
        return player != null
            && player.name != null
            && !player.name.isEmpty()
            && !player.name.equals(player.id);
    }

    public void disconnect() {
        connectRequested = false;
        if (socket != null) {
            socket.off();
            socket.disconnect();
            socket = null;
        }
        retryExecutor.shutdownNow();
    }

    public boolean isConnected() {
        return socket != null && socket.connected();
    }

    public boolean hasRoom() {
        return roomState != null && roomState.id != null;
    }

    public boolean isPlaying() {
        return roomState != null && roomState.isPlaying();
    }

    public boolean hasPendingGameAction() {
        return pendingGameAction != null;
    }

    public boolean isLobby() {
        return roomState != null && roomState.isLobby();
    }

    public MakaoRoomState getRoomState() {
        return roomState;
    }

    public void createRoom() {
        createRoom(null);
    }

    public void createRoom(String roomName) {
        createRoom(roomName, null);
    }

    public void createRoom(String roomName, JSONObject settings) {
        if (!isConnected()) {
            listener.onStatus(STATUS_MOMENT);
            connect();
            return;
        }
        JSONObject payload = new JSONObject();
        try {
            payload.put("playerName", config.playerName);
            payload.put("clientId", config.clientId);
            payload.put("supportsResumeToken", true);
            String cleanRoomName = roomName == null ? "" : roomName.trim();
            payload.put("roomName", cleanRoomName.isEmpty() ? config.playerName + " - native" : cleanRoomName);
            if (settings != null) {
                payload.put("settings", settings);
            }
        } catch (JSONException ignored) {
        }
        listener.onStatus("Utwórz pokój");
        socket.emit(EVENT_CREATE_ROOM, payload, (Ack) args -> handleRoomAck(args, "Utworzono pokój", null));
    }

    public void joinRoom(String roomId) {
        if (!isConnected()) {
            listener.onStatus(STATUS_MOMENT);
            return;
        }
        JSONObject payload = new JSONObject();
        try {
            payload.put("playerName", config.playerName);
            payload.put("clientId", config.clientId);
            payload.put("roomId", roomId);
            payload.put("supportsResumeToken", true);
            putResumeToken(payload, roomId);
        } catch (JSONException ignored) {
        }
        listener.onStatus("Łączenie…");
        socket.emit(EVENT_JOIN_ROOM, payload, (Ack) args -> handleRoomAck(args, "Dołączono", roomId));
    }

    public void reconnectSession(String roomId) {
        if (!isConnected()) {
            listener.onStatus(STATUS_RETURNING_TO_TABLE);
            return;
        }
        JSONObject payload = new JSONObject();
        try {
            payload.put("clientId", config.clientId);
            payload.put("roomId", roomId);
            payload.put("supportsResumeToken", true);
            putResumeToken(payload, roomId);
        } catch (JSONException ignored) {
        }
        listener.onStatus("Sprawdzam ostatni stół " + roomId + "…");
        socket.emit(EVENT_RECONNECT_SESSION, payload, (Ack) args -> handleRoomAck(args, "Wrócono", roomId));
    }

    public void refreshSession() {
        String roomId = roomState != null && roomState.id != null
            ? roomState.id
            : config.roomId;
        if (roomId == null || roomId.isEmpty()) {
            listener.onSessionRefreshResult(false, "Nie ma stołu, do którego możemy wrócić.");
            return;
        }
        if (!isConnected()) {
            listener.onSessionRefreshResult(false, "Nie ma teraz połączenia.");
            return;
        }
        if (sessionRefreshAwaitingAck) return;

        JSONObject payload = new JSONObject();
        try {
            payload.put("clientId", config.clientId);
            payload.put("roomId", roomId);
            payload.put("supportsResumeToken", true);
            putResumeToken(payload, roomId);
        } catch (JSONException ignored) {
        }
        sessionRefreshAwaitingAck = true;
        listener.onStatus(STATUS_RETURNING_TO_TABLE);
        socket.emit(EVENT_RECONNECT_SESSION, payload, (Ack) this::handleSessionRefreshAck);
    }

    public void startGame() {
        if (!isConnected() || !hasRoom()) return;
        listener.onStatus("Start gry");
        socket.emit(EVENT_START_GAME);
    }

    public void returnToLobby() {
        if (!isConnected() || !hasRoom()) return;
        listener.onStatus("Rewanż…");
        socket.emit(EVENT_RETURN_TO_LOBBY);
    }

    public void leaveRoom() {
        String roomId = roomState != null && roomState.id != null
            ? roomState.id
            : config.roomId;
        if (roomId == null || roomId.isEmpty()) {
            roomState = null;
            listener.onRoomState(null);
            listener.onLeaveConfirmed();
            return;
        }
        listener.onStatus("Opuszczam stół…");
        if (pendingLeave == null) {
            pendingLeave = new PendingLeave(
                UUID.randomUUID().toString(),
                roomId,
                config.clientId,
                resumeTokenFor(roomId)
            );
            persistPendingLeave(pendingLeave);
        }
        if (isConnected()) {
            sendPendingLeave();
        } else {
            connect();
        }
    }

    public void toggleReady() {
        if (!isConnected() || !hasRoom() || !isLobby()) return;
        listener.onStatus("Gotowość");
        socket.emit(EVENT_TOGGLE_READY);
    }

    public void updateSettings(JSONObject settings) {
        if (!isConnected() || !hasRoom() || !isLobby() || settings == null) return;
        listener.onStatus("Ustawienia stołu");
        socket.emit(EVENT_UPDATE_SETTINGS, settings);
    }

    public boolean drawCard() {
        if (!isConnected() || !isPlaying()) return false;
        return emitReliableGameAction(EVENT_DRAW_CARD, new JSONObject(), authoritativeStateVersion);
    }

    public boolean acceptSkip() {
        if (!isConnected() || !isPlaying()) return false;
        return emitReliableGameAction(EVENT_ACCEPT_SKIP, new JSONObject(), authoritativeStateVersion);
    }

    public boolean passTurn() {
        if (!isConnected() || !isPlaying()) return false;
        listener.onStatus("Pas…");
        return emitReliableGameAction(EVENT_PASS_TURN, new JSONObject(), authoritativeStateVersion);
    }

    public boolean declareMakao() {
        return declareMakao(0);
    }

    public boolean declareMakao(int expectedStateVersion) {
        if (!isConnected()) return false;
        JSONObject payload = new JSONObject();
        try {
            if (expectedStateVersion > 0) {
                payload.put("expectedStateVersion", expectedStateVersion);
            }
        } catch (JSONException ignored) {
        }
        boolean emitted = emitReliableGameAction(EVENT_DECLARE_MAKAO, payload, expectedStateVersion);
        if (emitted) listener.onStatus("MAKAO deklaruję…");
        return emitted;
    }

    public void catchMakao(String targetPlayerId) {
        catchMakao(targetPlayerId, 0);
    }

    public void catchMakao(String targetPlayerId, int expectedStateVersion) {
        if (!isConnected() || targetPlayerId == null || targetPlayerId.isEmpty()) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("targetPlayerId", targetPlayerId);
            if (expectedStateVersion > 0) {
                payload.put("expectedStateVersion", expectedStateVersion);
            }
        } catch (JSONException ignored) {
        }
        listener.onStatus("złap");
        emitReliableGameAction(EVENT_CATCH_MAKAO, payload, expectedStateVersion);
    }

    public boolean playSingleCard(MakaoCard card) {
        if (card == null) return false;
        ArrayList<MakaoCard> cards = new ArrayList<>(1);
        cards.add(card);
        return playCards(cards);
    }

    public boolean playCards(List<MakaoCard> cards) {
        return playCards(cards, null);
    }

    public boolean playCards(List<MakaoCard> cards, Map<String, MakaoCard> jokerDeclarations) {
        return playCards(cards, jokerDeclarations, null, null);
    }

    public boolean playCards(List<MakaoCard> cards, Map<String, MakaoCard> jokerDeclarations, String suitRequest, String rankRequest) {
        return playCards(cards, jokerDeclarations, suitRequest, rankRequest, 0);
    }

    public boolean playCards(List<MakaoCard> cards, Map<String, MakaoCard> jokerDeclarations, String suitRequest, String rankRequest, int expectedStateVersion) {
        if (!isConnected() || !isPlaying() || cards == null || cards.isEmpty()) return false;
        for (MakaoCard card : cards) {
            if (card == null) return false;
            if (MakaoCard.RANK_JOKER.equals(card.rank)
                && (jokerDeclarations == null || !jokerDeclarations.containsKey(card.cardInstanceId))) {
                listener.onError("joker wybierz wartość i kolor");
                return false;
            }
        }
        JSONObject payload = new JSONObject();
        JSONArray cardIds = new JSONArray();
        for (MakaoCard card : cards) {
            cardIds.put(card.cardInstanceId);
        }
        try {
            payload.put("cardIds", cardIds);
            if (jokerDeclarations != null && !jokerDeclarations.isEmpty()) {
                JSONObject declarations = new JSONObject();
                for (Map.Entry<String, MakaoCard> entry : jokerDeclarations.entrySet()) {
                    declarations.put(entry.getKey(), entry.getValue().toJson());
                }
                payload.put("jokerDeclarations", declarations);
            }
            if (suitRequest != null) {
                payload.put("suitRequest", suitRequest);
            }
            if (rankRequest != null) {
                payload.put("rankRequest", rankRequest);
            }
            if (expectedStateVersion > 0) {
                payload.put("expectedStateVersion", expectedStateVersion);
            }
        } catch (JSONException ignored) {
        }
        return emitReliableGameAction(EVENT_PLAY_CARDS, payload, expectedStateVersion);
    }

    private synchronized boolean emitReliableGameAction(String actionType, JSONObject data, int expectedStateVersion) {
        if (!isConnected() || !isPlaying() || pendingGameAction != null) return false;
        String roomId = cleanRoomId(roomState == null ? null : roomState.id);
        if (roomId == null) return false;
        pendingGameAction = new PendingGameAction(
            UUID.randomUUID().toString(),
            actionType,
            data == null ? new JSONObject() : data,
            expectedStateVersion > 0 ? expectedStateVersion : authoritativeStateVersion,
            roomId
        );
        persistPendingGameAction(pendingGameAction);
        sendPendingGameAction();
        return true;
    }

    private synchronized void sendPendingGameAction() {
        PendingGameAction pending = pendingGameAction;
        if (pending == null || gameActionAwaitingAck || !isConnected()) return;

        JSONObject envelope = new JSONObject();
        try {
            envelope.put("actionId", pending.actionId);
            envelope.put("actionType", pending.actionType);
            envelope.put("expectedStateVersion", pending.expectedStateVersion);
            envelope.put("data", pending.data);
        } catch (JSONException err) {
            clearPendingGameAction(pending);
            pendingGameAction = null;
            listener.onError("Nie udało się zachować ruchu. Spróbuj ponownie.");
            return;
        }

        gameActionAwaitingAck = true;
        int attempt = ++pending.attempt;
        socket.emit(EVENT_GAME_ACTION, envelope, (Ack) args -> handleGameActionAck(pending.actionId, attempt, args));
        scheduleGameActionRetry(pending.actionId, attempt);
    }

    private synchronized void handleGameActionAck(String actionId, int attempt, Object[] args) {
        PendingGameAction pending = pendingGameAction;
        if (pending == null || !pending.actionId.equals(actionId) || pending.attempt != attempt) return;
        gameActionAwaitingAck = false;
        JSONObject response = firstJson(args);
        if (response == null) {
            return;
        }
        if (response.optBoolean("success", false)) {
            authoritativeStateVersion = Math.max(
                authoritativeStateVersion,
                response.optInt("stateVersion", authoritativeStateVersion)
            );
            clearPendingGameAction(pending);
            pendingGameAction = null;
            return;
        }
        if (NativeReliableActionRules.shouldRetry(
            response.optString("code", ""),
            response.optBoolean("retryable", false)
        )) {
            listener.onStatus(STATUS_RETURNING_TO_TABLE);
            return;
        }
        clearPendingGameAction(pending);
        pendingGameAction = null;
        listener.onError(response.optString("error", "Ruch nie został przyjęty."));
    }

    private void scheduleGameActionRetry(String actionId, int attempt) {
        if (retryExecutor.isShutdown()) return;
        retryExecutor.schedule(() -> {
            synchronized (NativeGameClient.this) {
                PendingGameAction pending = pendingGameAction;
                if (pending == null || !pending.actionId.equals(actionId) || pending.attempt != attempt) return;
                gameActionAwaitingAck = false;
                sendPendingGameAction();
            }
        }, 6, TimeUnit.SECONDS);
    }

    private synchronized void sendPendingLeave() {
        PendingLeave pending = pendingLeave;
        if (pending == null || leaveAwaitingAck || !isConnected()) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("actionId", pending.actionId);
            payload.put("roomId", pending.roomId);
            payload.put("clientId", pending.clientId);
            payload.put("supportsResumeToken", true);
            if (pending.resumeToken != null) payload.put("resumeToken", pending.resumeToken);
        } catch (JSONException err) {
            listener.onError("Nie udało się przygotować rezygnacji.");
            return;
        }

        leaveAwaitingAck = true;
        int attempt = ++pending.attempt;
        socket.emit(EVENT_LEAVE_ROOM, payload, (Ack) args -> handleLeaveAck(pending.actionId, attempt, args));
        scheduleLeaveRetry(pending.actionId, attempt);
    }

    private synchronized void handleLeaveAck(String actionId, int attempt, Object[] args) {
        PendingLeave pending = pendingLeave;
        if (pending == null || !pending.actionId.equals(actionId) || pending.attempt != attempt) return;
        leaveAwaitingAck = false;
        JSONObject response = firstJson(args);
        if (response == null || !response.optBoolean("success", false)) {
            return;
        }
        clearPendingLeave(pending);
        clearResumeToken(pending.roomId);
        if (pendingGameAction != null) clearPendingGameAction(pendingGameAction);
        pendingLeave = null;
        pendingGameAction = null;
        roomState = null;
        listener.onRoomState(null);
        listener.onStatus("Poza stołem");
        listener.onLeaveConfirmed();
    }

    private void scheduleLeaveRetry(String actionId, int attempt) {
        if (retryExecutor.isShutdown()) return;
        retryExecutor.schedule(() -> {
            synchronized (NativeGameClient.this) {
                PendingLeave pending = pendingLeave;
                if (pending == null || !pending.actionId.equals(actionId) || pending.attempt != attempt) return;
                leaveAwaitingAck = false;
                sendPendingLeave();
            }
        }, 6, TimeUnit.SECONDS);
    }

    private void handleRoomAck(Object[] args, String successPrefix, String requestedRoomId) {
        JSONObject response = firstJson(args);
        if (response == null) {
            listener.onError("Nie udało się połączyć ze stołem.");
            return;
        }
        if (!response.optBoolean("success", false)) {
            String error = response.optString("error", "Operacja nieudana");
            if (isTerminalRoomNotFound(error)) clearTerminalSession(requestedRoomId);
            listener.onError(error);
            return;
        }
        JSONObject roomJson = response.optJSONObject("room");
        roomState = MakaoRoomState.fromJson(roomJson);
        persistResumeTokenFromAck(response, roomState == null ? requestedRoomId : roomState.id);
        listener.onRoomState(roomState);
        listener.onStatus(successPrefix + ": " + roomState.label(config.clientId));
    }

    private synchronized void handleSessionRefreshAck(Object[] args) {
        if (!sessionRefreshAwaitingAck) return;
        sessionRefreshAwaitingAck = false;
        JSONObject response = firstJson(args);
        if (response == null) {
            listener.onSessionRefreshResult(false, "Nie udało się wrócić do stołu.");
            return;
        }
        if (!response.optBoolean("success", false)) {
            String error = response.optString("error", "Nie udało się wrócić do stołu.");
            if (isTerminalRoomNotFound(error)) {
                String roomId = roomState != null ? roomState.id : config.roomId;
                clearTerminalSession(roomId);
            }
            listener.onSessionRefreshResult(
                false,
                error
            );
            return;
        }
        JSONObject roomJson = response.optJSONObject("room");
        roomState = MakaoRoomState.fromJson(roomJson);
        persistResumeTokenFromAck(response, roomState == null ? config.roomId : roomState.id);
        listener.onRoomState(roomState);
        listener.onStatus("Wróciliśmy do stołu");
        listener.onSessionRefreshResult(true, "Wróciliśmy do stołu.");
    }

    private void putResumeToken(JSONObject payload, String roomId) throws JSONException {
        String token = resumeTokenFor(roomId);
        if (token != null) payload.put("resumeToken", token);
    }

    private String resumeTokenFor(String roomId) {
        String normalizedRoomId = cleanRoomId(roomId);
        if (normalizedRoomId == null) return null;
        if (normalizedRoomId.equals(cleanRoomId(resumeTokenRoomId))) return clean(resumeToken);
        return persistence == null
            ? null
            : clean(persistence.loadResumeToken(config.serverUrl, normalizedRoomId, config.clientId));
    }

    private void persistResumeTokenFromAck(JSONObject response, String roomId) {
        String normalizedRoomId = cleanRoomId(roomId);
        String token = clean(response == null ? null : response.optString("resumeToken", null));
        if (normalizedRoomId == null) return;
        if (token == null) token = resumeTokenFor(normalizedRoomId);
        resumeTokenRoomId = normalizedRoomId;
        resumeToken = token;
        if (token != null && persistence != null) {
            persistence.saveResumeToken(config.serverUrl, normalizedRoomId, config.clientId, token);
        }
    }

    private void persistPendingGameAction(PendingGameAction pending) {
        if (persistence == null || pending == null) return;
        persistence.savePendingAction(
            config.serverUrl,
            pending.roomId,
            config.clientId,
            new NativeSessionPersistence.PendingAction(
                pending.actionId,
                pending.actionType,
                pending.data.toString(),
                pending.expectedStateVersion
            )
        );
    }

    private void clearPendingGameAction(PendingGameAction pending) {
        if (persistence == null || pending == null) return;
        persistence.clearPendingAction(config.serverUrl, pending.roomId, config.clientId);
    }

    private void persistPendingLeave(PendingLeave pending) {
        if (persistence == null || pending == null) return;
        persistence.savePendingLeave(
            config.serverUrl,
            pending.roomId,
            pending.clientId,
            new NativeSessionPersistence.PendingLeave(
                pending.actionId,
                pending.roomId,
                pending.clientId,
                pending.resumeToken
            )
        );
    }

    private void clearPendingLeave(PendingLeave pending) {
        if (persistence == null || pending == null) return;
        persistence.clearPendingLeave(config.serverUrl, pending.roomId, pending.clientId);
    }

    private void clearResumeToken(String roomId) {
        String normalizedRoomId = cleanRoomId(roomId);
        if (normalizedRoomId == null) return;
        if (persistence != null) {
            persistence.clearResumeToken(config.serverUrl, normalizedRoomId, config.clientId);
        }
        if (normalizedRoomId.equals(cleanRoomId(resumeTokenRoomId))) {
            resumeToken = null;
            resumeTokenRoomId = null;
        }
    }

    private void clearTerminalSession(String roomId) {
        String normalizedRoomId = cleanRoomId(roomId);
        if (normalizedRoomId == null) return;
        clearResumeToken(normalizedRoomId);
        if (pendingGameAction != null && normalizedRoomId.equals(pendingGameAction.roomId)) {
            clearPendingGameAction(pendingGameAction);
            pendingGameAction = null;
        }
        if (pendingLeave != null && normalizedRoomId.equals(pendingLeave.roomId)) {
            clearPendingLeave(pendingLeave);
            pendingLeave = null;
        }
    }

    private static boolean isTerminalRoomNotFound(String error) {
        String value = error == null ? "" : error.trim();
        return "Room not found".equalsIgnoreCase(value) || "Room not found.".equalsIgnoreCase(value);
    }

    private static String cleanRoomId(String roomId) {
        String value = clean(roomId);
        return value == null ? null : value.toUpperCase(java.util.Locale.ROOT);
    }

    private static String clean(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static final class PendingGameAction {
        final String actionId;
        final String actionType;
        final JSONObject data;
        final String roomId;
        volatile int expectedStateVersion;
        volatile int attempt;

        PendingGameAction(
            String actionId,
            String actionType,
            JSONObject data,
            int expectedStateVersion,
            String roomId
        ) {
            this.actionId = actionId;
            this.actionType = actionType;
            this.data = data;
            this.expectedStateVersion = expectedStateVersion;
            this.roomId = roomId;
        }
    }

    private static final class PendingLeave {
        final String actionId;
        final String roomId;
        final String clientId;
        final String resumeToken;
        volatile int attempt;

        PendingLeave(String actionId, String roomId, String clientId, String resumeToken) {
            this.actionId = actionId;
            this.roomId = roomId;
            this.clientId = clientId;
            this.resumeToken = resumeToken;
        }
    }

    private JSONObject firstJson(Object[] args) {
        if (args == null || args.length == 0 || args[0] == null) return null;
        if (args[0] instanceof JSONObject) return (JSONObject) args[0];
        if (args[0] instanceof String) {
            try {
                return new JSONObject((String) args[0]);
            } catch (JSONException ignored) {
                return null;
            }
        }
        return null;
    }

    private String firstArgLabel(Object[] args) {
        if (args == null || args.length == 0 || args[0] == null) return "brak szczegółów";
        Object first = args[0];
        if (first instanceof Throwable) return ((Throwable) first).getMessage();
        return String.valueOf(first);
    }
}
