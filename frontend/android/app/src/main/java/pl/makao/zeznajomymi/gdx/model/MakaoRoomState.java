package pl.makao.zeznajomymi.gdx.model;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public final class MakaoRoomState {
    public final List<MakaoPlayer> players = new ArrayList<>();
    public final Map<String, Integer> wins = new HashMap<>();
    public String id;
    public String name;
    public String status;
    public String hostId;
    public boolean gameOver;
    public String winnerId;
    public int deckCount = 1;
    public boolean useJokers;
    public boolean allowMultipleCards = true;
    public String queenVariant = "defensive_non_functional";
    public String queenRequestMode = "cancels_request";
    public String battleCounterMode = "suit_or_rank";
    public String jackRequestMode = "with_non_battle_kings";
    public String aceJackRequestMode = "optional";
    public int makaoPenaltyCards = 5;
    public int maxPlayers = 4;
    public int turnTimeLimitSeconds;
    public String firstPlayerMode = "random_each_game";
    public String firstPlayerId;
    public int recommendedDeckCount = 1;
    public String nextGameFirstPlayerId;
    public int gamesPlayed;

    public static MakaoRoomState fromJson(JSONObject json) {
        MakaoRoomState state = new MakaoRoomState();
        if (json == null) return state;
        state.id = optNullableString(json, "id");
        state.name = optNullableString(json, "name");
        state.status = optNullableString(json, "status");
        state.hostId = optNullableString(json, "hostId");
        state.gameOver = json.optBoolean("gameOver", false);
        state.winnerId = optNullableString(json, "winnerId");
        state.recommendedDeckCount = json.optInt("recommendedDeckCount", state.recommendedDeckCount);
        state.nextGameFirstPlayerId = optNullableString(json, "nextGameFirstPlayerId");

        JSONObject statsJson = json.optJSONObject("stats");
        if (statsJson != null) {
            state.gamesPlayed = Math.max(0, statsJson.optInt("gamesPlayed", 0));
            JSONObject winsJson = statsJson.optJSONObject("wins");
            if (winsJson != null) {
                Iterator<String> keys = winsJson.keys();
                while (keys.hasNext()) {
                    String playerId = keys.next();
                    int winCount = Math.max(0, winsJson.optInt(playerId, 0));
                    if (winCount > 0) state.wins.put(playerId, winCount);
                }
            }
        }

        JSONObject settingsJson = json.optJSONObject("settings");
        if (settingsJson != null) {
            state.deckCount = settingsJson.optInt("deckCount", state.deckCount);
            state.useJokers = settingsJson.optBoolean("useJokers", state.useJokers);
            state.allowMultipleCards = settingsJson.optBoolean("allowMultipleCards", true);
            state.queenVariant = optString(settingsJson, "queenVariant", state.queenVariant);
            state.queenRequestMode = optString(settingsJson, "queenRequestMode", state.queenRequestMode);
            state.battleCounterMode = optString(settingsJson, "battleCounterMode", state.battleCounterMode);
            state.jackRequestMode = optString(settingsJson, "jackRequestMode", state.jackRequestMode);
            state.aceJackRequestMode = optString(settingsJson, "aceJackRequestMode", state.aceJackRequestMode);
            state.makaoPenaltyCards = settingsJson.optInt("makaoPenaltyCards", state.makaoPenaltyCards);
            state.maxPlayers = settingsJson.optInt("maxPlayers", state.maxPlayers);
            state.turnTimeLimitSeconds = settingsJson.optInt("turnTimeLimitSeconds", state.turnTimeLimitSeconds);
            state.firstPlayerMode = optString(settingsJson, "firstPlayerMode", state.firstPlayerMode);
            state.firstPlayerId = optNullableString(settingsJson, "firstPlayerId");
        }

        JSONArray playersJson = json.optJSONArray("players");
        if (playersJson != null) {
            for (int i = 0; i < playersJson.length(); i++) {
                MakaoPlayer player = MakaoPlayer.fromJson(playersJson.optJSONObject(i));
                if (player != null) state.players.add(player);
            }
        }
        return state;
    }

    public boolean isPlaying() {
        return "playing".equals(status);
    }

    public boolean isLobby() {
        return "lobby".equals(status);
    }

    public boolean isHost(String clientId) {
        return hostId != null && hostId.equals(clientId);
    }

    public String label(String clientId) {
        String room = id == null || id.isEmpty() ? "bez pokoju" : id;
        if (isPlaying()) return "Gra: " + room;
        if (isLobby()) {
            String role = isHost(clientId) ? "host" : "gość";
            return "Lobby gotowe. Dotknij stosu, aby rozpocząć. " + players.size() + " gr., " + role;
        }
        return "Pokój " + room;
    }

    private static String optNullableString(JSONObject json, String key) {
        Object value = json.opt(key);
        if (value == null || value == JSONObject.NULL) return null;
        return String.valueOf(value);
    }

    private static String optString(JSONObject json, String key, String fallback) {
        String value = optNullableString(json, key);
        return value == null || value.isEmpty() ? fallback : value;
    }
}
