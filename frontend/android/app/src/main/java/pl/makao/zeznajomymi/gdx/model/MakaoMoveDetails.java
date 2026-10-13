package pl.makao.zeznajomymi.gdx.model;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public final class MakaoMoveDetails {
    public final List<MakaoCard> playedCards = new ArrayList<>();

    public int drawnCount;
    public int amount;
    public int remaining;
    public boolean canPlayDrawnCard;
    public String targetPlayerId;
    public String effectType;
    public String resolvedEffectType;
    public String nextPlayerId;
    public String suitRequest;
    public String rankRequest;
    public String resolvedSuitRequest;
    public String resolvedRankRequest;
    public String playerName;

    public static MakaoMoveDetails fromJson(JSONObject json) {
        MakaoMoveDetails details = new MakaoMoveDetails();
        if (json == null) return details;

        JSONArray playedCardsJson = json.optJSONArray("playedCards");
        if (playedCardsJson != null) {
            for (int i = 0; i < playedCardsJson.length(); i++) {
                MakaoCard card = MakaoCard.fromJson(playedCardsJson.optJSONObject(i));
                if (card != null) details.playedCards.add(card);
            }
        }

        details.drawnCount = json.optInt("drawnCount", 0);
        details.amount = json.optInt("amount", 0);
        details.remaining = json.optInt("remaining", 0);
        details.canPlayDrawnCard = json.optBoolean("canPlayDrawnCard", false);
        details.targetPlayerId = optNullableString(json, "targetPlayerId");
        details.effectType = optNullableString(json, "effectType");
        details.resolvedEffectType = optNullableString(json, "resolvedEffectType");
        details.nextPlayerId = optNullableString(json, "nextPlayerId");
        details.suitRequest = optNullableString(json, "suitRequest");
        details.rankRequest = optNullableString(json, "rankRequest");
        details.resolvedSuitRequest = optNullableString(json, "resolvedSuitRequest");
        details.resolvedRankRequest = optNullableString(json, "resolvedRankRequest");
        details.playerName = optNullableString(json, "playerName");
        return details;
    }

    public MakaoMoveDetails copy() {
        MakaoMoveDetails copy = new MakaoMoveDetails();
        copy.playedCards.addAll(playedCards);
        copy.drawnCount = drawnCount;
        copy.amount = amount;
        copy.remaining = remaining;
        copy.canPlayDrawnCard = canPlayDrawnCard;
        copy.targetPlayerId = targetPlayerId;
        copy.effectType = effectType;
        copy.resolvedEffectType = resolvedEffectType;
        copy.nextPlayerId = nextPlayerId;
        copy.suitRequest = suitRequest;
        copy.rankRequest = rankRequest;
        copy.resolvedSuitRequest = resolvedSuitRequest;
        copy.resolvedRankRequest = resolvedRankRequest;
        copy.playerName = playerName;
        return copy;
    }

    private static String optNullableString(JSONObject json, String key) {
        Object value = json.opt(key);
        if (value == null || value == JSONObject.NULL) return null;
        return String.valueOf(value);
    }
}
