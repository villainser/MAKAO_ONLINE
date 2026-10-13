package pl.makao.zeznajomymi.gdx.model;

import org.json.JSONObject;

public final class MakaoMoveEvent {
    public final String id;
    public final int version;
    public final String type;
    public final String playerId;
    public final String currentPlayerId;
    public final MakaoCard topCard;
    public final MakaoMoveDetails details;

    public MakaoMoveEvent(
        int version,
        String type,
        String playerId,
        String currentPlayerId,
        MakaoCard topCard,
        MakaoMoveDetails details
    ) {
        this(null, version, type, playerId, currentPlayerId, topCard, details);
    }

    public MakaoMoveEvent(
        String id,
        int version,
        String type,
        String playerId,
        String currentPlayerId,
        MakaoCard topCard,
        MakaoMoveDetails details
    ) {
        this.id = id;
        this.version = version;
        this.type = type;
        this.playerId = playerId;
        this.currentPlayerId = currentPlayerId;
        this.topCard = topCard;
        this.details = details == null ? new MakaoMoveDetails() : details;
    }

    public static MakaoMoveEvent fromJson(JSONObject json) {
        if (json == null) return null;
        MakaoMoveDetails details = MakaoMoveDetails.fromJson(json.optJSONObject("details"));
        if (details.nextPlayerId == null) {
            details.nextPlayerId = optNullableString(json, "nextPlayerId");
        }
        String currentPlayerId = optNullableString(json, "currentPlayerId");
        if (details.nextPlayerId == null) {
            details.nextPlayerId = currentPlayerId;
        }

        return new MakaoMoveEvent(
            optNullableString(json, "id"),
            json.optInt("version", 0),
            optNullableString(json, "type"),
            optNullableString(json, "playerId"),
            currentPlayerId,
            MakaoCard.fromJson(json.optJSONObject("topCard")),
            details
        );
    }

    public static MakaoMoveEvent fromTurnEventJson(JSONObject json, String currentPlayerId) {
        if (json == null) return null;
        String eventCurrentPlayerId = optNullableString(json, "currentPlayerId");
        if (eventCurrentPlayerId == null) eventCurrentPlayerId = currentPlayerId;
        MakaoMoveDetails details = new MakaoMoveDetails();
        int consumed = json.optInt("consumed", 0);
        int remaining = json.optInt("remaining", 0);
        int added = json.optInt("added", 0);
        details.amount = json.optInt("amount", added > 0 ? added : consumed + remaining);
        details.remaining = json.optInt("remaining", 0);
        details.targetPlayerId = optNullableString(json, "targetPlayerId");
        if (details.targetPlayerId == null) {
            details.targetPlayerId = optNullableString(json, "pausedPlayerId");
        }
        details.effectType = optNullableString(json, "effectType");
        details.playerName = optNullableString(json, "playerName");
        details.nextPlayerId = optNullableString(json, "nextPlayerId");
        if (details.nextPlayerId == null) {
            details.nextPlayerId = eventCurrentPlayerId;
        }
        String playerId = optNullableString(json, "playerId");
        if (playerId == null) playerId = details.targetPlayerId;

        return new MakaoMoveEvent(
            optNullableString(json, "id"),
            0,
            optNullableString(json, "type"),
            playerId,
            eventCurrentPlayerId,
            MakaoCard.fromJson(json.optJSONObject("topCard")),
            details
        );
    }

    public MakaoMoveEvent copy() {
        return new MakaoMoveEvent(
            id,
            version,
            type,
            playerId,
            currentPlayerId,
            topCard,
            details.copy()
        );
    }

    private static String optNullableString(JSONObject json, String key) {
        Object value = json.opt(key);
        if (value == null || value == JSONObject.NULL) return null;
        return String.valueOf(value);
    }
}
