package pl.makao.zeznajomymi;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.RectF;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;

import com.badlogic.gdx.backends.android.AndroidFragmentApplication;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

import java.util.List;
import java.util.UUID;

import pl.makao.zeznajomymi.gdx.MakaoGdxGame;
import pl.makao.zeznajomymi.gdx.net.NativeGameConfig;

public class MainActivity extends BridgeActivity implements AndroidFragmentApplication.Callbacks, MakaoGdxFragment.Host {
    public interface HybridGameResultCallback {
        void onResult(String action);
    }

    private static final String PREFS_NAME = "makao_native";
    private static final String CLIENT_ID_KEY = "client_id";
    private static final String GDX_FRAGMENT_TAG = "makao_hybrid_gdx";
    private static final int WEB_BACKGROUND_COLOR = Color.rgb(2, 7, 13);

    private HybridGameRootLayout hybridRoot;
    private FrameLayout gdxContainer;
    private View webLayer;
    private MakaoGdxFragment gdxFragment;
    private NativeGameConfig hybridConfig;
    private HybridGameResultCallback hybridResultCallback;
    private boolean hybridActive;
    private boolean reactGameActive;
    private String pendingInviteText = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        captureInviteIntent(getIntent());
        registerPlugin(NativeGamePlugin.class);
        super.onCreate(savedInstanceState);
        installBackPressedHandler();
        installHybridRoot();
        configureGameShell();
        emitPendingInviteToReact();
    }

    @Override
    public void onResume() {
        super.onResume();
        configureGameShell();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) configureGameShell();
    }

    @Override
    public void onBackPressed() {
        if (handleGameBackPressed()) return;
        super.onBackPressed();
    }

    private boolean handleGameBackPressed() {
        if (hybridActive) {
            emitHybridOverlayEventToReact("confirm_leave", "{\"source\":\"android_back\"}");
            return true;
        }
        if (reactGameActive && emitAndroidBackPressedToReact()) {
            return true;
        }
        return false;
    }

    private void installBackPressedHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (handleGameBackPressed()) return;
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureInviteIntent(intent);
        emitPendingInviteToReact();
    }

    private void configureGameShell() {
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        hideSystemChrome();

        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        configureHybridWebLayer(hybridActive);
        webView.postDelayed(this::hideSystemChrome, 250);
    }

    public boolean showHybridNativeGame(
        String serverUrl,
        String roomId,
        String playerName,
        String clientId,
        String resumeToken,
        HybridGameResultCallback callback
    ) {
        if (roomId == null || roomId.trim().isEmpty()) {
            return false;
        }
        runOnUiThread(() -> {
            installHybridRoot();
            configureHybridWebLayer(true);
            hybridConfig = new NativeGameConfig(
                serverUrl,
                roomId,
                playerName,
                getOrCreateClientId(clientId),
                null,
                false,
                true,
                resumeToken
            );
            hybridResultCallback = callback;
            hybridActive = true;
            reactGameActive = false;
            if (hybridRoot != null) {
                hybridRoot.setHybridActive(true);
                hybridRoot.bringChildToFront(webLayer);
            }
            if (gdxContainer != null) {
                gdxContainer.setVisibility(View.VISIBLE);
                gdxFragment = MakaoGdxFragment.newInstance(hybridConfig);
                getSupportFragmentManager()
                    .beginTransaction()
                    .replace(gdxContainer.getId(), gdxFragment, GDX_FRAGMENT_TAG)
                    .commitNowAllowingStateLoss();
            }
            configureGameShell();
        });
        return true;
    }

    public NativeGameConfig getHybridConfig() {
        return hybridConfig;
    }

    public String consumePendingInviteText() {
        String text = pendingInviteText == null ? "" : pendingInviteText;
        pendingInviteText = "";
        return text;
    }

    public boolean isHybridActive() {
        return hybridActive;
    }

    public void setReactGameActive(boolean active) {
        reactGameActive = active && !hybridActive;
    }

    public void setHybridOverlayHitRegions(List<RectF> regions, float viewportWidth, float viewportHeight) {
        runOnUiThread(() -> {
            if (hybridRoot != null) {
                hybridRoot.setOverlayHitRegions(regions, viewportWidth, viewportHeight);
            }
        });
    }

    public void sendHybridOverlayCommand(String command, String payloadJson) {
        runOnUiThread(() -> {
            if (gdxFragment != null) {
                gdxFragment.handleHybridOverlayCommand(command, payloadJson);
            }
        });
    }

    @Override
    public void onMakaoGdxOverlayEvent(String type, String payloadJson) {
        runOnUiThread(() -> {
            emitHybridOverlayEventToReact(type, payloadJson);
        });
    }

    @Override
    public void onMakaoGdxExit(String action) {
        finishHybridGame(action);
    }

    @Override
    public void exit() {
        finishHybridGame(MakaoGdxGame.NATIVE_EXIT_LEFT_ROOM);
    }

    private void finishHybridGame(String action) {
        runOnUiThread(() -> {
            String resultAction = action == null || action.isEmpty()
                ? MakaoGdxGame.NATIVE_EXIT_LEFT_ROOM
                : action;
            HybridGameResultCallback callback = hybridResultCallback;
            hybridResultCallback = null;
            hybridConfig = null;
            hybridActive = false;
            if (hybridRoot != null) {
                hybridRoot.setHybridActive(false);
            }
            if (gdxContainer != null) {
                gdxContainer.setVisibility(View.GONE);
            }
            MakaoGdxFragment fragment = gdxFragment;
            gdxFragment = null;
            if (fragment != null && !isFinishing()) {
                getSupportFragmentManager()
                    .beginTransaction()
                    .remove(fragment)
                    .commitAllowingStateLoss();
            }
            configureHybridWebLayer(false);
            configureGameShell();
            if (callback != null) {
                callback.onResult(resultAction);
            }
        });
    }

    private void installHybridRoot() {
        if (hybridRoot != null) return;
        FrameLayout content = findViewById(android.R.id.content);
        if (content == null || content.getChildCount() == 0) return;

        webLayer = content.getChildAt(0);
        content.removeView(webLayer);

        hybridRoot = new HybridGameRootLayout(this);
        content.addView(
            hybridRoot,
            new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        );

        gdxContainer = new FrameLayout(this);
        gdxContainer.setId(View.generateViewId());
        gdxContainer.setVisibility(View.GONE);
        hybridRoot.addView(
            gdxContainer,
            new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        );

        hybridRoot.addView(
            webLayer,
            new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        );
        if (getBridge() != null) {
            hybridRoot.setTouchTargets(getBridge().getWebView(), gdxContainer);
        }
    }

    private void configureHybridWebLayer(boolean transparent) {
        int backgroundColor = transparent ? Color.TRANSPARENT : WEB_BACKGROUND_COLOR;
        if (webLayer != null) {
            webLayer.setBackgroundColor(backgroundColor);
        }
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.setBackgroundColor(backgroundColor);
    }

    private boolean emitHybridOverlayEventToReact(String type, String payloadJson) {
        if (!hybridActive || getBridge() == null) return false;
        PluginHandle handle = getBridge().getPlugin("NativeGame");
        if (handle == null || !(handle.getInstance() instanceof NativeGamePlugin)) return false;
        ((NativeGamePlugin) handle.getInstance()).emitHybridOverlayEvent(type, payloadJson);
        return true;
    }

    private boolean emitAndroidBackPressedToReact() {
        if (getBridge() == null) return false;
        PluginHandle handle = getBridge().getPlugin("NativeGame");
        if (handle == null || !(handle.getInstance() instanceof NativeGamePlugin)) return false;
        ((NativeGamePlugin) handle.getInstance()).emitAndroidBackPressed();
        return true;
    }

    private void captureInviteIntent(Intent intent) {
        String text = extractInviteText(intent);
        if (text != null && !text.trim().isEmpty()) {
            pendingInviteText = text.trim();
        }
    }

    private String extractInviteText(Intent intent) {
        if (intent == null) return "";

        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            String data = intent.getDataString();
            return data == null ? "" : data;
        }

        if (Intent.ACTION_SEND.equals(action)) {
            CharSequence extraText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (extraText != null) return extraText.toString();
            CharSequence subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
            return subject == null ? "" : subject.toString();
        }

        return "";
    }

    private void emitPendingInviteToReact() {
        if (pendingInviteText == null || pendingInviteText.isEmpty() || getBridge() == null) return;
        PluginHandle handle = getBridge().getPlugin("NativeGame");
        if (handle == null || !(handle.getInstance() instanceof NativeGamePlugin)) return;
        ((NativeGamePlugin) handle.getInstance()).emitInviteReceived(pendingInviteText);
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

    private void hideSystemChrome() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        }
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }
}
