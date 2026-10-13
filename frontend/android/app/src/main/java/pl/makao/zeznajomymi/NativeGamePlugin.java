package pl.makao.zeznajomymi;

import android.content.Intent;
import android.graphics.RectF;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

import pl.makao.zeznajomymi.gdx.MakaoGdxGame;
import pl.makao.zeznajomymi.gdx.net.NativeGameConfig;

@CapacitorPlugin(name = "NativeGame")
public class NativeGamePlugin extends Plugin {
    private PluginCall pendingHybridOpenCall;
    private JSObject stickyHybridOverlayEvent;

    @PluginMethod
    public void open(PluginCall call) {
        String roomId = call.getString("roomId");
        if (roomId == null || roomId.trim().isEmpty()) {
            call.reject("Missing roomId");
            return;
        }

        boolean legacyActivity = Boolean.TRUE.equals(call.getBoolean("legacyActivity", false));
        if (!legacyActivity && getActivity() instanceof MainActivity) {
            MainActivity activity = (MainActivity) getActivity();
            if (activity.isHybridActive()) {
                NativeGameConfig activeConfig = activity.getHybridConfig();
                if (isSameRoom(activeConfig, roomId)) {
                    pendingHybridOpenCall = call;
                    return;
                }
                call.reject("Hybrid native game is already open");
                return;
            }
            if (pendingHybridOpenCall != null) {
                call.reject("Hybrid native game is already open");
                return;
            }
            clearStickyHybridOverlayEvent();
            boolean started = activity.showHybridNativeGame(
                call.getString("serverUrl"),
                roomId,
                call.getString("playerName"),
                call.getString("clientId"),
                call.getString("resumeToken"),
                action -> resolveHybridOpenCall(action)
            );
            if (!started) {
                call.reject("Unable to open hybrid native game");
                return;
            }
            pendingHybridOpenCall = call;
            return;
        }

        Intent intent = new Intent(getActivity(), MakaoNativeActivity.class);
        intent.putExtra("serverUrl", call.getString("serverUrl"));
        intent.putExtra("roomId", roomId);
        intent.putExtra("playerName", call.getString("playerName"));
        intent.putExtra("clientId", call.getString("clientId"));
        intent.putExtra("resumeToken", call.getString("resumeToken"));
        startActivityForResult(call, intent, "handleNativeGameResult");
    }

    @PluginMethod
    public void getLaunchConfig(PluginCall call) {
        JSObject response = new JSObject();
        if (getActivity() instanceof MainActivity) {
            MainActivity activity = (MainActivity) getActivity();
            NativeGameConfig config = activity.getHybridConfig();
            response.put("active", activity.isHybridActive());
            if (config != null) {
                response.put("serverUrl", config.serverUrl);
                response.put("roomId", config.roomId);
                response.put("playerName", config.playerName);
                response.put("clientId", config.clientId);
            }
        } else {
            response.put("active", false);
        }
        call.resolve(response);
    }

    @PluginMethod
    public void getPendingInvite(PluginCall call) {
        JSObject response = new JSObject();
        if (getActivity() instanceof MainActivity) {
            response.put("text", ((MainActivity) getActivity()).consumePendingInviteText());
        } else {
            response.put("text", "");
        }
        call.resolve(response);
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("Missing text");
            return;
        }

        String title = call.getString("title", "Makao");
        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType("text/plain");
        sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
        sendIntent.putExtra(Intent.EXTRA_TEXT, text);

