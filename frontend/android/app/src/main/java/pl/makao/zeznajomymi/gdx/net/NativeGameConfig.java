package pl.makao.zeznajomymi.gdx.net;

public final class NativeGameConfig {
    public static final String DEFAULT_SERVER_URL = pl.makao.zeznajomymi.BuildConfig.MAKAO_DEFAULT_SERVER_URL;

    public static boolean isRetiredServer(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        String normalized = stripTrailingSlash(value.trim());
        for (String retired : pl.makao.zeznajomymi.BuildConfig.MAKAO_RETIRED_SERVER_URLS.split(",")) {
            if (!retired.trim().isEmpty() && normalized.equals(stripTrailingSlash(retired.trim()))) return true;
        }
        return false;
    }

    public final String serverUrl;
    public final String roomId;
    public final String playerName;
    public final String clientId;
    public final String debugScenario;
    public final boolean reconnectSession;
    public final boolean hostManagedTable;
    public final String resumeToken;

    public NativeGameConfig(String serverUrl, String roomId, String playerName, String clientId) {
        this(serverUrl, roomId, playerName, clientId, null);
    }

    public NativeGameConfig(String serverUrl, String roomId, String playerName, String clientId, String debugScenario) {
        this(serverUrl, roomId, playerName, clientId, debugScenario, false);
    }

    public NativeGameConfig(String serverUrl, String roomId, String playerName, String clientId, String debugScenario, boolean reconnectSession) {
        this(serverUrl, roomId, playerName, clientId, debugScenario, reconnectSession, normalizeOptional(roomId) != null);
    }

    public NativeGameConfig(
        String serverUrl,
        String roomId,
        String playerName,
        String clientId,
        String debugScenario,
        boolean reconnectSession,
        boolean hostManagedTable
    ) {
        this(serverUrl, roomId, playerName, clientId, debugScenario, reconnectSession, hostManagedTable, null);
    }

    public NativeGameConfig(
        String serverUrl,
        String roomId,
        String playerName,
        String clientId,
        String debugScenario,
        boolean reconnectSession,
        boolean hostManagedTable,
        String resumeToken
    ) {
        this.serverUrl = normalizeServerUrl(serverUrl);
        this.roomId = normalizeOptional(roomId);
        this.playerName = normalizeOptional(playerName) == null ? "Native" : playerName.trim();
        this.clientId = normalizeOptional(clientId) == null ? "native_" + System.currentTimeMillis() : clientId.trim();
        this.debugScenario = normalizeOptional(debugScenario);
        this.reconnectSession = reconnectSession;
        this.hostManagedTable = hostManagedTable;
        this.resumeToken = normalizeOptional(resumeToken);
    }

    private static String normalizeServerUrl(String value) {
        String trimmed = normalizeOptional(value);
        if (trimmed == null) return DEFAULT_SERVER_URL;
        if (trimmed.matches("^[a-zA-Z][a-zA-Z\\d+.-]*://.*")) return stripTrailingSlash(trimmed);

        String host = trimmed.split("/")[0].split(":")[0];
        boolean localOrIp = "localhost".equalsIgnoreCase(host) || host.matches("\\d{1,3}(\\.\\d{1,3}){3}");
        return (localOrIp ? "http://" : "https://") + stripTrailingSlash(trimmed);
    }

    private static String stripTrailingSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private static String normalizeOptional(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
