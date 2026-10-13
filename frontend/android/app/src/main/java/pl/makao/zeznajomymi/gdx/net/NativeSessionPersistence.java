package pl.makao.zeznajomymi.gdx.net;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

public final class NativeSessionPersistence {
    public interface Store {
        String getString(String key);
        void putString(String key, String value);
        void remove(String key);
    }

    public static final class PendingAction {
        public final String actionId;
        public final String actionType;
        public final String payloadJson;
        public final int expectedStateVersion;

        public PendingAction(String actionId, String actionType, String payloadJson, int expectedStateVersion) {
            this.actionId = actionId;
            this.actionType = actionType;
            this.payloadJson = payloadJson;
            this.expectedStateVersion = expectedStateVersion;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof PendingAction)) return false;
            PendingAction action = (PendingAction) other;
            return expectedStateVersion == action.expectedStateVersion
                && Objects.equals(actionId, action.actionId)
                && Objects.equals(actionType, action.actionType)
                && Objects.equals(payloadJson, action.payloadJson);
        }

        @Override
        public int hashCode() {
            return Objects.hash(actionId, actionType, payloadJson, expectedStateVersion);
        }
    }

    public static final class PendingLeave {
        public final String actionId;
        public final String roomId;
        public final String clientId;
        public final String resumeToken;

        public PendingLeave(String actionId, String roomId, String clientId, String resumeToken) {
            this.actionId = actionId;
            this.roomId = roomId;
            this.clientId = clientId;
            this.resumeToken = resumeToken;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof PendingLeave)) return false;
            PendingLeave leave = (PendingLeave) other;
            return Objects.equals(actionId, leave.actionId)
                && Objects.equals(roomId, leave.roomId)
                && Objects.equals(clientId, leave.clientId)
                && Objects.equals(resumeToken, leave.resumeToken);
        }

        @Override
        public int hashCode() {
            return Objects.hash(actionId, roomId, clientId, resumeToken);
        }
    }

    private static final String PREFIX = "session_v1_";
    private final Store store;

    public NativeSessionPersistence(Store store) {
        this.store = store;
    }

    public String loadResumeToken(String serverUrl, String roomId, String clientId) {
        return read("resume", serverUrl, roomId, clientId);
    }

    public void saveResumeToken(String serverUrl, String roomId, String clientId, String resumeToken) {
        String token = clean(resumeToken);
        if (token == null) return;
        write("resume", serverUrl, roomId, clientId, token);
    }

    public void clearResumeToken(String serverUrl, String roomId, String clientId) {
        remove("resume", serverUrl, roomId, clientId);
    }

    public PendingAction loadPendingAction(String serverUrl, String roomId, String clientId) {
        List<String> fields = decode(read("action", serverUrl, roomId, clientId));
        if (fields == null || fields.size() != 4) return null;
        try {
            return new PendingAction(fields.get(0), fields.get(1), fields.get(2), Integer.parseInt(fields.get(3)));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    public void savePendingAction(
        String serverUrl,
        String roomId,
        String clientId,
        PendingAction action
    ) {
        if (action == null) return;
        write(
            "action",
            serverUrl,
            roomId,
            clientId,
            encode(action.actionId, action.actionType, action.payloadJson, String.valueOf(action.expectedStateVersion))
        );
    }

    public void clearPendingAction(String serverUrl, String roomId, String clientId) {
        remove("action", serverUrl, roomId, clientId);
    }

    public PendingLeave loadPendingLeave(String serverUrl, String roomId, String clientId) {
        List<String> fields = decode(read("leave", serverUrl, roomId, clientId));
        if (fields == null || fields.size() != 4) return null;
        return new PendingLeave(fields.get(0), fields.get(1), fields.get(2), emptyToNull(fields.get(3)));
    }

    public void savePendingLeave(
        String serverUrl,
        String roomId,
        String clientId,
        PendingLeave leave
    ) {
        if (leave == null) return;
        write(
            "leave",
            serverUrl,
            roomId,
            clientId,
            encode(leave.actionId, leave.roomId, leave.clientId, leave.resumeToken)
        );
    }

    public void clearPendingLeave(String serverUrl, String roomId, String clientId) {
        remove("leave", serverUrl, roomId, clientId);
    }

    private String read(String type, String serverUrl, String roomId, String clientId) {
        String key = key(type, serverUrl, roomId, clientId);
        return key == null || store == null ? null : store.getString(key);
    }

    private void write(String type, String serverUrl, String roomId, String clientId, String value) {
        String key = key(type, serverUrl, roomId, clientId);
        if (key != null && store != null && value != null) store.putString(key, value);
    }

    private void remove(String type, String serverUrl, String roomId, String clientId) {
        String key = key(type, serverUrl, roomId, clientId);
        if (key != null && store != null) store.remove(key);
    }

    private static String key(String type, String serverUrl, String roomId, String clientId) {
        String origin = normalizeServerOrigin(serverUrl);
        String room = clean(roomId);
        String client = clean(clientId);
        if (origin == null || room == null || client == null) return null;
        String scope = origin + "\n" + room.toUpperCase(Locale.ROOT) + "\n" + client;
        return PREFIX + type + "_" + sha256(scope);
    }

    static String normalizeServerOrigin(String serverUrl) {
        String value = clean(serverUrl);
        if (value == null) return null;
        try {
            URI uri = URI.create(value);
            String scheme = clean(uri.getScheme());
            String host = clean(uri.getHost());
            if (scheme != null && host != null) {
                String port = uri.getPort() < 0 ? "" : ":" + uri.getPort();
                return scheme.toLowerCase(Locale.ROOT) + "://" + host.toLowerCase(Locale.ROOT) + port;
            }
        } catch (IllegalArgumentException ignored) {
        }
        return value.replaceAll("/+$", "").toLowerCase(Locale.ROOT);
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte item : digest) hex.append(String.format(Locale.ROOT, "%02x", item & 0xff));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }

    private static String encode(String... fields) {
        StringBuilder encoded = new StringBuilder();
        for (String field : fields) {
            String value = field == null ? "" : field;
            encoded.append(value.length()).append(':').append(value);
        }
        return encoded.toString();
    }

    private static List<String> decode(String encoded) {
        if (encoded == null) return null;
        ArrayList<String> fields = new ArrayList<>();
        int offset = 0;
        while (offset < encoded.length()) {
            int separator = encoded.indexOf(':', offset);
            if (separator < 0) return null;
            int length;
            try {
                length = Integer.parseInt(encoded.substring(offset, separator));
            } catch (NumberFormatException ignored) {
                return null;
            }
            int start = separator + 1;
            int end = start + length;
            if (length < 0 || end > encoded.length()) return null;
            fields.add(encoded.substring(start, end));
            offset = end;
        }
        return fields;
    }

    private static String clean(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }
}