        Intent chooser = Intent.createChooser(sendIntent, title);
        getActivity().startActivity(chooser);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void setReactGameActive(PluginCall call) {
        if (!(getActivity() instanceof MainActivity)) {
            call.resolve(new JSObject().put("ok", false));
            return;
        }
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        ((MainActivity) getActivity()).setReactGameActive(active);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void getOverlaySnapshot(PluginCall call) {
        JSObject response = new JSObject();
        response.put("active", getActivity() instanceof MainActivity && ((MainActivity) getActivity()).isHybridActive());
        JSObject event = cloneStickyHybridOverlayEvent();
        if (event != null) {
            response.put("event", event);
        }
        call.resolve(response);
    }

    @PluginMethod
    public void sendCommand(PluginCall call) {
        String command = call.getString("command");
        if (command == null || command.trim().isEmpty()) {
            call.reject("Missing command");
            return;
        }
        if (!(getActivity() instanceof MainActivity)) {
            call.reject("Hybrid native game is unavailable");
            return;
        }
        JSObject payload = call.getObject("payload", new JSObject());
        String cleanCommand = command.trim();
        clearStickyHybridOverlayEventForCommand(cleanCommand);
        ((MainActivity) getActivity()).sendHybridOverlayCommand(cleanCommand, payload.toString());
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void setOverlayHitRegions(PluginCall call) {
        if (!(getActivity() instanceof MainActivity)) {
            call.resolve(new JSObject().put("ok", false));
            return;
        }

        JSArray rectArray = call.getArray("rects", new JSArray());
        JSObject viewport = call.getObject("viewport", new JSObject());
        float viewportWidth = (float) viewport.optDouble("width", 0d);
        float viewportHeight = (float) viewport.optDouble("height", 0d);
        List<RectF> regions = new ArrayList<>();
        for (int i = 0; i < rectArray.length(); i++) {
            JSONObject rect = rectArray.optJSONObject(i);
            if (rect == null) continue;
            float x = (float) rect.optDouble("x", 0d);
            float y = (float) rect.optDouble("y", 0d);
            float width = (float) rect.optDouble("width", 0d);
            float height = (float) rect.optDouble("height", 0d);
            if (width <= 0f || height <= 0f) continue;
            regions.add(new RectF(x, y, x + width, y + height));
        }
        ((MainActivity) getActivity()).setHybridOverlayHitRegions(regions, viewportWidth, viewportHeight);
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void close(PluginCall call) {
        String action = call.getString("action", MakaoGdxGame.NATIVE_EXIT_LEFT_ROOM);
        if (getActivity() instanceof MainActivity) {
            clearStickyHybridOverlayEvent();
            ((MainActivity) getActivity()).onMakaoGdxExit(action);
            call.resolve(new JSObject().put("ok", true));
            return;
        }
        call.resolve(new JSObject().put("ok", false));
    }

    public void emitHybridOverlayEvent(String type, String payloadJson) {
        JSObject event = new JSObject();
        event.put("type", type == null ? "" : type);
        if (payloadJson != null && !payloadJson.trim().isEmpty()) {
            try {
                event.put("payload", new JSObject(payloadJson));
            } catch (JSONException ignored) {
                event.put("payload", new JSObject().put("raw", payloadJson));
            }
        } else {
            event.put("payload", new JSObject());
        }
        rememberStickyHybridOverlayEvent(type, event);
        notifyListeners("hybridOverlayEvent", event);
    }

    public void emitInviteReceived(String text) {
        JSObject event = new JSObject();
        event.put("text", text == null ? "" : text);
        notifyListeners("inviteReceived", event);
    }

    public void emitAndroidBackPressed() {
        notifyListeners("androidBackPressed", new JSObject());
    }

    @ActivityCallback
    private void handleNativeGameResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result == null ? null : result.getData();
        String action = data == null ? "" : data.getStringExtra("nativeGameAction");
        resolveNativeResult(call, action);
    }

    private void resolveHybridOpenCall(String action) {
        PluginCall call = pendingHybridOpenCall;
        pendingHybridOpenCall = null;
        clearStickyHybridOverlayEvent();
        if (call != null) {
            resolveNativeResult(call, action);
        }
    }

    private void resolveNativeResult(PluginCall call, String action) {
        JSObject response = new JSObject();
        response.put("action", action == null ? "" : action);
        response.put("leftRoom", "left_room".equals(action));
        response.put("returnLobby", "return_lobby".equals(action));
        call.resolve(response);
    }

    private void rememberStickyHybridOverlayEvent(String type, JSObject event) {
        if ("confirm_leave".equals(type)
            || "request_choice_open".equals(type)
            || "joker_choice_open".equals(type)
            || "game_over".equals(type)) {
            stickyHybridOverlayEvent = cloneEvent(event);
            return;
        }

        if ("request_choice_close".equals(type) && isStickyHybridOverlayType("request_choice_open")) {
            clearStickyHybridOverlayEvent();
            return;
        }

        if ("joker_choice_close".equals(type) && isStickyHybridOverlayType("joker_choice_open")) {
            clearStickyHybridOverlayEvent();
        }
    }

    private void clearStickyHybridOverlayEventForCommand(String command) {
        if ("leave_room".equals(command) || "return_lobby".equals(command) || "close".equals(command)) {
            clearStickyHybridOverlayEvent();
            return;
        }

        if ("cancel_leave".equals(command) && isStickyHybridOverlayType("confirm_leave")) {
            clearStickyHybridOverlayEvent();
            return;
        }

        if ("choose_suit_request".equals(command) || "choose_rank_request".equals(command)) {
            if (isStickyHybridOverlayType("request_choice_open")) {
                clearStickyHybridOverlayEvent();
            }
            return;
        }

        if ("choose_joker".equals(command) && isStickyHybridOverlayType("joker_choice_open")) {
            clearStickyHybridOverlayEvent();
            return;
        }

        if ("dismiss_popup".equals(command)
            && (isStickyHybridOverlayType("request_choice_open") || isStickyHybridOverlayType("joker_choice_open"))) {
            clearStickyHybridOverlayEvent();
        }
    }

    private boolean isStickyHybridOverlayType(String type) {
        return stickyHybridOverlayEvent != null && type.equals(stickyHybridOverlayEvent.getString("type"));
    }

    private JSObject cloneStickyHybridOverlayEvent() {
        return cloneEvent(stickyHybridOverlayEvent);
    }

    private JSObject cloneEvent(JSObject event) {
        if (event == null) return null;
        try {
            return new JSObject(event.toString());
        } catch (JSONException ignored) {
            return null;
        }
    }

    private void clearStickyHybridOverlayEvent() {
        stickyHybridOverlayEvent = null;
    }

    private boolean isSameRoom(NativeGameConfig config, String roomId) {
        if (config == null || config.roomId == null || roomId == null) return false;
        return config.roomId.trim().equalsIgnoreCase(roomId.trim());
    }
}
