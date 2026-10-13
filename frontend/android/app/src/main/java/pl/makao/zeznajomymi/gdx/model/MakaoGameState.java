package pl.makao.zeznajomymi.gdx.model;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MakaoGameState {
    public final List<MakaoCard> myHand = new ArrayList<>();
    public final List<MakaoPlayer> players = new ArrayList<>();
    public final Map<String, Integer> handCounts = new LinkedHashMap<>();
    public final Map<String, Boolean> makaoByPlayer = new LinkedHashMap<>();
    public final Map<String, Boolean> missingMakaoByPlayer = new LinkedHashMap<>();
    public final Map<String, Long> makaoCatchAtByPlayer = new LinkedHashMap<>();
    public final Map<String, Integer> pauseTurnsByPlayer = new LinkedHashMap<>();
    public final List<MakaoMoveEvent> moveHistory = new ArrayList<>();
    public final List<MakaoMoveEvent> turnEvents = new ArrayList<>();
    public final List<MakaoCard> discardPileTail = new ArrayList<>();

    public String roomId;
    public String myPlayerId;
    public String currentPlayerId;
    public String currentPlayerName;
    public String winnerId;
    public String endReason;
    public String lastLeftPlayerName;
    public String statusText;
    public String activeEffectText;
    public String activeEffectType;
    public String activeEffectTargetPlayerId;
    public String activeEffectRequestedSuit;
    public String activeEffectRequestedRank;
    public String activeEffectBattleSuit;
    public String queenVariant = "defensive_non_functional";
    public String queenRequestMode = "cancels_request";
    public String battleCounterMode = "suit_or_rank";
    public boolean allowMultipleCards = true;
    public int activeEffectAmount;
    public int activeEffectPenaltyDrawnCount;
    public int activeEffectPenaltyRemainingCount;
    public int stateVersion;
    public long serverNow;
    public long receivedAt;
    public MakaoCard topCard;
    public int drawPileCount;
    public int discardPileCount;
    public boolean hasDrawnCardThisTurn;
    public String drawnCardInstanceId;
    public boolean gameOver;
    public boolean connected = true;

    public static MakaoGameState fromJson(JSONObject json, String myPlayerId) {
        MakaoGameState state = new MakaoGameState();
        state.myPlayerId = myPlayerId;
        if (json == null) {
            state.connected = false;
            state.statusText = "Brak stanu gry";
            return state;
        }

        state.roomId = optNullableString(json, "roomId");
        state.stateVersion = json.optInt("stateVersion", 0);
        state.serverNow = json.optLong("serverNow", 0L);
        state.receivedAt = System.currentTimeMillis();
        state.drawPileCount = json.optInt("drawPileCount", 0);
        state.discardPileCount = json.optInt("discardPileCount", 0);
        state.hasDrawnCardThisTurn = json.optBoolean("hasDrawnCardThisTurn", false);
        state.drawnCardInstanceId = optNullableString(json, "drawnCardInstanceId");
        state.gameOver = json.optBoolean("gameOver", false);
        state.winnerId = optNullableString(json, "winnerId");
        state.endReason = optNullableString(json, "endReason");
        state.topCard = MakaoCard.fromJson(json.optJSONObject("topCard"));
        JSONObject settingsJson = json.optJSONObject("settings");
        if (settingsJson != null) {
            String parsedQueenVariant = optNullableString(settingsJson, "queenVariant");
            if (parsedQueenVariant != null && !parsedQueenVariant.isEmpty()) {
                state.queenVariant = parsedQueenVariant;
            }
            String parsedQueenRequestMode = optNullableString(settingsJson, "queenRequestMode");
            if (parsedQueenRequestMode != null && !parsedQueenRequestMode.isEmpty()) {
                state.queenRequestMode = parsedQueenRequestMode;
            }
            String parsedBattleCounterMode = optNullableString(settingsJson, "battleCounterMode");
            if (parsedBattleCounterMode != null && !parsedBattleCounterMode.isEmpty()) {
                state.battleCounterMode = parsedBattleCounterMode;
            }
            state.allowMultipleCards = settingsJson.optBoolean("allowMultipleCards", true);
        }

        JSONArray handJson = json.optJSONArray("myHand");
        if (handJson != null) {
            for (int i = 0; i < handJson.length(); i++) {
                MakaoCard card = MakaoCard.fromJson(handJson.optJSONObject(i));
                if (card != null) state.myHand.add(card);
            }
        }

        JSONArray playersJson = json.optJSONArray("players");
        if (playersJson != null) {
            for (int i = 0; i < playersJson.length(); i++) {
                MakaoPlayer player = MakaoPlayer.fromJson(playersJson.optJSONObject(i));
                if (player != null) state.players.add(player);
            }
        }

        JSONArray moveHistoryJson = json.optJSONArray("moveHistory");
        if (moveHistoryJson != null) {
            for (int i = 0; i < moveHistoryJson.length(); i++) {
                MakaoMoveEvent event = MakaoMoveEvent.fromJson(moveHistoryJson.optJSONObject(i));
                if (event != null) {
                    state.moveHistory.add(event);
                    if ("player_left".equals(event.type) && event.details.playerName != null) {
                        state.lastLeftPlayerName = event.details.playerName;
                    }
                }
            }
        }

        JSONArray discardPileTailJson = json.optJSONArray("discardPileTail");
        if (discardPileTailJson != null) {
            for (int i = 0; i < discardPileTailJson.length(); i++) {
                MakaoCard card = MakaoCard.fromJson(discardPileTailJson.optJSONObject(i));
                if (card != null) state.discardPileTail.add(card);
            }
        }

        JSONObject countsJson = json.optJSONObject("handCounts");
        if (countsJson != null) {
            JSONArray keys = countsJson.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String key = keys.optString(i, "");
                    state.handCounts.put(key, countsJson.optInt(key, 0));
                }
            }
        }

        JSONObject makaoJson = json.optJSONObject("makao");
        if (makaoJson != null) {
            JSONArray keys = makaoJson.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String key = keys.optString(i, "");
                    state.parseMakaoState(key, makaoJson.opt(key));
                }
            }
        }

        JSONObject skipsJson = json.optJSONObject("skipTurns");
        if (skipsJson != null) {
            JSONArray keys = skipsJson.names();
            if (keys != null) {
                for (int i = 0; i < keys.length(); i++) {
                    String key = keys.optString(i, "");
                    state.pauseTurnsByPlayer.put(key, skipsJson.optInt(key, 0));
                }
            }
        }

        JSONArray turnOrder = json.optJSONArray("turnOrder");
        int currentPlayerIndex = json.optInt("currentPlayerIndex", -1);
        if (turnOrder != null && currentPlayerIndex >= 0 && currentPlayerIndex < turnOrder.length()) {
            state.currentPlayerId = turnOrder.optString(currentPlayerIndex, null);
        }
        if (state.currentPlayerId == null) {
            state.currentPlayerId = optNullableString(json, "currentPlayerId");
        }
        state.currentPlayerName = state.resolvePlayerName(state.currentPlayerId);
        JSONArray turnEventsJson = json.optJSONArray("turnEvents");
        if (turnEventsJson != null) {
            for (int i = 0; i < turnEventsJson.length(); i++) {
                MakaoMoveEvent event = MakaoMoveEvent.fromTurnEventJson(turnEventsJson.optJSONObject(i), state.currentPlayerId);
                if (event != null) state.turnEvents.add(event);
            }
        }
        state.parseActiveEffect(json.optJSONObject("activeEffect"));
        state.syncPlayerStatusFields();
        state.statusText = state.buildStatusText();
        return state;
    }

    private void parseMakaoState(String playerId, Object value) {
        if (playerId == null || playerId.isEmpty()) return;
        if (value instanceof JSONObject) {
            JSONObject json = (JSONObject) value;
            boolean declared = json.optBoolean("declared", false);
            boolean armed = json.optBoolean("armed", false);
            makaoByPlayer.put(playerId, armed || declared);
            if (json.has("declared") && !declared) {
                missingMakaoByPlayer.put(playerId, true);
                makaoCatchAtByPlayer.put(playerId, json.optLong("canBeCaughtAt", 0L));
            }
            return;
        }
        if (value instanceof Boolean) {
            makaoByPlayer.put(playerId, (Boolean) value);
            return;
        }
        makaoByPlayer.put(playerId, false);
    }

    public static MakaoGameState createPrototype() {
        MakaoGameState state = new MakaoGameState();
        state.roomId = "PROTOTYPE";
        state.myPlayerId = "local";
        state.currentPlayerId = "local";
        state.currentPlayerName = "Ty";
        state.stateVersion = 1;
        state.drawPileCount = 41;
        state.discardPileCount = 1;
        state.hasDrawnCardThisTurn = false;
        state.drawnCardInstanceId = null;
        state.topCard = MakaoCard.create("proto_top_queen_diamonds", "queen", "diamonds");
        state.players.add(new MakaoPlayer("local", "Ty", true, true, true));
        state.players.add(new MakaoPlayer("codex", "Codex", false, true, true));
        state.handCounts.put("local", 9);
        state.handCounts.put("codex", 7);
        state.myHand.add(MakaoCard.create("proto_ace_spades", "ace", "spades"));
        state.myHand.add(MakaoCard.create("proto_king_hearts", "king", "hearts"));
        state.myHand.add(MakaoCard.create("proto_10_clubs", "10", "clubs"));
        state.myHand.add(MakaoCard.create("proto_8_diamonds", "8", "diamonds"));
        state.myHand.add(MakaoCard.create("proto_6_spades", "6", "spades"));
        state.myHand.add(MakaoCard.create("proto_4_hearts", "4", "hearts"));
        state.myHand.add(MakaoCard.create("proto_jack_clubs", "jack", "clubs"));
        state.myHand.add(MakaoCard.create("proto_2_diamonds", "2", "diamonds"));
        state.myHand.add(MakaoCard.create("proto_joker", "joker", null));
        state.moveHistory.add(new MakaoMoveEvent(
            1,
            "game_started",
            null,
            "local",
            state.topCard,
            new MakaoMoveDetails()
        ));
        state.statusText = "Prototype: renderer czeka na Socket.IO";
        return state;
    }

    public MakaoGameState copy() {
        MakaoGameState copy = new MakaoGameState();
        copy.roomId = roomId;
        copy.myPlayerId = myPlayerId;
        copy.currentPlayerId = currentPlayerId;
        copy.currentPlayerName = currentPlayerName;
        copy.winnerId = winnerId;
        copy.endReason = endReason;
        copy.lastLeftPlayerName = lastLeftPlayerName;
        copy.statusText = statusText;
        copy.activeEffectText = activeEffectText;
        copy.activeEffectType = activeEffectType;
        copy.activeEffectTargetPlayerId = activeEffectTargetPlayerId;
        copy.activeEffectRequestedSuit = activeEffectRequestedSuit;
        copy.activeEffectRequestedRank = activeEffectRequestedRank;
        copy.activeEffectBattleSuit = activeEffectBattleSuit;
        copy.queenVariant = queenVariant;
        copy.queenRequestMode = queenRequestMode;
        copy.battleCounterMode = battleCounterMode;
        copy.allowMultipleCards = allowMultipleCards;
        copy.activeEffectAmount = activeEffectAmount;
        copy.activeEffectPenaltyDrawnCount = activeEffectPenaltyDrawnCount;
        copy.activeEffectPenaltyRemainingCount = activeEffectPenaltyRemainingCount;
        copy.stateVersion = stateVersion;
        copy.serverNow = serverNow;
        copy.receivedAt = receivedAt;
        copy.topCard = topCard;
        copy.drawPileCount = drawPileCount;
        copy.discardPileCount = discardPileCount;
        copy.hasDrawnCardThisTurn = hasDrawnCardThisTurn;
        copy.drawnCardInstanceId = drawnCardInstanceId;
        copy.gameOver = gameOver;
        copy.connected = connected;
        copy.myHand.addAll(myHand);
        copy.players.addAll(players);
        copy.handCounts.putAll(handCounts);
        copy.makaoByPlayer.putAll(makaoByPlayer);
        copy.missingMakaoByPlayer.putAll(missingMakaoByPlayer);
        copy.makaoCatchAtByPlayer.putAll(makaoCatchAtByPlayer);
        copy.pauseTurnsByPlayer.putAll(pauseTurnsByPlayer);
        for (MakaoMoveEvent event : moveHistory) {
            if (event != null) copy.moveHistory.add(event.copy());
        }
        for (MakaoMoveEvent event : turnEvents) {
            if (event != null) copy.turnEvents.add(event.copy());
        }
        copy.discardPileTail.addAll(discardPileTail);
        return copy;
    }

    public boolean isMyTurn() {
        return myPlayerId != null && myPlayerId.equals(currentPlayerId);
    }

    public boolean isMakaoReady(String playerId) {
        if (playerId == null) return false;
        Boolean ready = makaoByPlayer.get(playerId);
        return ready != null && ready;
    }

    public boolean isMyMakaoReady() {
        return isMakaoReady(myPlayerId);
    }

    public boolean isMakaoMissing(String playerId) {
        if (playerId == null) return false;
        Boolean missing = missingMakaoByPlayer.get(playerId);
        return missing != null && missing;
    }

    public boolean isMyMakaoMissing() {
        return isMakaoMissing(myPlayerId);
    }

    public long makaoCatchAt(String playerId) {
        if (playerId == null) return 0L;
        Long catchAt = makaoCatchAtByPlayer.get(playerId);
        return catchAt == null ? 0L : catchAt;
    }

    public long estimatedServerNow() {
        long localNow = System.currentTimeMillis();
        if (serverNow <= 0L || receivedAt <= 0L) return localNow;
        return serverNow + Math.max(0L, localNow - receivedAt);
    }

    public boolean canDeclareMyMakaoNow() {
        if (!isMyMakaoMissing()) return false;
        long catchAt = makaoCatchAt(myPlayerId);
        return catchAt <= 0L || estimatedServerNow() < catchAt;
    }

    public boolean canCatchMakao(String playerId) {
        if (!isMakaoMissing(playerId)) return false;
        long catchAt = makaoCatchAt(playerId);
        return catchAt <= 0L || estimatedServerNow() >= catchAt;
    }

    public boolean isActiveDrawPenaltyForMe() {
        return "draw_penalty".equals(activeEffectType)
            && (activeEffectTargetPlayerId == null || activeEffectTargetPlayerId.equals(myPlayerId));
    }

    public boolean isPenaltyDrawAcceptanceLocked() {
        return isActiveDrawPenaltyForMe()
            && activeEffectPenaltyDrawnCount > 0
            && (!hasDrawnCardThisTurn || drawnCardInstanceId == null);
    }

    public boolean isActiveSkipForMe() {
        return "skip_turn".equals(activeEffectType)
            && (activeEffectTargetPlayerId == null || activeEffectTargetPlayerId.equals(myPlayerId));
    }

    public void addCardToHand(MakaoCard card) {
        if (card != null) {
            myHand.add(card);
            handCounts.put(myPlayerId, myHand.size());
        }
    }

    public MakaoCard removeCardFromHand(String cardInstanceId) {
        for (int i = 0; i < myHand.size(); i++) {
            MakaoCard card = myHand.get(i);
            if (card.cardInstanceId.equals(cardInstanceId)) {
                myHand.remove(i);
                handCounts.put(myPlayerId, myHand.size());
                return card;
            }
        }
        return null;
    }

    public String resolvePlayerName(String playerId) {
        if (playerId == null || playerId.isEmpty()) return "";
        for (MakaoPlayer player : players) {
            if (player.id.equals(playerId)) return player.name;
        }
        return playerId;
    }

    public String buildStatusText() {
        if (!connected) return "Brak połączenia z grą";
        if (gameOver) {
            String winnerName = resolvePlayerName(winnerId);
            return winnerName.isEmpty() ? "Koniec gry" : "Wygrywa: " + winnerName;
        }
        String turnText = turnStatusText();
        String effectText = activeEffectStatusText();
        if (effectText != null && !effectText.isEmpty()) {
            return turnText + " · " + effectText;
        }
        if (isMyTurn() && hasDrawnCardThisTurn && drawnCardInstanceId != null) {
            return turnText + " · zagraj albo spasuj";
        }
        return turnText;
    }

    private String turnStatusText() {
        if (isMyTurn()) return "Twoja tura";
        int myPauseTurns = pauseTurnsForPlayer(myPlayerId);
        if (myPauseTurns > 0) {
            String playerName = resolvePlayerName(currentPlayerId);
            String text = "Czekasz jeszcze " + turnCountLabel(myPauseTurns);
            return playerName.isEmpty() ? text : text + " · tura: " + playerName;
        }
        String playerName = resolvePlayerName(currentPlayerId);
        if (playerName.isEmpty()) return "Czekaj na swoją turę";
        return "Tura: " + playerName;
    }

    private int pauseTurnsForPlayer(String playerId) {
        if (playerId == null || playerId.isEmpty()) return 0;
        Integer turns = pauseTurnsByPlayer.get(playerId);
        return turns == null ? 0 : Math.max(0, turns);
    }

    private String activeEffectStatusText() {
        if ("draw_penalty".equals(activeEffectType)) {
            String amountText = activeEffectAmount > 0 ? "kara +" + activeEffectAmount : "dobieranie";
            if (activeEffectPenaltyDrawnCount > 0) {
                int remaining = activeEffectPenaltyRemainingCount > 0
                    ? activeEffectPenaltyRemainingCount
                    : Math.max(0, activeEffectAmount - activeEffectPenaltyDrawnCount);
                amountText += " · dobrano " + activeEffectPenaltyDrawnCount + "/" + Math.max(activeEffectAmount, activeEffectPenaltyDrawnCount);
                if (remaining > 0) amountText += ", zostało " + remaining;
            }
            String targetName = resolvePlayerName(activeEffectTargetPlayerId);
            return targetName.isEmpty() ? amountText : amountText + " " + targetName;
        }
        return activeEffectText;
    }

    private void parseActiveEffect(JSONObject activeEffect) {
        if (activeEffect == null) {
            activeEffectType = null;
            activeEffectTargetPlayerId = null;
            activeEffectRequestedSuit = null;
            activeEffectRequestedRank = null;
            activeEffectBattleSuit = null;
            activeEffectAmount = 0;
            activeEffectPenaltyDrawnCount = 0;
            activeEffectPenaltyRemainingCount = 0;
            activeEffectText = null;
            return;
        }
        activeEffectType = optNullableString(activeEffect, "type");
        activeEffectTargetPlayerId = optNullableString(activeEffect, "targetPlayerId");
        activeEffectRequestedSuit = optNullableString(activeEffect, "requestedSuit");
        activeEffectRequestedRank = optNullableString(activeEffect, "requestedRank");
        activeEffectBattleSuit = optNullableString(activeEffect, "battleSuit");
        activeEffectAmount = activeEffect.optInt("amount", 0);
        activeEffectPenaltyDrawnCount = activeEffect.optInt("penaltyDrawnCount", 0);
        activeEffectPenaltyRemainingCount = activeEffect.optInt(
            "penaltyRemainingCount",
            Math.max(0, activeEffectAmount - activeEffectPenaltyDrawnCount)
        );
        if (activeEffectType == null) {
            if (activeEffectRequestedRank != null) {
                activeEffectType = "rank_request";
            } else if (activeEffectRequestedSuit != null) {
                activeEffectType = "suit_request";
            } else if (activeEffectAmount > 0 || activeEffectBattleSuit != null) {
                activeEffectType = "draw_penalty";
            }
        }
        activeEffectText = activeEffectLabel(
            activeEffectType,
            activeEffectAmount,
            activeEffectRequestedSuit,
            activeEffectRequestedRank,
            activeEffectBattleSuit
        );
    }

    private void syncPlayerStatusFields() {
        for (MakaoPlayer player : players) {
            Integer handCount = handCounts.get(player.id);
            if (handCount != null) player.handCount = handCount;
            Integer pauseTurns = pauseTurnsByPlayer.get(player.id);
            player.pauseTurns = pauseTurns == null ? 0 : pauseTurns;
            player.makao = isMakaoReady(player.id);
        }
    }

    private static String activeEffectLabel(String type, int amount, String requestedSuit, String requestedRank, String battleSuit) {
        if (type == null) return null;
        if ("draw_penalty".equals(type)) {
            return amount > 0 ? "kara +" + amount : "dobieranie";
        }
        if ("skip_turn".equals(type)) return pauseLabel(Math.max(1, amount));
        if ("rank_request".equals(type)) return requestedRank == null ? "Żądanie: wartość" : "Żądanie: " + rankLabel(requestedRank);
        if ("suit_request".equals(type)) return requestedSuit == null ? "Żądanie: kolor" : "Żądanie: " + suitLabel(requestedSuit);
        return "efekt " + type;
    }

    private static String suitLabel(String suit) {
        if ("hearts".equals(suit)) return "♥";
        if ("diamonds".equals(suit)) return "♦";
        if ("clubs".equals(suit)) return "♣";
        if ("spades".equals(suit)) return "♠";
        return suit;
    }

    private static String rankLabel(String rank) {
        if ("ace".equals(rank)) return "A";
        if ("king".equals(rank)) return "K";
        if ("non_battle_king".equals(rank)) return "K♣/♦";
        if ("queen".equals(rank)) return "D";
        if ("jack".equals(rank)) return "W";
        return rank;
    }

    private static String pauseLabel(int count) {
        return "|| " + Math.max(1, count);
    }

    private static String turnCountLabel(int count) {
        int safeCount = Math.max(1, count);
        return safeCount + " " + turnWord(safeCount);
    }

    private static String turnWord(int count) {
        if (count == 1) return "turę";
        if (count >= 2 && count <= 4) return "tury";
        return "tur";
    }

    private static String optNullableString(JSONObject json, String key) {
        if (json == null) return null;
        Object value = json.opt(key);
        if (value == null || value == JSONObject.NULL) return null;
        return String.valueOf(value);
    }
}
