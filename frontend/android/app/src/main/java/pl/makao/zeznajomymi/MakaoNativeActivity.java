package pl.makao.zeznajomymi;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import com.badlogic.gdx.backends.android.AndroidApplication;
import com.badlogic.gdx.backends.android.AndroidApplicationConfiguration;

import java.util.UUID;

import pl.makao.zeznajomymi.gdx.MakaoGdxGame;
import pl.makao.zeznajomymi.gdx.NativeFeedback;
import pl.makao.zeznajomymi.gdx.net.NativeGameConfig;

public class MakaoNativeActivity extends AndroidApplication {
    private static final String PREFS_NAME = "makao_native";
    private static final String CLIENT_ID_KEY = "client_id";
    private static final int IMMERSIVE_FLAGS =
        View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);
        configureNativeShell();

        AndroidApplicationConfiguration config = new AndroidApplicationConfiguration();
        config.useAccelerometer = false;
        config.useCompass = false;
        config.useImmersiveMode = true;
        config.useWakelock = true;

        initialize(new MakaoGdxGame(createNativeConfig(), NativeFeedback.create(this), this::finishAfterNativeExit), config);
        configureNativeShell();
    }

    @Override
    protected void onResume() {
        super.onResume();
        configureNativeShell();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) configureNativeShell();
    }

    private void configureNativeShell() {
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(IMMERSIVE_FLAGS);
    }

    private void finishAfterNativeExit(String action) {
        runOnUiThread(() -> {
            Intent result = new Intent();
            result.putExtra("nativeGameAction", action == null ? MakaoGdxGame.NATIVE_EXIT_LEFT_ROOM : action);
            setResult(RESULT_OK, result);
            finish();
        });
    }

    private NativeGameConfig createNativeConfig() {
        String serverUrl = getIntent().getStringExtra("serverUrl");
        String roomId = getIntent().getStringExtra("roomId");
        String playerName = getIntent().getStringExtra("playerName");
        String clientId = getIntent().getStringExtra("clientId");
        String resumeToken = getIntent().getStringExtra("resumeToken");
        String debugScenario = isDebuggableBuild() ? getIntent().getStringExtra("debugScenario") : null;
        boolean standaloneDebugTable = isDebuggableBuild()
            && getIntent().getBooleanExtra("standaloneNativeTest", false);
        return new NativeGameConfig(
            serverUrl,
            roomId,
            playerName,
            getOrCreateClientId(clientId),
            debugScenario,
            false,
            !standaloneDebugTable,
            resumeToken
        );
    }

    private boolean isDebuggableBuild() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private String getOrCreateClientId(String preferredClientId) {
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (preferredClientId != null && !preferredClientId.trim().isEmpty()) {
            String clean = preferredClientId.trim();
            preferences.edit().putString(CLIENT_ID_KEY, clean).apply();
            return clean;
        }

        String existing = preferences.getString(CLIENT_ID_KEY, null);
        if (existing != null && !existing.isEmpty()) return existing;

        String generated = "native_" + UUID.randomUUID();
        preferences.edit().putString(CLIENT_ID_KEY, generated).apply();
        return generated;
    }
}
