package pl.makao.zeznajomymi;

import android.app.Activity;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import com.badlogic.gdx.backends.android.AndroidApplicationConfiguration;
import com.badlogic.gdx.backends.android.AndroidFragmentApplication;

import pl.makao.zeznajomymi.gdx.MakaoGdxGame;
import pl.makao.zeznajomymi.gdx.NativeFeedback;
import pl.makao.zeznajomymi.gdx.net.NativeGameConfig;

public class MakaoGdxFragment extends AndroidFragmentApplication {
    private static final String ARG_SERVER_URL = "serverUrl";
    private static final String ARG_ROOM_ID = "roomId";
    private static final String ARG_PLAYER_NAME = "playerName";
    private static final String ARG_CLIENT_ID = "clientId";
    private static final String ARG_RESUME_TOKEN = "resumeToken";
    private static final String ARG_DEBUG_SCENARIO = "debugScenario";

    public interface Host {
        void onMakaoGdxExit(String action);
        void onMakaoGdxOverlayEvent(String type, String payloadJson);
    }

    private MakaoGdxGame game;

    public static MakaoGdxFragment newInstance(NativeGameConfig config) {
        MakaoGdxFragment fragment = new MakaoGdxFragment();
        Bundle args = new Bundle();
        if (config != null) {
            args.putString(ARG_SERVER_URL, config.serverUrl);
            args.putString(ARG_ROOM_ID, config.roomId);
            args.putString(ARG_PLAYER_NAME, config.playerName);
            args.putString(ARG_CLIENT_ID, config.clientId);
            args.putString(ARG_RESUME_TOKEN, config.resumeToken);
            args.putString(ARG_DEBUG_SCENARIO, config.debugScenario);
        }
        fragment.setArguments(args);
        return fragment;
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        AndroidApplicationConfiguration config = new AndroidApplicationConfiguration();
        config.useAccelerometer = false;
        config.useCompass = false;
        config.useImmersiveMode = true;
        config.useWakelock = true;

        game = new MakaoGdxGame(createNativeConfig(), NativeFeedback.create(getActivity()), this::notifyHostExit, this::notifyHostOverlayEvent);
        return initializeForView(game, config);
    }

    @Override
    public void onDestroyView() {
        game = null;
        super.onDestroyView();
    }

    public void handleHybridOverlayCommand(String command, String payloadJson) {
        if (game != null) {
            game.handleHybridOverlayCommand(command, payloadJson);
        }
    }

    private NativeGameConfig createNativeConfig() {
        Bundle args = getArguments();
        if (args == null) {
            return new NativeGameConfig(null, null, null, null);
        }
        return new NativeGameConfig(
            args.getString(ARG_SERVER_URL),
            args.getString(ARG_ROOM_ID),
            args.getString(ARG_PLAYER_NAME),
            args.getString(ARG_CLIENT_ID),
            args.getString(ARG_DEBUG_SCENARIO),
            false,
            true,
            args.getString(ARG_RESUME_TOKEN)
        );
    }

    private void notifyHostExit(String action) {
        Activity activity = getActivity();
        if (activity instanceof Host) {
            activity.runOnUiThread(() -> ((Host) activity).onMakaoGdxExit(action));
        }
    }

    private void notifyHostOverlayEvent(String type, String payloadJson) {
        Activity activity = getActivity();
        if (activity instanceof Host) {
            activity.runOnUiThread(() -> ((Host) activity).onMakaoGdxOverlayEvent(type, payloadJson));
        }
    }
}
