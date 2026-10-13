package pl.makao.zeznajomymi.gdx.model;

import org.json.JSONObject;

public final class MakaoPlayer {
    public final String id;
    public final String name;
    public final boolean host;
    public final boolean ready;
    public final boolean online;
    public int handCount;
    public int pauseTurns;
    public boolean makao;

    public MakaoPlayer(String id, String name, boolean host, boolean ready, boolean online) {
        this.id = id == null ? "" : id;
        this.name = name == null || name.isEmpty() ? this.id : name;
        this.host = host;
        this.ready = ready;
        this.online = online;
    }

    public static MakaoPlayer fromJson(JSONObject json) {
        if (json == null) return null;
        String id = optNullableString(json, "id");
        String name = optNullableString(json, "name");
        if (name == null) name = optNullableString(json, "nickname");
        return new MakaoPlayer(
            id,
            name,
            json.optBoolean("isHost", json.optBoolean("host", false)),
            json.optBoolean("isReady", json.optBoolean("ready", false)),
            json.optBoolean("isOnline", json.optBoolean("online", true))
        );
    }

    private static String optNullableString(JSONObject json, String key) {
        Object value = json.opt(key);
        if (value == null || value == JSONObject.NULL) return null;
        return String.valueOf(value);
    }
}
