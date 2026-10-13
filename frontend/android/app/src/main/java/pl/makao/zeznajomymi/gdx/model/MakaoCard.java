package pl.makao.zeznajomymi.gdx.model;

import org.json.JSONException;
import org.json.JSONObject;

public final class MakaoCard {
    public static final String RANK_JOKER = "joker";

    public final String cardInstanceId;
    public final String rank;
    public final String suit;
    public final MakaoCard jokerDeclaration;

    public MakaoCard(String cardInstanceId, String rank, String suit) {
        this(cardInstanceId, rank, suit, null);
    }

    public MakaoCard(String cardInstanceId, String rank, String suit, MakaoCard jokerDeclaration) {
        this.cardInstanceId = cardInstanceId == null ? fallbackId(rank, suit) : cardInstanceId;
        this.rank = rank == null ? "" : rank;
        this.suit = suit;
        this.jokerDeclaration = jokerDeclaration;
    }

    public static MakaoCard create(String cardInstanceId, String rank, String suit) {
        return new MakaoCard(cardInstanceId, rank, suit);
    }

    public static MakaoCard fromJson(JSONObject json) {
        if (json == null) return null;
        String rank = optNullableString(json, "rank");
        String suit = optNullableString(json, "suit");
        String id = optNullableString(json, "cardInstanceId");
        if (id == null) id = optNullableString(json, "id");

        MakaoCard jokerDeclaration = null;
        JSONObject declarationJson = json.optJSONObject("jokerDeclaration");
        if (declarationJson != null) {
            jokerDeclaration = fromJson(declarationJson);
        }

        return new MakaoCard(id, rank, suit, jokerDeclaration);
    }

    public JSONObject toJson() {
        JSONObject json = new JSONObject();
        try {
            json.put("cardInstanceId", cardInstanceId);
            json.put("rank", rank);
            if (suit == null) {
                json.put("suit", JSONObject.NULL);
            } else {
                json.put("suit", suit);
            }
            if (jokerDeclaration != null) {
                json.put("jokerDeclaration", jokerDeclaration.toJson());
            }
        } catch (JSONException ignored) {
            // JSONObject only throws for invalid values; our values are simple strings/nulls.
        }
        return json;
    }

    public String rankLabel() {
        if ("ace".equals(rank)) return "A";
        if ("king".equals(rank)) return "K";
        if ("queen".equals(rank)) return "D";
        if ("jack".equals(rank)) return "W";
        if (RANK_JOKER.equals(rank)) return "Joker";
        return rank == null ? "" : rank;
    }

    public String rankNamePl() {
        if ("ace".equals(rank)) return "As";
        if ("king".equals(rank)) return "Król";
        if ("queen".equals(rank)) return "Dama";
        if ("jack".equals(rank)) return "Walet";
        if (RANK_JOKER.equals(rank)) return "Joker";
        return rank == null ? "" : rank;
    }

    public String suitShort() {
        if ("hearts".equals(suit)) return "♥";
        if ("diamonds".equals(suit)) return "♦";
        if ("clubs".equals(suit)) return "♣";
        if ("spades".equals(suit)) return "♠";
        return "";
    }

    public String suitLabel() {
        if ("hearts".equals(suit)) return "kier";
        if ("diamonds".equals(suit)) return "karo";
        if ("clubs".equals(suit)) return "trefl";
        if ("spades".equals(suit)) return "pik";
        return "";
    }

    public boolean isRed() {
        return "hearts".equals(suit) || "diamonds".equals(suit);
    }

    public String tableLabel() {
        String declared = jokerDeclaration == null ? "" : " → " + jokerDeclaration.rankLabel() + " " + jokerDeclaration.suitShort();
        String suitLabel = suitShort();
        if (suitLabel.isEmpty()) return rankLabel() + declared;
        return rankLabel() + " " + suitLabel + declared;
    }

    private static String optNullableString(JSONObject json, String key) {
        Object value = json.opt(key);
        if (value == null || value == JSONObject.NULL) return null;
        return String.valueOf(value);
    }

    private static String fallbackId(String rank, String suit) {
        String safeRank = rank == null ? "unknown" : rank;
        String safeSuit = suit == null ? "none" : suit;
        return safeRank + "_" + safeSuit + "_" + Math.abs((safeRank + ":" + safeSuit).hashCode());
    }
}
