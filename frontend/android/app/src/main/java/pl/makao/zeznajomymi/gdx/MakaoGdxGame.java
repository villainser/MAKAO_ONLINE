package pl.makao.zeznajomymi.gdx;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.InputProcessor;
import com.badlogic.gdx.Preferences;
import com.badlogic.gdx.audio.Sound;
import com.badlogic.gdx.graphics.Color;
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.OrthographicCamera;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.GlyphLayout;
import com.badlogic.gdx.graphics.g2d.SpriteBatch;
import com.badlogic.gdx.graphics.g2d.TextureAtlas;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.g2d.freetype.FreeTypeFontGenerator;
import com.badlogic.gdx.graphics.glutils.ShapeRenderer;
import com.badlogic.gdx.math.MathUtils;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Rectangle;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.ScreenUtils;
import com.badlogic.gdx.utils.viewport.FitViewport;

import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import pl.makao.zeznajomymi.gdx.model.MakaoCard;
import pl.makao.zeznajomymi.gdx.model.MakaoGameState;
import pl.makao.zeznajomymi.gdx.model.MakaoMoveDetails;
import pl.makao.zeznajomymi.gdx.model.MakaoMoveEvent;
import pl.makao.zeznajomymi.gdx.model.MakaoPlayer;
import pl.makao.zeznajomymi.gdx.model.MakaoRoomState;
import pl.makao.zeznajomymi.gdx.net.NativeGameClient;
import pl.makao.zeznajomymi.gdx.net.NativeGameConfig;
import pl.makao.zeznajomymi.gdx.net.NativeSessionPersistence;
import pl.makao.zeznajomymi.gdx.rules.NativePlayRules;
import pl.makao.zeznajomymi.gdx.rules.NativeReliableActionRules;

public class MakaoGdxGame extends ApplicationAdapter implements InputProcessor {
    public interface NativeExitCallback {
        void run(String action);
    }

    public interface HybridOverlayEventCallback {
        void emit(String type, String payloadJson);
    }

    public static final String NATIVE_EXIT_LEFT_ROOM = "left_room";
    public static final String NATIVE_EXIT_RETURN_LOBBY = "return_lobby";

    private static final float WORLD_WIDTH = 960f;
    private static final float WORLD_HEIGHT = 540f;
    private static final float CARD_WIDTH = 92f;
    private static final float CARD_HEIGHT = 138f;
    private static final float PILE_WIDTH = 104f;
    private static final float PILE_HEIGHT = 156f;
    private static final float HAND_Y = 92f;
    private static final float HAND_CARD_SPACING = 72f;
    private static final float HAND_VISIBLE_WIDTH = 748f;
    private static final float HAND_COLLAPSED_Y_OFFSET = -30f;
    private static final float HAND_COLLAPSED_SCALE = 0.8f;
    private static final float HAND_CARD_BOTTOM_MARGIN = 6f;
    private static final float HAND_OPPONENT_PEEK_FOCUS = 0.28f;
    private static final float HAND_TABLE_REVEAL_FOCUS = 0.04f;
    private static final float HAND_THROW_FLIGHT_FOCUS = 0.12f;
    private static final float HAND_FOCUS_HOLD_SECONDS = 2.2f;
    private static final float HAND_TABLE_REVEAL_HOLD_SECONDS = 1.1f;
    private static final float HAND_DEBUG_REVEAL_HOLD_SECONDS = 7.5f;
    private static final float DEBUG_AUTO_MOTION_DELAY_SECONDS = 1.15f;
    private static final float HAND_PAN_THRESHOLD = 18f;
    private static final float HAND_PAN_MAX_VELOCITY = 1650f;
    private static final float HAND_PAN_FRICTION = 7.5f;
    private static final float HAND_DOUBLE_TAP_SECONDS = 0.46f;
    private static final float HAND_DOUBLE_TAP_DISTANCE = 58f;
    private static final float SORT_WAVE_DURATION = 0.42f;
    private static final float TABLE_Y = 300f;
    private static final int PLAYER_NAME_MAX_CHARS = 40;
    private static final float TAP_MOVE_THRESHOLD = 12f;
    private static final float THROW_ZONE_Y = 190f;
    private static final float THROW_MIN_UPWARD_DISTANCE = 78f;
    private static final float THROW_CANCEL_MIN_DOWNWARD_DISTANCE = 36f;
    private static final float THROW_TABLE_MIN_UPWARD_DISTANCE = 34f;
    private static final float THROW_MIN_UPWARD_VELOCITY = 540f;
    private static final float THROW_NEAR_DISCARD_PADDING = 56f;
    private static final float THROW_ARM_SCORE = 0.72f;
    private static final float THROW_KEEP_ARM_SCORE = 0.44f;
    private static final float DRAW_PULL_MIN_DISTANCE = 58f;
    private static final float DRAW_RELEASE_Y = 218f;
    private static final float DRAW_RECOIL_SECONDS = 0.24f;
    private static final float DRAW_RECOIL_PIXELS = 7f;
    private static final float DRAW_LAND_BOUNCE_PIXELS = 8f;
    private static final float DISCARD_SETTLE_PIXELS = 9f;
    private static final float SEAT_HAND_POP_SECONDS = 0.72f;
    private static final float SEAT_IMPACT_SECONDS = 0.62f;
    private static final float LOBBY_DEAL_PREVIEW_SECONDS = 1.15f;
    private static final int DISCARD_UNDER_VISIBLE_COUNT = 2;
    private static final String STATUS_MOMENT = "Chwileczkę…";
    private static final String STATUS_RETURNING_TO_TABLE = "Wracamy do stołu…";
    private static final String PREFS_NAME = "makao_native_game";
    private static final String PREF_PLAYER_NAME = "player_name";
    private static final String PREF_ROOM_NAME = "room_name";
    private static final String PREF_SERVER_URL = "server_url";
    private static final String PREF_SERVER_SETTINGS_VERSION = "server_settings_version";
    private static final String PREF_AUDIO_ENABLED = "audio_enabled";
    private static final String PREF_HAPTICS_ENABLED = "haptics_enabled";
    private static final String PREF_SOLID_CARDS_ENABLED = "solid_cards_enabled";
    private static final String PREF_LAST_ROOM_ID = "last_room_id";
    private static final String PREF_LAST_ROOM_SERVER_URL = "last_room_server_url";
    private static final int SERVER_SETTINGS_VERSION = 2;
    private static final String[] JOKER_RANKS = { "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king", "ace" };
    private static final String[] JOKER_SUITS = { "hearts", "diamonds", "clubs", "spades" };
    private static final String JACK_REQUEST_RANK_NON_BATTLE_KING = "non_battle_king";
    private static final String[] REQUEST_RANKS_BASIC = { "5", "6", "7", "8", "9", "10" };
    private static final String[] REQUEST_RANKS_WITH_NON_BATTLE_KINGS = { "5", "6", "7", "8", "9", "10", JACK_REQUEST_RANK_NON_BATTLE_KING };

    private enum StartPanel {
        CREATE,
        JOIN,
        SETTINGS
    }

    private enum KeyboardMode {
        TEXT,
        CODE,
        URL
    }

    private interface NativeTextCommit {
        void commit(String value);
    }

    private final Array<NativeCard> hand = new Array<>();
    private final Array<CardFlight> flights = new Array<>();
    private final Array<NativeCard> selectedCards = new Array<>();
    private final Array<NativeCard> discardUnderCards = new Array<>();
    private final Array<MakaoCard> latestLocalDiscardMove = new Array<>();
    private final Array<EventBubble> eventBubbles = new Array<>();
    private final ArrayList<String> handOrderIds = new ArrayList<>();
    private final Array<String> pendingPlayedCardIds = new Array<>();
    private final Array<NativeCard> pendingJokerCardsToPlay = new Array<>();
    private final Array<NativeCard> pendingRequestCardsToPlay = new Array<>();
    private final Map<String, MakaoCard> pendingRequestJokerDeclarations = new HashMap<>();
    private final Map<String, Rectangle> catchMakaoBoundsByPlayer = new HashMap<>();
    private final Map<String, Integer> previousSeatHandCounts = new HashMap<>();
    private final Map<String, Float> seatHandPopTimers = new HashMap<>();
    private final Map<String, Float> seatImpactTimers = new HashMap<>();
    private final Map<String, BadgeTone> seatImpactTones = new HashMap<>();
    private final Rectangle drawPileBounds = new Rectangle(292f, 226f, PILE_WIDTH, PILE_HEIGHT);
    private final Rectangle discardPileBounds = new Rectangle(566f, 220f, PILE_WIDTH, PILE_HEIGHT);
    private final Rectangle passButtonBounds = new Rectangle(536f, 166f, 126f, 44f);
    private final Rectangle makaoButtonBounds = new Rectangle(690f, 166f, 138f, 44f);
    private final Vector3 touchPoint = new Vector3();
    private final GlyphLayout glyphLayout = new GlyphLayout();

    private OrthographicCamera camera;
    private FitViewport viewport;
    private SpriteBatch batch;
    private ShapeRenderer shapes;
    private BitmapFont titleFont;
    private BitmapFont labelFont;
    private BitmapFont messageFont;
    private BitmapFont cardFont;
    private Texture cardFrontTexture;
    private Texture cardBackTexture;
    private Texture glowTexture;
    private Texture shadowTexture;
    private Texture whitePixelTexture;
    private Texture heartIconTexture;
    private Texture diamondIconTexture;
    private Texture clubIconTexture;
    private Texture spadeIconTexture;
    private Texture iconGameplayTexture;
    private TextureRegion requestBangIconRegion;
    private TextureRegion requestNoIconRegion;
    private TextureRegion jokerIconRegion;
    private TextureRegion jokerArrowIconRegion;
    private TextureRegion pauseIconRegion;
    private final Map<String, TextureRegion> requestRankIconRegions = new HashMap<>();
    private final Map<String, TextureRegion> requestSuitIconRegions = new HashMap<>();
    private final Map<String, TextureRegion> plainSuitIconRegions = new HashMap<>();
    private TextureAtlas cardAtlas;
    private Sound tapSound;
    private Sound playSound;
    private Sound drawSound;
    private Sound landSound;
    private Sound sortSound;
    private Sound shuffleSound;
    private Sound illegalSound;
    private Sound specialSound;
    private Sound makaoSound;
    private Sound turnPingSound;
    private NativeTableSkin.LoadedTexture tableBackgroundTexture;
    private NativeTableSkin.LoadedTexture homeBackgroundTexture;
    private NativeTableSkin.LoadedTexture bubuBackTexture;
    private Preferences preferences;

    private final NativeGameConfig nativeConfig;
    private final NativeFeedback feedback;
    private final NativeExitCallback nativeExitCallback;
    private final HybridOverlayEventCallback hybridOverlayEventCallback;
    private NativeGameClient nativeClient;
    private MakaoRoomState nativeRoomState;
    private NativeCard selectedCard;
    private NativeCard draggedCard;
    private NativeCard discardTop;
    private MakaoGameState prototypeState;
    private MakaoGameState latestState;
    private float dragOffsetX;
    private float dragOffsetY;
    private float dragStartX;
    private float dragStartY;
    private float lastDragX;
    private float lastDragY;
    private float lastDragTime;
    private float dragVelocityX;
    private float dragVelocityY;
    private float handScrollOffset;
    private float handPanStartOffset;
    private float handScrollVelocity;
    private float handFocusAmount = 1f;
    private float handFocusHoldTimer;
    private float tableRevealHoldTimer;
    private float lastHandTapTime = -10f;
    private float lastHandTapX;
    private float lastHandTapY;
    private float sortWaveTimer;
    private float drawPileActiveAmount;
    private float discardPileActiveAmount;
    private float throwIntentAmount;
    private float drawPileRecoilTimer;
    private float discardSettleTimer;
    private float pendingPlayTargetX = 566f + PILE_WIDTH / 2f;
    private float pendingPlayTargetY = 220f + PILE_HEIGHT / 2f;
    private int pendingDrawInsertIndex = -1;
    private boolean discardVisualSyncDeferred;
    private boolean dragThrowArmed;
    private boolean draggingDrawCard;
    private boolean drawPullArmed;
    private boolean pendingDrawRequest;
    private boolean handSortAscending;
    private boolean jokerDeclarationOpen;
    private boolean jokerRankLocked;
    private boolean requestDeclarationOpen;
    private boolean panningHand;
    private boolean handPanCandidate;
    private boolean touchStartedInHandBand;
    private float requestPanelTimer;
    private float jokerPanelTimer;
    private float lobbyDealPreviewTimer;
    private float drawDragX;
    private float drawDragY;
    private float drawDragAngle;
    private float drawDragScale = 1f;
    private String jokerDeclarationRank = "2";
    private String jokerDeclarationSuit = "hearts";
    private String requestDeclarationType = "";
    private int drawPileCount = 41;
    private int previousDrawPileCount = -1;
    private int nextPrototypeCardId = 1;
    private float pendingNativeExitFinishTimer;
    private String pendingNativeExitAction = "";
    private String nativeStatusText = "Rozdawanie kart...";
    private String menuPlayerName = "Gracz";
    private String menuRoomName = "Stół";
    private String menuRoomCode = "";
    private String lastRoomId = "";
    private String lastRoomServerUrl = "";
    private String pendingReconnectRoomId = "";
    private String menuServerUrl = NativeGameConfig.DEFAULT_SERVER_URL;
    private String currentClientServerUrl = "";
    private String currentClientPlayerName = "";
    private String noticeText = "";
    private String pendingDiscardNoticeText = "";
    private String pendingLocalTurnNoticeText = "";
    private String previousTopCardId = "";
    private String previousActiveEffectText = "";
    private String lastMoveHistoryRoomKey = "";
    private String lastSeatAnimationRoomKey = "";
    private String lastHybridGameOverKey = "";
    private int lastMoveHistoryVersion;
    private String lastTurnEventsRoomKey = "";
    private int lastTurnEventsStateVersion;
    private String lastHybridTurnStatusKey = "";
    private float noticeTimer;
    private boolean noticeOnLeft = true;
    private boolean startScreenVisible;
    private boolean audioEnabled = true;
    private boolean hapticsEnabled = true;
    private boolean solidCardsEnabled = true;
    private StartPanel startPanel = StartPanel.CREATE;
    private boolean lobbySettingsOpen;
    private boolean leaveConfirmOpen;
    private boolean leaveConfirmInGame;
    private int lobbySettingsPage;
    private boolean textEditorOpen;
    private String textEditorTitle = "";
    private String textEditorText = "";
    private String textEditorHint = "";
    private NativeTextCommit textEditorCommit;
    private KeyboardMode textEditorMode = KeyboardMode.TEXT;
    private int textEditorMaxChars = 32;
    private boolean keyboardShift = true;
    private boolean keyboardSymbols;
    private float elapsed;

    private enum FeedbackIntent {
        DRAW,
        PLAY,
        LAND_DRAW,
        LAND_PLAY,
        LAND_REMOTE_DRAW,
        LAND_REMOTE_PLAY,
        ILLEGAL,
        REQUEST,
        MAKAO,
        SPECIAL,
        OPPONENT_EVENT,
        SORT,
        SHUFFLE,
        ARM_TICK
    }

    public MakaoGdxGame() {
        this(null, null);
    }

    public MakaoGdxGame(NativeGameConfig nativeConfig) {
        this(nativeConfig, null);
    }

    public MakaoGdxGame(NativeGameConfig nativeConfig, NativeFeedback feedback) {
        this(nativeConfig, feedback, null);
    }

    public MakaoGdxGame(NativeGameConfig nativeConfig, NativeFeedback feedback, NativeExitCallback nativeExitCallback) {
        this(nativeConfig, feedback, nativeExitCallback, null);
    }

    public MakaoGdxGame(
        NativeGameConfig nativeConfig,
        NativeFeedback feedback,
        NativeExitCallback nativeExitCallback,
        HybridOverlayEventCallback hybridOverlayEventCallback
    ) {
        this.nativeConfig = nativeConfig;
        this.feedback = feedback == null ? NativeFeedback.libGdxOnly() : feedback;
        this.nativeExitCallback = nativeExitCallback;
        this.hybridOverlayEventCallback = hybridOverlayEventCallback;
    }

    @Override
    public void create() {
        camera = new OrthographicCamera();
        viewport = new FitViewport(WORLD_WIDTH, WORLD_HEIGHT, camera);
        batch = new SpriteBatch();
        shapes = new ShapeRenderer();

        titleFont = loadUiFont("native/fonts/Kreon-Bold.ttf", 82, 1.1f);
        labelFont = loadUiFont("native/fonts/NotoSans-Bold.ttf", 20, 0.75f);
        messageFont = loadUiFont("native/fonts/NotoSans-Bold.ttf", 25, 0.75f);
        cardFont = loadUiFont("native/fonts/NotoSans-Bold.ttf", 27, 0.9f);
        loadNativePreferences();

        cardFrontTexture = createRoundedCardTexture(new Color(0.93f, 0.87f, 0.73f, 1f), new Color(0.22f, 0.14f, 0.09f, 1f), false);
        cardBackTexture = createRoundedCardTexture(new Color(0.11f, 0.19f, 0.29f, 1f), new Color(0.78f, 0.61f, 0.27f, 1f), true);
        glowTexture = createRoundedCardTexture(new Color(1f, 0.78f, 0.22f, 0.26f), new Color(1f, 0.86f, 0.42f, 0.92f), false);
        shadowTexture = createRoundedCardTexture(new Color(0f, 0f, 0f, 0.32f), new Color(0f, 0f, 0f, 0f), false);
        whitePixelTexture = createSolidTexture(Color.WHITE);
        heartIconTexture = createSuitTexture("hearts");
        diamondIconTexture = createSuitTexture("diamonds");
        clubIconTexture = createSuitTexture("clubs");
        spadeIconTexture = createSuitTexture("spades");
        loadGameplayIconRegions();
        tableBackgroundTexture = NativeTableSkin.loadTableBackground();
        homeBackgroundTexture = NativeTableSkin.loadHomeBackground();
        bubuBackTexture = NativeTableSkin.loadBubuDuduBack();
        cardAtlas = loadOptionalCardAtlas();

        tapSound = loadFirstOptionalSound("native/audio/card_function.ogg", "public/audio/native-tap.ogg");
        playSound = loadFirstOptionalSound("native/audio/card_throw.ogg", "public/audio/native-play.ogg");
        drawSound = loadFirstOptionalSound("native/audio/card_draw.ogg", "public/audio/native-draw.ogg");
        landSound = loadFirstOptionalSound("native/audio/card_land.ogg");
        sortSound = loadFirstOptionalSound("native/audio/deck_shuffle.ogg", "native/audio/card_function.ogg");
        shuffleSound = loadFirstOptionalSound("native/audio/deck_shuffle.ogg");
        illegalSound = loadFirstOptionalSound("native/audio/illegal_move.ogg");
        specialSound = loadFirstOptionalSound("native/audio/card_function.ogg");
        makaoSound = loadFirstOptionalSound("native/audio/makao.ogg", "native/audio/card_function.ogg");
        turnPingSound = loadFirstOptionalSound("native/audio/turn_ping.ogg", "native/audio/card_function.ogg");

        if (nativeConfig == null) {
            seedPrototypeTable();
        } else {
            clearTableStateForShell();
        }
        setupNativeClient();
        Gdx.input.setInputProcessor(this);
    }

    @Override
    public void resize(int width, int height) {
        viewport.update(width, height, true);
    }

    @Override
    public void render() {
        float delta = Math.min(Gdx.graphics.getDeltaTime(), 1f / 30f);
        elapsed += delta;

        updateNotice(delta);
        updateEventBubbles(delta);
        updateSeatAnimations(delta);
        updateChoicePanelAnimations(delta);
        updateShellAnimations(delta);
        updateNativeLeaveFinish(delta);
        updateHandInertia(delta);
        updatePileHighlights(delta);
        updateSortWave(delta);
        updateHandFocus(delta);
        updateCards(delta);
        updateFlights(delta);

        ScreenUtils.clear(0.035f, 0.055f, 0.07f, 1f);
        Gdx.gl.glEnable(GL20.GL_BLEND);
        Gdx.gl.glBlendFunc(GL20.GL_SRC_ALPHA, GL20.GL_ONE_MINUS_SRC_ALPHA);

        viewport.apply();
        batch.setProjectionMatrix(camera.combined);
        shapes.setProjectionMatrix(camera.combined);

        if (shouldShowNativeStartScreen()) {
            drawNativeStartScreen();
            drawNotice();
            drawLeaveConfirmOverlay();
            drawTextEditorOverlay();
            return;
        }

        if (shouldShowNativeLobbyScreen()) {
            drawNativeLobbyScreen();
            drawNotice();
            drawLeaveConfirmOverlay();
            drawTextEditorOverlay();
            return;
        }

        if (shouldShowNativeTableLoadingScreen()) {
            drawNativeTableLoadingScreen();
            drawNotice();
            return;
        }

        drawTable();
        drawPiles();
        drawActiveEffectBadge();
        drawHand();
        drawHandScrollIndicator();
        drawDraggedDrawCard();
        drawFlights();
        drawPassButton();
        drawMakaoButton();
        drawPlayerChips();
        drawEventBubbles();
        drawHud();
        drawNotice();
        drawGameLeaveButton();
        drawRequestDeclaration();
        drawJokerDeclaration();
        drawGameOverOverlay();
        drawLeaveConfirmOverlay();
        drawTextEditorOverlay();
    }

    private void seedPrototypeTable() {
        prototypeState = MakaoGameState.createPrototype();
        applyGameState(prototypeState);
        settleHandCardsToTargets();
    }

    private void clearTableStateForShell() {
        prototypeState = null;
        latestState = null;
        hand.clear();
        selectedCards.clear();
        selectedCard = null;
        draggedCard = null;
        discardTop = null;
        discardUnderCards.clear();
        latestLocalDiscardMove.clear();
        flights.clear();
        eventBubbles.clear();
        pendingPlayedCardIds.clear();
        catchMakaoBoundsByPlayer.clear();
        leaveConfirmOpen = false;
    }

    private void loadNativePreferences() {
        preferences = Gdx.app == null ? null : Gdx.app.getPreferences(PREFS_NAME);
        String configuredName = nativeConfig == null ? "Gracz" : nativeConfig.playerName;
        if (configuredName == null || configuredName.trim().isEmpty() || "Native".equals(configuredName.trim())) {
            configuredName = "Gracz";
        }
        String configuredServer = nativeConfig == null ? NativeGameConfig.DEFAULT_SERVER_URL : nativeConfig.serverUrl;

        if (preferences == null) {
            menuPlayerName = configuredName;
            menuRoomName = "Stół";
            menuServerUrl = configuredServer == null ? NativeGameConfig.DEFAULT_SERVER_URL : configuredServer;
            lastRoomId = "";
            lastRoomServerUrl = "";
            audioEnabled = true;
            hapticsEnabled = true;
            solidCardsEnabled = true;
        } else {
            int serverSettingsVersion = preferences.getInteger(PREF_SERVER_SETTINGS_VERSION, 0);
            boolean resetServerPreferences = serverSettingsVersion < SERVER_SETTINGS_VERSION
                || NativeGameConfig.isRetiredServer(preferences.getString(PREF_SERVER_URL, configuredServer));
            menuPlayerName = cleanPlayerName(preferences.getString(PREF_PLAYER_NAME, configuredName));
            menuRoomName = cleanRoomName(preferences.getString(PREF_ROOM_NAME, "Stół"));
            if (resetServerPreferences) {
                menuServerUrl = cleanServerUrl(configuredServer);
                lastRoomId = "";
                lastRoomServerUrl = "";
                preferences.putString(PREF_SERVER_URL, menuServerUrl);
                preferences.remove(PREF_LAST_ROOM_ID);
                preferences.remove(PREF_LAST_ROOM_SERVER_URL);
                preferences.putInteger(PREF_SERVER_SETTINGS_VERSION, SERVER_SETTINGS_VERSION);
                preferences.flush();
            } else {
                menuServerUrl = cleanServerUrl(preferences.getString(PREF_SERVER_URL, configuredServer));
                lastRoomId = cleanRoomCode(preferences.getString(PREF_LAST_ROOM_ID, ""));
                lastRoomServerUrl = cleanServerUrl(preferences.getString(PREF_LAST_ROOM_SERVER_URL, ""));
            }
            audioEnabled = preferences.getBoolean(PREF_AUDIO_ENABLED, true);
            hapticsEnabled = preferences.getBoolean(PREF_HAPTICS_ENABLED, true);
            solidCardsEnabled = preferences.getBoolean(PREF_SOLID_CARDS_ENABLED, true);
        }

        if (menuPlayerName.isEmpty()) menuPlayerName = "Gracz";
        if (menuRoomName.isEmpty()) menuRoomName = "Stół";
        if (menuServerUrl.isEmpty()) menuServerUrl = NativeGameConfig.DEFAULT_SERVER_URL;
        if (!lastRoomId.isEmpty() && lastRoomId.length() != 6) lastRoomId = "";
        if (!lastRoomId.isEmpty()) {
            if (lastRoomServerUrl.isEmpty()) lastRoomServerUrl = menuServerUrl;
            if (!safeEquals(lastRoomServerUrl, menuServerUrl)) {
                lastRoomId = "";
                lastRoomServerUrl = "";
            } else if (menuRoomCode.isEmpty()) {
                menuRoomCode = lastRoomId;
                startPanel = StartPanel.JOIN;
            }
        }
        startScreenVisible = nativeConfig != null
            && nativeConfig.debugScenario == null
            && nativeConfig.roomId == null;
        applyNativeFeedbackSettings();
    }

    private void saveNativePreferences() {
        if (preferences == null) return;
        preferences.putString(PREF_PLAYER_NAME, menuPlayerName);
        preferences.putString(PREF_ROOM_NAME, menuRoomName);
        preferences.putString(PREF_SERVER_URL, menuServerUrl);
        preferences.putInteger(PREF_SERVER_SETTINGS_VERSION, SERVER_SETTINGS_VERSION);
        preferences.putBoolean(PREF_AUDIO_ENABLED, audioEnabled);
        preferences.putBoolean(PREF_HAPTICS_ENABLED, hapticsEnabled);
        preferences.putBoolean(PREF_SOLID_CARDS_ENABLED, solidCardsEnabled);
        preferences.flush();
    }

    private void rememberLastRoom(MakaoRoomState roomState) {
        if (roomState == null || roomState.players == null || roomState.players.isEmpty()) return;
        String roomId = cleanRoomCode(roomState.id);
        if (roomId.length() != 6) return;
        String serverUrl = currentClientServerUrl == null || currentClientServerUrl.isEmpty()
            ? menuServerUrl
            : currentClientServerUrl;
        lastRoomId = roomId;
        lastRoomServerUrl = serverUrl;
        menuRoomCode = roomId;
        if (preferences == null) return;
        preferences.putString(PREF_LAST_ROOM_ID, lastRoomId);
        preferences.putString(PREF_LAST_ROOM_SERVER_URL, lastRoomServerUrl);
        preferences.flush();
    }

    private void clearLastRoom() {
        lastRoomId = "";
        lastRoomServerUrl = "";
        pendingReconnectRoomId = "";
        if (preferences == null) return;
        preferences.remove(PREF_LAST_ROOM_ID);
        preferences.remove(PREF_LAST_ROOM_SERVER_URL);
        preferences.flush();
    }

    private boolean isTerminalReconnectError(String message) {
        if (message == null) return false;
        String normalized = message.toLowerCase(Locale.ROOT);
        return normalized.contains("room not found")
            || normalized.contains("player session not found")
            || normalized.contains("już zakończona")
            || normalized.contains("already ended");
    }

    private void applyNativeFeedbackSettings() {
        if (feedback != null) feedback.setEnabled(hapticsEnabled);
    }

    private void settleHandCardsToTargets() {
        for (NativeCard card : hand) {
            card.x = card.targetX;
            card.y = card.targetY;
            card.angle = card.targetAngle;
            card.scale = card.targetScale;
        }
    }

    public void applyGameState(MakaoGameState state) {
        if (state == null) return;

        boolean hadPendingDrawRequest = pendingDrawRequest;
        draggingDrawCard = false;
        drawPullArmed = false;
        closeJokerDeclaration();
        closeRequestDeclaration();
        pendingLocalTurnNoticeText = "";
        latestState = state.copy();
        Map<String, NativeCard> previousCards = new HashMap<>();
        for (NativeCard card : hand) {
            previousCards.put(card.model.cardInstanceId, card);
        }
        startConfirmedLocalPlayFlights(state, previousCards);
        if (previousDrawPileCount == 0 && state.drawPileCount > 0) {
            showNotice("talia przetasowana");
            emitFeedback(FeedbackIntent.SHUFFLE);
        }
        previousDrawPileCount = state.drawPileCount;
        drawPileCount = state.drawPileCount;
        boolean moveHistoryEventShown = syncMoveHistoryAnimations(state);
        boolean turnEventShown = syncTurnEventBubbles(state);
        syncSeatAnimationState(state);
        boolean tableEventShown = moveHistoryEventShown || turnEventShown;
        nativeStatusText = humanGameStatus(state);
        if (!pendingLocalTurnNoticeText.isEmpty()) {
            nativeStatusText = pendingLocalTurnNoticeText;
        }
        emitHybridTurnStatus(state);
        boolean deferDiscardVisual = hasActiveDiscardFlightFor(state.topCard);
        String topCardId = state.topCard == null ? "" : state.topCard.cardInstanceId;
        if (!tableEventShown
            && !previousTopCardId.isEmpty()
            && !safeEquals(previousTopCardId, topCardId)
            && state.topCard != null
            && !isDeclaredJoker(state.topCard)) {
            String text = "stos " + state.topCard.tableLabel();
            if (isWebLaunchedNativeTable()) {
                pendingDiscardNoticeText = "";
            } else if (deferDiscardVisual) {
                pendingDiscardNoticeText = text;
            } else {
                showNotice(text);
            }
        }
        previousTopCardId = topCardId;

        previousActiveEffectText = activeEffectNoticeText(state);

        Array<String> selectedIds = selectedCardIds();
        hand.clear();
        selectedCard = null;
        selectedCards.clear();
        draggedCard = null;

        List<MakaoCard> orderedHand = orderedHand(state.myHand);
        List<String> fallbackDrawCardIds = fallbackDrawCardIdsForUnmarkedDraw(orderedHand, previousCards, hadPendingDrawRequest, state);
        boolean drawRequestObservedHandChange = !fallbackDrawCardIds.isEmpty()
            || handContainsCardId(orderedHand, state.drawnCardInstanceId);
        boolean drawRequestBoundToHandCard = false;
        boolean confirmedDrawFeedbackPending = false;
        for (MakaoCard model : orderedHand) {
            NativeCard card = previousCards.get(model.cardInstanceId);
            boolean newCard = card == null;
            if (card == null) {
                card = createNativeCard(model, drawPileBounds.x + drawPileBounds.width / 2f, drawPileBounds.y + drawPileBounds.height / 2f, 0.8f);
            } else {
                card.model = model;
            }
            int fallbackDrawIndex = fallbackDrawCardIds.indexOf(model.cardInstanceId);
            boolean shouldAnimateDraw = newCard && (
                shouldAnimateDrawnCard(model, state, hadPendingDrawRequest)
                    || fallbackDrawIndex >= 0
            );
            if (shouldAnimateDraw) {
                confirmedDrawFeedbackPending = bindDrawFlightToCard(
                    model,
                    card,
                    Math.max(0, fallbackDrawIndex)
                ) || confirmedDrawFeedbackPending;
                CardFlight drawFlight = findDrawFlightForCard(model.cardInstanceId);
                card.hiddenByFlight = drawFlight != null;
                drawRequestBoundToHandCard = drawRequestBoundToHandCard || drawFlight != null;
            } else if (card.hiddenByFlight && findDrawFlightForCard(model.cardInstanceId) == null) {
                card.hiddenByFlight = false;
            }
            hand.add(card);
            if (selectedIds.contains(model.cardInstanceId, false)) {
                selectedCards.add(card);
            }
        }
        selectedCard = selectedCards.size > 0 ? selectedCards.peek() : null;
        if (!state.allowMultipleCards && selectedCards.size > 1) {
            while (selectedCards.size > 1) selectedCards.removeIndex(1);
            selectedCard = selectedCards.first();
        }
        if (pendingPlayedCardIds.size > 0 && !hasPendingCardsInHand(state)) {
            pendingPlayedCardIds.clear();
        }

        if (deferDiscardVisual) {
            discardVisualSyncDeferred = true;
        } else {
            syncDiscardVisual(state);
        }

        layoutHandTargets();
        syncDrawFlightsToHandTargets();
        if (confirmedDrawFeedbackPending) {
            emitFeedback(FeedbackIntent.DRAW);
        }
        if (hadPendingDrawRequest) {
            boolean stillPending = !(drawRequestBoundToHandCard || drawRequestObservedHandChange);
            pendingDrawRequest = stillPending;
            if (!stillPending && !drawRequestBoundToHandCard) {
                clearDrawInsertSlot();
            }
        }
        emitHybridGameOverIfNeeded(state);
    }

    public void handleHybridOverlayCommand(String command, String payloadJson) {
        if (command == null) return;
        Runnable action = () -> handleHybridOverlayCommandOnGameThread(command.trim(), payloadJson);
        if (Gdx.app != null) {
            Gdx.app.postRunnable(action);
        } else {
            action.run();
        }
    }

    private void handleHybridOverlayCommandOnGameThread(String command, String payloadJson) {
        if (command == null || command.isEmpty()) return;
        if ("refresh_session".equals(command)) {
            if (nativeClient == null) {
                showSessionRefreshResult(false, "Brak aktywnego połączenia ze stołem.");
                return;
            }
            nativeClient.refreshSession();
            return;
        }
        if ("leave_room".equals(command)) {
            leaveConfirmInGame = true;
            leaveConfirmOpen = false;
            leaveCurrentNativeRoom();
            return;
        }
        if ("return_lobby".equals(command)) {
            if (nativeClient != null && nativeClient.hasRoom()) {
                if (!canRequestRematch()) {
                    showNotice("Rewanż uruchamia host");
                    return;
                }
                nativeClient.returnToLobby();
                return;
            }
            scheduleNativeLobbyReturn();
            return;
        }
        if ("choose_joker".equals(command)) {
            handleHybridJokerChoice(payloadJson);
            return;
        }
        if ("choose_suit_request".equals(command)) {
            handleHybridRequestChoice("suit", payloadJson);
            return;
        }
        if ("choose_rank_request".equals(command)) {
            handleHybridRequestChoice("rank", payloadJson);
            return;
        }
        if ("dismiss_popup".equals(command)) {
            leaveConfirmOpen = false;
            closeJokerDeclaration();
            closeRequestDeclaration();
        }
    }

    private void handleHybridJokerChoice(String payloadJson) {
        if (!jokerDeclarationOpen) return;
        JSONObject payload = parseHybridPayload(payloadJson);
        String rank = payload.optString("rank", "");
        String suit = payload.optString("suit", "");
        if (!containsValue(JOKER_RANKS, rank)
            || !containsValue(JOKER_SUITS, suit)
            || !NativePlayRules.isJokerRankAllowed(activeJokerResponseEffectType(), rank)) {
            showIllegalNotice("Nieprawidłowy joker");
            emitHybridJokerChoiceOpen();
            return;
        }
        if (jokerRankLocked && !safeEquals(rank, jokerDeclarationRank)) {
            showIllegalNotice("Wartość jokera zablokowana");
            emitHybridJokerChoiceOpen();
            return;
        }
        jokerDeclarationRank = rank;
        jokerDeclarationSuit = suit;
        confirmJokerDeclaration();
    }

    private void handleHybridRequestChoice(String expectedType, String payloadJson) {
        if (!requestDeclarationOpen || !safeEquals(expectedType, requestDeclarationType)) return;
        JSONObject payload = parseHybridPayload(payloadJson);
        String value = payload.optString("value", "none");
        if (!isValidRequestChoice(expectedType, value)) {
            showIllegalNotice("Nieprawidłowe żądanie");
            emitHybridRequestChoiceOpen();
            return;
        }
        confirmRequestDeclaration(value);
    }

    private JSONObject parseHybridPayload(String payloadJson) {
        if (payloadJson == null || payloadJson.trim().isEmpty()) return new JSONObject();
        try {
            return new JSONObject(payloadJson);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private List<String> fallbackDrawCardIdsForUnmarkedDraw(List<MakaoCard> orderedHand, Map<String, NativeCard> previousCards, boolean hadPendingDrawRequest, MakaoGameState state) {
        ArrayList<String> newCardIds = new ArrayList<>();
        if (!hadPendingDrawRequest || state == null || state.drawnCardInstanceId != null) {
            return newCardIds;
        }
        for (MakaoCard model : orderedHand) {
            String id = cardOrderId(model);
            if (id == null || previousCards.containsKey(id)) continue;
            newCardIds.add(id);
        }
        return newCardIds;
    }

    private boolean handContainsCardId(List<MakaoCard> cards, String cardInstanceId) {
        if (cards == null || cardInstanceId == null) return false;
        for (MakaoCard card : cards) {
            if (card != null && cardInstanceId.equals(card.cardInstanceId)) return true;
        }
        return false;
    }

    private void syncDiscardVisual(MakaoGameState state) {
        discardVisualSyncDeferred = false;
        if (state == null || state.topCard == null) {
            discardTop = null;
            discardUnderCards.clear();
            return;
        }

        if (discardTop != null && discardTop.model != null && sameCardIdentity(discardTop.model, state.topCard)) {
            discardTop.model = state.topCard;
        } else {
            discardTop = createNativeCard(
                state.topCard,
                discardTopVisualX(false),
                discardTopVisualY(false),
                1f
            );
        }
        rebuildDiscardUnderCards(discardUnderModels(state));
        applyDiscardTopVisualLayout(true);
        if (!pendingDiscardNoticeText.isEmpty()) {
            if (!isWebLaunchedNativeTable()) {
                showNotice(pendingDiscardNoticeText);
            }
            pendingDiscardNoticeText = "";
        }
    }

    private List<MakaoCard> orderedHand(List<MakaoCard> source) {
        if (handSortAscending && pendingDrawInsertIndex < 0) {
            List<MakaoCard> sorted = sortedHand(source);
            syncHandOrderIds(sorted);
            return sorted;
        }

        Map<String, MakaoCard> cardsById = new HashMap<>();
        ArrayList<String> sourceIds = new ArrayList<>();
        ArrayList<MakaoCard> cardsWithoutIds = new ArrayList<>();
        for (MakaoCard card : source) {
            String id = cardOrderId(card);
            if (id == null) {
                cardsWithoutIds.add(card);
            } else {
                cardsById.put(id, card);
                sourceIds.add(id);
            }
        }

        ArrayList<String> nextOrder = new ArrayList<>();
        for (String id : handOrderIds) {
            if (cardsById.containsKey(id) && !nextOrder.contains(id)) {
                nextOrder.add(id);
            }
        }

        ArrayList<String> newIds = new ArrayList<>();
        for (String id : sourceIds) {
            if (!nextOrder.contains(id)) {
                newIds.add(id);
            }
        }

        if (!newIds.isEmpty()) {
            int insertAt = pendingDrawInsertIndex >= 0
                ? MathUtils.clamp(pendingDrawInsertIndex, 0, nextOrder.size())
                : nextOrder.size();
            for (String id : newIds) {
                nextOrder.add(insertAt, id);
                insertAt++;
            }
            if (pendingDrawInsertIndex >= 0) {
                handSortAscending = false;
                pendingDrawInsertIndex = -1;
            }
        }

        ArrayList<MakaoCard> ordered = new ArrayList<>();
        for (String id : nextOrder) {
            MakaoCard card = cardsById.get(id);
            if (card != null) ordered.add(card);
        }
        ordered.addAll(cardsWithoutIds);
        syncHandOrderIds(ordered);
        return ordered;
    }

    private List<MakaoCard> sortedHand(List<MakaoCard> source) {
        ArrayList<MakaoCard> sorted = new ArrayList<>(source);
        sorted.sort(Comparator
            .comparingInt((MakaoCard card) -> rankSortValue(card))
            .thenComparingInt(this::suitSortValue)
            .thenComparing(card -> card.cardInstanceId == null ? "" : card.cardInstanceId));
        return sorted;
    }

    private void syncHandOrderIds(List<MakaoCard> orderedCards) {
        handOrderIds.clear();
        for (MakaoCard card : orderedCards) {
            String id = cardOrderId(card);
            if (id != null) handOrderIds.add(id);
        }
    }

    private String cardOrderId(MakaoCard card) {
        return card == null || card.cardInstanceId == null ? null : card.cardInstanceId;
    }

    private int rankSortValue(MakaoCard card) {
        if (card == null || card.rank == null) return -1;
        if (MakaoCard.RANK_JOKER.equals(card.rank)) return 15;
        if ("ace".equals(card.rank)) return 14;
        if ("king".equals(card.rank)) return 13;
        if ("queen".equals(card.rank)) return 12;
        if ("jack".equals(card.rank)) return 11;
        try {
            return Integer.parseInt(card.rank);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private int suitSortValue(MakaoCard card) {
        if (card == null || card.suit == null) return 99;
        for (int i = 0; i < JOKER_SUITS.length; i++) {
            if (JOKER_SUITS[i].equals(card.suit)) return i;
        }
        return 99;
    }

    private List<MakaoCard> discardUnderModels(MakaoGameState state) {
        List<MakaoCard> serverTail = serverDiscardUnderModels(state);
        if (!serverTail.isEmpty()) return serverTail;

        ArrayList<MakaoCard> nearFirst = new ArrayList<>();
        appendSameMoveUnderCardsNearFirst(state, nearFirst);
        appendHistoryUnderCardsNearFirst(state, nearFirst);
        while (nearFirst.size() > DISCARD_UNDER_VISIBLE_COUNT) {
            nearFirst.remove(nearFirst.size() - 1);
        }
        Collections.reverse(nearFirst);
        return nearFirst;
    }

    private List<MakaoCard> serverDiscardUnderModels(MakaoGameState state) {
        ArrayList<MakaoCard> models = new ArrayList<>();
        if (state == null || state.discardPileTail == null || state.discardPileTail.isEmpty()) {
            return models;
        }
        int start = Math.max(0, state.discardPileTail.size() - DISCARD_UNDER_VISIBLE_COUNT);
        for (int i = start; i < state.discardPileTail.size(); i++) {
            MakaoCard card = state.discardPileTail.get(i);
            if (card != null) models.add(card);
        }
        return models;
    }

    private void appendSameMoveUnderCardsNearFirst(MakaoGameState state, ArrayList<MakaoCard> nearFirst) {
        if (state == null || state.topCard == null || state.moveHistory == null) return;
        for (int i = state.moveHistory.size() - 1; i >= 0; i--) {
            MakaoMoveEvent event = state.moveHistory.get(i);
            if (event == null || !"play_cards".equals(event.type) || event.details == null) continue;
            List<MakaoCard> played = event.details.playedCards;
            if (played == null || played.isEmpty()) continue;
            int topIndex = -1;
            for (int c = played.size() - 1; c >= 0; c--) {
                if (sameCardIdentity(played.get(c), state.topCard)) {
                    topIndex = c;
                    break;
                }
            }
            if (topIndex < 0) continue;
            for (int c = topIndex - 1; c >= 0; c--) {
                appendUniqueUnderModel(nearFirst, played.get(c), state.topCard);
            }
            return;
        }
    }

    private void appendHistoryUnderCardsNearFirst(MakaoGameState state, ArrayList<MakaoCard> nearFirst) {
        if (state == null || state.topCard == null || state.moveHistory == null) return;
        ArrayList<MakaoCard> recent = new ArrayList<>();
        for (MakaoMoveEvent event : state.moveHistory) {
            if (event == null || !"play_cards".equals(event.type) || event.details == null) continue;
            for (MakaoCard playedCard : event.details.playedCards) {
                recent.add(playedCard);
            }
        }
        int topIndex = -1;
        for (int i = recent.size() - 1; i >= 0; i--) {
            if (sameCardIdentity(recent.get(i), state.topCard)) {
                topIndex = i;
                break;
            }
        }
        if (topIndex < 0) return;
        for (int i = topIndex - 1; i >= 0 && nearFirst.size() < DISCARD_UNDER_VISIBLE_COUNT; i--) {
            appendUniqueUnderModel(nearFirst, recent.get(i), state.topCard);
        }
    }

    private void appendUniqueUnderModel(ArrayList<MakaoCard> target, MakaoCard card, MakaoCard topCard) {
        if (card == null || sameCardIdentity(card, topCard)) return;
        for (MakaoCard existing : target) {
            if (sameCardIdentity(existing, card)) return;
        }
        target.add(card);
    }

    private void rebuildDiscardUnderCards(List<MakaoCard> models) {
        discardUnderCards.clear();
        if (models == null || models.isEmpty()) return;
        int total = Math.min(DISCARD_UNDER_VISIBLE_COUNT, models.size());
        int start = Math.max(0, models.size() - total);
        for (int i = start; i < models.size(); i++) {
            MakaoCard model = models.get(i);
            if (model == null) continue;
            int visualIndex = i - start;
            float depth = total - visualIndex;
            NativeCard card = createNativeCard(
                model,
                discardCenterX() - depth * 42f,
                discardCenterY() - depth * 8f,
                0.98f
            );
            card.angle = -11f + visualIndex * 5f;
            card.targetAngle = card.angle;
            discardUnderCards.add(card);
        }
    }

    private boolean sameCardIdentity(MakaoCard a, MakaoCard b) {
        if (a == null || b == null) return false;
        if (a.cardInstanceId != null && b.cardInstanceId != null) {
            return a.cardInstanceId.equals(b.cardInstanceId);
        }
        return safeEquals(a.rank, b.rank) && safeEquals(a.suit, b.suit);
    }

    private void applyDiscardTopVisualLayout(boolean immediate) {
        if (discardTop == null) return;
        boolean fanned = discardUnderCards.size > 0;
        discardTop.targetX = discardTopVisualX(fanned);
        discardTop.targetY = discardTopVisualY(fanned);
        discardTop.targetAngle = fanned ? 5f : -3f;
        discardTop.targetScale = 1f;
        if (immediate) {
            discardTop.x = discardTop.targetX;
            discardTop.y = discardTop.targetY;
            discardTop.angle = discardTop.targetAngle;
            discardTop.scale = discardTop.targetScale;
        }
    }

    private float discardTopVisualX(boolean fanned) {
        return discardCenterX() + (fanned ? 32f : 0f);
    }

    private float discardTopVisualY(boolean fanned) {
        return discardCenterY() + (fanned ? 6f : 0f);
    }

    private MakaoCard findCardModelById(MakaoGameState state, String cardInstanceId) {
        if (state == null || cardInstanceId == null) return null;
        for (MakaoCard card : state.myHand) {
            if (cardInstanceId.equals(card.cardInstanceId)) return card;
        }
        return null;
    }

    private Array<String> selectedCardIds() {
        Array<String> ids = new Array<>();
        for (NativeCard card : selectedCards) {
            if (card != null && card.model != null) ids.add(card.model.cardInstanceId);
        }
        return ids;
    }

    private boolean hasPendingCardsInHand(MakaoGameState state) {
        for (String id : pendingPlayedCardIds) {
            if (findCardModelById(state, id) != null) return true;
        }
        return false;
    }

    private boolean startConfirmedLocalPlayFlights(MakaoGameState state, Map<String, NativeCard> previousCards) {
        if (state == null || pendingPlayedCardIds.size == 0 || hasPendingCardsInHand(state)) return false;

        Array<NativeCard> confirmedCards = new Array<>();
        for (String cardId : pendingPlayedCardIds) {
            NativeCard card = previousCards.get(cardId);
            if (card != null) confirmedCards.add(card);
        }
        pendingPlayedCardIds.clear();
        if (confirmedCards.size == 0) {
            latestLocalDiscardMove.clear();
            return false;
        }

        emitFeedback(FeedbackIntent.PLAY);
        int index = 0;
        for (NativeCard card : confirmedCards) {
            startThrowFlight(
                card,
                true,
                confirmedLocalDiscardModel(card.model),
                index++,
                confirmedCards.size
            );
        }
        latestLocalDiscardMove.clear();
        return true;
    }

    private MakaoCard confirmedLocalDiscardModel(MakaoCard fallback) {
        if (fallback == null || fallback.cardInstanceId == null) return fallback;
        for (MakaoCard card : latestLocalDiscardMove) {
            if (card != null && fallback.cardInstanceId.equals(card.cardInstanceId)) return card;
        }
        return fallback;
    }

    private boolean syncMoveHistoryAnimations(MakaoGameState state) {
        if (state == null) return false;
        String roomKey = state.roomId == null ? "prototype" : state.roomId;
        int newestVersion = newestMoveHistoryVersion(state);
        if (!safeEquals(lastMoveHistoryRoomKey, roomKey)) {
            lastMoveHistoryRoomKey = roomKey;
            lastMoveHistoryVersion = newestVersion;
            eventBubbles.clear();
            return false;
        }

        if (newestVersion < lastMoveHistoryVersion) {
            lastMoveHistoryVersion = newestVersion;
            eventBubbles.clear();
            return false;
        }

        if (newestVersion <= lastMoveHistoryVersion) return false;
        boolean realMoveShown = false;
        for (MakaoMoveEvent event : state.moveHistory) {
            if (event != null && event.version > lastMoveHistoryVersion) {
                startMoveHistoryFlights(state, event);
                realMoveShown = showMoveEventBubbles(state, event) || realMoveShown;
            }
        }
        lastMoveHistoryVersion = newestVersion;
        return realMoveShown;
    }

    private int newestMoveHistoryVersion(MakaoGameState state) {
        int newest = 0;
        if (state == null) return newest;
        for (MakaoMoveEvent event : state.moveHistory) {
            if (event != null) newest = Math.max(newest, event.version);
        }
        return newest;
    }

    private boolean syncTurnEventBubbles(MakaoGameState state) {
        if (state == null) return false;
        String roomKey = state.roomId == null ? "prototype" : state.roomId;
        if (!safeEquals(lastTurnEventsRoomKey, roomKey)) {
            lastTurnEventsRoomKey = roomKey;
            lastTurnEventsStateVersion = state.stateVersion;
            return false;
        }

        if (state.stateVersion <= lastTurnEventsStateVersion) return false;
        boolean shown = false;
        boolean localPauseNoticeShown = false;
        for (MakaoMoveEvent event : state.turnEvents) {
            if (event == null || !isVisibleTurnEvent(event)) continue;
            if (!localPauseNoticeShown && showLocalPauseTurnNotice(state, event)) {
                localPauseNoticeShown = true;
                shown = true;
            }
            if (turnEventHasVisiblePlayer(state, event)) {
                shown = showMoveEventBubbles(state, event) || shown;
            }
        }
        lastTurnEventsStateVersion = state.stateVersion;
        return shown;
    }

    private boolean isVisibleTurnEvent(MakaoMoveEvent event) {
        return isPauseTurnEvent(event) || isFinishTurnEvent(event);
    }

    private boolean isPauseTurnEvent(MakaoMoveEvent event) {
        if (event == null || event.type == null) return false;
        return "skip_added".equals(event.type)
            || "skip_used".equals(event.type)
            || "skip_finished".equals(event.type)
            || "skip_accepted".equals(event.type)
            || ("host_forced_effect".equals(event.type)
                && event.details != null
                && "skip_turn".equals(event.details.effectType));
    }

    private boolean showLocalPauseTurnNotice(MakaoGameState state, MakaoMoveEvent event) {
        if (!isLocalPauseTurnEvent(state, event)) return false;
        String text = localPauseTurnNoticeText(state, event);
        if (text.isEmpty()) return false;
        pendingLocalTurnNoticeText = text;
        showNotice(text, FeedbackIntent.OPPONENT_EVENT);
        return true;
    }

    private boolean isLocalPauseTurnEvent(MakaoGameState state, MakaoMoveEvent event) {
        if (state == null || state.myPlayerId == null || !isPauseTurnEvent(event)) return false;
        String pausePlayerId = event == null || event.details == null ? null : event.details.targetPlayerId;
        if (pausePlayerId == null && event != null) pausePlayerId = event.playerId;
        return safeEquals(state.myPlayerId, pausePlayerId);
    }

    private String localPauseTurnNoticeText(MakaoGameState state, MakaoMoveEvent event) {
        if (event == null || event.type == null) return "";
        int totalTurns = Math.max(1, localPauseEventTotalTurns(event));
        int remainingTurns = event.details == null ? 0 : Math.max(0, event.details.remaining);
        if ("skip_added".equals(event.type) || "skip_used".equals(event.type)) {
            if (totalTurns > 1) return "Przebili Cię: czekasz " + turnCountLabel(totalTurns);
            return "Pauza: tracisz turę";
        }
        if ("skip_accepted".equals(event.type)) {
            return remainingTurns > 0
                ? "Pauza: jeszcze " + turnCountLabel(remainingTurns)
                : pauseResolvedTurnText(state, event, "Pauza przyjęta");
        }
        if ("skip_finished".equals(event.type)) return pauseResolvedTurnText(state, event, "Pauza minęła");
        if ("host_forced_effect".equals(event.type)) return "Pauza: czekasz " + turnCountLabel(totalTurns);
        return "";
    }

    private String pauseResolvedTurnText(MakaoGameState state, MakaoMoveEvent event, String prefix) {
        String nextPlayerId = event == null || event.details == null ? null : event.details.nextPlayerId;
        if (nextPlayerId == null && event != null) nextPlayerId = event.currentPlayerId;
        if ((nextPlayerId == null || nextPlayerId.isEmpty()) && state != null) nextPlayerId = state.currentPlayerId;
        if (state != null && safeEquals(nextPlayerId, state.myPlayerId)) return prefix + ": Twoja tura";
        String nextName = state == null ? "" : compactPlayerName(state, nextPlayerId);
        if (!nextName.isEmpty() && !"?".equals(nextName)) return prefix + ": teraz " + nextName;
        return prefix + ": czekaj";
    }

    private int localPauseEventTotalTurns(MakaoMoveEvent event) {
        if (event == null || event.details == null) return 1;
        return Math.max(Math.max(1, event.details.amount), event.details.remaining);
    }

    private boolean isFinishTurnEvent(MakaoMoveEvent event) {
        if (event == null || event.type == null) return false;
        return "player_finished".equals(event.type) || "game_over".equals(event.type);
    }

    private boolean turnEventHasVisiblePlayer(MakaoGameState state, MakaoMoveEvent event) {
        if (event == null) return false;
        if (isFinishTurnEvent(event)) return event.playerId != null && findPlayerById(state, event.playerId) != null;
        if (isOpponentPlayer(state, event.playerId)) return true;
        return event.details != null && isOpponentPlayer(state, event.details.targetPlayerId);
    }

    private void startMoveHistoryFlights(MakaoGameState state, MakaoMoveEvent event) {
        emitConfirmedLocalMoveFeedback(state, event);
        boolean revealTable = startOpponentPlayFlights(state, event);
        revealTable = startOpponentDrawFlights(state, event) || revealTable;
        if (revealTable) {
            tableRevealHoldTimer = Math.max(tableRevealHoldTimer, HAND_TABLE_REVEAL_HOLD_SECONDS);
        }
    }

    private void emitConfirmedLocalMoveFeedback(MakaoGameState state, MakaoMoveEvent event) {
        if (state == null
            || event == null
            || event.playerId == null
            || !event.playerId.equals(state.myPlayerId)) {
            return;
        }
        if ("declare_makao".equals(event.type) || "catch_makao".equals(event.type)) {
            emitFeedback(FeedbackIntent.MAKAO);
        }
    }

    private boolean showMoveEventBubbles(MakaoGameState state, MakaoMoveEvent event) {
        if (state == null || event == null || !isEventBubbleMove(event)) return false;
        boolean shown = false;
        triggerSeatImpactForEvent(event);

        String actorText = eventBubbleText(state, event);
        BadgeTone tone = eventBubbleTone(event);
        if (!actorText.isEmpty() && isOpponentPlayer(state, event.playerId)) {
            eventBubbles.add(new EventBubble(
                event.playerId,
                actorText,
                tone,
                eventBubbleDuration(),
                eventBubbleIconKind(event),
                eventBubbleIconCard(event),
                eventBubbleIconAmount(event)
            ));
            shown = true;
        }

        if ("catch_makao".equals(event.type)
            && event.details != null
            && event.details.targetPlayerId != null
            && !safeEquals(event.details.targetPlayerId, event.playerId)
            && isOpponentPlayer(state, event.details.targetPlayerId)) {
            int amount = Math.max(1, event.details.amount);
            eventBubbles.add(new EventBubble(
                event.details.targetPlayerId,
                compactPlayerName(state, event.details.targetPlayerId) + " Makao +" + amount,
                BadgeTone.PENALTY,
                eventBubbleDuration(),
                EventBubbleIconKind.PENALTY,
                null,
                amount
            ));
            shown = true;
        }

        if ("host_forced_effect".equals(event.type)
            && event.details != null
            && "draw_penalty".equals(event.details.effectType)
            && !safeEquals(event.details.targetPlayerId, event.playerId)
            && isOpponentPlayer(state, event.details.targetPlayerId)) {
            int amount = Math.max(1, event.details.amount);
            eventBubbles.add(new EventBubble(
                event.details.targetPlayerId,
                compactPlayerName(state, event.details.targetPlayerId) + " +" + amount,
                BadgeTone.PENALTY,
                eventBubbleDuration(),
                EventBubbleIconKind.PENALTY,
                null,
                amount
            ));
            shown = true;
        }

        if ("host_forced_effect".equals(event.type)
            && event.details != null
            && "skip_turn".equals(event.details.effectType)
            && !safeEquals(event.details.targetPlayerId, event.playerId)
            && isOpponentPlayer(state, event.details.targetPlayerId)) {
            eventBubbles.add(new EventBubble(
                event.details.targetPlayerId,
                skipAcceptedText(state, event, event.details.targetPlayerId),
                BadgeTone.PAUSE,
                eventBubbleDuration(),
                EventBubbleIconKind.PAUSE,
                null,
                Math.max(1, event.details.amount)
            ));
            shown = true;
        }

        trimEventBubbles();
        return shown;
    }

    private void trimEventBubbles() {
        while (eventBubbles.size > 7) {
            eventBubbles.removeIndex(0);
        }
    }

    private void triggerSeatImpactForEvent(MakaoMoveEvent event) {
        if (event == null || event.type == null) return;
        if ("accept_penalty".equals(event.type)) {
            triggerSeatImpact(event.playerId, BadgeTone.PENALTY);
        } else if ("catch_makao".equals(event.type)) {
            if (event.details != null) triggerSeatImpact(event.details.targetPlayerId, BadgeTone.PENALTY);
            triggerSeatImpact(event.playerId, BadgeTone.REQUEST);
        } else if ("accept_skip".equals(event.type)
            || "skip_added".equals(event.type)
            || "skip_used".equals(event.type)
            || "skip_finished".equals(event.type)
            || "skip_accepted".equals(event.type)) {
            triggerSeatImpact(event.playerId, BadgeTone.PAUSE);
        } else if ("host_forced_effect".equals(event.type) && event.details != null) {
            if ("draw_penalty".equals(event.details.effectType)) {
                triggerSeatImpact(event.details.targetPlayerId, BadgeTone.PENALTY);
            } else if ("skip_turn".equals(event.details.effectType)) {
                triggerSeatImpact(event.details.targetPlayerId, BadgeTone.PAUSE);
            }
        } else if ("declare_makao".equals(event.type)) {
            triggerSeatImpact(event.playerId, BadgeTone.REQUEST);
        } else if ("player_finished".equals(event.type) || "game_over".equals(event.type)) {
            triggerSeatImpact(event.playerId, BadgeTone.REQUEST);
        } else if ("play_cards".equals(event.type)) {
            triggerSeatImpact(event.playerId, BadgeTone.DEFAULT);
        }
    }

    private boolean isEventBubbleMove(MakaoMoveEvent event) {
        if (event == null || event.type == null) return false;
        return "play_cards".equals(event.type)
            || "draw_card".equals(event.type)
            || "accept_penalty".equals(event.type)
            || "accept_skip".equals(event.type)
            || "skip_added".equals(event.type)
            || "skip_used".equals(event.type)
            || "skip_finished".equals(event.type)
            || "skip_accepted".equals(event.type)
            || "declare_makao".equals(event.type)
            || "catch_makao".equals(event.type)
            || "player_finished".equals(event.type)
            || "game_over".equals(event.type)
            || "pass_turn".equals(event.type)
            || "host_forced_effect".equals(event.type);
    }

    private String eventBubbleText(MakaoGameState state, MakaoMoveEvent event) {
        if (event == null || event.type == null || event.details == null) return "";
        String name = compactPlayerName(state, event.playerId);
        if ("play_cards".equals(event.type)) {
            if (isRequestResolutionEvent(event)) return name + " spełnia";
            int count = event.details.playedCards.size();
            if (count <= 0) return name + " karta";
            MakaoCard card = event.details.playedCards.get(count - 1);
            if (count > 1) return name + " ×" + count;
            if (card != null && MakaoCard.RANK_JOKER.equals(card.rank) && card.jokerDeclaration != null) {
                return name + " joker";
            }
            return name + " karta";
        }
        if ("draw_card".equals(event.type)) {
            if (isRequestResolutionEvent(event)) return name + " pas";
            int count = Math.max(1, event.details.drawnCount);
            if (event.details.canPlayDrawnCard) return name + " decyduje";
            return name + " + " + count;
        }
        if ("accept_penalty".equals(event.type)) {
            int amount = Math.max(Math.max(1, event.details.amount), event.details.drawnCount);
            return name + " +" + amount;
        }
        if ("accept_skip".equals(event.type)) return skipAcceptedText(state, event, event.playerId);
        if ("skip_added".equals(event.type)) {
            int remaining = Math.max(Math.max(1, event.details.remaining), event.details.amount);
            return name + " " + pauseTag(remaining);
        }
        if ("skip_used".equals(event.type)) {
            int remaining = Math.max(0, event.details.remaining);
            return skipAcceptedText(state, event, event.playerId, remaining);
        }
        if ("skip_finished".equals(event.type)) {
            return skipAcceptedText(state, event, event.playerId);
        }
        if ("skip_accepted".equals(event.type)) {
            int remaining = Math.max(0, event.details.remaining);
            return skipAcceptedText(state, event, event.playerId, remaining);
        }
        if ("declare_makao".equals(event.type)) return name + " MAKAO";
        if ("catch_makao".equals(event.type)) return name + " ZŁAP";
        if ("player_finished".equals(event.type)) return name + " skończył";
        if ("game_over".equals(event.type)) return name + " wygrał";
        if ("pass_turn".equals(event.type) && isRequestResolutionEvent(event)) return name + " pas";
        if ("pass_turn".equals(event.type)) return name + " pas";
        if ("host_forced_effect".equals(event.type) && "draw_penalty".equals(event.details.effectType)) {
            int amount = Math.max(1, event.details.amount);
            return name + " +" + amount;
        }
        if ("host_forced_effect".equals(event.type) && "skip_turn".equals(event.details.effectType)) return "";
        return "";
    }

    private EventBubbleIconKind eventBubbleIconKind(MakaoMoveEvent event) {
        if (event == null || event.type == null) return EventBubbleIconKind.NONE;
        if (isRequestResolutionEvent(event)) return EventBubbleIconKind.REQUEST;
        if ("play_cards".equals(event.type)) {
            MakaoCard card = eventBubbleIconCard(event);
            return card != null && MakaoCard.RANK_JOKER.equals(card.rank)
                ? EventBubbleIconKind.JOKER
                : EventBubbleIconKind.CARD;
        }
        if ("draw_card".equals(event.type)) return EventBubbleIconKind.DRAW;
        if ("accept_penalty".equals(event.type)) return EventBubbleIconKind.PENALTY;
        if ("accept_skip".equals(event.type)
            || "skip_added".equals(event.type)
            || "skip_used".equals(event.type)
            || "skip_finished".equals(event.type)
            || "skip_accepted".equals(event.type)) {
            return EventBubbleIconKind.PAUSE;
        }
        if ("declare_makao".equals(event.type)) return EventBubbleIconKind.MAKAO;
        if ("catch_makao".equals(event.type)) return EventBubbleIconKind.CATCH;
        if ("player_finished".equals(event.type) || "game_over".equals(event.type)) return EventBubbleIconKind.MAKAO;
        if ("pass_turn".equals(event.type)) return EventBubbleIconKind.PASS;
        if ("host_forced_effect".equals(event.type) && event.details != null) {
            if ("draw_penalty".equals(event.details.effectType)) return EventBubbleIconKind.PENALTY;
            if ("skip_turn".equals(event.details.effectType)) return EventBubbleIconKind.PAUSE;
        }
        return EventBubbleIconKind.NONE;
    }

    private MakaoCard eventBubbleIconCard(MakaoMoveEvent event) {
        if (isRequestResolutionEvent(event)) return requestResolutionIconCard(event);
        if (event == null || event.details == null || event.details.playedCards.isEmpty()) return null;
        return event.details.playedCards.get(event.details.playedCards.size() - 1);
    }

    private int eventBubbleIconAmount(MakaoMoveEvent event) {
        if (event == null || event.details == null) return 0;
        if ("draw_card".equals(event.type)) return Math.max(1, event.details.drawnCount);
        if ("accept_penalty".equals(event.type)) return Math.max(Math.max(1, event.details.amount), event.details.drawnCount);
        if ("accept_skip".equals(event.type)
            || "skip_added".equals(event.type)
            || "skip_used".equals(event.type)
            || "skip_finished".equals(event.type)
            || "skip_accepted".equals(event.type)) {
            return Math.max(Math.max(1, event.details.amount), event.details.remaining);
        }
        if ("host_forced_effect".equals(event.type)) return Math.max(1, event.details.amount);
        return 0;
    }

    private String skipAcceptedText(MakaoGameState state, MakaoMoveEvent event, String pausePlayerId) {
        return skipAcceptedText(state, event, pausePlayerId, -1);
    }

    private String skipAcceptedText(MakaoGameState state, MakaoMoveEvent event, String pausePlayerId, int remaining) {
        String name = compactPlayerName(state, pausePlayerId);
        int amount = Math.max(event == null || event.details == null ? 0 : event.details.amount, 1);
        String text = name + " " + pauseTag(remaining >= 0 ? remaining : amount);
        String nextPlayerId = event == null || event.details == null ? null : event.details.nextPlayerId;
        if (nextPlayerId == null && event != null) nextPlayerId = event.currentPlayerId;
        String nextName = compactPlayerName(state, nextPlayerId);
        if (!nextName.isEmpty() && !"?".equals(nextName) && !safeEquals(nextName, name)) {
            text += " → " + nextName;
        }
        return text;
    }

    private BadgeTone eventBubbleTone(MakaoMoveEvent event) {
        if (event == null || event.type == null) return BadgeTone.DEFAULT;
        if (isRequestResolutionEvent(event)) return BadgeTone.REQUEST;
        if ("accept_penalty".equals(event.type) || "catch_makao".equals(event.type)) return BadgeTone.PENALTY;
        if ("accept_skip".equals(event.type)
            || "skip_added".equals(event.type)
            || "skip_used".equals(event.type)
            || "skip_finished".equals(event.type)
            || "skip_accepted".equals(event.type)) {
            return BadgeTone.PAUSE;
        }
        if ("declare_makao".equals(event.type)) return BadgeTone.REQUEST;
        if ("player_finished".equals(event.type) || "game_over".equals(event.type)) return BadgeTone.REQUEST;
        if ("host_forced_effect".equals(event.type) && event.details != null && "draw_penalty".equals(event.details.effectType)) {
            return BadgeTone.PENALTY;
        }
        return BadgeTone.DEFAULT;
    }

    private boolean isRequestResolutionEvent(MakaoMoveEvent event) {
        return event != null
            && event.details != null
            && ("suit_request".equals(event.details.resolvedEffectType)
                || "rank_request".equals(event.details.resolvedEffectType));
    }

    private MakaoCard requestResolutionIconCard(MakaoMoveEvent event) {
        if (event == null || event.details == null) return null;
        if ("suit_request".equals(event.details.resolvedEffectType)) {
            return MakaoCard.create("request_resolved_suit", null, event.details.resolvedSuitRequest);
        }
        if ("rank_request".equals(event.details.resolvedEffectType)) {
            return MakaoCard.create("request_resolved_rank", event.details.resolvedRankRequest, null);
        }
        return null;
    }

    private boolean isOpponentPlayer(MakaoGameState state, String playerId) {
        return state != null
            && playerId != null
            && !playerId.equals(state.myPlayerId)
            && findPlayerById(state, playerId) != null;
    }

    private MakaoPlayer findPlayerById(MakaoGameState state, String playerId) {
        if (state == null || playerId == null) return null;
        for (MakaoPlayer player : state.players) {
            if (player != null && playerId.equals(player.id)) return player;
        }
        return null;
    }

    private ArrayList<MakaoPlayer> opponentPlayers(MakaoGameState state) {
        ArrayList<MakaoPlayer> opponents = new ArrayList<>();
        if (state == null) return opponents;
        for (MakaoPlayer player : state.players) {
            if (player == null || player.id.equals(state.myPlayerId)) continue;
            int duplicateIndex = findOpponentDuplicateIndex(state, opponents, player);
            if (duplicateIndex < 0) {
                opponents.add(player);
            } else if (isBetterOpponentSeat(state, player, opponents.get(duplicateIndex))) {
                opponents.set(duplicateIndex, player);
            }
        }
        return opponents;
    }

    private int findOpponentDuplicateIndex(MakaoGameState state, ArrayList<MakaoPlayer> opponents, MakaoPlayer candidate) {
        if (candidate == null) return -1;
        for (int i = 0; i < opponents.size(); i++) {
            MakaoPlayer player = opponents.get(i);
            if (player != null && candidate.id.equals(player.id)) return i;
        }
        String candidateKey = opponentDedupeKey(state, candidate);
        if (candidateKey.isEmpty()) return -1;
        for (int i = 0; i < opponents.size(); i++) {
            if (candidateKey.equals(opponentDedupeKey(state, opponents.get(i)))) return i;
        }
        return -1;
    }

    private String opponentDedupeKey(MakaoGameState state, MakaoPlayer player) {
        if (player == null) return "";
        String name = normalizedOpponentName(player);
        if (!name.isEmpty()) {
            return "name:" + name + ":cards:" + playerHandCount(state, player);
        }
        return player.id == null || player.id.isEmpty() ? "" : "id:" + player.id;
    }

    private String normalizedOpponentName(MakaoPlayer player) {
        if (player == null || player.name == null) return "";
        String clean = player.name.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty() || clean.equals(player.id)) return "";
        return clean.toLowerCase(java.util.Locale.ROOT);
    }

    private boolean isBetterOpponentSeat(MakaoGameState state, MakaoPlayer candidate, MakaoPlayer current) {
        if (candidate == null) return false;
        if (current == null) return true;
        boolean candidateCurrent = candidate.id.equals(state.currentPlayerId);
        boolean currentCurrent = current.id.equals(state.currentPlayerId);
        if (candidateCurrent != currentCurrent) return candidateCurrent;
        boolean candidateTarget = candidate.id.equals(state.activeEffectTargetPlayerId);
        boolean currentTarget = current.id.equals(state.activeEffectTargetPlayerId);
        if (candidateTarget != currentTarget) return candidateTarget;
        boolean candidateGameData = hasPlayerGameData(state, candidate.id);
        boolean currentGameData = hasPlayerGameData(state, current.id);
        if (candidateGameData != currentGameData) return candidateGameData;
        return isRealDisplayName(candidate) && !isRealDisplayName(current);
    }

    private boolean hasPlayerGameData(MakaoGameState state, String playerId) {
        return state != null
            && playerId != null
            && (state.handCounts.containsKey(playerId)
                || state.pauseTurnsByPlayer.containsKey(playerId)
                || state.makaoByPlayer.containsKey(playerId)
                || state.missingMakaoByPlayer.containsKey(playerId));
    }

    private boolean isRealDisplayName(MakaoPlayer player) {
        return player != null
            && player.name != null
            && !player.name.isEmpty()
            && !player.name.equals(player.id);
    }

    private float eventBubbleDuration() {
        return nativeConfig != null && nativeConfig.debugScenario != null ? 7.5f : 2.9f;
    }

    private boolean startOpponentPlayFlights(MakaoGameState state, MakaoMoveEvent event) {
        if (event == null || !"play_cards".equals(event.type)) return false;
        if (event.playerId == null || event.playerId.equals(state.myPlayerId)) return false;
        if (event.details == null || event.details.playedCards.isEmpty()) return false;

        Rectangle seat = opponentSeatBoundsForPlayer(state, event.playerId);
        if (seat == null) return false;

        int count = Math.min(3, event.details.playedCards.size());
        boolean started = false;
        for (int i = 0; i < count; i++) {
            MakaoCard publicCard = event.details.playedCards.get(i);
            if (publicCard == null) continue;
            MakaoCard flightModel = new MakaoCard(
                "opponent_move_" + event.version + "_" + i,
                publicCard.rank,
                publicCard.suit,
                publicCard.jokerDeclaration
            );
            NativeCard card = createNativeCard(
                flightModel,
                opponentSeatCardX(seat) + i * 5f,
                opponentSeatCardY(seat) + i * 2f,
                0.44f
            );
            CardFlight flight = new CardFlight(card, true);
            flight.landingDiscardModel = publicCard;
            flight.landingDiscardCardInstanceId = publicCard.cardInstanceId;
            flight.startX = card.x;
            flight.startY = card.y;
            flight.startAngle = -8f + i * 5f;
            flight.startScale = card.scale;
            flight.endX = discardTopVisualX(true) + MathUtils.random(-7f, 7f) + i * 3f;
            flight.endY = discardTopVisualY(true) + MathUtils.random(-5f, 6f) + i * 2f;
            flight.endAngle = MathUtils.random(-7f, 7f);
            flight.endScale = 1.08f;
            flight.duration = 0.42f + i * 0.055f;
            flight.arc = 72f + i * 8f;
            flight.startDelay = i * 0.045f;
            flight.silentLanding = i < count - 1;
            flight.landFeedbackIntent = FeedbackIntent.LAND_REMOTE_PLAY;
            flight.tableRevealFlight = true;
            flights.add(flight);
            started = true;
        }
        if (started) emitFeedback(FeedbackIntent.OPPONENT_EVENT);
        return started;
    }

    private boolean startOpponentDrawFlights(MakaoGameState state, MakaoMoveEvent event) {
        if (event == null || event.details == null) return false;
        String targetPlayerId = opponentDrawTargetPlayerId(event);
        if (targetPlayerId == null || targetPlayerId.equals(state.myPlayerId)) return false;
        int cardCount = opponentDrawAnimationCount(event);
        if (cardCount <= 0) return false;

        Rectangle seat = opponentSeatBoundsForPlayer(state, targetPlayerId);
        if (seat == null) return false;

        int visibleCount = Math.min(6, cardCount);
        float drawX = drawPileBounds.x + drawPileBounds.width / 2f;
        float drawY = drawPileBounds.y + drawPileBounds.height / 2f;
        float seatX = opponentSeatCardX(seat);
        float seatY = opponentSeatCardY(seat);
        for (int i = 0; i < visibleCount; i++) {
            NativeCard card = createNativeCard(
                MakaoCard.create("opponent_draw_" + event.version + "_" + i, "?", null),
                drawX + MathUtils.random(-3f, 3f),
                drawY + MathUtils.random(-3f, 3f),
                0.54f
            );
            CardFlight flight = new CardFlight(card, false);
            flight.faceDown = true;
            flight.startX = card.x;
            flight.startY = card.y;
            flight.startAngle = MathUtils.random(-4f, 4f);
            flight.startScale = card.scale;
            flight.detachX = drawX + MathUtils.random(-9f, 11f);
            flight.detachY = drawY + MathUtils.random(18f, 27f);
            flight.detachAngle = flight.startAngle + MathUtils.random(-5f, 5f);
            flight.detachScale = card.scale * 1.05f;
            flight.endX = seatX + Math.min(i, 3) * 5f;
            flight.endY = seatY + Math.min(i, 3) * 1.8f;
            flight.endAngle = -7f + Math.min(i, 3) * 4f;
            flight.endScale = 0.46f;
            flight.duration = 0.56f + Math.min(i, 2) * 0.035f;
            flight.arc = 74f + Math.min(i, 3) * 7f;
            flight.startDelay = i * 0.075f;
            flight.silentLanding = i < visibleCount - 1;
            flight.landFeedbackIntent = FeedbackIntent.LAND_REMOTE_DRAW;
            flight.tableRevealFlight = true;
            flights.add(flight);
        }
        emitFeedback(FeedbackIntent.OPPONENT_EVENT);
        return true;
    }

    private String opponentDrawTargetPlayerId(MakaoMoveEvent event) {
        if ("draw_card".equals(event.type) || "accept_penalty".equals(event.type)) return event.playerId;
        if ("catch_makao".equals(event.type)) return event.details.targetPlayerId;
        if ("host_forced_effect".equals(event.type) && "draw_penalty".equals(event.details.effectType)) {
            return event.details.targetPlayerId;
        }
        return null;
    }

    private int opponentDrawAnimationCount(MakaoMoveEvent event) {
        if ("draw_card".equals(event.type)) return Math.max(1, event.details.drawnCount);
        if ("accept_penalty".equals(event.type)) return Math.max(event.details.amount, event.details.drawnCount);
        if ("catch_makao".equals(event.type)) return Math.max(1, event.details.amount);
        if ("host_forced_effect".equals(event.type) && "draw_penalty".equals(event.details.effectType)) {
            return Math.max(1, event.details.amount);
        }
        return 0;
    }

    private Rectangle opponentSeatBoundsForPlayer(MakaoGameState state, String playerId) {
        if (state == null || playerId == null) return null;
        MakaoPlayer requestedPlayer = findPlayerById(state, playerId);
        String requestedKey = opponentDedupeKey(state, requestedPlayer);
        ArrayList<MakaoPlayer> opponents = opponentPlayers(state);
        int count = Math.min(7, opponents.size());
        for (int i = 0; i < count; i++) {
            MakaoPlayer player = opponents.get(i);
            if (playerId.equals(player.id) || (!requestedKey.isEmpty() && requestedKey.equals(opponentDedupeKey(state, player)))) {
                return opponentSeatBounds(i, count);
            }
        }
        return null;
    }

    private boolean shouldAnimateDrawnCard(MakaoCard model, MakaoGameState state, boolean hadPendingDrawRequest) {
        if (model == null || model.cardInstanceId == null) return false;
        if (findDrawFlightForCard(model.cardInstanceId) != null) return true;
        return hadPendingDrawRequest
            && state != null
            && state.drawnCardInstanceId != null
            && model.cardInstanceId.equals(state.drawnCardInstanceId);
    }

    private boolean bindDrawFlightToCard(MakaoCard model, NativeCard card, int drawStackIndex) {
        if (model == null || card == null) return false;
        CardFlight flight = findDrawFlightForCard(model.cardInstanceId);
        boolean authoritativeCommit = false;
        if (flight == null) {
            flight = findUnboundDrawFlight();
        }
        if (flight == null) {
            startDrawFlightToHand(model, drawStackIndex);
            flight = findDrawFlightForCard(model.cardInstanceId);
            authoritativeCommit = flight != null;
        } else if (flight.landingCardInstanceId == null || flight.awaitingAuthoritativeState) {
            authoritativeCommit = true;
        }
        if (flight == null) return false;
        flight.landingCardInstanceId = model.cardInstanceId;
        flight.revealModel = model;
        flight.flipToFace = true;
        flight.awaitingAuthoritativeState = false;
        flight.startDelay = Math.max(flight.startDelay, NativeCardMotion.drawStartDelaySeconds(drawStackIndex));
        flight.silentLanding = drawStackIndex > 0;
        return authoritativeCommit;
    }

    private CardFlight findDrawFlightForCard(String cardInstanceId) {
        if (cardInstanceId == null) return null;
        for (int i = flights.size - 1; i >= 0; i--) {
            CardFlight flight = flights.get(i);
            if (flight != null
                && isLocalDrawFlight(flight)
                && cardInstanceId.equals(flight.landingCardInstanceId)) {
                return flight;
            }
        }
        return null;
    }

    private CardFlight findUnboundDrawFlight() {
        for (int i = flights.size - 1; i >= 0; i--) {
            CardFlight flight = flights.get(i);
            if (isLocalDrawFlight(flight) && flight.landingCardInstanceId == null) {
                return flight;
            }
        }
        return null;
    }

    private void syncDrawFlightsToHandTargets() {
        for (CardFlight flight : flights) {
            if (!isLocalDrawFlight(flight) || flight.landingCardInstanceId == null) continue;
            NativeCard landingCard = findHandCardById(flight.landingCardInstanceId);
            if (landingCard == null) continue;
            flight.endX = landingCard.targetX;
            flight.endY = landingCard.targetY + 10f;
            flight.endAngle = landingCard.targetAngle;
            flight.endScale = landingCard.targetScale;
        }
    }

    private boolean isLocalDrawFlight(CardFlight flight) {
        return flight != null && flight.faceDown && !flight.toDiscard && !flight.tableRevealFlight;
    }

    private void cancelNewestUnboundLocalDrawFlight() {
        for (int i = flights.size - 1; i >= 0; i--) {
            CardFlight flight = flights.get(i);
            if (isLocalDrawFlight(flight) && flight.landingCardInstanceId == null) {
                flights.removeIndex(i);
                return;
            }
        }
    }

    private void setupNativeClient() {
        if (nativeConfig == null) return;
        if (nativeConfig.debugScenario != null) {
            applyDebugScenario(nativeConfig.debugScenario);
            return;
        }
        String initialRoomId = nativeConfig.roomId == null ? lastRoomId : nativeConfig.roomId;
        boolean reconnectLastRoom = nativeConfig.roomId == null && initialRoomId != null && !initialRoomId.isEmpty();
        String initialServerUrl = nativeConfig.roomId == null ? menuServerUrl : nativeConfig.serverUrl;
        String initialPlayerName = nativeConfig.roomId == null ? menuPlayerName : nativeConfig.playerName;
        pendingReconnectRoomId = reconnectLastRoom ? initialRoomId : "";
        NativeGameConfig initialConfig = new NativeGameConfig(
            initialServerUrl,
            initialRoomId,
            initialPlayerName,
            nativeConfig.clientId,
            null,
            reconnectLastRoom,
            nativeConfig.hostManagedTable,
            nativeConfig.resumeToken
        );
        connectNativeClient(initialConfig);
    }

    private void connectNativeClient(NativeGameConfig config) {
        if (config == null) return;
        if (nativeClient != null) {
            nativeClient.disconnect();
        }
        currentClientServerUrl = config.serverUrl;
        currentClientPlayerName = config.playerName;
        pendingReconnectRoomId = config.reconnectSession && config.roomId != null
            ? cleanRoomCode(config.roomId)
            : "";
        nativeClient = new NativeGameClient(config, new NativeGameClient.Listener() {
            @Override
            public void onStatus(String message) {
                postToGameThread(() -> {
                    trace("status " + message);
                    nativeStatusText = message;
                });
            }

            @Override
            public void onRoomState(MakaoRoomState roomState) {
                postToGameThread(() -> {
                    trace("room status=" + (roomState == null ? "null" : roomState.status)
                        + " players=" + (roomState == null || roomState.players == null ? 0 : roomState.players.size()));
                    nativeRoomState = roomState;
                    if (roomState == null) {
                        startScreenVisible = !isWebLaunchedNativeTable();
                        clearTableStateForShell();
                        nativeStatusText = "Poza stołem";
                        return;
                    }
                    pendingReconnectRoomId = "";
                    rememberLastRoom(roomState);
                    if (roomState != null && roomState.id != null && !roomState.id.isEmpty()) {
                        startScreenVisible = false;
                    }
                    if (isWebLaunchedNativeTable() && roomState != null && roomState.isLobby()) {
                        nativeStatusText = "Wracam do lobby…";
                        scheduleNativeLobbyReturn();
                        clearTableStateForShell();
                        return;
                    }
                    if (roomState != null && roomState.isLobby()) {
                        clearTableStateForShell();
                    }
                    nativeStatusText = roomState.label(nativeConfig.clientId);
                });
            }

            @Override
            public void onGameState(MakaoGameState gameState) {
                postToGameThread(() -> {
                    trace("game " + stateDebug(gameState));
                    prototypeState = null;
                    nativeStatusText = gameState.buildStatusText();
                    applyGameState(gameState);
                });
            }

            @Override
            public void onError(String message) {
                postToGameThread(() -> {
                    trace("server_error " + message);
                    pendingPlayedCardIds.clear();
                    cancelNewestUnboundLocalDrawFlight();
                    pendingDrawRequest = false;
                    clearDrawInsertSlot();
                    draggingDrawCard = false;
                    drawPullArmed = false;
                    closeJokerDeclaration();
                    closeRequestDeclaration();
                    boolean reconnectFailed = !pendingReconnectRoomId.isEmpty();
                    boolean terminalReconnectFailure = reconnectFailed && isTerminalReconnectError(message);
                    boolean returningToTable = !terminalReconnectFailure && isConnectionRecoveryNotice(message);
                    String notice = returningToTable
                        ? STATUS_RETURNING_TO_TABLE
                        : (terminalReconnectFailure
                            ? "Ostatni stół " + pendingReconnectRoomId + " niedostępny"
                            : serverErrorNotice(message));
                    if (terminalReconnectFailure) {
                        clearLastRoom();
                    }
                    nativeStatusText = notice;
                    if (!returningToTable) {
                        showNotice(notice, FeedbackIntent.ILLEGAL);
                    }
                    layoutHandTargets();
                    if (isWebLaunchedNativeTable() && latestState == null) {
                        scheduleNativeLobbyReturn();
                    }
                });
            }

            @Override
            public void onSessionRefreshResult(boolean success, String message) {
                postToGameThread(() -> showSessionRefreshResult(success, message));
            }

            @Override
            public void onLeaveConfirmed() {
                postToGameThread(() -> {
                    clearLastRoom();
                    nativeStatusText = "Poza stołem";
                    scheduleNativeLeaveReturn();
                });
            }
        }, createNativeSessionPersistence());
        nativeStatusText = config.roomId == null ? "Łączenie…" : STATUS_RETURNING_TO_TABLE;
        nativeClient.connect();
    }

    private NativeSessionPersistence createNativeSessionPersistence() {
        if (preferences == null) return null;
        return new NativeSessionPersistence(new NativeSessionPersistence.Store() {
            @Override
            public String getString(String key) {
                return preferences.getString(key, null);
            }

            @Override
            public void putString(String key, String value) {
                preferences.putString(key, value);
                preferences.flush();
            }

            @Override
            public void remove(String key) {
                preferences.remove(key);
                preferences.flush();
            }
        });
    }

    private boolean ensureMenuClientConnected() {
        if (nativeConfig == null || nativeConfig.debugScenario != null) return false;
        boolean needsClient = nativeClient == null
            || !safeEquals(currentClientServerUrl, menuServerUrl)
            || !safeEquals(currentClientPlayerName, menuPlayerName);
        if (needsClient) {
            NativeGameConfig config = new NativeGameConfig(menuServerUrl, null, menuPlayerName, nativeConfig.clientId);
            connectNativeClient(config);
            return false;
        }
        if (!nativeClient.isConnected()) {
            nativeStatusText = "Łączenie…";
            nativeClient.connect();
            return false;
        }
        return true;
    }

    private void applyDebugScenario(String scenarioName) {
        String scenario = scenarioName == null ? "" : scenarioName.trim().toLowerCase();
        MathUtils.random.setSeed(1337L);
        nativeClient = null;
        nativeRoomState = null;
        pendingPlayedCardIds.clear();
        selectedCards.clear();
        selectedCard = null;
        tableRevealHoldTimer = 0f;
        handFocusHoldTimer = 0f;
        seatHandPopTimers.clear();
        seatImpactTimers.clear();
        seatImpactTones.clear();
        closeJokerDeclaration();
        closeRequestDeclaration();

        if ("ace_request_panel".equals(scenario)) {
            applyDebugPanelScenario(scenario, "debug_ace_spades", "ace", "spades", "suit");
        } else if ("jack_request_panel".equals(scenario)) {
            applyDebugPanelScenario(scenario, "debug_jack_clubs", "jack", "clubs", "rank");
        } else if ("joker_declaration_panel".equals(scenario)) {
            applyDebugJokerScenario(scenario);
        } else if ("joker_skip_response_panel".equals(scenario)) {
            applyDebugJokerSkipResponseScenario(scenario);
        } else if ("own_missing_makao".equals(scenario)) {
            applyDebugOwnMissingMakaoScenario(scenario);
        } else if ("opponent_catch_makao".equals(scenario)) {
            applyDebugOpponentCatchScenario(scenario);
        } else if ("opponent_play_history".equals(scenario)) {
            applyDebugOpponentPlayHistoryScenario(scenario);
        } else if ("opponent_draw_history".equals(scenario)) {
            applyDebugOpponentDrawHistoryScenario(scenario, false);
        } else if ("opponent_penalty_history".equals(scenario)) {
            applyDebugOpponentDrawHistoryScenario(scenario, true);
        } else if ("opponent_skip_history".equals(scenario)) {
            applyDebugOpponentSkipHistoryScenario(scenario);
        } else if ("opponent_skip_added_history".equals(scenario)) {
            applyDebugOpponentSkipAddedHistoryScenario(scenario);
        } else if ("opponent_catch_history".equals(scenario)) {
            applyDebugOpponentCatchHistoryScenario(scenario);
        } else if ("opponent_request_pass_history".equals(scenario)) {
            applyDebugOpponentRequestResolutionScenario(scenario, true);
        } else if ("opponent_request_resolve_history".equals(scenario)) {
            applyDebugOpponentRequestResolutionScenario(scenario, false);
        } else if ("local_draw_from_deck".equals(scenario)) {
            applyDebugLocalDrawScenario(scenario);
        } else if ("local_throw_to_stack".equals(scenario)) {
            applyDebugLocalThrowScenario(scenario);
        } else if ("manual_throw_gesture".equals(scenario)) {
            applyDebugManualThrowGestureScenario(scenario);
        } else if ("multi_opponent_table".equals(scenario)) {
            applyDebugMultiOpponentTableScenario(scenario);
        } else if ("multi_opponent_bubbles".equals(scenario)) {
            applyDebugMultiOpponentBubblesScenario(scenario);
        } else if ("hand_focus_reveal".equals(scenario)) {
            applyDebugHandFocusRevealScenario(scenario);
        } else if ("hand_idle_peek".equals(scenario)) {
            applyDebugHandIdlePeekScenario(scenario);
        } else if ("sort_hand".equals(scenario)) {
            applyDebugSortHandScenario(scenario);
        } else if ("game_over".equals(scenario)) {
            applyDebugGameOverScenario(scenario);
        } else if (scenario.startsWith("badge_")) {
            applyDebugBadgeScenario(scenario);
        } else {
            MakaoGameState state = debugBaseState("debug_default");
            state.statusText = "Debug: nieznany scenariusz";
            prototypeState = state;
            applyGameState(state);
        }
    }

    private MakaoGameState debugBaseState(String scenario) {
        MakaoGameState state = new MakaoGameState();
        state.roomId = "DEBUG_" + scenario;
        state.myPlayerId = "local";
        state.currentPlayerId = "local";
        state.currentPlayerName = "Ty";
        state.stateVersion = 1;
        state.drawPileCount = 40;
        state.discardPileCount = 1;
        state.hasDrawnCardThisTurn = false;
        state.drawnCardInstanceId = null;
        state.topCard = MakaoCard.create("debug_top_8_diamonds", "8", "diamonds");
        state.players.add(new MakaoPlayer("local", "Ty", true, true, true));
        state.players.add(new MakaoPlayer("opponent", "Rywal", false, true, true));
        state.handCounts.put("local", 0);
        state.handCounts.put("opponent", 5);
        state.statusText = "Debug: " + scenario;
        addDebugDiscardHistory(state, MakaoCard.create("debug_stack_6_clubs", "6", "clubs"));
        addDebugDiscardHistory(state, MakaoCard.create("debug_stack_queen_hearts", "queen", "hearts"));
        addDebugDiscardHistory(state, state.topCard);
        state.moveHistory.add(new MakaoMoveEvent(
            1,
            "game_started",
            null,
            "local",
            state.topCard,
            new MakaoMoveDetails()
        ));
        return state;
    }

    private void addDebugDiscardHistory(MakaoGameState state, MakaoCard card) {
        MakaoMoveDetails details = new MakaoMoveDetails();
        details.playedCards.add(card);
        state.moveHistory.add(new MakaoMoveEvent(
            0,
            "play_cards",
            "history",
            state.currentPlayerId,
            card,
            details
        ));
    }

    private void applyDebugGameOverScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.gameOver = true;
        state.winnerId = "opponent";
        state.currentPlayerId = null;
        state.handCounts.put("local", 3);
        state.handCounts.put("opponent", 0);
        state.statusText = state.buildStatusText();
        state.turnEvents.add(new MakaoMoveEvent(
            2,
            "player_finished",
            "opponent",
            null,
            state.topCard,
            new MakaoMoveDetails()
        ));
        state.turnEvents.add(new MakaoMoveEvent(
            3,
            "game_over",
            "opponent",
            null,
            state.topCard,
            new MakaoMoveDetails()
        ));
        prototypeState = state;
        applyGameState(state);
    }

    private void applyDebugPanelScenario(String scenario, String cardId, String rank, String suit, String requestType) {
        MakaoGameState state = debugBaseState(scenario);
        state.myHand.add(MakaoCard.create(cardId, rank, suit));
        state.myHand.add(MakaoCard.create("debug_10_hearts", "10", "hearts"));
        state.myHand.add(MakaoCard.create("debug_6_spades", "6", "spades"));
        state.handCounts.put("local", state.myHand.size());
        prototypeState = state;
        applyGameState(state);

        NativeCard card = findHandCardById(cardId);
        if (card == null) return;
        Array<NativeCard> cardsToPlay = new Array<>();
        cardsToPlay.add(card);
        selectedCards.clear();
        selectedCards.add(card);
        selectedCard = card;
        openRequestDeclaration(cardsToPlay, null, requestType);
    }

    private void applyDebugJokerScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.topCard = MakaoCard.create("debug_top_2_hearts", "2", "hearts");
        state.myHand.add(MakaoCard.create("debug_joker", "joker", null));
        state.myHand.add(MakaoCard.create("debug_7_hearts", "7", "hearts"));
        state.myHand.add(MakaoCard.create("debug_5_diamonds", "5", "diamonds"));
        state.handCounts.put("local", state.myHand.size());
        prototypeState = state;
        applyGameState(state);

        NativeCard joker = findHandCardById("debug_joker");
        if (joker == null) return;
        Array<NativeCard> cardsToPlay = new Array<>();
        cardsToPlay.add(joker);
        selectedCards.clear();
        selectedCards.add(joker);
        selectedCard = joker;
        openJokerDeclaration(cardsToPlay);
    }

    private void applyDebugJokerSkipResponseScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.topCard = MakaoCard.create("debug_skip_top_4_hearts", "4", "hearts");
        state.activeEffectType = "skip_turn";
        state.activeEffectTargetPlayerId = "local";
        state.activeEffectAmount = 2;
        state.activeEffectText = "4 x 2";
        state.myHand.add(MakaoCard.create("debug_skip_joker", "joker", null));
        state.myHand.add(MakaoCard.create("debug_skip_4_spades", "4", "spades"));
        state.myHand.add(MakaoCard.create("debug_skip_8_diamonds", "8", "diamonds"));
        state.handCounts.put("local", state.myHand.size());
        prototypeState = state;
        applyGameState(state);

        NativeCard joker = findHandCardById("debug_skip_joker");
        if (joker == null) return;
        Array<NativeCard> cardsToPlay = new Array<>();
        cardsToPlay.add(joker);
        selectedCards.clear();
        selectedCards.add(joker);
        selectedCard = joker;
        openJokerDeclaration(cardsToPlay);
    }

    private void applyDebugOwnMissingMakaoScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.currentPlayerId = "opponent";
        state.currentPlayerName = "Rywal";
        state.myHand.add(MakaoCard.create("debug_last_card", "5", "diamonds"));
        state.handCounts.put("local", 1);
        state.handCounts.put("opponent", 4);
        state.missingMakaoByPlayer.put("local", true);
        state.makaoCatchAtByPlayer.put("local", System.currentTimeMillis() + 60000L);
        prototypeState = state;
        applyGameState(state);
    }

    private void applyDebugOpponentCatchScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.currentPlayerId = "local";
        state.myHand.add(MakaoCard.create("debug_8_hearts", "8", "hearts"));
        state.myHand.add(MakaoCard.create("debug_9_spades", "9", "spades"));
        state.myHand.add(MakaoCard.create("debug_king_clubs", "king", "clubs"));
        state.handCounts.put("local", state.myHand.size());
        state.handCounts.put("opponent", 1);
        state.missingMakaoByPlayer.put("opponent", true);
        state.makaoCatchAtByPlayer.put("opponent", System.currentTimeMillis() - 1000L);
        prototypeState = state;
        applyGameState(state);
    }

    private void applyDebugSortHandScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.currentPlayerId = "local";
        state.myHand.add(MakaoCard.create("debug_sort_joker", "joker", null));
        state.myHand.add(MakaoCard.create("debug_sort_king_clubs", "king", "clubs"));
        state.myHand.add(MakaoCard.create("debug_sort_2_hearts", "2", "hearts"));
        state.myHand.add(MakaoCard.create("debug_sort_10_spades", "10", "spades"));
        state.myHand.add(MakaoCard.create("debug_sort_6_diamonds", "6", "diamonds"));
        state.handCounts.put("local", state.myHand.size());
        state.handCounts.put("opponent", 4);
        prototypeState = state;
        applyGameState(state);
    }

    private void applyDebugOpponentPlayHistoryScenario(String scenario) {
        MakaoGameState base = debugBaseState(scenario);
        base.currentPlayerId = "opponent";
        base.currentPlayerName = "Rywal";
        base.myHand.add(MakaoCard.create("debug_8_hearts", "8", "hearts"));
        base.myHand.add(MakaoCard.create("debug_10_spades", "10", "spades"));
        base.myHand.add(MakaoCard.create("debug_queen_clubs", "queen", "clubs"));
        base.handCounts.put("local", base.myHand.size());
        base.handCounts.put("opponent", 5);
        prototypeState = base;
        applyGameState(base);

        MakaoGameState next = base.copy();
        MakaoCard played = MakaoCard.create("debug_opponent_8_clubs", "8", "clubs");
        next.stateVersion = 2;
        next.currentPlayerId = "local";
        next.currentPlayerName = "Ty";
        next.topCard = played;
        next.handCounts.put("opponent", 4);
        MakaoMoveDetails details = new MakaoMoveDetails();
        details.playedCards.add(played);
        next.moveHistory.add(new MakaoMoveEvent(
            2,
            "play_cards",
            "opponent",
            "local",
            played,
            details
        ));
        prototypeState = next;
        applyGameState(next);
    }

    private void applyDebugHandFocusRevealScenario(String scenario) {
        applyDebugOpponentPlayHistoryScenario(scenario);
        tableRevealHoldTimer = HAND_DEBUG_REVEAL_HOLD_SECONDS;
        handFocusHoldTimer = 0f;
        handFocusAmount = 0f;
        layoutHandTargets();
    }

    private void applyDebugHandIdlePeekScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.currentPlayerId = "opponent";
        state.currentPlayerName = "Rywal";
        state.myHand.add(MakaoCard.create("debug_peek_8_hearts", "8", "hearts"));
        state.myHand.add(MakaoCard.create("debug_peek_10_spades", "10", "spades"));
        state.myHand.add(MakaoCard.create("debug_peek_queen_clubs", "queen", "clubs"));
        state.myHand.add(MakaoCard.create("debug_peek_3_diamonds", "3", "diamonds"));
        state.handCounts.put("local", state.myHand.size());
        state.handCounts.put("opponent", 4);
        prototypeState = state;
        applyGameState(state);
        tableRevealHoldTimer = 0f;
        handFocusHoldTimer = 0f;
        handFocusAmount = HAND_OPPONENT_PEEK_FOCUS;
        layoutHandTargets();
    }

    private void applyDebugLocalDrawScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.currentPlayerId = "local";
        state.currentPlayerName = "Ty";
        state.myHand.add(MakaoCard.create("debug_draw_8_hearts", "8", "hearts"));
        state.myHand.add(MakaoCard.create("debug_draw_10_spades", "10", "spades"));
        state.myHand.add(MakaoCard.create("debug_draw_queen_clubs", "queen", "clubs"));
        state.handCounts.put("local", state.myHand.size());
        state.handCounts.put("opponent", 4);
        prototypeState = state;
        applyGameState(state);
        settleHandCardsToTargets();

        drawDragX = WORLD_WIDTH / 2f;
        drawDragY = DRAW_RELEASE_Y;
        captureDrawInsertSlot();
        MakaoCard drawn = MakaoCard.create("debug_drawn_jack_hearts", "jack", "hearts");
        startDrawFlightToHand(drawn);
        delayNewestFlight(DEBUG_AUTO_MOTION_DELAY_SECONDS);
        state.drawPileCount = Math.max(0, state.drawPileCount - 1);
        state.addCardToHand(drawn);
        state.hasDrawnCardThisTurn = true;
        state.drawnCardInstanceId = drawn.cardInstanceId;
        state.statusText = "Debug: dobieranie z talii";
        prototypeState = state;
        applyGameState(state);
        layoutHandTargets();
    }

    private void applyDebugLocalThrowScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.currentPlayerId = "local";
        state.currentPlayerName = "Ty";
        state.myHand.add(MakaoCard.create("debug_throw_8_hearts", "8", "hearts"));
        state.myHand.add(MakaoCard.create("debug_throw_10_spades", "10", "spades"));
        state.myHand.add(MakaoCard.create("debug_throw_queen_clubs", "queen", "clubs"));
        state.handCounts.put("local", state.myHand.size());
        state.handCounts.put("opponent", 4);
        prototypeState = state;
        applyGameState(state);
        settleHandCardsToTargets();

        NativeCard card = findHandCardById("debug_throw_8_hearts");
        if (card == null) return;
        Array<NativeCard> cardsToPlay = new Array<>();
        cardsToPlay.add(card);
        selectedCards.clear();
        selectedCards.add(card);
        selectedCard = card;
        dragVelocityY = 760f;
        resetPendingPlayTargetToDiscardCenter();
        playCardsLocally(cardsToPlay, null);
        delayActiveDiscardFlights(DEBUG_AUTO_MOTION_DELAY_SECONDS);
    }

    private void applyDebugManualThrowGestureScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.currentPlayerId = "local";
        state.currentPlayerName = "Ty";
        state.myHand.add(MakaoCard.create("debug_manual_throw_8_hearts", "8", "hearts"));
        state.myHand.add(MakaoCard.create("debug_manual_throw_10_spades", "10", "spades"));
        state.myHand.add(MakaoCard.create("debug_manual_throw_queen_clubs", "queen", "clubs"));
        state.handCounts.put("local", state.myHand.size());
        state.handCounts.put("opponent", 4);
        state.statusText = "Debug: ręczny gest rzutu";
        prototypeState = state;
        applyGameState(state);
        settleHandCardsToTargets();
        handFocusHoldTimer = HAND_DEBUG_REVEAL_HOLD_SECONDS;
        layoutHandTargets();
    }

    private void applyDebugOpponentDrawHistoryScenario(String scenario, boolean penalty) {
        MakaoGameState base = debugBaseState(scenario);
        base.currentPlayerId = "opponent";
        base.currentPlayerName = "Rywal";
        base.myHand.add(MakaoCard.create("debug_8_hearts", "8", "hearts"));
        base.myHand.add(MakaoCard.create("debug_10_spades", "10", "spades"));
        base.myHand.add(MakaoCard.create("debug_queen_clubs", "queen", "clubs"));
        base.handCounts.put("local", base.myHand.size());
        base.handCounts.put("opponent", penalty ? 3 : 5);
        prototypeState = base;
        applyGameState(base);

        int count = penalty ? 5 : 1;
        MakaoGameState next = base.copy();
        next.stateVersion = 2;
        next.currentPlayerId = penalty ? "local" : "opponent";
        next.currentPlayerName = penalty ? "Ty" : "Rywal";
        next.drawPileCount = Math.max(0, next.drawPileCount - count);
        next.handCounts.put("opponent", Math.max(0, next.handCounts.get("opponent")) + count);
        MakaoMoveDetails details = new MakaoMoveDetails();
        details.drawnCount = count;
        details.amount = penalty ? count : 0;
        details.canPlayDrawnCard = !penalty;
        next.moveHistory.add(new MakaoMoveEvent(
            2,
            penalty ? "accept_penalty" : "draw_card",
            "opponent",
            next.currentPlayerId,
            next.topCard,
            details
        ));
        prototypeState = next;
        applyGameState(next);
    }

    private void applyDebugOpponentSkipHistoryScenario(String scenario) {
        MakaoGameState base = debugBaseState(scenario);
        base.currentPlayerId = "opponent";
        base.currentPlayerName = "Rywal";
        base.topCard = MakaoCard.create("debug_top_4_hearts", "4", "hearts");
        base.activeEffectType = "skip_turn";
        base.activeEffectTargetPlayerId = "opponent";
        base.activeEffectAmount = 2;
        base.activeEffectText = "4 x 2";
        base.myHand.add(MakaoCard.create("debug_8_hearts", "8", "hearts"));
        base.myHand.add(MakaoCard.create("debug_10_spades", "10", "spades"));
        base.myHand.add(MakaoCard.create("debug_queen_clubs", "queen", "clubs"));
        base.handCounts.put("local", base.myHand.size());
        base.handCounts.put("opponent", 4);
        prototypeState = base;
        applyGameState(base);

        MakaoGameState next = base.copy();
        next.stateVersion = 2;
        next.currentPlayerId = "local";
        next.currentPlayerName = "Ty";
        next.activeEffectType = null;
        next.activeEffectTargetPlayerId = null;
        next.activeEffectAmount = 0;
        next.activeEffectText = null;
        MakaoMoveDetails details = new MakaoMoveDetails();
        details.amount = 2;
        details.nextPlayerId = "local";
        next.moveHistory.add(new MakaoMoveEvent(
            2,
            "accept_skip",
            "opponent",
            "local",
            next.topCard,
            details
        ));
        prototypeState = next;
        applyGameState(next);
    }

    private void applyDebugOpponentSkipAddedHistoryScenario(String scenario) {
        MakaoGameState base = debugBaseState(scenario);
        base.currentPlayerId = "local";
        base.currentPlayerName = "Ty";
        base.topCard = MakaoCard.create("debug_top_4_hearts", "4", "hearts");
        base.myHand.add(MakaoCard.create("debug_skip_added_8_hearts", "8", "hearts"));
        base.myHand.add(MakaoCard.create("debug_skip_added_10_spades", "10", "spades"));
        base.handCounts.put("local", base.myHand.size());
        base.handCounts.put("opponent", 4);
        prototypeState = base;
        applyGameState(base);

        MakaoGameState next = base.copy();
        next.stateVersion = 2;
        next.pauseTurnsByPlayer.put("opponent", 2);
        MakaoMoveDetails details = new MakaoMoveDetails();
        details.remaining = 2;
        details.nextPlayerId = "local";
        next.turnEvents.add(new MakaoMoveEvent(
            "debug_skip_added",
            0,
            "skip_added",
            "opponent",
            "local",
            next.topCard,
            details
        ));
        prototypeState = next;
        applyGameState(next);
    }

    private void applyDebugOpponentCatchHistoryScenario(String scenario) {
        MakaoGameState base = debugBaseState(scenario);
        base.currentPlayerId = "local";
        base.currentPlayerName = "Ty";
        base.myHand.add(MakaoCard.create("debug_8_hearts", "8", "hearts"));
        base.myHand.add(MakaoCard.create("debug_9_spades", "9", "spades"));
        base.myHand.add(MakaoCard.create("debug_king_clubs", "king", "clubs"));
        base.handCounts.put("local", base.myHand.size());
        base.handCounts.put("opponent", 1);
        prototypeState = base;
        applyGameState(base);

        MakaoGameState next = base.copy();
        next.stateVersion = 2;
        next.currentPlayerId = "opponent";
        next.currentPlayerName = "Rywal";
        next.handCounts.put("local", base.myHand.size() + 5);
        MakaoMoveDetails details = new MakaoMoveDetails();
        details.amount = 5;
        details.targetPlayerId = "local";
        next.moveHistory.add(new MakaoMoveEvent(
            2,
            "catch_makao",
            "opponent",
            "opponent",
            next.topCard,
            details
        ));
        prototypeState = next;
        applyGameState(next);
    }

    private void applyDebugOpponentRequestResolutionScenario(String scenario, boolean drawPass) {
        MakaoGameState base = debugBaseState(scenario);
        configureDebugCrowdedTable(base);
        String actorId = drawPass ? "p2" : "p4";
        String sourceId = "p1";
        base.currentPlayerId = actorId;
        base.currentPlayerName = base.resolvePlayerName(actorId);
        base.topCard = drawPass
            ? MakaoCard.create("debug_request_top_ace_hearts", "ace", "hearts")
            : MakaoCard.create("debug_request_top_jack_clubs", "jack", "clubs");
        base.activeEffectType = drawPass ? "suit_request" : "rank_request";
        base.activeEffectTargetPlayerId = actorId;
        base.activeEffectRequestedSuit = drawPass ? "spades" : null;
        base.activeEffectRequestedRank = drawPass ? null : "10";
        base.activeEffectText = drawPass ? "Anka ! ♠" : "Anka ! 10";
        base.myHand.add(MakaoCard.create("debug_request_local_8_hearts", "8", "hearts"));
        base.myHand.add(MakaoCard.create("debug_request_local_queen_clubs", "queen", "clubs"));
        base.handCounts.put("local", base.myHand.size());
        MakaoMoveDetails sourceDetails = new MakaoMoveDetails();
        if (drawPass) {
            sourceDetails.suitRequest = "spades";
        } else {
            sourceDetails.rankRequest = "10";
        }
        sourceDetails.playedCards.add(base.topCard);
        base.moveHistory.add(new MakaoMoveEvent(
            2,
            "play_cards",
            sourceId,
            actorId,
            base.topCard,
            sourceDetails
        ));
        prototypeState = base;
        applyGameState(base);

        MakaoGameState next = base.copy();
        next.stateVersion = 3;
        next.activeEffectType = null;
        next.activeEffectTargetPlayerId = null;
        next.activeEffectRequestedSuit = null;
        next.activeEffectRequestedRank = null;
        next.activeEffectText = null;
        next.currentPlayerId = "local";
        next.currentPlayerName = "Ty";
        MakaoMoveDetails details = new MakaoMoveDetails();
        if (drawPass) {
            details.drawnCount = 1;
            details.canPlayDrawnCard = false;
            details.resolvedEffectType = "suit_request";
            details.resolvedSuitRequest = "spades";
            next.handCounts.put(actorId, next.handCounts.get(actorId) + 1);
            next.drawPileCount = Math.max(0, next.drawPileCount - 1);
            next.moveHistory.add(new MakaoMoveEvent(
                3,
                "draw_card",
                actorId,
                "local",
                next.topCard,
                details
            ));
        } else {
            MakaoCard played = MakaoCard.create("debug_request_resolve_10_spades", "10", "spades");
            details.playedCards.add(played);
            details.resolvedEffectType = "rank_request";
            details.resolvedRankRequest = "10";
            next.topCard = played;
            next.handCounts.put(actorId, Math.max(0, next.handCounts.get(actorId) - 1));
            next.moveHistory.add(new MakaoMoveEvent(
                3,
                "play_cards",
                actorId,
                "local",
                played,
                details
            ));
        }
        prototypeState = next;
        applyGameState(next);
    }

    private void applyDebugMultiOpponentTableScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        configureDebugCrowdedTable(state);
        state.currentPlayerId = "p3";
        state.currentPlayerName = "Celina";
        state.myHand.add(MakaoCard.create("debug_multi_8_hearts", "8", "hearts"));
        state.myHand.add(MakaoCard.create("debug_multi_10_spades", "10", "spades"));
        state.myHand.add(MakaoCard.create("debug_multi_queen_clubs", "queen", "clubs"));
        state.makaoByPlayer.put("p4", true);
        state.missingMakaoByPlayer.put("p5", true);
        state.makaoCatchAtByPlayer.put("p5", System.currentTimeMillis() - 1000L);
        state.pauseTurnsByPlayer.put("p2", 1);
        state.moveHistory.add(debugMove(2, "play_cards", "p1", MakaoCard.create("debug_p1_8_clubs", "8", "clubs"), 0));
        MakaoMoveEvent playableDraw = debugMove(3, "draw_card", "p2", state.topCard, 1);
        playableDraw.details.canPlayDrawnCard = true;
        state.moveHistory.add(playableDraw);
        state.moveHistory.add(debugMove(4, "accept_penalty", "p6", state.topCard, 5));
        prototypeState = state;
        applyGameState(state);
    }

    private void configureDebugCrowdedTable(MakaoGameState state) {
        state.players.clear();
        state.handCounts.clear();
        state.players.add(new MakaoPlayer("local", "Ty", true, true, true));
        state.handCounts.put("local", 3);
        String[] ids = { "p1", "p2", "p3", "p4", "p5", "p6" };
        String[] names = { "Anka", "Bartek", "Celina", "Darek", "Ela", "Franek" };
        int[] counts = { 6, 3, 9, 1, 4, 8 };
        for (int i = 0; i < ids.length; i++) {
            state.players.add(new MakaoPlayer(ids[i], names[i], false, true, i != 4));
            state.handCounts.put(ids[i], counts[i]);
        }
    }

    private void applyDebugMultiOpponentBubblesScenario(String scenario) {
        applyDebugMultiOpponentTableScenario(scenario);
        eventBubbles.clear();
        eventBubbles.add(new EventBubble(
            "p1",
            "Anka karta",
            BadgeTone.DEFAULT,
            eventBubbleDuration(),
            EventBubbleIconKind.CARD,
            MakaoCard.create("bubble_8_clubs", "8", "clubs"),
            0
        ));
        eventBubbles.add(new EventBubble("p2", "Bartek decyduje", BadgeTone.DEFAULT, eventBubbleDuration(), EventBubbleIconKind.DRAW, null, 1));
        eventBubbles.add(new EventBubble("p3", "Celina +5", BadgeTone.PENALTY, eventBubbleDuration(), EventBubbleIconKind.PENALTY, null, 5));
        eventBubbles.add(new EventBubble("p4", "Darek MAKAO", BadgeTone.REQUEST, eventBubbleDuration(), EventBubbleIconKind.MAKAO, null, 0));
        eventBubbles.add(new EventBubble("p6", "Franek 4 -> Ty", BadgeTone.PAUSE, eventBubbleDuration(), EventBubbleIconKind.PAUSE, null, 1));
        eventBubbles.add(new EventBubble("p5", "Ela spełnia", BadgeTone.REQUEST, eventBubbleDuration(), EventBubbleIconKind.REQUEST, MakaoCard.create("bubble_request_10", "10", null), 0));
        seatHandPopTimers.put("p2", SEAT_HAND_POP_SECONDS);
        seatHandPopTimers.put("p3", SEAT_HAND_POP_SECONDS);
        seatHandPopTimers.put("p6", SEAT_HAND_POP_SECONDS);
        triggerSeatImpact("p3", BadgeTone.PENALTY);
        triggerSeatImpact("p5", BadgeTone.PENALTY);
        triggerSeatImpact("p6", BadgeTone.PAUSE);
    }

    private void applyDebugBadgeScenario(String scenario) {
        MakaoGameState state = debugBaseState(scenario);
        state.currentPlayerId = "local";
        state.currentPlayerName = "Ty";
        state.myHand.add(MakaoCard.create("debug_badge_2_hearts", "2", "hearts"));
        state.myHand.add(MakaoCard.create("debug_badge_4_spades", "4", "spades"));
        state.myHand.add(MakaoCard.create("debug_badge_queen_clubs", "queen", "clubs"));
        state.myHand.add(MakaoCard.create("debug_badge_8_hearts", "8", "hearts"));
        state.myHand.add(MakaoCard.create("debug_badge_joker", "joker", null));
        state.handCounts.put("local", state.myHand.size());
        state.handCounts.put("opponent", 4);

        if ("badge_suit_request".equals(scenario)) {
            state.activeEffectType = "suit_request";
            state.activeEffectTargetPlayerId = "local";
            state.activeEffectRequestedSuit = "hearts";
            state.activeEffectText = "Gracz ! ♥";
        } else if ("badge_rank_request".equals(scenario)) {
            state.activeEffectType = "rank_request";
            state.activeEffectTargetPlayerId = "local";
            state.activeEffectRequestedRank = "8";
            state.activeEffectText = "Gracz ! 8";
        } else if ("badge_draw_penalty".equals(scenario)) {
            state.topCard = MakaoCard.create("debug_top_3_hearts", "3", "hearts");
            state.activeEffectType = "draw_penalty";
            state.activeEffectTargetPlayerId = "local";
            state.activeEffectAmount = 7;
            state.activeEffectBattleSuit = "hearts";
            state.activeEffectText = "kara +7";
        } else if ("badge_warsaw_queen_penalty".equals(scenario)) {
            state.queenVariant = "warsaw_pardon";
            state.topCard = MakaoCard.create("debug_top_3_hearts", "3", "hearts");
            state.activeEffectType = "draw_penalty";
            state.activeEffectTargetPlayerId = "local";
            state.activeEffectAmount = 7;
            state.activeEffectBattleSuit = "hearts";
            state.activeEffectText = "kara +7";
            state.myHand.add(MakaoCard.create("debug_badge_queen_hearts", "queen", "hearts"));
        } else if ("badge_skip_turn".equals(scenario)) {
            state.topCard = MakaoCard.create("debug_top_4_spades", "4", "spades");
            state.activeEffectType = "skip_turn";
            state.activeEffectTargetPlayerId = "local";
            state.activeEffectAmount = 2;
            state.activeEffectText = "4 x 2";
        } else if ("badge_joker_context".equals(scenario)) {
            state.topCard = new MakaoCard(
                "debug_top_joker_declared",
                MakaoCard.RANK_JOKER,
                null,
                MakaoCard.create("debug_joker_as_8_spades", "8", "spades")
            );
            state.activeEffectType = null;
            state.activeEffectTargetPlayerId = null;
            state.activeEffectText = null;
        } else {
            state.statusText = "Debug: nieznany badge";
        }

        state.handCounts.put("local", state.myHand.size());
        addDebugDiscardHistory(state, state.topCard);
        prototypeState = state;
        applyGameState(state);
    }

    private MakaoMoveEvent debugMove(int version, String type, String playerId, MakaoCard topCard, int drawnCount) {
        MakaoMoveDetails details = new MakaoMoveDetails();
        if ("play_cards".equals(type) && topCard != null) {
            details.playedCards.add(topCard);
        }
        details.drawnCount = drawnCount;
        details.amount = drawnCount;
        return new MakaoMoveEvent(version, type, playerId, "local", topCard, details);
    }

    private void postToGameThread(Runnable runnable) {
        if (Gdx.app == null) {
            runnable.run();
            return;
        }
        Gdx.app.postRunnable(runnable);
    }

    private NativeCard createNativeCard(MakaoCard model, float x, float y, float scale) {
        NativeCard card = new NativeCard(model);
        card.x = x;
        card.y = y;
        card.targetX = x;
        card.targetY = y;
        card.scale = scale;
        card.targetScale = scale;
        return card;
    }

    private void layoutHandTargets() {
        int count = hand.size;
        if (count == 0) {
            handScrollOffset = 0f;
            return;
        }

        handScrollOffset = clampedHandScrollOffset(handScrollOffset);
        boolean reserveDrawSlot = shouldReserveDrawSlot();
        int layoutCount = reserveDrawSlot ? count + 1 : count;
        float spacing = layoutCount <= 1 ? 0f : HAND_CARD_SPACING;
        float startX = WORLD_WIDTH / 2f - spacing * (layoutCount - 1f) / 2f - handScrollOffset;
        float centerIndex = (layoutCount - 1f) / 2f;
        int drawInsertIndex = reserveDrawSlot ? drawInsertIndex(count, startX, spacing) : -1;
        float collapsed = 1f - handFocusAmount;
        float handY = HAND_Y + HAND_COLLAPSED_Y_OFFSET * collapsed;
        float baseScale = MathUtils.lerp(HAND_COLLAPSED_SCALE, 1f, handFocusAmount);

        for (int i = 0; i < count; i++) {
            NativeCard card = hand.get(i);
            if (card == draggedCard) continue;

            int slotIndex = reserveDrawSlot && i >= drawInsertIndex ? i + 1 : i;
            float offset = slotIndex - centerIndex;
            card.targetX = startX + spacing * slotIndex;
            card.targetY = handY - Math.abs(offset) * 2.5f;
            card.targetAngle = offset * MathUtils.lerp(2.8f, 4.4f, handFocusAmount);
            card.targetScale = baseScale;
            card.dimmed = !isPrototypePlayable(card.model) && !canStartPotentialMultiCardSelection(card);

            if (isDrawnCard(card)) {
                card.targetY += 22f;
                card.targetScale = 1.08f * baseScale;
                card.dimmed = false;
            }

            if (isCardSelected(card)) {
                card.targetY += 58f;
                card.targetAngle = offset * 1.3f;
                card.targetScale = 1.12f;
            }

            if (sortWaveTimer > 0f) {
                float waveLife = MathUtils.clamp(sortWaveTimer / SORT_WAVE_DURATION, 0f, 1f);
                float phase = (1f - waveLife) * MathUtils.PI + i * 0.34f;
                card.targetY += MathUtils.sin(phase) * 16f * waveLife;
                card.targetAngle += MathUtils.sin(phase + 0.7f) * 2.2f * waveLife;
            }

            card.targetY = Math.max(
                card.targetY,
                minimumVisibleCardCenterY(card.targetAngle, card.targetScale)
            );
        }
    }

    private float minimumVisibleCardCenterY(float angle, float scale) {
        float safeScale = Math.max(0f, scale);
        float halfHeight = (
            Math.abs(MathUtils.cosDeg(angle)) * CARD_HEIGHT
                + Math.abs(MathUtils.sinDeg(angle)) * CARD_WIDTH
        ) * safeScale / 2f;
        return halfHeight + HAND_CARD_BOTTOM_MARGIN;
    }

    private boolean shouldReserveDrawSlot() {
        return draggingDrawCard && drawDragY <= DRAW_RELEASE_Y + 42f;
    }

    private int drawInsertIndex(int count, float startX, float spacing) {
        if (count <= 0 || spacing <= 0f) return 0;
        int bestIndex = 0;
        float bestDistance = Float.MAX_VALUE;
        for (int i = 0; i <= count; i++) {
            float slotX = startX + spacing * i;
            float distance = Math.abs(drawDragX - slotX);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    private void captureDrawInsertSlot() {
        int count = hand.size;
        if (count <= 0) {
            pendingDrawInsertIndex = 0;
            return;
        }
        int layoutCount = count + 1;
        float spacing = layoutCount <= 1 ? 0f : HAND_CARD_SPACING;
        float startX = WORLD_WIDTH / 2f - spacing * (layoutCount - 1f) / 2f - handScrollOffset;
        pendingDrawInsertIndex = drawInsertIndex(count, startX, spacing);
    }

    private void clearDrawInsertSlot() {
        pendingDrawInsertIndex = -1;
    }

    private float maxHandScrollOffset() {
        if (hand.size <= 1) return 0f;
        float handWidth = HAND_CARD_SPACING * (hand.size - 1f) + CARD_WIDTH;
        return Math.max(0f, (handWidth - HAND_VISIBLE_WIDTH) / 2f);
    }

    private float clampedHandScrollOffset(float value) {
        float maxOffset = maxHandScrollOffset();
        return MathUtils.clamp(value, -maxOffset, maxOffset);
    }

    private boolean canPanHand() {
        return maxHandScrollOffset() > 1f;
    }

    private void updateHandInertia(float delta) {
        if (panningHand || Math.abs(handScrollVelocity) < 1f || !canPanHand()) {
            if (!canPanHand()) handScrollVelocity = 0f;
            return;
        }

        float nextOffset = clampedHandScrollOffset(handScrollOffset + handScrollVelocity * delta);
        if (nextOffset != handScrollOffset + handScrollVelocity * delta) {
            handScrollVelocity = 0f;
        } else {
            handScrollVelocity *= (float) Math.exp(-HAND_PAN_FRICTION * delta);
            if (Math.abs(handScrollVelocity) < 12f) handScrollVelocity = 0f;
        }
        handScrollOffset = nextOffset;
        layoutHandTargets();
    }

    private void updateSortWave(float delta) {
        if (sortWaveTimer <= 0f) return;
        sortWaveTimer = Math.max(0f, sortWaveTimer - delta);
        layoutHandTargets();
    }

    private void updatePileHighlights(float delta) {
        float speed = 1f - (float) Math.pow(0.0005f, delta);
        drawPileActiveAmount = MathUtils.lerp(drawPileActiveAmount, shouldHighlightDrawPile() ? 1f : 0f, speed);
        discardPileActiveAmount = MathUtils.lerp(discardPileActiveAmount, shouldHighlightDiscardPile() ? 1f : 0f, speed);
        if (drawPileRecoilTimer > 0f) {
            drawPileRecoilTimer = Math.max(0f, drawPileRecoilTimer - delta);
        }
        if (discardSettleTimer > 0f) {
            discardSettleTimer = Math.max(0f, discardSettleTimer - delta);
        }
    }

    private void updateHandFocus(float delta) {
        if (handFocusHoldTimer > 0f) {
            handFocusHoldTimer = Math.max(0f, handFocusHoldTimer - delta);
        }
        if (tableRevealHoldTimer > 0f) {
            tableRevealHoldTimer = Math.max(0f, tableRevealHoldTimer - delta);
        }
        float target = desiredHandFocusAmount();
        float speed = 1f - (float) Math.pow(0.0007f, delta);
        float next = MathUtils.lerp(handFocusAmount, target, speed);
        if (Math.abs(next - handFocusAmount) > 0.001f) {
            handFocusAmount = next;
            layoutHandTargets();
        } else {
            handFocusAmount = target;
        }
    }

    private float desiredHandFocusAmount() {
        if (hasActiveLocalDiscardFlight()) return HAND_THROW_FLIGHT_FOCUS;
        if (handFocusHoldTimer > 0f) return 1f;
        if (draggedCard != null || draggingDrawCard || panningHand || handPanCandidate) return 1f;
        if (selectedCards.size > 0 || requestDeclarationOpen || jokerDeclarationOpen) return 1f;
        if (sortWaveTimer > 0f) return 1f;
        if (tableRevealHoldTimer > 0f || hasActiveTableRevealFlight()) return HAND_TABLE_REVEAL_FOCUS;

        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || state.myPlayerId == null || state.currentPlayerId == null) return 1f;
        if (state.gameOver || state.hasDrawnCardThisTurn) return 1f;
        if (state.myPlayerId.equals(state.currentPlayerId)) return 1f;
        if (shouldHighlightDrawPile() || shouldHighlightDiscardPile()) return 1f;
        return HAND_OPPONENT_PEEK_FOCUS;
    }

    private boolean hasActiveTableRevealFlight() {
        for (CardFlight flight : flights) {
            if (flight != null && flight.tableRevealFlight) return true;
        }
        return false;
    }

    private boolean isPrototypePlayable(MakaoCard card) {
        if (card == null || latestState == null || latestState.topCard == null) return true;
        if (latestState.hasDrawnCardThisTurn && latestState.drawnCardInstanceId != null) {
            if (latestState.drawnCardInstanceId.equals(card.cardInstanceId)) return true;
            NativeCard firstSelected = selectedCards.size > 0 ? selectedCards.first() : null;
            String selectedRank = selectedGroupRank();
            return firstSelected != null
                && latestState.drawnCardInstanceId.equals(firstSelected.model.cardInstanceId)
                && (MakaoCard.RANK_JOKER.equals(card.rank)
                    || selectedRank == null
                    || safeEquals(selectedRank, card.rank));
        }
        if (latestState.isPenaltyDrawAcceptanceLocked()) return false;
        if (latestState.activeEffectType != null) {
            if (latestState.activeEffectTargetPlayerId != null
                && !latestState.activeEffectTargetPlayerId.equals(latestState.myPlayerId)) {
                return false;
            }
            if ("draw_penalty".equals(latestState.activeEffectType)) {
                return isDrawPenaltyAnswer(card, latestState) || canJoinActiveBattleKingSelection(card);
            }
            if ("skip_turn".equals(latestState.activeEffectType)) {
                return MakaoCard.RANK_JOKER.equals(card.rank) || "4".equals(card.rank);
            }
            if ("suit_request".equals(latestState.activeEffectType)) {
                boolean queenCanCancelRequest = !"blocked_by_request".equals(latestState.queenRequestMode);
                return MakaoCard.RANK_JOKER.equals(card.rank)
                    || (queenCanCancelRequest && "queen".equals(card.rank))
                    || "ace".equals(card.rank)
                    || safeEquals(card.suit, latestState.activeEffectRequestedSuit);
            }
            if ("rank_request".equals(latestState.activeEffectType)) {
                return isRankRequestAnswer(card, latestState);
            }
        }
        MakaoCard topCard = latestState.topCard;
        if (topCard != null && topCard.jokerDeclaration != null) {
            topCard = topCard.jokerDeclaration;
        }
        if (topCard == null) return true;
        return MakaoCard.RANK_JOKER.equals(card.rank)
            || "queen".equals(card.rank)
            || "queen".equals(topCard.rank)
            || safeEquals(card.rank, topCard.rank)
            || safeEquals(card.suit, topCard.suit);
    }

    private boolean isRankRequestAnswer(MakaoCard card, MakaoGameState state) {
        if (card == null || state == null) return false;
        if (MakaoCard.RANK_JOKER.equals(card.rank)) return true;
        if ("queen".equals(card.rank)) return !"blocked_by_request".equals(state.queenRequestMode);
        if ("jack".equals(card.rank)) return true;
        String requestedRank = state.activeEffectRequestedRank;
        if (requestedRank == null || requestedRank.isEmpty()) return false;
        if ("non_battle_king".equals(requestedRank)) {
            return "king".equals(card.rank)
                && ("clubs".equals(card.suit) || "diamonds".equals(card.suit));
        }
        return safeEquals(card.rank, requestedRank);
    }

    private boolean isDrawPenaltyAnswer(MakaoCard card, MakaoGameState state) {
        if (card == null || state == null) return false;
        if (MakaoCard.RANK_JOKER.equals(card.rank)) return true;
        if (isWarsawQueenPardon(card, state)) return true;
        String battleSuit = state.activeEffectBattleSuit;
        boolean matchesBattleSuit = battleSuit != null && safeEquals(card.suit, battleSuit);
        boolean battleCard = "2".equals(card.rank)
            || "3".equals(card.rank)
            || ("king".equals(card.rank) && ("hearts".equals(card.suit) || "spades".equals(card.suit)));
        if (battleCard) {
            MakaoCard topCard = state.topCard;
            if (topCard != null && topCard.jokerDeclaration != null) topCard = topCard.jokerDeclaration;
            boolean suitOrRank = "suit_or_rank".equals(state.battleCounterMode);
            return matchesBattleSuit || (suitOrRank && topCard != null && safeEquals(card.rank, topCard.rank));
        }
        return false;
    }

    private boolean canJoinActiveBattleKingSelection(MakaoCard card) {
        if (card == null || latestState == null || !"draw_penalty".equals(latestState.activeEffectType)) return false;
        if (!"king".equals(card.rank) || isBattleKing(card)) return false;

        boolean hasSelectedKing = false;
        boolean hasLegalBattleKing = false;
        for (NativeCard selected : selectedCards) {
            if (selected == null || selected.model == null) continue;
            MakaoCard selectedCard = selected.model;
            if (MakaoCard.RANK_JOKER.equals(selectedCard.rank)) continue;
            if (!"king".equals(selectedCard.rank)) return false;

            hasSelectedKing = true;
            if (isBattleKing(selectedCard) && isDrawPenaltyAnswer(selectedCard, latestState)) {
                hasLegalBattleKing = true;
            }
        }

        return hasSelectedKing && hasLegalBattleKing;
    }

    private boolean isBattleKing(MakaoCard card) {
        return card != null
            && "king".equals(card.rank)
            && ("hearts".equals(card.suit) || "spades".equals(card.suit));
    }

    private boolean isWarsawQueenPardon(MakaoCard card, MakaoGameState state) {
        return card != null
            && state != null
            && "warsaw_pardon".equals(state.queenVariant)
            && "queen".equals(card.rank)
            && ("hearts".equals(card.suit) || "spades".equals(card.suit));
    }

    private String illegalCardNotice() {
        if (latestState != null && "draw_penalty".equals(latestState.activeEffectType)) {
            if (latestState.isPenaltyDrawAcceptanceLocked()) return "Dobierz resztę kary";
            return "Nie przebija kary";
        }
        if (latestState != null && "skip_turn".equals(latestState.activeEffectType)) {
            return "Tylko 4";
        }
        return "Nie pasuje";
    }

    private boolean isDrawnCard(NativeCard card) {
        return card != null
            && latestState != null
            && latestState.hasDrawnCardThisTurn
            && latestState.drawnCardInstanceId != null
            && latestState.drawnCardInstanceId.equals(card.model.cardInstanceId);
    }

    private boolean isCardSelected(NativeCard card) {
        if (card == null || card.model == null) return false;
        for (NativeCard selected : selectedCards) {
            if (selected != null
                && selected.model != null
                && card.model.cardInstanceId.equals(selected.model.cardInstanceId)) {
                return true;
            }
        }
        return false;
    }

    private void toggleCardSelection(NativeCard card) {
        if (card == null || isPendingPlayed(card)) return;
        if (isCardSelected(card)) {
            removeSelectedCard(card);
            selectedCard = selectedCards.size > 0 ? selectedCards.peek() : null;
            layoutHandTargets();
            return;
        }

        if (!NativePlayRules.canStageAnotherCard(allowsMultipleCards(), selectedCards.size, false)) {
            showIllegalNotice("W tym pokoju zagrywasz jedną kartę");
            return;
        }

        if (selectedCards.size == 0) {
            if (!isPrototypePlayable(card.model) && !canStartPotentialMultiCardSelection(card)) {
                showIllegalNotice(illegalCardNotice());
                return;
            }
            if (!canStartSelection(card)) return;
            selectedCards.add(card);
            selectedCard = card;
            layoutHandTargets();
            return;
        }

        String groupRank = selectedGroupRank();
        boolean jokerCard = MakaoCard.RANK_JOKER.equals(card.model.rank);
        boolean canJoinGroup = jokerCard || groupRank == null || safeEquals(groupRank, card.model.rank);
        if (!canJoinGroup) {
            if (latestState != null && latestState.hasDrawnCardThisTurn) {
                showIllegalNotice("Ten sam symbol");
                return;
            }
            selectedCards.clear();
            if (!isPrototypePlayable(card.model)) {
                showIllegalNotice(illegalCardNotice());
                layoutHandTargets();
                return;
            }
            if (!canStartSelection(card)) return;
            selectedCards.add(card);
            selectedCard = card;
            layoutHandTargets();
            return;
        }

        if (latestState != null
            && "draw_penalty".equals(latestState.activeEffectType)
            && !isPrototypePlayable(card.model)
            && !canJoinActiveBattleKingSelection(card.model)) {
            showIllegalNotice(illegalCardNotice());
            return;
        }

        if (latestState != null
            && latestState.hasDrawnCardThisTurn
            && latestState.drawnCardInstanceId != null
            && !latestState.drawnCardInstanceId.equals(selectedCards.first().model.cardInstanceId)) {
            showIllegalNotice("Zacznij od dobranej");
            return;
        }

        selectedCards.add(card);
        selectedCard = card;
        layoutHandTargets();
    }

    private boolean canStartSelection(NativeCard card) {
        if (latestState != null
            && latestState.hasDrawnCardThisTurn
            && latestState.drawnCardInstanceId != null
            && !latestState.drawnCardInstanceId.equals(card.model.cardInstanceId)
            && !canStartPotentialMultiCardSelection(card)) {
            showIllegalNotice("Wybierz dobraną");
            return false;
        }
        return true;
    }

    private boolean canStartPotentialMultiCardSelection(NativeCard card) {
        if (card == null || card.model == null || latestState == null) return false;
        if (!allowsMultipleCards()) return false;
        if ("draw_penalty".equals(latestState.activeEffectType)) return false;
        if (MakaoCard.RANK_JOKER.equals(card.model.rank)) return false;
        for (NativeCard other : hand) {
            if (other == null || other == card || other.model == null) continue;
            if (MakaoCard.RANK_JOKER.equals(other.model.rank)) continue;
            if (safeEquals(card.model.rank, other.model.rank) && isPrototypePlayable(other.model)) {
                return true;
            }
        }
        return false;
    }

    private boolean allowsMultipleCards() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state != null) return state.allowMultipleCards;
        return nativeRoomState == null || nativeRoomState.allowMultipleCards;
    }

    private String selectedGroupRank() {
        for (NativeCard selected : selectedCards) {
            if (selected != null
                && selected.model != null
                && !MakaoCard.RANK_JOKER.equals(selected.model.rank)) {
                return selected.model.rank;
            }
        }
        return null;
    }

    private void removeSelectedCard(NativeCard card) {
        for (int i = selectedCards.size - 1; i >= 0; i--) {
            NativeCard selected = selectedCards.get(i);
            if (selected != null
                && selected.model != null
                && card.model.cardInstanceId.equals(selected.model.cardInstanceId)) {
                selectedCards.removeIndex(i);
            }
        }
    }

    private boolean safeEquals(String left, String right) {
        if (left == null) return right == null;
        return left.equals(right);
    }

    private boolean isRequestEffect(MakaoGameState state) {
        return state != null
            && ("suit_request".equals(state.activeEffectType) || "rank_request".equals(state.activeEffectType));
    }

    private String activeEffectNoticeText(MakaoGameState state) {
        if (state == null || state.activeEffectType == null) return "";
        return activeEffectBadgeInfo(state).title;
    }

    private ActiveEffectBadge activeEffectBadgeInfo(MakaoGameState state) {
        if (state == null || state.activeEffectType == null) return ActiveEffectBadge.EMPTY;
        String target = compactEffectTargetName(state);
        if ("suit_request".equals(state.activeEffectType)) {
            String suit = state.activeEffectRequestedSuit;
            return new ActiveEffectBadge(
                requestBadgeText(state, "kolor", suit == null ? null : suitSymbol(suit)),
                "",
                suit,
                BadgeTone.REQUEST
            );
        }
        if ("rank_request".equals(state.activeEffectType)) {
            String rank = state.activeEffectRequestedRank;
            return new ActiveEffectBadge(
                requestBadgeText(state, "wartość", rank == null ? null : rankLabelForValue(rank)),
                "",
                null,
                BadgeTone.REQUEST
            );
        }
        if ("draw_penalty".equals(state.activeEffectType)) {
            String title = state.activeEffectAmount > 0 ? "kara +" + state.activeEffectAmount : "dobieranie";
            String targetName = effectTargetDisplayName(state);
            if (!targetName.isEmpty()) title += " " + targetName;
            String subtitle = "";
            if (state.activeEffectPenaltyDrawnCount > 0) {
                int total = Math.max(state.activeEffectAmount, state.activeEffectPenaltyDrawnCount);
                int remaining = state.activeEffectPenaltyRemainingCount > 0
                    ? state.activeEffectPenaltyRemainingCount
                    : Math.max(0, total - state.activeEffectPenaltyDrawnCount);
                subtitle = remaining > 0
                    ? "dobrano " + state.activeEffectPenaltyDrawnCount + "/" + total + " · zostało " + remaining
                    : "dobrano " + state.activeEffectPenaltyDrawnCount + "/" + total;
            }
            return new ActiveEffectBadge(title, subtitle, null, BadgeTone.PENALTY);
        }
        if ("skip_turn".equals(state.activeEffectType)) {
            int amount = Math.max(1, state.activeEffectAmount);
            String title = pauseIconRegion == null ? pauseTag(amount) : String.valueOf(amount);
            return new ActiveEffectBadge(title, target, null, BadgeTone.PAUSE, "4");
        }
        return new ActiveEffectBadge(state.activeEffectText == null ? "" : state.activeEffectText, "", null, BadgeTone.DEFAULT);
    }

    private ActiveEffectBadge tableStateBadgeInfo(MakaoGameState state) {
        if (state == null) return ActiveEffectBadge.EMPTY;
        if (state.activeEffectType != null) return activeEffectBadgeInfo(state);
        MakaoCard visibleTop = visibleTopCard(state);
        if (isDeclaredJoker(visibleTop)) {
            MakaoCard declaration = visibleTop.jokerDeclaration;
            return new ActiveEffectBadge(
                jokerIconRegion == null ? "joker → " + cardTag(declaration) : "joker",
                "",
                declaration.suit,
                BadgeTone.JOKER,
                declaration.rank
            );
        }
        return ActiveEffectBadge.EMPTY;
    }

    private String compactEffectTargetName(MakaoGameState state) {
        if (state == null || state.activeEffectTargetPlayerId == null) return "?";
        if (state.activeEffectTargetPlayerId.equals(state.myPlayerId)) return "Ty";
        return cleanDisplayName(state.resolvePlayerName(state.activeEffectTargetPlayerId));
    }

    private String effectTargetDisplayName(MakaoGameState state) {
        if (state == null || state.activeEffectTargetPlayerId == null) return "";
        String name = state.resolvePlayerName(state.activeEffectTargetPlayerId);
        return name == null || name.isEmpty() ? "" : cleanDisplayName(name);
    }

    private String compactPlayerName(MakaoGameState state, String playerId) {
        if (state == null || playerId == null || playerId.isEmpty()) return "?";
        if (playerId.equals(state.myPlayerId)) return "Ty";
        return cleanDisplayName(state.resolvePlayerName(playerId));
    }

    private String requestBadgeText(MakaoGameState state, String requestKind, String requestValue) {
        String value = requestValue == null || requestValue.isEmpty() ? requestKind : requestValue;
        String requesterId = requestSourcePlayerId(state);
        String requester = requesterId == null ? "" : requestBadgePlayerName(state, requesterId);
        boolean hasRequester = !requester.isEmpty() && !"?".equals(requester) && !"Gracz".equals(requester);
        if ("kolor".equals(requestKind) && !requestSuitIconRegions.isEmpty()) {
            return hasRequester ? requester : "Żądanie";
        }
        if (!hasRequester) return "Żądanie " + value;
        String marker = requestBangIconRegion == null ? " żąda " : " ";
        return requester + marker + value;
    }

    private String requestBadgePlayerName(MakaoGameState state, String playerId) {
        if (state == null || playerId == null || playerId.isEmpty()) return "Gracz";
        String name = state.resolvePlayerName(playerId);
        if (name == null || name.isEmpty()) return "Gracz";
        return cleanDisplayName(name);
    }

    private String requestSourcePlayerId(MakaoGameState state) {
        if (state == null || state.moveHistory == null) return null;
        for (int i = state.moveHistory.size() - 1; i >= 0; i--) {
            MakaoMoveEvent event = state.moveHistory.get(i);
            if (event == null || event.details == null || !"play_cards".equals(event.type)) continue;
            if ("suit_request".equals(state.activeEffectType)
                && event.details.suitRequest != null
                && !"none".equals(event.details.suitRequest)) {
                return event.playerId;
            }
            if ("rank_request".equals(state.activeEffectType)
                && event.details.rankRequest != null
                && !"none".equals(event.details.rankRequest)) {
                return event.playerId;
            }
        }
        return null;
    }

    private String pauseCountLabel(int count) {
        int safeCount = Math.max(0, count);
        return "4 x " + safeCount;
    }

    private boolean shouldShowSeparateJokerContextBadge() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        return state != null
            && state.activeEffectType == null
            && isDeclaredJoker(visibleTopCard(state));
    }

    private boolean isDeclaredJoker(MakaoCard card) {
        return card != null
            && MakaoCard.RANK_JOKER.equals(card.rank)
            && card.jokerDeclaration != null;
    }

    private MakaoCard visibleTopCard(MakaoGameState state) {
        if (discardTop != null && discardTop.model != null) return discardTop.model;
        return state == null ? null : state.topCard;
    }

    private String suitNamePl(String suit) {
        if ("hearts".equals(suit)) return "kier";
        if ("diamonds".equals(suit)) return "karo";
        if ("clubs".equals(suit)) return "trefl";
        if ("spades".equals(suit)) return "pik";
        return suit == null ? "" : suit;
    }

    private String suitSymbol(String suit) {
        if ("hearts".equals(suit)) return "♥";
        if ("diamonds".equals(suit)) return "♦";
        if ("clubs".equals(suit)) return "♣";
        if ("spades".equals(suit)) return "♠";
        return suit == null ? "" : suit;
    }

    private String cardTag(MakaoCard card) {
        if (card == null) return "";
        String rank = rankLabelForValue(card.rank);
        String suit = suitSymbol(card.suit);
        if (suit.isEmpty()) return rank;
        return rank + " " + suit;
    }

    private String pauseTag(int count) {
        return "4 x " + Math.max(1, count);
    }

    private String turnCountLabel(int count) {
        int safeCount = Math.max(1, count);
        return safeCount + " " + turnWord(safeCount);
    }

    private String turnWord(int count) {
        if (count == 1) return "turę";
        if (count >= 2 && count <= 4) return "tury";
        return "tur";
    }

    private void updateCards(float delta) {
        float speed = 1f - (float) Math.pow(0.001f, delta);
        for (NativeCard card : hand) {
            if (card == draggedCard) continue;
            card.x = MathUtils.lerp(card.x, card.targetX, speed);
            card.y = MathUtils.lerp(card.y, card.targetY, speed);
            card.angle = MathUtils.lerpAngleDeg(card.angle, card.targetAngle, speed);
            card.scale = MathUtils.lerp(card.scale, card.targetScale, speed);
        }
    }

    private void updateFlights(float delta) {
        for (int i = flights.size - 1; i >= 0; i--) {
            CardFlight flight = flights.get(i);
            if (flight.startDelay > 0f) {
                flight.startDelay = Math.max(0f, flight.startDelay - delta);
                continue;
            }
            flight.elapsed = NativeCardMotion.advanceFlightElapsed(
                flight.elapsed,
                delta,
                flight.duration,
                flight.awaitingAuthoritativeState
            );
            float t = Math.min(1f, flight.elapsed / flight.duration);
            if (flight.faceDown && t < NativeCardMotion.DRAW_DETACH_PHASE) {
                float detach = NativeCardMotion.detachProgress(t / NativeCardMotion.DRAW_DETACH_PHASE);
                flight.card.x = MathUtils.lerp(flight.startX, flight.detachX, detach);
                flight.card.y = MathUtils.lerp(flight.startY, flight.detachY, detach);
                flight.card.angle = MathUtils.lerpAngleDeg(flight.startAngle, flight.detachAngle, detach);
                flight.card.scale = MathUtils.lerp(flight.startScale, flight.detachScale, detach);
            } else {
                float travelT = flight.faceDown
                    ? MathUtils.clamp(
                        (t - NativeCardMotion.DRAW_DETACH_PHASE) / (1f - NativeCardMotion.DRAW_DETACH_PHASE),
                        0f,
                        1f
                    )
                    : t;
                float eased = flight.faceDown
                    ? NativeCardMotion.drawTravelProgress(travelT)
                    : NativeCardMotion.throwTravelProgress(travelT);
                float fromX = flight.faceDown ? flight.detachX : flight.startX;
                float fromY = flight.faceDown ? flight.detachY : flight.startY;
                float fromAngle = flight.faceDown ? flight.detachAngle : flight.startAngle;
                float fromScale = flight.faceDown ? flight.detachScale : flight.startScale;
                float arcT = flight.faceDown ? travelT : t;
                float settle = flight.toDiscard ? smoothstep(MathUtils.clamp((t - 0.78f) / 0.22f, 0f, 1f)) : 0f;
                float settleDrop = flight.toDiscard ? MathUtils.sin(settle * MathUtils.PI) * DISCARD_SETTLE_PIXELS : 0f;
                flight.card.x = MathUtils.lerp(fromX, flight.endX, eased);
                flight.card.y = MathUtils.lerp(fromY, flight.endY, eased) + MathUtils.sin(arcT * MathUtils.PI) * flight.arc - settleDrop;
                flight.card.angle = MathUtils.lerpAngleDeg(fromAngle, flight.endAngle, eased);
                flight.card.scale = MathUtils.lerp(fromScale, flight.endScale, eased);
                if (flight.faceDown && !flight.toDiscard) {
                    float landBounce = smoothstep(MathUtils.clamp((travelT - 0.76f) / 0.24f, 0f, 1f));
                    float bounceWave = MathUtils.sin(landBounce * MathUtils.PI);
                    flight.card.y += bounceWave * DRAW_LAND_BOUNCE_PIXELS;
                    flight.card.scale *= 1f + bounceWave * 0.035f;
                }
            }

            if (t >= 1f) {
                if (!flight.silentLanding) {
                    FeedbackIntent landIntent = flight.landFeedbackIntent == null
                        ? (flight.toDiscard ? FeedbackIntent.LAND_PLAY : FeedbackIntent.LAND_DRAW)
                        : flight.landFeedbackIntent;
                    emitFeedback(landIntent);
                }
                boolean landedLocalDraw = isLocalDrawFlight(flight);
                if (isLocalDrawFlight(flight) && flight.landingCardInstanceId != null) {
                    NativeCard landingCard = findHandCardById(flight.landingCardInstanceId);
                    if (landingCard != null) {
                        landingCard.hiddenByFlight = false;
                        landingCard.x = flight.endX;
                        landingCard.y = flight.endY;
                        landingCard.angle = flight.endAngle;
                        landingCard.scale = flight.endScale;
                        handFocusHoldTimer = Math.max(handFocusHoldTimer, 0.35f);
                        layoutHandTargets();
                        syncDrawFlightsToHandTargets();
                    }
                }
                boolean landedOnDiscard = flight.toDiscard;
                flights.removeIndex(i);
                if (landedLocalDraw && !hasActiveLocalDrawFlight()) {
                    clearDrawInsertSlot();
                    layoutHandTargets();
                }
                if (landedOnDiscard && !hasActiveDiscardFlight()) {
                    triggerDiscardSettle();
                    MakaoGameState visualState = latestState != null ? latestState : prototypeState;
                    syncDiscardVisual(visualState);
                }
            }
        }
    }

    private boolean hasActiveDiscardFlight() {
        for (CardFlight flight : flights) {
            if (flight != null && flight.toDiscard) return true;
        }
        return false;
    }

    private boolean hasActiveLocalDrawFlight() {
        for (CardFlight flight : flights) {
            if (isLocalDrawFlight(flight)) return true;
        }
        return false;
    }

    private boolean hasActiveLocalDiscardFlight() {
        for (CardFlight flight : flights) {
            if (flight != null && flight.toDiscard && flight.localDiscardFlight) return true;
        }
        return false;
    }

    private boolean hasActiveDiscardFlightFor(MakaoCard topCard) {
        if (topCard == null) return hasActiveDiscardFlight();
        for (CardFlight flight : flights) {
            if (flight == null || !flight.toDiscard) continue;
            if (flight.landingDiscardModel == null) return true;
            if (sameCardIdentity(flight.landingDiscardModel, topCard)) return true;
        }
        return false;
    }

    private void updateNotice(float delta) {
        if (noticeTimer <= 0f) return;
        noticeTimer = Math.max(0f, noticeTimer - delta);
        if (noticeTimer == 0f) noticeText = "";
    }

    private void updateEventBubbles(float delta) {
        for (int i = eventBubbles.size - 1; i >= 0; i--) {
            EventBubble bubble = eventBubbles.get(i);
            bubble.timer = Math.max(0f, bubble.timer - delta);
            if (bubble.timer <= 0f) {
                eventBubbles.removeIndex(i);
            }
        }
    }

    private void updateSeatAnimations(float delta) {
        decrementTimerMap(seatHandPopTimers, delta);
        decrementTimerMap(seatImpactTimers, delta);
    }

    private void updateShellAnimations(float delta) {
        lobbyDealPreviewTimer = Math.max(0f, lobbyDealPreviewTimer - delta);
    }

    private void updateNativeLeaveFinish(float delta) {
        if (pendingNativeExitFinishTimer <= 0f) return;
        pendingNativeExitFinishTimer = Math.max(0f, pendingNativeExitFinishTimer - delta);
        if (pendingNativeExitFinishTimer == 0f && nativeExitCallback != null) {
            String action = pendingNativeExitAction == null || pendingNativeExitAction.isEmpty()
                ? NATIVE_EXIT_LEFT_ROOM
                : pendingNativeExitAction;
            pendingNativeExitAction = "";
            nativeExitCallback.run(action);
        }
    }

    private void decrementTimerMap(Map<String, Float> timers, float delta) {
        ArrayList<String> expired = new ArrayList<>();
        for (Map.Entry<String, Float> entry : timers.entrySet()) {
            float next = Math.max(0f, entry.getValue() - delta);
            if (next <= 0f) {
                expired.add(entry.getKey());
            } else {
                entry.setValue(next);
            }
        }
        for (String key : expired) {
            timers.remove(key);
            if (timers == seatImpactTimers) seatImpactTones.remove(key);
        }
    }

    private void syncSeatAnimationState(MakaoGameState state) {
        if (state == null) return;
        String roomKey = state.roomId == null ? "prototype" : state.roomId;
        if (!safeEquals(lastSeatAnimationRoomKey, roomKey)) {
            lastSeatAnimationRoomKey = roomKey;
            previousSeatHandCounts.clear();
            seedSeatHandCounts(state);
            seatHandPopTimers.clear();
            seatImpactTimers.clear();
            seatImpactTones.clear();
            return;
        }

        ArrayList<String> seen = new ArrayList<>();
        for (MakaoPlayer player : state.players) {
            if (player == null || player.id == null) continue;
            int handCount = playerHandCount(state, player);
            Integer previous = previousSeatHandCounts.get(player.id);
            if (previous != null && previous.intValue() != handCount && !player.id.equals(state.myPlayerId)) {
                seatHandPopTimers.put(player.id, SEAT_HAND_POP_SECONDS);
            }
            previousSeatHandCounts.put(player.id, handCount);
            seen.add(player.id);
        }

        ArrayList<String> stale = new ArrayList<>();
        for (String playerId : previousSeatHandCounts.keySet()) {
            if (!seen.contains(playerId)) stale.add(playerId);
        }
        for (String playerId : stale) {
            previousSeatHandCounts.remove(playerId);
            seatHandPopTimers.remove(playerId);
            seatImpactTimers.remove(playerId);
            seatImpactTones.remove(playerId);
        }
    }

    private void seedSeatHandCounts(MakaoGameState state) {
        if (state == null) return;
        for (MakaoPlayer player : state.players) {
            if (player != null && player.id != null) {
                previousSeatHandCounts.put(player.id, playerHandCount(state, player));
            }
        }
    }

    private void triggerSeatImpact(String playerId, BadgeTone tone) {
        if (playerId == null || playerId.isEmpty()) return;
        seatImpactTimers.put(playerId, SEAT_IMPACT_SECONDS);
        seatImpactTones.put(playerId, tone == null ? BadgeTone.DEFAULT : tone);
    }

    private void updateChoicePanelAnimations(float delta) {
        requestPanelTimer = requestDeclarationOpen ? Math.min(1f, requestPanelTimer + delta / 0.16f) : 0f;
        jokerPanelTimer = jokerDeclarationOpen ? Math.min(1f, jokerPanelTimer + delta / 0.16f) : 0f;
    }

    private void drawTable() {
        boolean hasBackground = tableBackgroundTexture != null && tableBackgroundTexture.isLoaded();
        if (hasBackground) {
            batch.begin();
            batch.setColor(Color.WHITE);
            batch.draw(tableBackgroundTexture.getRegion(), -24f, -14f, WORLD_WIDTH + 48f, WORLD_HEIGHT + 32f);
            batch.setColor(Color.WHITE);
            batch.end();
        }

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        if (!hasBackground) {
            shapes.setColor(0.05f, 0.1f, 0.1f, 1f);
            shapes.rect(0f, 0f, WORLD_WIDTH, WORLD_HEIGHT);

            shapes.setColor(0.09f, 0.19f, 0.16f, 1f);
            shapes.ellipse(60f, 44f, WORLD_WIDTH - 120f, 418f);
            shapes.setColor(0.72f, 0.56f, 0.28f, 0.22f);
            shapes.rectLine(125f, 430f, 835f, 430f, 2.5f);
        }
        drawThrowGuide();
        drawPullGuide();
        shapes.end();
    }

    private void drawThrowGuide() {
        float amount = MathUtils.clamp(throwIntentAmount, 0f, 1f);
        if (draggedCard == null || amount <= 0.04f) return;

        float cx = discardCenterX();
        float cy = discardCenterY();
        float pad = 10f + amount * 20f;
        float alpha = dragThrowArmed ? 0.42f : 0.16f + amount * 0.2f;
        shapes.setColor(1f, 0.82f, 0.32f, alpha);
        shapes.ellipse(
            discardPileBounds.x - pad,
            discardPileBounds.y - pad * 0.72f,
            discardPileBounds.width + pad * 2f,
            discardPileBounds.height + pad * 1.44f
        );
        shapes.setColor(1f, 0.94f, 0.62f, dragThrowArmed ? 0.34f : 0.14f);
        shapes.rectLine(draggedCard.x, draggedCard.y, cx, cy, 2.5f + amount * 3.5f);
    }

    private void drawPullGuide() {
        // Pulling the deck card opens space in the hand instead of drawing a guide line.
    }

    private boolean shouldShowNativeStartScreen() {
        return startScreenVisible
            && nativeConfig != null
            && nativeConfig.debugScenario == null
            && (nativeClient == null || !nativeClient.hasRoom());
    }

    private boolean shouldShowNativeLobbyScreen() {
        return nativeClient != null
            && !isWebLaunchedNativeTable()
            && nativeClient.isLobby()
            && nativeRoomState != null
            && !requestDeclarationOpen
            && !jokerDeclarationOpen;
    }

    private boolean shouldShowNativeTableLoadingScreen() {
        return isWebLaunchedNativeTable()
            && (latestState == null || nativeRoomState == null || !nativeRoomState.isPlaying());
    }

    private boolean isWebLaunchedNativeTable() {
        return nativeConfig != null
            && nativeConfig.debugScenario == null
            && nativeConfig.hostManagedTable;
    }

    private void drawNativeTableLoadingScreen() {
        drawNativeShellBackground(false);

        Rectangle panel = new Rectangle(WORLD_WIDTH / 2f - 184f, WORLD_HEIGHT / 2f - 54f, 368f, 108f);
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        drawGlassPanel(panel, 22f, 0.82f);
        shapes.end();

        batch.begin();
        messageFont.setColor(0.98f, 0.95f, 0.84f, 1f);
        drawCentered(messageFont, "ROZDAWANIE KART...", WORLD_WIDTH / 2f, panel.y + 66f);
        labelFont.setColor(0.78f, 0.86f, 0.90f, 0.86f);
        String detail = nativeConfig.roomId == null ? "Czekam na grę" : "Pokój " + nativeConfig.roomId;
        drawCentered(labelFont, detail, WORLD_WIDTH / 2f, panel.y + 34f);
        messageFont.setColor(Color.WHITE);
        labelFont.setColor(Color.WHITE);
        batch.end();
    }

    private void drawNativeStartScreen() {
        drawNativeShellBackground(true);

        Rectangle panel = startPanelBounds();
        Rectangle status = startStatusBounds();

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        drawGlassPanel(panel, 22f, 0.96f);
        drawStartStatusShape(status);
        drawStartTabsShape();
        drawStartPanelFieldsShape();
        shapes.end();

        batch.begin();
        titleFont.setColor(1f, 0.98f, 0.88f, 1f);
        titleFont.draw(batch, "MAKAO", 68f, 318f);
        drawNativeStartHeroDeck(226f, 238f);
        drawStartStatusText(status);

        messageFont.setColor(1f, 0.92f, 0.66f, 1f);
        messageFont.draw(batch, startPanelTitle(), panel.x + 24f, panel.y + panel.height - 32f);
        drawStartTabsText();
        drawStartPanelFieldsText();
        batch.end();
    }

    private void drawNativeLobbyScreen() {
        drawNativeShellBackground(false);

        Rectangle readyButton = lobbyReadyButtonBounds();
        Rectangle startButton = lobbyStartButtonBounds();
        Rectangle settingsButton = lobbySettingsButtonBounds();
        Rectangle leaveButton = lobbyLeaveButtonBounds();
        boolean isHost = nativeRoomState != null && nativeConfig != null && nativeRoomState.isHost(nativeConfig.clientId);
        boolean meReady = isNativeLobbyMeReady();
        boolean allReady = lobbyAllPlayersReady();
        boolean enoughPlayers = lobbyHasEnoughPlayers();
        boolean canStart = isHost && allReady && enoughPlayers;

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        drawNativeLobbyRoomPanelShape();
        drawNativeLobbyTableStageShape(canStart);
        drawNativeLobbySeatsShape();
        drawNativeLobbyActionDockShape();
        drawGlassButton(leaveButton, new Color(0.28f, 0.065f, 0.055f, 0.94f), false);
        drawGlassButton(readyButton, meReady ? new Color(0.42f, 0.30f, 0.08f, 0.96f) : new Color(0.04f, 0.34f, 0.24f, 0.96f), true);
        if (lobbyDealPreviewTimer > 0f) {
            drawGlassButton(startButton, new Color(0.20f, 0.62f, 0.38f, 0.98f), true);
        } else {
            drawGlassButton(startButton, canStart ? new Color(0.92f, 0.56f, 0.08f, 0.98f) : new Color(0.13f, 0.16f, 0.22f, 0.78f), canStart);
        }
        drawGlassButton(settingsButton, isHost ? new Color(0.11f, 0.14f, 0.20f, 0.94f) : new Color(0.08f, 0.10f, 0.13f, 0.72f), isHost);
        shapes.end();

        batch.begin();
        drawNativeLobbyDeckDecor();
        drawNativeLobbyHeaderText();
        drawNativeLobbyCenterText();
        drawNativeLobbySeatsText();
        messageFont.setColor(1f, 0.84f, 0.78f, 1f);
        drawCentered(messageFont, "WYJDŹ", leaveButton.x + leaveButton.width / 2f, leaveButton.y + 33f);
        messageFont.setColor(meReady ? new Color(1f, 0.92f, 0.64f, 1f) : new Color(0.86f, 1f, 0.88f, 1f));
        drawCentered(messageFont, meReady ? "ANULUJ" : "GOTOWY", readyButton.x + readyButton.width / 2f, readyButton.y + 33f);
        messageFont.setColor(canStart ? new Color(0.08f, 0.07f, 0.04f, 1f) : new Color(0.62f, 0.66f, 0.72f, 1f));
        drawCentered(messageFont, lobbyDealPreviewTimer > 0f ? "ROZDAJĘ" : (canStart ? "START" : "CZEKAJ"), startButton.x + startButton.width / 2f, startButton.y + 33f);
        labelFont.setColor(isHost ? new Color(1f, 0.91f, 0.62f, 1f) : new Color(0.64f, 0.68f, 0.72f, 1f));
        drawCentered(labelFont, "USTAW.", settingsButton.x + settingsButton.width / 2f, settingsButton.y + 26f);
        batch.end();

        if (lobbySettingsOpen) {
            drawLobbySettingsOverlay();
        }
    }

    private void drawNativeShellBackground(boolean homeArtwork) {
        batch.begin();
        if (homeArtwork && drawLoadedCover(homeBackgroundTexture, 0f, 0f, WORLD_WIDTH, WORLD_HEIGHT, 1f)) {
            // Home art is intentionally darkened below to match the web start screen.
        } else if (tableBackgroundTexture != null && tableBackgroundTexture.isLoaded()) {
            batch.setColor(0.42f, 0.58f, 0.72f, 1f);
            batch.draw(tableBackgroundTexture.getRegion(), -24f, -14f, WORLD_WIDTH + 48f, WORLD_HEIGHT + 32f);
        } else {
            batch.setColor(0.025f, 0.055f, 0.045f, 1f);
            batch.draw(whitePixelTexture, 0f, 0f, WORLD_WIDTH, WORLD_HEIGHT);
        }
        if (!homeArtwork) {
            drawCardBack(86f + nativeShellSway(0f) * 5f, 442f + nativeShellSway(1.1f) * 3f, 46f, 69f, -14f + nativeShellSway(0.4f) * 2f, 1f, new Color(1f, 1f, 1f, 0.30f));
            drawCardBack(148f + nativeShellSway(1.7f) * 5f, 438f + nativeShellSway(0.7f) * 4f, 46f, 69f, 9f + nativeShellSway(1.2f) * 2f, 1f, new Color(1f, 1f, 1f, 0.26f));
            drawCardBack(850f + nativeShellSway(2.2f) * 5f, 78f + nativeShellSway(1.4f) * 4f, 48f, 72f, 8f + nativeShellSway(0.9f) * 2f, 1f, new Color(1f, 1f, 1f, 0.24f));
        }
        batch.setColor(Color.WHITE);
        batch.end();

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(homeArtwork ? new Color(0.008f, 0.014f, 0.022f, 0.34f) : new Color(0.008f, 0.014f, 0.018f, 0.70f));
        shapes.rect(0f, 0f, WORLD_WIDTH, WORLD_HEIGHT);
        if (homeArtwork) {
            shapes.setColor(0.04f, 0.16f, 0.13f, 0.48f + nativeShellPulse(0.2f) * 0.06f);
            shapes.ellipse(28f, 110f, 420f, 300f);
            shapes.setColor(0.03f, 0.08f, 0.12f, 0.22f);
            shapes.ellipse(602f, 70f, 390f, 360f);
            shapes.setColor(0f, 0f, 0f, 0.10f);
            shapes.ellipse(28f, 110f, 420f, 300f);
            shapes.ellipse(590f, 70f, 400f, 360f);
        } else {
            shapes.setColor(0.008f, 0.012f, 0.018f, 0.24f);
            shapes.rect(0f, 0f, WORLD_WIDTH, 54f);
            shapes.rect(0f, WORLD_HEIGHT - 54f, WORLD_WIDTH, 54f);
            shapes.setColor(0.08f, 0.20f, 0.18f, 0.22f + nativeShellPulse(0f) * 0.05f);
            shapes.ellipse(46f, 44f, WORLD_WIDTH - 92f, 438f);
            shapes.setColor(0.02f, 0.05f, 0.08f, 0.26f);
            shapes.ellipse(628f, 52f, 328f, 242f);
        }
        shapes.end();
    }

    private boolean drawLoadedCover(NativeTableSkin.LoadedTexture loaded, float x, float y, float width, float height, float alpha) {
        if (loaded == null || !loaded.isLoaded()) return false;
        Texture texture = loaded.getTexture();
        if (texture == null) return false;
        int sourceWidth = texture.getWidth();
        int sourceHeight = texture.getHeight();
        float sourceRatio = (float) sourceWidth / Math.max(1f, sourceHeight);
        float destRatio = width / Math.max(1f, height);
        int srcX = 0;
        int srcY = 0;
        int srcW = sourceWidth;
        int srcH = sourceHeight;
        if (sourceRatio > destRatio) {
            srcW = Math.max(1, Math.round(sourceHeight * destRatio));
            srcX = Math.max(0, (sourceWidth - srcW) / 2);
        } else {
            srcH = Math.max(1, Math.round(sourceWidth / destRatio));
            srcY = Math.max(0, (sourceHeight - srcH) / 2);
        }
        batch.setColor(1f, 1f, 1f, alpha);
        batch.draw(texture, x, y, width, height, srcX, srcY, srcW, srcH, false, false);
        batch.setColor(Color.WHITE);
        return true;
    }

    private void drawRoundedRect(Rectangle bounds, float radius, Color color) {
        float r = MathUtils.clamp(radius, 0f, Math.min(bounds.width, bounds.height) / 2f);
        shapes.setColor(color);
        shapes.rect(bounds.x + r, bounds.y, bounds.width - r * 2f, bounds.height);
        shapes.rect(bounds.x, bounds.y + r, bounds.width, bounds.height - r * 2f);
        shapes.circle(bounds.x + r, bounds.y + r, r, 24);
        shapes.circle(bounds.x + bounds.width - r, bounds.y + r, r, 24);
        shapes.circle(bounds.x + r, bounds.y + bounds.height - r, r, 24);
        shapes.circle(bounds.x + bounds.width - r, bounds.y + bounds.height - r, r, 24);
    }

    private void drawGlassPanel(Rectangle bounds, float radius, float alpha) {
        Rectangle shadow = new Rectangle(bounds.x + 10f, bounds.y - 12f, bounds.width, bounds.height);
        drawRoundedRect(shadow, radius + 4f, new Color(0f, 0f, 0f, 0.24f * alpha));
        drawRoundedRect(bounds, radius, new Color(0.045f, 0.070f, 0.115f, 0.91f * alpha));
        Rectangle inner = new Rectangle(bounds.x + 2f, bounds.y + 2f, bounds.width - 4f, bounds.height - 4f);
        drawRoundedRect(inner, Math.max(0f, radius - 2f), new Color(0.020f, 0.032f, 0.055f, 0.46f * alpha));
        shapes.setColor(1f, 1f, 1f, 0.055f * alpha);
        shapes.rect(bounds.x + radius, bounds.y + bounds.height - 2f, bounds.width - radius * 2f, 2f);
        shapes.setColor(0.95f, 0.76f, 0.34f, 0.24f * alpha);
        shapes.rect(bounds.x + radius, bounds.y + 1f, bounds.width - radius * 2f, 2f);
    }

    private void drawGlassButton(Rectangle bounds, Color color, boolean highlighted) {
        drawRoundedRect(new Rectangle(bounds.x + 4f, bounds.y - 5f, bounds.width, bounds.height), bounds.height / 2f, new Color(0f, 0f, 0f, 0.22f));
        drawRoundedRect(bounds, bounds.height / 2f, color);
        shapes.setColor(1f, 1f, 1f, highlighted ? 0.20f : 0.08f);
        shapes.rect(bounds.x + bounds.height / 2f, bounds.y + bounds.height - 2f, bounds.width - bounds.height, 2f);
    }

    private float nativeShellSway(float offset) {
        return MathUtils.sin(elapsed * 1.2f + offset);
    }

    private float nativeShellPulse(float offset) {
        return 0.5f + MathUtils.sin(elapsed * 2.0f + offset) * 0.5f;
    }

    private void drawNativeStartHeroDeck(float centerX, float centerY) {
        float intro = smoothstep(MathUtils.clamp(elapsed / 0.72f, 0f, 1f));
        float idle = nativeShellSway(0.8f) * 2.2f;
        float[] offsets = { -48f, -16f, 16f, 48f };
        float[] angles = { -12f, -4f, 5f, 13f };
        for (int i = 0; i < offsets.length; i++) {
            float deal = smoothstep(MathUtils.clamp((elapsed - 0.08f - i * 0.055f) / 0.42f, 0f, 1f));
            float x = centerX + offsets[i] * deal;
            float y = centerY + idle + (1f - deal) * 22f;
            float alpha = MathUtils.clamp(intro * (0.38f + deal * 0.62f), 0f, 1f);
            drawCardBack(x, y, 34f, 51f, angles[i] * deal, 1f, new Color(1f, 1f, 1f, alpha));
        }
    }

    private void drawNativeLobbyRoomPanelShape() {
        drawGlassPanel(lobbyRoomPanelBounds(), 18f, 0.92f);
    }

    private void drawNativeLobbyActionDockShape() {
        drawGlassPanel(lobbyActionDockBounds(), 20f, 0.74f);
    }

    private void drawNativeLobbyTableStageShape(boolean allReady) {
        float pulse = nativeShellPulse(0.5f);
        shapes.setColor(0f, 0f, 0f, 0.28f);
        shapes.ellipse(78f, 66f, 804f, 384f);
        shapes.setColor(0.012f, 0.050f, 0.062f, 0.82f);
        shapes.ellipse(92f, 84f, 776f, 354f);
        shapes.setColor(0.026f, 0.132f, 0.104f, allReady ? 0.54f + pulse * 0.05f : 0.48f);
        shapes.ellipse(132f, 118f, 696f, 286f);
        shapes.setColor(0.018f, 0.074f, 0.064f, 0.44f);
        shapes.ellipse(196f, 176f, 568f, 166f);
        shapes.setColor(0.95f, 0.76f, 0.34f, allReady ? 0.20f + pulse * 0.07f : 0.16f);
        shapes.rectLine(128f, 396f, 832f, 396f, allReady ? 2.8f : 1.6f);
        shapes.rectLine(128f, 128f, 832f, 128f, 1.2f);
        shapes.rectLine(182f, 262f, 778f, 262f, 1.0f);
        shapes.setColor(1f, 1f, 1f, 0.026f);
        shapes.ellipse(234f, 246f, 492f, 74f);
    }

    private void drawNativeLobbyDeckDecor() {
        float idleY = 220f + nativeShellSway(1.5f) * 2f;
        drawCardBack(WORLD_WIDTH / 2f - 16f, idleY + 2f, 42f, 63f, -8f + nativeShellSway(0.2f) * 2f, 1f, new Color(1f, 1f, 1f, 0.72f));
        drawCardBack(WORLD_WIDTH / 2f + 16f, idleY, 42f, 63f, 7f + nativeShellSway(0.6f) * 2f, 1f, new Color(1f, 1f, 1f, 0.78f));
        if (lobbyDealPreviewTimer <= 0f) return;

        float phase = 1f - MathUtils.clamp(lobbyDealPreviewTimer / LOBBY_DEAL_PREVIEW_SECONDS, 0f, 1f);
        float[][] targets = {
            { -172f, -84f, -13f },
            { 172f, 72f, 12f },
            { -136f, 76f, 8f },
            { 138f, -74f, -8f }
        };
        for (int i = 0; i < targets.length; i++) {
            float t = smoothstep(MathUtils.clamp((phase - i * 0.08f) / 0.46f, 0f, 1f));
            float x = WORLD_WIDTH / 2f + targets[i][0] * t;
            float y = 220f + targets[i][1] * t;
            float alpha = MathUtils.clamp(t * 1.2f, 0f, 1f);
            drawCardBack(x, y, 42f, 63f, targets[i][2] * t, 1f, new Color(1f, 1f, 1f, alpha));
        }
    }

    private void drawNativeLobbyHeaderText() {
        String roomName = nativeRoomState == null || nativeRoomState.name == null || nativeRoomState.name.trim().isEmpty()
            ? (nativeRoomState == null || nativeRoomState.id == null ? "Stół" : nativeRoomState.id)
            : nativeRoomState.name;
        Rectangle panel = lobbyRoomPanelBounds();
        labelFont.setColor(0.72f, 0.78f, 0.82f, 0.9f);
        labelFont.draw(batch, "Pokój", panel.x + 18f, panel.y + panel.height - 18f);
        messageFont.setColor(1f, 0.98f, 0.88f, 1f);
        messageFont.draw(batch, compactText(roomName, 20), panel.x + 18f, panel.y + panel.height - 48f);
        labelFont.setColor(0.80f, 0.84f, 0.80f, 0.82f);
        labelFont.draw(batch, "Kod: " + (nativeRoomState == null || nativeRoomState.id == null ? "------" : nativeRoomState.id), panel.x + 18f, panel.y + 21f);
    }

    private void drawNativeLobbyCenterText() {
        if (nativeRoomState == null) return;
        String countLabel = lobbyHasEnoughPlayers()
            ? lobbyReadyCount() + "/" + nativeRoomState.players.size() + " gotowych"
            : "Czekam na gracza";
        String settingsSummary = nativeRoomState.deckCount + " talia"
            + (nativeRoomState.deckCount == 1 ? "" : "e")
            + " · " + (nativeRoomState.useJokers ? "jokery" : "bez jokerów")
            + " · " + (nativeRoomState.allowMultipleCards ? "wiele kart" : "jedna karta")
            + " · " + battleCounterLabel(nativeRoomState.battleCounterMode);
        String statsSummary = nativeLobbyStatsSummary();
        messageFont.setColor(1f, 0.92f, 0.66f, 1f);
        drawCenteredScaledFitted(messageFont, nativeRoomState.id == null ? "------" : nativeRoomState.id, WORLD_WIDTH / 2f, 340f, 270f, 1.18f, 0.76f);
        labelFont.setColor(lobbyHasEnoughPlayers() ? new Color(0.86f, 0.90f, 0.88f, 0.88f) : new Color(1f, 0.82f, 0.52f, 0.95f));
        drawCenteredFitted(labelFont, countLabel, WORLD_WIDTH / 2f, 306f, 300f, 0.58f);
        labelFont.setColor(0.78f, 0.84f, 0.82f, 0.76f);
        drawCenteredFitted(labelFont, settingsSummary, WORLD_WIDTH / 2f, 276f, 420f, 0.46f);
        labelFont.setColor(0.96f, 0.89f, 0.70f, 0.78f);
        drawCenteredFitted(labelFont, statsSummary, WORLD_WIDTH / 2f, 254f, 360f, 0.42f);
    }

    private String nativeLobbyStatsSummary() {
        if (nativeRoomState == null) return "Partie: 0";
        String leaderName = "";
        int leaderWins = 0;
        for (MakaoPlayer player : nativeRoomState.players) {
            if (player == null || player.id == null) continue;
            int wins = nativeRoomState.wins.getOrDefault(player.id, 0);
            if (wins > leaderWins) {
                leaderWins = wins;
                leaderName = cleanDisplayName(player.name);
            }
        }
        if (leaderWins > 0) {
            return "Partie: " + nativeRoomState.gamesPlayed + " · lider " + leaderName + ": " + leaderWins;
        }
        return "Partie: " + nativeRoomState.gamesPlayed;
    }

    private void drawNativeLobbySeatsShape() {
        if (nativeRoomState == null) return;
        int maxSeats = MathUtils.clamp(nativeRoomState.maxPlayers, nativeRoomState.players.size(), 8);
        for (int i = 0; i < maxSeats; i++) {
            Rectangle seat = lobbySeatBounds(i);
            boolean occupied = i < nativeRoomState.players.size();
            boolean ready = occupied && nativeRoomState.players.get(i).ready;
            float alpha = occupied ? 0.96f : 0.34f;
            drawRoundedRect(new Rectangle(seat.x + 3f, seat.y - 5f, seat.width, seat.height), seat.height / 2f, new Color(0f, 0f, 0f, 0.20f * alpha));
            drawRoundedRect(seat, seat.height / 2f, ready
                ? new Color(0.04f, 0.26f, 0.20f, alpha)
                : (occupied ? new Color(0.055f, 0.080f, 0.112f, alpha) : new Color(0.030f, 0.050f, 0.066f, alpha)));
            shapes.setColor(occupied
                ? (ready ? new Color(0.52f, 0.98f, 0.68f, 0.84f * alpha) : new Color(0.98f, 0.72f, 0.30f, 0.82f * alpha))
                : new Color(0.70f, 0.78f, 0.78f, 0.32f * alpha));
            shapes.circle(seat.x + 22f, seat.y + seat.height / 2f, occupied ? 8f : 6f, 18);
            shapes.setColor(ready ? new Color(0.40f, 0.92f, 0.62f, 0.42f * alpha) : new Color(0.96f, 0.76f, 0.34f, 0.22f * alpha));
            shapes.rect(seat.x + seat.height / 2f, seat.y + seat.height - 2f, seat.width - seat.height, 2f);
        }
    }

    private void drawNativeLobbySeatsText() {
        if (nativeRoomState == null) return;
        int maxSeats = MathUtils.clamp(nativeRoomState.maxPlayers, nativeRoomState.players.size(), 8);
        for (int i = 0; i < maxSeats; i++) {
            Rectangle seat = lobbySeatBounds(i);
            if (i < nativeRoomState.players.size()) {
                MakaoPlayer player = nativeRoomState.players.get(i);
                boolean host = player.host || (nativeRoomState.hostId != null && nativeRoomState.hostId.equals(player.id));
                labelFont.setColor(player.online ? new Color(0.94f, 0.97f, 0.96f, 1f) : new Color(0.68f, 0.72f, 0.76f, 0.72f));
                drawFullPlayerName(labelFont, cleanDisplayName(player.name), seat.x + 38f, seat.y + 32f, seat.width - 104f, 0.48f);
                labelFont.setColor(player.ready ? new Color(0.54f, 0.92f, 0.65f, 1f) : new Color(0.96f, 0.76f, 0.34f, 0.92f));
                drawCenteredFitted(labelFont, host ? "host" : (player.ready ? "gotowy" : "czeka"), seat.x + seat.width - 42f, seat.y + 31f, 76f, 0.42f);
                labelFont.setColor(0.98f, 0.91f, 0.70f, 0.82f);
                int wins = player.id == null ? 0 : nativeRoomState.wins.getOrDefault(player.id, 0);
                drawCenteredFitted(labelFont, "W: " + wins, seat.x + seat.width - 42f, seat.y + 15f, 76f, 0.34f);
            } else {
                labelFont.setColor(0.78f, 0.84f, 0.84f, 0.50f);
                drawCenteredFitted(labelFont, "+ miejsce", seat.x + seat.width / 2f + 8f, seat.y + 31f, seat.width - 40f, 0.46f);
            }
        }
    }

    private Rectangle lobbySeatBounds(int index) {
        float width = 174f;
        float height = 48f;
        switch (index) {
            case 0:
                return new Rectangle(WORLD_WIDTH / 2f - width / 2f, 88f, width, height);
            case 1:
                return new Rectangle(WORLD_WIDTH / 2f - width / 2f, 404f, width, height);
            case 2:
                return new Rectangle(54f, 248f, width, height);
            case 3:
                return new Rectangle(WORLD_WIDTH - 54f - width, 248f, width, height);
            case 4:
                return new Rectangle(196f, 370f, width, height);
            case 5:
                return new Rectangle(WORLD_WIDTH - 196f - width, 370f, width, height);
            case 6:
                return new Rectangle(196f, 126f, width, height);
            default:
                return new Rectangle(WORLD_WIDTH - 196f - width, 126f, width, height);
        }
    }

    private void drawStartStatusShape(Rectangle status) {
        Color tone = menuStatusColor();
        drawRoundedRect(new Rectangle(status.x + 4f, status.y - 5f, status.width, status.height), status.height / 2f, new Color(0f, 0f, 0f, 0.25f));
        drawRoundedRect(status, status.height / 2f, new Color(0.02f, 0.028f, 0.04f, 0.78f));
        shapes.setColor(tone.r, tone.g, tone.b, 0.12f + nativeShellPulse(0.2f) * 0.16f);
        shapes.circle(status.x + 18f, status.y + status.height / 2f, 10f + nativeShellPulse(0.2f) * 4f);
        shapes.setColor(tone);
        shapes.circle(status.x + 18f, status.y + status.height / 2f, 5f + nativeShellPulse(0.2f) * 1.6f);
    }

    private void drawStartStatusText(Rectangle status) {
        labelFont.setColor(0.9f, 0.9f, 0.84f, 1f);
        labelFont.draw(batch, menuStatusLabel(), status.x + 32f, status.y + 23f);
    }

    private void drawStartTabsShape() {
        Rectangle tabs = startTabsBounds();
        drawRoundedRect(tabs, 18f, new Color(0.006f, 0.012f, 0.020f, 0.76f));
        for (StartPanel panel : StartPanel.values()) {
            Rectangle bounds = startTabBounds(panel);
            if (startPanel == panel) {
                drawRoundedRect(bounds, 14f, new Color(0.43f, 0.31f, 0.11f, 0.94f));
                shapes.setColor(0.95f, 0.76f, 0.34f, 0.45f);
                shapes.rect(bounds.x + 18f, bounds.y + 4f, bounds.width - 36f, 2f);
            }
        }
    }

    private void drawStartTabsText() {
        for (StartPanel panel : StartPanel.values()) {
            Rectangle bounds = startTabBounds(panel);
            labelFont.setColor(startPanel == panel ? new Color(1f, 0.91f, 0.62f, 1f) : new Color(0.74f, 0.76f, 0.78f, 1f));
            drawCentered(labelFont, startPanelLabel(panel), bounds.x + bounds.width / 2f, bounds.y + 28f);
        }
    }

    private void drawStartPanelFieldsShape() {
        if (startPanel == StartPanel.CREATE) {
            drawInputShape(playerFieldBounds());
            drawInputShape(roomNameFieldBounds());
            drawPrimaryButtonShape(createRoomButtonBounds(), true);
        } else if (startPanel == StartPanel.JOIN) {
            drawInputShape(playerFieldBounds());
            drawInputShape(roomCodeFieldBounds());
            drawPrimaryButtonShape(joinRoomButtonBounds(), menuRoomCode.length() == 6);
        } else {
            drawInputShape(playerFieldBounds());
            drawInputShape(serverFieldBounds());
            drawToggleShape(audioToggleBounds(), audioEnabled);
            drawToggleShape(hapticsToggleBounds(), hapticsEnabled);
            drawToggleShape(solidCardsToggleBounds(), solidCardsEnabled);
            drawPrimaryButtonShape(defaultServerButtonBounds(), true);
        }
    }

    private void drawStartPanelFieldsText() {
        if (startPanel == StartPanel.CREATE) {
            drawFieldText("PSEUDONIM", menuPlayerName, playerFieldBounds());
            drawFieldText("NAZWA STOŁU", menuRoomName, roomNameFieldBounds());
            drawButtonText(createRoomButtonBounds(), "STWÓRZ STÓŁ", false, messageFont);
        } else if (startPanel == StartPanel.JOIN) {
            drawFieldText("PSEUDONIM", menuPlayerName, playerFieldBounds());
            String roomCodeLabel = !lastRoomId.isEmpty() && safeEquals(menuRoomCode, lastRoomId)
                ? "OSTATNI STÓŁ"
                : "KOD STOŁU";
            drawFieldText(roomCodeLabel, menuRoomCode.isEmpty() ? "------" : menuRoomCode, roomCodeFieldBounds());
            drawButtonText(joinRoomButtonBounds(), "DOŁĄCZ", false, messageFont);
        } else {
            drawFieldText("PSEUDONIM", menuPlayerName, playerFieldBounds());
            drawFieldText("SERWER", compactText(menuServerUrl, 34), serverFieldBounds());
            drawToggleText(audioToggleBounds(), "DŹWIĘK", audioEnabled ? "Włączony" : "Wyłączony");
            drawToggleText(hapticsToggleBounds(), "WIBRACJE", hapticsEnabled ? "Włączone" : "Wyłączone");
            drawToggleText(solidCardsToggleBounds(), "KARTY", solidCardsEnabled ? "Pełne" : "Miękkie");
            drawButtonText(defaultServerButtonBounds(), "DOMYŚLNY", false, labelFont);
        }
    }

    private void drawInputShape(Rectangle bounds) {
        drawRoundedRect(new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height), 14f, new Color(0.006f, 0.014f, 0.028f, 0.78f));
        shapes.setColor(0.42f, 0.52f, 0.64f, 0.22f);
        shapes.rect(bounds.x + 16f, bounds.y + bounds.height - 2f, bounds.width - 32f, 2f);
    }

    private void drawPrimaryButtonShape(Rectangle bounds, boolean enabled) {
        float pulse = enabled ? nativeShellPulse(0.6f) : 0f;
        drawRoundedRect(new Rectangle(bounds.x + 5f, bounds.y - 6f, bounds.width, bounds.height), bounds.height / 2f, new Color(0f, 0f, 0f, 0.25f));
        drawRoundedRect(bounds, bounds.height / 2f, enabled ? new Color(0.18f, 0.41f + pulse * 0.03f, 0.88f + pulse * 0.04f, 0.98f) : new Color(0.12f, 0.18f, 0.28f, 0.72f));
        if (enabled) {
            shapes.setColor(0.94f, 0.72f, 0.28f, 0.18f + pulse * 0.16f);
            shapes.rect(bounds.x + bounds.height / 2f, bounds.y + bounds.height - 2f, bounds.width - bounds.height, 2f);
        }
    }

    private void drawToggleShape(Rectangle bounds, boolean enabled) {
        drawRoundedRect(bounds, 14f, enabled ? new Color(0.04f, 0.28f, 0.19f, 0.88f) : new Color(0.05f, 0.07f, 0.09f, 0.84f));
        shapes.setColor(enabled ? new Color(0.34f, 0.88f, 0.58f, 0.46f) : new Color(0.38f, 0.42f, 0.48f, 0.36f));
        shapes.rect(bounds.x + 14f, bounds.y + bounds.height - 2f, bounds.width - 28f, 2f);
    }

    private void drawFieldText(String label, String value, Rectangle field) {
        labelFont.setColor(0.66f, 0.72f, 0.8f, 1f);
        labelFont.draw(batch, label, field.x, field.y + field.height + 18f);
        messageFont.setColor(0.9f, 0.92f, 0.94f, 1f);
        drawCentered(messageFont, value, field.x + field.width / 2f, field.y + 30f);
    }

    private void drawToggleText(Rectangle bounds, String label, String value) {
        labelFont.setColor(0.72f, 0.78f, 0.82f, 1f);
        labelFont.draw(batch, label, bounds.x + 14f, bounds.y + 36f);
        labelFont.setColor(0.92f, 0.94f, 0.86f, 1f);
        labelFont.draw(batch, value, bounds.x + 14f, bounds.y + 16f);
    }

    private Rectangle startPanelBounds() {
        return new Rectangle(528f, 48f, 382f, 444f);
    }

    private Rectangle startStatusBounds() {
        return new Rectangle(72f, 178f, 154f, 36f);
    }

    private Rectangle startTabsBounds() {
        Rectangle panel = startPanelBounds();
        return new Rectangle(panel.x + 18f, panel.y + 314f, panel.width - 36f, 50f);
    }

    private Rectangle startTabBounds(StartPanel panel) {
        Rectangle tabs = startTabsBounds();
        float gap = 6f;
        float width = (tabs.width - gap * 2f) / 3f;
        int index = panel == StartPanel.CREATE ? 0 : panel == StartPanel.JOIN ? 1 : 2;
        return new Rectangle(tabs.x + index * (width + gap), tabs.y + 6f, width, tabs.height - 12f);
    }

    private Rectangle playerFieldBounds() {
        Rectangle panel = startPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 232f, panel.width - 44f, 52f);
    }

    private Rectangle roomNameFieldBounds() {
        Rectangle panel = startPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 150f, panel.width - 44f, 52f);
    }

    private Rectangle roomCodeFieldBounds() {
        return roomNameFieldBounds();
    }

    private Rectangle serverFieldBounds() {
        Rectangle panel = startPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 144f, panel.width - 44f, 44f);
    }

    private Rectangle createRoomButtonBounds() {
        Rectangle panel = startPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 54f, panel.width - 44f, 56f);
    }

    private Rectangle joinRoomButtonBounds() {
        return createRoomButtonBounds();
    }

    private Rectangle audioToggleBounds() {
        Rectangle panel = startPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 92f, (panel.width - 52f) / 2f, 52f);
    }

    private Rectangle hapticsToggleBounds() {
        Rectangle audio = audioToggleBounds();
        return new Rectangle(audio.x + audio.width + 8f, audio.y, audio.width, audio.height);
    }

    private Rectangle solidCardsToggleBounds() {
        Rectangle panel = startPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 30f, (panel.width - 52f) / 2f, 48f);
    }

    private Rectangle defaultServerButtonBounds() {
        Rectangle solid = solidCardsToggleBounds();
        return new Rectangle(solid.x + solid.width + 8f, solid.y, solid.width, solid.height);
    }

    private MakaoPlayer nativeLobbyMe() {
        if (nativeRoomState == null || nativeConfig == null) return null;
        for (MakaoPlayer player : nativeRoomState.players) {
            if (player.id != null && player.id.equals(nativeConfig.clientId)) return player;
        }
        return null;
    }

    private boolean isNativeLobbyMeReady() {
        MakaoPlayer me = nativeLobbyMe();
        return me != null && me.ready;
    }

    private int lobbyReadyCount() {
        if (nativeRoomState == null) return 0;
        int count = 0;
        for (MakaoPlayer player : nativeRoomState.players) {
            if (player.ready) count++;
        }
        return count;
    }

    private boolean lobbyAllPlayersReady() {
        if (nativeRoomState == null || nativeRoomState.players.isEmpty()) return false;
        for (MakaoPlayer player : nativeRoomState.players) {
            if (!player.ready) return false;
        }
        return true;
    }

    private boolean lobbyHasEnoughPlayers() {
        return nativeRoomState != null && nativeRoomState.players != null && nativeRoomState.players.size() >= 2;
    }

    private Rectangle lobbyPanelBounds() {
        return new Rectangle(118f, 88f, 724f, 350f);
    }

    private Rectangle lobbyRoomPanelBounds() {
        return new Rectangle(28f, 434f, 286f, 82f);
    }

    private Rectangle lobbyActionDockBounds() {
        return new Rectangle(96f, 10f, 768f, 76f);
    }

    private Rectangle lobbyReadyButtonBounds() {
        return new Rectangle(326f, 22f, 184f, 50f);
    }

    private Rectangle lobbyStartButtonBounds() {
        return new Rectangle(656f, 22f, 184f, 50f);
    }

    private Rectangle lobbyLeaveButtonBounds() {
        return new Rectangle(120f, 22f, 156f, 50f);
    }

    private Rectangle lobbySettingsButtonBounds() {
        return new Rectangle(832f, 476f, 88f, 40f);
    }

    private Rectangle lobbySettingsSheetBounds() {
        return new Rectangle(72f, 42f, 816f, 456f);
    }

    private Rectangle lobbySettingsCloseBounds() {
        Rectangle sheet = lobbySettingsSheetBounds();
        return new Rectangle(sheet.x + sheet.width - 68f, sheet.y + sheet.height - 58f, 46f, 40f);
    }

    private Rectangle lobbySettingsTabBounds(int page) {
        Rectangle sheet = lobbySettingsSheetBounds();
        float width = 168f;
        return new Rectangle(sheet.x + 28f + page * (width + 10f), sheet.y + sheet.height - 92f, width, 38f);
    }

    private Rectangle lobbySettingsCardBounds(int index) {
        Rectangle sheet = lobbySettingsSheetBounds();
        float gap = 14f;
        float width = (sheet.width - 56f - gap) / 2f;
        float height = 70f;
        int col = index % 2;
        int row = index / 2;
        return new Rectangle(sheet.x + 28f + col * (width + gap), sheet.y + sheet.height - 190f - row * 82f, width, height);
    }

    private Rectangle settingsMinusBounds(Rectangle card) {
        return new Rectangle(card.x + 12f, card.y + 13f, 44f, 30f);
    }

    private Rectangle settingsPlusBounds(Rectangle card) {
        return new Rectangle(card.x + card.width - 56f, card.y + 13f, 44f, 30f);
    }

    private Rectangle settingsLeftSegmentBounds(Rectangle card) {
        return new Rectangle(card.x + 12f, card.y + 12f, (card.width - 30f) / 2f, 32f);
    }

    private Rectangle settingsRightSegmentBounds(Rectangle card) {
        Rectangle left = settingsLeftSegmentBounds(card);
        return new Rectangle(left.x + left.width + 6f, left.y, left.width, left.height);
    }

    private void drawLobbySettingsOverlay() {
        Rectangle sheet = lobbySettingsSheetBounds();
        Rectangle close = lobbySettingsCloseBounds();
        boolean isHost = isNativeLobbyHost();

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.005f, 0.008f, 0.012f, 0.68f);
        shapes.rect(0f, 0f, WORLD_WIDTH, WORLD_HEIGHT);
        shapes.setColor(0.018f, 0.025f, 0.037f, 0.98f);
        shapes.rect(sheet.x, sheet.y, sheet.width, sheet.height);
        shapes.setColor(0.94f, 0.72f, 0.28f, 0.34f);
        shapes.rectLine(sheet.x, sheet.y, sheet.x + sheet.width, sheet.y, 2f);
        shapes.rectLine(sheet.x, sheet.y + sheet.height, sheet.x + sheet.width, sheet.y + sheet.height, 2f);
        drawSettingsTabShape(lobbySettingsTabBounds(0), lobbySettingsPage == 0);
        drawSettingsTabShape(lobbySettingsTabBounds(1), lobbySettingsPage == 1);
        shapes.setColor(0.12f, 0.10f, 0.10f, 0.94f);
        shapes.rect(close.x, close.y, close.width, close.height);
        shapes.setColor(0.75f, 0.2f, 0.14f, 0.5f);
        shapes.rectLine(close.x, close.y, close.x + close.width, close.y, 1.5f);
        shapes.rectLine(close.x, close.y + close.height, close.x + close.width, close.y + close.height, 1.5f);

        for (int i = 0; i < 6; i++) {
            Rectangle card = lobbySettingsCardBounds(i);
            if (lobbySettingsPage == 0) {
                drawBasicSettingsCardShape(i, card, isHost);
            } else {
                drawRuleSettingsCardShape(i, card, isHost);
            }
        }
        shapes.end();

        batch.begin();
        messageFont.setColor(1f, 0.92f, 0.66f, 1f);
        messageFont.draw(batch, "USTAWIENIA STOŁU", sheet.x + 28f, sheet.y + sheet.height - 26f);
        drawSettingsTabText(lobbySettingsTabBounds(0), "Podstawowe", lobbySettingsPage == 0);
        drawSettingsTabText(lobbySettingsTabBounds(1), "Zasady", lobbySettingsPage == 1);
        drawCentered(messageFont, "×", close.x + close.width / 2f, close.y + 28f);

        for (int i = 0; i < 6; i++) {
            Rectangle card = lobbySettingsCardBounds(i);
            if (lobbySettingsPage == 0) {
                drawBasicSettingsCardText(i, card);
            } else {
                drawRuleSettingsCardText(i, card);
            }
        }
        batch.end();
    }

    private void drawSettingsTabShape(Rectangle bounds, boolean active) {
        shapes.setColor(active ? new Color(0.38f, 0.28f, 0.10f, 0.96f) : new Color(0.05f, 0.06f, 0.075f, 0.92f));
        shapes.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    private void drawSettingsTabText(Rectangle bounds, String text, boolean active) {
        labelFont.setColor(active ? new Color(1f, 0.91f, 0.62f, 1f) : new Color(0.72f, 0.76f, 0.8f, 1f));
        drawCentered(labelFont, text, bounds.x + bounds.width / 2f, bounds.y + 25f);
    }

    private void drawSettingCardBase(Rectangle card, boolean enabled) {
        shapes.setColor(enabled ? new Color(0.035f, 0.046f, 0.062f, 0.96f) : new Color(0.026f, 0.032f, 0.042f, 0.92f));
        shapes.rect(card.x, card.y, card.width, card.height);
        shapes.setColor(0.25f, 0.30f, 0.36f, enabled ? 0.36f : 0.20f);
        shapes.rectLine(card.x, card.y, card.x + card.width, card.y, 1.25f);
        shapes.rectLine(card.x, card.y + card.height, card.x + card.width, card.y + card.height, 1.25f);
    }

    private void drawStepperShape(Rectangle card, boolean enabled) {
        drawSettingCardBase(card, enabled);
        drawSmallSettingButton(settingsMinusBounds(card), enabled);
        drawSmallSettingButton(settingsPlusBounds(card), enabled);
    }

    private void drawSmallSettingButton(Rectangle bounds, boolean enabled) {
        shapes.setColor(enabled ? new Color(0.12f, 0.18f, 0.27f, 0.94f) : new Color(0.07f, 0.08f, 0.10f, 0.82f));
        shapes.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    private void drawSegmentShape(Rectangle card, boolean leftActive, boolean enabled) {
        drawSettingCardBase(card, enabled);
        Rectangle left = settingsLeftSegmentBounds(card);
        Rectangle right = settingsRightSegmentBounds(card);
        shapes.setColor(leftActive ? new Color(0.22f, 0.24f, 0.34f, enabled ? 0.98f : 0.58f) : new Color(0.07f, 0.08f, 0.10f, 0.84f));
        shapes.rect(left.x, left.y, left.width, left.height);
        shapes.setColor(!leftActive ? new Color(0.22f, 0.24f, 0.34f, enabled ? 0.98f : 0.58f) : new Color(0.07f, 0.08f, 0.10f, 0.84f));
        shapes.rect(right.x, right.y, right.width, right.height);
    }

    private void drawBasicSettingsCardShape(int index, Rectangle card, boolean enabled) {
        if (index == 0 || index == 1 || index == 2) {
            drawStepperShape(card, enabled);
        } else if (index == 3 || index == 4) {
            boolean leftActive = index == 3 ? !nativeRoomState.useJokers : "random_each_game".equals(nativeRoomState.firstPlayerMode);
            drawSegmentShape(card, leftActive, enabled);
        } else {
            drawSettingCardBase(card, enabled);
        }
    }

    private void drawRuleSettingsCardShape(int index, Rectangle card, boolean enabled) {
        if (index == 5) {
            drawStepperShape(card, enabled);
            return;
        }
        boolean leftActive;
        if (index == 0) {
            leftActive = "suit_or_rank".equals(nativeRoomState.battleCounterMode);
        } else if (index == 1) {
            leftActive = "defensive_non_functional".equals(nativeRoomState.queenVariant);
        } else if (index == 2) {
            leftActive = "cancels_request".equals(nativeRoomState.queenRequestMode);
        } else if (index == 3) {
            leftActive = "with_non_battle_kings".equals(nativeRoomState.jackRequestMode);
        } else {
            leftActive = "optional".equals(nativeRoomState.aceJackRequestMode);
        }
        drawSegmentShape(card, leftActive, enabled);
    }

    private void drawCardLabel(Rectangle card, String label) {
        labelFont.setColor(0.62f, 0.68f, 0.76f, 1f);
        labelFont.draw(batch, label, card.x + 14f, card.y + card.height - 12f);
    }

    private void drawStepperText(Rectangle card, String label, String value) {
        drawCardLabel(card, label);
        messageFont.setColor(0.94f, 0.9f, 0.76f, 1f);
        drawCenteredFitted(messageFont, value, card.x + card.width / 2f, card.y + 34f, card.width - 130f, 0.54f);
        labelFont.setColor(0.94f, 0.9f, 0.76f, 1f);
        drawCentered(labelFont, "-", settingsMinusBounds(card).x + settingsMinusBounds(card).width / 2f, settingsMinusBounds(card).y + 22f);
        drawCentered(labelFont, "+", settingsPlusBounds(card).x + settingsPlusBounds(card).width / 2f, settingsPlusBounds(card).y + 22f);
    }

    private void drawSegmentText(Rectangle card, String label, String left, String right) {
        drawCardLabel(card, label);
        labelFont.setColor(0.91f, 0.9f, 0.78f, 1f);
        Rectangle leftBounds = settingsLeftSegmentBounds(card);
        Rectangle rightBounds = settingsRightSegmentBounds(card);
        drawCenteredFitted(labelFont, left, leftBounds.x + leftBounds.width / 2f, leftBounds.y + 22f, leftBounds.width - 8f, 0.48f);
        drawCenteredFitted(labelFont, right, rightBounds.x + rightBounds.width / 2f, rightBounds.y + 22f, rightBounds.width - 8f, 0.48f);
    }

    private void drawBasicSettingsCardText(int index, Rectangle card) {
        if (index == 0) {
            drawStepperText(card, "Limit graczy", nativeRoomState.players.size() + "/" + nativeRoomState.maxPlayers);
        } else if (index == 1) {
            String value = nativeRoomState.deckCount + " (sug. " + nativeRoomState.recommendedDeckCount + ")";
            drawStepperText(card, "Liczba talii", value);
        } else if (index == 2) {
            drawStepperText(card, "Czas tury", turnLimitLabel(nativeRoomState.turnTimeLimitSeconds));
        } else if (index == 3) {
            drawSegmentText(card, "Jokery", "Nie", "Tak");
        } else if (index == 4) {
            drawSegmentText(card, "Kto zaczyna", "Losowo", firstPlayerHostLabel());
        } else {
            drawCardLabel(card, "Nazwa stołu");
            messageFont.setColor(0.94f, 0.9f, 0.76f, 1f);
            drawCenteredFitted(messageFont, nativeRoomState.name == null ? "Stół" : nativeRoomState.name, card.x + card.width / 2f, card.y + 32f, card.width - 32f, 0.48f);
        }
    }

    private void drawRuleSettingsCardText(int index, Rectangle card) {
        if (index == 0) {
            drawSegmentText(card, "Wojna 2/3", "Wartość/kolor", "Tylko kolor");
        } else if (index == 1) {
            drawSegmentText(card, "Damy", "Zwykłe", "Warszawskie");
        } else if (index == 2) {
            drawSegmentText(card, "Dama i żądanie", "Dama kasuje", "Żądanie blokuje");
        } else if (index == 3) {
            drawSegmentText(card, "Walet żąda", "5-10 + K", "5-10");
        } else if (index == 4) {
            drawSegmentText(card, "Walet/as", "Opcjonalnie", "Wymagane");
        } else {
            drawStepperText(card, "Kara za brak Makao", "+" + nativeRoomState.makaoPenaltyCards);
        }
    }

    private boolean isNativeLobbyHost() {
        return nativeRoomState != null && nativeConfig != null && nativeRoomState.isHost(nativeConfig.clientId);
    }

    private String startPanelTitle() {
        if (startPanel == StartPanel.JOIN) return "DOŁĄCZ";
        if (startPanel == StartPanel.SETTINGS) return "USTAWIENIA";
        return "START GRY";
    }

    private String startPanelLabel(StartPanel panel) {
        if (panel == StartPanel.JOIN) return "Dołącz";
        if (panel == StartPanel.SETTINGS) return "Ustawienia";
        return "Nowa gra";
    }

    private String turnLimitLabel(int seconds) {
        if (seconds <= 0) return "bez limitu";
        return seconds + " s";
    }

    private String battleCounterLabel(String mode) {
        return "suit_only".equals(mode) ? "wojna: kolor" : "wojna: wartość/kolor";
    }

    private String firstPlayerHostLabel() {
        if (nativeRoomState == null) return "Host";
        String hostId = nativeRoomState.hostId;
        for (MakaoPlayer player : nativeRoomState.players) {
            if (player.id != null && player.id.equals(hostId)) {
                return compactText(cleanDisplayName(player.name), 10);
            }
        }
        return "Host";
    }

    private String menuStatusLabel() {
        if (nativeClient != null && nativeClient.isConnected()) return "Połączono";
        if (nativeStatusText != null && nativeStatusText.startsWith("Błąd")) return "Błąd";
        return "Łączenie";
    }

    private Color menuStatusColor() {
        if (nativeClient != null && nativeClient.isConnected()) return new Color(0.36f, 0.92f, 0.62f, 1f);
        if (nativeStatusText != null && nativeStatusText.startsWith("Błąd")) return new Color(0.94f, 0.36f, 0.34f, 1f);
        return new Color(0.95f, 0.82f, 0.32f, 1f);
    }

    private void drawPiles() {
        float drawRecoil = drawPileRecoilAmount();
        float discardSettle = discardSettleAmount();
        float drawScale = 1f + drawPileActiveAmount * 0.055f + drawRecoil * 0.035f;
        float discardScale = 1.08f + discardPileActiveAmount * 0.055f + discardSettle * 0.045f;
        float drawCx = drawPileBounds.x + PILE_WIDTH / 2f;
        float drawCy = drawPileBounds.y + PILE_HEIGHT / 2f - drawRecoil * DRAW_RECOIL_PIXELS;
        float drawAngle = -drawRecoil * 2.3f;
        float discardCx = discardPileBounds.x + PILE_WIDTH / 2f;
        float discardCy = discardPileBounds.y + PILE_HEIGHT / 2f;

        batch.begin();
        if (drawPileActiveAmount > 0.02f || pendingDrawRequest) {
            float alpha = MathUtils.clamp(0.18f + drawPileActiveAmount * 0.54f, 0f, 0.72f);
            drawCardTexture(glowTexture, drawCx, drawCy, PILE_WIDTH + 24f, PILE_HEIGHT + 28f, drawAngle, drawScale, new Color(1f, 0.9f, 0.48f, alpha));
        }
        drawCardBack(drawCx, drawCy, PILE_WIDTH, PILE_HEIGHT, drawAngle, drawScale, Color.WHITE);
        for (NativeCard underCard : discardUnderCards) {
            drawCard(underCard, PILE_WIDTH, PILE_HEIGHT, false);
        }
        if (discardTop != null) {
            if (discardPileActiveAmount > 0.02f || discardSettle > 0.02f) {
                float alpha = MathUtils.clamp(0.18f + discardPileActiveAmount * 0.56f + discardSettle * 0.22f, 0f, 0.78f);
                drawCardTexture(glowTexture, discardTop.x, discardTop.y, PILE_WIDTH + 28f, PILE_HEIGHT + 32f, 0f, discardScale, new Color(1f, 0.92f, 0.62f, alpha));
            }
            if (discardSettle > 0.02f) {
                NativeCard settledTop = discardTop.copy();
                settledTop.y += discardSettle * 4f;
                settledTop.angle += discardSettle * 1.6f;
                drawCard(settledTop, PILE_WIDTH * discardScale, PILE_HEIGHT * discardScale, false, !shouldShowSeparateJokerContextBadge());
            } else {
                drawCard(discardTop, PILE_WIDTH * discardScale, PILE_HEIGHT * discardScale, false, !shouldShowSeparateJokerContextBadge());
            }
        } else {
            drawCardTexture(cardFrontTexture, discardCx, discardCy, PILE_WIDTH, PILE_HEIGHT, 0f, discardScale, new Color(1f, 1f, 1f, 0.35f));
        }

        batch.end();
    }

    private float drawPileRecoilAmount() {
        if (drawPileRecoilTimer <= 0f) return 0f;
        float phase = 1f - MathUtils.clamp(drawPileRecoilTimer / DRAW_RECOIL_SECONDS, 0f, 1f);
        return MathUtils.sin(phase * MathUtils.PI);
    }

    private float discardSettleAmount() {
        if (discardSettleTimer <= 0f) return 0f;
        float phase = 1f - MathUtils.clamp(discardSettleTimer / NativeCardMotion.DISCARD_SETTLE_SECONDS, 0f, 1f);
        return MathUtils.sin(phase * MathUtils.PI);
    }

    private void triggerDiscardSettle() {
        discardSettleTimer = NativeCardMotion.DISCARD_SETTLE_SECONDS;
    }

    private boolean shouldHighlightDrawPile() {
        if (draggingDrawCard || pendingDrawRequest) return true;
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || state.gameOver) return false;
        if (state.isActiveDrawPenaltyForMe()) return true;
        return state.isMyTurn()
            && !state.hasDrawnCardThisTurn
            && selectedCards.size == 0
            && pendingPlayedCardIds.size == 0
            && !hasPlayableHandCard();
    }

    private boolean shouldHighlightDiscardPile() {
        if (dragThrowArmed || throwIntentAmount > 0.35f || selectedCards.size > 0) return true;
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || state.gameOver) return false;
        return state.isMyTurn()
            && !state.isActiveDrawPenaltyForMe()
            && !state.isActiveSkipForMe()
            && pendingPlayedCardIds.size == 0
            && hasPlayableHandCard();
    }

    private boolean hasPlayableHandCard() {
        for (NativeCard card : hand) {
            if (card != null && !isPendingPlayed(card) && isPrototypePlayable(card.model)) return true;
        }
        return false;
    }

    private void drawHand() {
        batch.begin();
        for (NativeCard card : hand) {
            if (card == draggedCard) continue;
            if (card.hiddenByFlight) continue;
            if (isDrawnCard(card)) {
                drawCardTexture(glowTexture, card.x, card.y, CARD_WIDTH + 22f, CARD_HEIGHT + 24f, card.angle, card.scale, new Color(0.75f, 0.9f, 1f, 1f));
            }
            if (isCardSelected(card)) {
                drawCardTexture(glowTexture, card.x, card.y, CARD_WIDTH + 16f, CARD_HEIGHT + 18f, card.angle, card.scale, Color.WHITE);
            }
            drawCard(card, CARD_WIDTH, CARD_HEIGHT, true);
        }
        if (draggedCard != null) {
            float arm = MathUtils.clamp(throwIntentAmount, 0f, 1f);
            Color armedGlow = dragThrowArmed
                ? new Color(1f, 0.86f, 0.34f, 1f)
                : new Color(1f, 1f, 1f, 0.72f + arm * 0.28f);
            drawCardTexture(glowTexture, draggedCard.x, draggedCard.y, CARD_WIDTH + 18f + arm * 18f, CARD_HEIGHT + 18f + arm * 20f, 0f, 1.14f + arm * 0.05f, armedGlow);
            drawCard(draggedCard, CARD_WIDTH, CARD_HEIGHT, true);
        }
        batch.end();
    }

    private void drawHandScrollIndicator() {
        float maxOffset = maxHandScrollOffset();
        if (maxOffset <= 1f || handFocusAmount < 0.18f) return;

        float trackWidth = 320f;
        float trackHeight = 5f;
        float trackX = WORLD_WIDTH / 2f - trackWidth / 2f;
        float trackY = MathUtils.lerp(50f, 72f, handFocusAmount);
        float thumbWidth = MathUtils.clamp((HAND_VISIBLE_WIDTH / (HAND_VISIBLE_WIDTH + maxOffset * 2f)) * trackWidth, 52f, trackWidth);
        float normalized = (handScrollOffset + maxOffset) / (maxOffset * 2f);
        float thumbX = trackX + (trackWidth - thumbWidth) * normalized;

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.02f, 0.025f, 0.025f, 0.62f * handFocusAmount);
        shapes.rect(trackX, trackY, trackWidth, trackHeight);
        shapes.setColor(0.93f, 0.78f, 0.42f, 0.78f * handFocusAmount);
        shapes.rect(thumbX, trackY, thumbWidth, trackHeight);
        shapes.end();
    }

    private void drawDraggedDrawCard() {
        if (!draggingDrawCard) return;
        batch.begin();
        drawCardTexture(shadowTexture, drawDragX + 5f, drawDragY - 6f, PILE_WIDTH, PILE_HEIGHT, drawDragAngle, drawDragScale, Color.WHITE);
        drawCardBack(drawDragX, drawDragY, PILE_WIDTH, PILE_HEIGHT, drawDragAngle, drawDragScale, Color.WHITE);
        batch.end();
    }

    private boolean isPendingPlayed(NativeCard card) {
        return card != null
            && pendingPlayedCardIds.contains(card.model.cardInstanceId, false);
    }

    private void drawFlights() {
        batch.begin();
        for (CardFlight flight : flights) {
            if (flight.faceDown) {
                float t = flight.duration <= 0f ? 1f : MathUtils.clamp(flight.elapsed / flight.duration, 0f, 1f);
                drawCardTexture(shadowTexture, flight.card.x + 5f, flight.card.y - 6f, CARD_WIDTH, CARD_HEIGHT, flight.card.angle, flight.card.scale, Color.WHITE);
                if (flight.flipToFace && flight.revealModel != null) {
                    float reveal = smoothstep(MathUtils.clamp((t - 0.48f) / 0.26f, 0f, 1f));
                    if (reveal < 0.98f) {
                        drawCardBack(flight.card.x, flight.card.y, CARD_WIDTH, CARD_HEIGHT, flight.card.angle - reveal * 1.5f, flight.card.scale * (1f - reveal * 0.035f), new Color(1f, 1f, 1f, 1f - reveal));
                    }
                    if (reveal > 0.02f) {
                        NativeCard revealCard = flight.card.copy();
                        revealCard.model = flight.revealModel;
                        revealCard.angle = flight.card.angle + (1f - reveal) * 2.2f;
                        revealCard.scale = flight.card.scale * (0.97f + reveal * 0.03f);
                        drawCardFrontOnly(revealCard, CARD_WIDTH, CARD_HEIGHT, new Color(1f, 1f, 1f, reveal));
                    }
                } else {
                    drawCardBack(flight.card.x, flight.card.y, CARD_WIDTH, CARD_HEIGHT, flight.card.angle, flight.card.scale, Color.WHITE);
                }
            } else {
                drawCard(flight.card, CARD_WIDTH, CARD_HEIGHT, true);
            }
        }
        batch.end();
    }

    private void drawCardFrontOnly(NativeCard card, float width, float height, Color tint) {
        TextureRegion cardRegion = cardRegionFor(card.model);
        if (cardRegion != null) {
            drawCardTexture(cardRegion, card.x, card.y, width, height, card.angle, card.scale, tint);
            drawDeclaredJokerBadge(card, width, height, tint);
        } else {
            drawCardTexture(cardFrontTexture, card.x, card.y, width, height, card.angle, card.scale, tint);
            drawCardText(card, width, height, tint);
            drawDeclaredJokerBadge(card, width, height, tint);
        }
    }

    private float smoothstep(float t) {
        return t * t * (3f - 2f * t);
    }

    private void drawHud() {
        if (isWebLaunchedNativeTable()) return;
        if (requestDeclarationOpen || jokerDeclarationOpen) return;
        if (noticeTimer > 0f && noticeText != null && !noticeText.isEmpty()) return;
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null) return;
        String text = nativeStatusText == null || nativeStatusText.isEmpty()
            ? state.buildStatusText()
            : nativeStatusText;
        Color accent = state.isMyTurn()
            ? new Color(0.96f, 0.72f, 0.24f, 0.9f)
            : new Color(0.32f, 0.62f, 0.76f, 0.78f);
        drawTopStatusPill(text, accent, 1f);
    }

    private void drawTopStatusPill(String text, Color accent, float alpha) {
        Rectangle area = topStatusBounds();
        text = fitTextToWidth(messageFont, text, area.width - 52f);
        if (text.isEmpty()) return;

        glyphLayout.setText(messageFont, text);
        float width = MathUtils.clamp(glyphLayout.width + 52f, 280f, area.width);
        float x = area.x + area.width / 2f - width / 2f;
        float y = area.y;

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.018f, 0.025f, 0.026f, 0.84f * alpha);
        shapes.rect(x, y, width, area.height);
        shapes.setColor(accent.r, accent.g, accent.b, accent.a * alpha);
        shapes.rect(x, y + area.height - 4f, width, 4f);
        shapes.rect(x, y, width, 3f);
        shapes.end();

        batch.begin();
        messageFont.setColor(1f, 0.9f, 0.66f, alpha);
        drawCentered(messageFont, text, x + width / 2f, y + 27f);
        batch.end();
    }

    private Rectangle topStatusBounds() {
        float height = 40f;
        return new Rectangle(170f, WORLD_HEIGHT - height - 8f, WORLD_WIDTH - 340f, height);
    }

    private void drawNotice() {
        if (requestDeclarationOpen || jokerDeclarationOpen) return;
        if (noticeTimer <= 0f || noticeText == null || noticeText.isEmpty()) return;
        if (isWebLaunchedNativeTable()) return;
        float alpha = MathUtils.clamp(noticeTimer / 0.35f, 0f, 1f);
        if (!shouldShowNativeStartScreen() && !shouldShowNativeLobbyScreen()) {
            drawTopStatusPill(noticeText, new Color(0.94f, 0.72f, 0.28f, 0.92f), alpha);
            return;
        }
        float lift = MathUtils.clamp((2.1f - noticeTimer) * 14f, 0f, 18f);
        glyphLayout.setText(messageFont, noticeText);
        float width = MathUtils.clamp(glyphLayout.width + 48f, 240f, 420f);
        float height = 48f;
        float x = noticeOnLeft ? 36f : WORLD_WIDTH - width - 36f;
        float y = 390f + lift;

        batch.begin();
        batch.setColor(0.025f, 0.035f, 0.032f, 0.82f * alpha);
        batch.draw(whitePixelTexture, x, y, width, height);
        batch.setColor(0.94f, 0.72f, 0.28f, 0.92f * alpha);
        batch.draw(whitePixelTexture, x, y, width, 3f);
        batch.draw(whitePixelTexture, x, y + height - 3f, width, 3f);
        messageFont.setColor(1f, 0.9f, 0.66f, alpha);
        drawCentered(messageFont, noticeText, x + width / 2f, y + 32f);
        batch.setColor(Color.WHITE);
        batch.end();
    }

    private void drawGameOverOverlay() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || !state.gameOver) return;
        if (isWebLaunchedNativeTable()) return;

        Rectangle panel = gameOverPanelBounds();
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.004f, 0.006f, 0.008f, 0.58f);
        shapes.rect(0f, 0f, WORLD_WIDTH, WORLD_HEIGHT);
        shapes.setColor(0.018f, 0.024f, 0.03f, 0.94f);
        shapes.rect(panel.x, panel.y, panel.width, panel.height);
        shapes.setColor(0.94f, 0.72f, 0.28f, 0.92f);
        shapes.rect(panel.x, panel.y + panel.height - 5f, panel.width, 5f);
        shapes.rect(panel.x, panel.y, panel.width, 4f);
        shapes.rect(panel.x, panel.y, 4f, panel.height);
        shapes.rect(panel.x + panel.width - 4f, panel.y, 4f, panel.height);
        shapes.setColor(0.94f, 0.72f, 0.28f, 0.08f);
        shapes.rect(panel.x + 22f, panel.y + panel.height - 42f, panel.width - 44f, 2f);
        drawPrimaryButtonShape(gameOverReplayButtonBounds(), canRequestRematch());
        drawInputShape(gameOverExitButtonBounds());
        shapes.end();

        String winnerName = cleanDisplayName(state.resolvePlayerName(state.winnerId));
        boolean myWin = state.winnerId != null && state.winnerId.equals(state.myPlayerId);
        String title = myWin ? "WYGRAŁEŚ" : "KONIEC GRY";
        String winnerLine = winnerName.isEmpty() || "?".equals(winnerName)
            ? "Partia zakończona"
            : (myWin ? "Zwycięzca: " + winnerName : "Wygrał: " + winnerName);

        batch.begin();
        messageFont.setColor(1f, 0.88f, 0.48f, 1f);
        drawCenteredScaledFitted(messageFont, title, panel.x + panel.width / 2f, panel.y + panel.height - 44f, panel.width - 70f, 1.62f, 0.82f);
        messageFont.setColor(1f, 0.94f, 0.78f, 1f);
        drawCenteredScaledFitted(messageFont, winnerLine, panel.x + panel.width / 2f, panel.y + 148f, panel.width - 76f, 1.0f, 0.62f);
        labelFont.setColor(0.82f, 0.86f, 0.82f, 0.92f);
        drawCenteredFitted(labelFont, gameOverHintText(), panel.x + panel.width / 2f, panel.y + 112f, panel.width - 90f, 0.62f);
        drawButtonText(gameOverReplayButtonBounds(), canRequestRematch() ? "REWANŻ" : "HOST REWANŻ", false, messageFont);
        drawButtonText(gameOverExitButtonBounds(), "WYJDŹ", false, messageFont);
        batch.end();
    }

    private Rectangle gameOverPanelBounds() {
        return new Rectangle(170f, 138f, WORLD_WIDTH - 340f, 244f);
    }

    private Rectangle gameOverReplayButtonBounds() {
        Rectangle panel = gameOverPanelBounds();
        float width = (panel.width - 92f) / 2f;
        return new Rectangle(panel.x + 38f, panel.y + 30f, width, 48f);
    }

    private Rectangle gameOverExitButtonBounds() {
        Rectangle panel = gameOverPanelBounds();
        float width = (panel.width - 92f) / 2f;
        return new Rectangle(panel.x + 54f + width, panel.y + 30f, width, 48f);
    }

    private boolean canRequestRematch() {
        if (nativeClient == null || !nativeClient.hasRoom()) return true;
        return nativeRoomState != null && nativeConfig != null && nativeRoomState.isHost(nativeConfig.clientId);
    }

    private String gameOverHintText() {
        if (nativeClient == null || !nativeClient.hasRoom()) return "Powtórka lokalna";
        return canRequestRematch() ? "Wróć do lobby i rozdaj ponownie" : "Rewanż uruchamia host";
    }

    private void drawGameLeaveButton() {
        if (!shouldShowGameLeaveButton()) return;

        Rectangle button = gameLeaveButtonBounds();
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        drawGlassButton(button, new Color(0.28f, 0.065f, 0.055f, 0.92f), false);
        shapes.end();

        batch.begin();
        labelFont.setColor(1f, 0.84f, 0.78f, 1f);
        drawCenteredFitted(labelFont, "REZYGNUJ", button.x + button.width / 2f, button.y + 25f, button.width - 16f, 0.54f);
        batch.end();
    }

    private void drawLeaveConfirmOverlay() {
        if (isWebLaunchedNativeTable()) return;
        if (!leaveConfirmOpen) return;

        Rectangle panel = leaveConfirmPanelBounds();
        Rectangle cancel = leaveConfirmCancelButtonBounds();
        Rectangle confirm = leaveConfirmAcceptButtonBounds();
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.004f, 0.006f, 0.008f, 0.62f);
        shapes.rect(0f, 0f, WORLD_WIDTH, WORLD_HEIGHT);
        drawGlassPanel(panel, 18f, 1f);
        drawInputShape(cancel);
        drawDangerButtonShape(confirm);
        shapes.end();

        String title = leaveConfirmInGame ? "ZREZYGNOWAĆ?" : "OPUŚCIĆ STÓŁ?";
        String detail = leaveConfirmInGame ? "Wyjdziesz z aktywnej partii." : "Wyjdziesz z tego pokoju.";
        batch.begin();
        messageFont.setColor(1f, 0.92f, 0.66f, 1f);
        drawCenteredScaledFitted(messageFont, title, panel.x + panel.width / 2f, panel.y + panel.height - 50f, panel.width - 64f, 1.18f, 0.68f);
        labelFont.setColor(0.82f, 0.86f, 0.84f, 0.92f);
        drawCenteredFitted(labelFont, detail, panel.x + panel.width / 2f, panel.y + 98f, panel.width - 64f, 0.58f);
        drawButtonText(cancel, "ANULUJ", false, messageFont);
        drawButtonText(confirm, leaveConfirmInGame ? "REZYGNUJ" : "WYJDŹ", false, messageFont);
        batch.end();
    }

    private void drawDangerButtonShape(Rectangle bounds) {
        drawRoundedRect(new Rectangle(bounds.x + 5f, bounds.y - 6f, bounds.width, bounds.height), bounds.height / 2f, new Color(0f, 0f, 0f, 0.25f));
        drawRoundedRect(bounds, bounds.height / 2f, new Color(0.52f, 0.10f, 0.075f, 0.98f));
        shapes.setColor(1f, 0.74f, 0.56f, 0.24f);
        shapes.rect(bounds.x + bounds.height / 2f, bounds.y + bounds.height - 2f, bounds.width - bounds.height, 2f);
    }

    private boolean shouldShowGameLeaveButton() {
        if (nativeClient == null || !nativeClient.hasRoom()) return false;
        if (isWebLaunchedNativeTable()) return false;
        if (shouldShowNativeStartScreen() || shouldShowNativeLobbyScreen()) return false;
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        return state != null && !state.gameOver;
    }

    private Rectangle gameLeaveButtonBounds() {
        return new Rectangle(WORLD_WIDTH - 140f, WORLD_HEIGHT - 48f, 108f, 40f);
    }

    private Rectangle leaveConfirmPanelBounds() {
        return new Rectangle(274f, 166f, 412f, 206f);
    }

    private Rectangle leaveConfirmCancelButtonBounds() {
        Rectangle panel = leaveConfirmPanelBounds();
        return new Rectangle(panel.x + 34f, panel.y + 30f, 160f, 48f);
    }

    private Rectangle leaveConfirmAcceptButtonBounds() {
        Rectangle panel = leaveConfirmPanelBounds();
        return new Rectangle(panel.x + panel.width - 194f, panel.y + 30f, 160f, 48f);
    }

    private void drawActiveEffectBadge() {
        if (requestDeclarationOpen || jokerDeclarationOpen) return;
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        ActiveEffectBadge badge = tableStateBadgeInfo(state);
        if (badge.isEmpty()) return;

        boolean graphicJokerBadge = shouldDrawGraphicJokerBadge(badge);
        float titleWidth;
        glyphLayout.setText(messageFont, badge.title);
        titleWidth = glyphLayout.width;
        glyphLayout.setText(labelFont, badge.detail);
        float detailWidth = glyphLayout.width;
        float textWidth = graphicJokerBadge ? 132f : Math.max(titleWidth, detailWidth);
        float height = badge.detail.isEmpty() ? 48f : 62f;
        TextureRegion badgeIcon = activeBadgeIconRegion(badge);
        boolean hasLeadingVisual = badgeIcon != null || badge.suit != null;
        float width = graphicJokerBadge ? 202f : MathUtils.clamp(textWidth + (hasLeadingVisual ? 78f : 34f), 188f, 390f);
        float x = discardPileBounds.x + PILE_WIDTH + 18f;
        if (x + width > WORLD_WIDTH - 30f) x = WORLD_WIDTH - width - 30f;
        float y = discardPileBounds.y + PILE_HEIGHT + 14f;
        Rectangle iconBounds = null;
        Rectangle suitBounds = null;
        if (badgeIcon != null) {
            iconBounds = new Rectangle(x + 10f, y + height / 2f - 18f, 38f, 36f);
        } else if (badge.suit != null) {
            suitBounds = new Rectangle(x + 10f, y + height / 2f - 15f, 30f, 30f);
        }
        Color accent = badge.accentColor();

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.035f, 0.04f, 0.05f, 0.86f);
        shapes.rect(x, y, width, height);
        shapes.setColor(accent);
        shapes.rect(x, y, width, 3f);
        shapes.rect(x, y + height - 3f, width, 3f);
        shapes.rect(x, y, 4f, height);
        if (suitBounds != null) {
            drawSuitIcon(badge.suit, suitBounds, 1f);
        }
        shapes.end();

        batch.begin();
        if (graphicJokerBadge) {
            drawJokerDeclarationGraphic(new Rectangle(x + 10f, y + 6f, width - 20f, height - 12f), badge.rank, badge.suit, 1f);
            batch.end();
            return;
        }
        if (badgeIcon != null) {
            drawIconRegion(badgeIcon, iconBounds, 1f);
        }
        messageFont.setColor(1f, 0.9f, 0.66f, 1f);
        float textX = hasLeadingVisual ? x + 58f : x + 14f;
        float maxTextWidth = Math.max(20f, x + width - textX - 12f);
        if (badge.detail.isEmpty()) {
            messageFont.draw(batch, fitTextToWidth(messageFont, badge.title, maxTextWidth), textX, y + 32f);
        } else {
            messageFont.draw(batch, fitTextToWidth(messageFont, badge.title, maxTextWidth), textX, y + 43f);
            labelFont.setColor(0.82f, 0.82f, 0.74f, 0.92f);
            labelFont.draw(batch, fitTextToWidth(labelFont, badge.detail, maxTextWidth), textX, y + 18f);
        }
        batch.end();
    }

    private void drawPlayerChips() {
        catchMakaoBoundsByPlayer.clear();
        if (requestDeclarationOpen || jokerDeclarationOpen) return;
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || state.players.isEmpty()) return;

        ArrayList<MakaoPlayer> opponents = opponentPlayers(state);
        int count = Math.min(7, opponents.size());

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        for (int i = 0; i < count; i++) {
            MakaoPlayer player = opponents.get(i);
            Rectangle bounds = animatedSeatBounds(opponentSeatBounds(i, count), player.id, i);
            boolean current = player.id.equals(state.currentPlayerId);
            boolean missingMakao = state.isMakaoMissing(player.id);
            boolean canCatch = missingMakao && state.canCatchMakao(player.id);
            float currentPulse = currentSeatPulseAmount(current);
            float handPop = seatHandPopAmount(player.id);
            float impact = seatImpactAmount(player.id);
            BadgeTone impactTone = seatImpactTones.get(player.id);

            if (current) {
                float grow = 5f + currentPulse * 4f;
                shapes.setColor(0.96f, 0.72f, 0.26f, 0.13f + currentPulse * 0.14f);
                shapes.rect(bounds.x - grow, bounds.y - grow * 0.7f, bounds.width + grow * 2f, bounds.height + grow * 1.4f);
            }
            if (impact > 0.02f) {
                Color impactColor = seatImpactColor(impactTone);
                float grow = 4f + impact * 8f;
                shapes.setColor(impactColor.r, impactColor.g, impactColor.b, impactColor.a * (0.16f + impact * 0.22f));
                shapes.rect(bounds.x - grow, bounds.y - grow * 0.7f, bounds.width + grow * 2f, bounds.height + grow * 1.4f);
            }

            shapes.setColor(current ? new Color(0.36f, 0.27f, 0.1f, 0.9f) : new Color(0.025f, 0.035f, 0.04f, player.online ? 0.78f : 0.58f));
            shapes.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            float borderAlpha = current ? 0.72f + currentPulse * 0.24f : 0.34f;
            shapes.setColor(canCatch ? new Color(0.78f, 0.12f, 0.08f, 0.95f) : new Color(0.94f, 0.76f, 0.34f, borderAlpha));
            shapes.rectLine(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y, current ? 3.5f : 2f);
            shapes.rectLine(bounds.x, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height, current ? 3.5f : 2f);
            if (current) {
                shapes.setColor(0.98f, 0.78f, 0.32f, 0.62f + currentPulse * 0.28f);
                shapes.rect(bounds.x, bounds.y, 4f, bounds.height);
            }
            if (handPop > 0.02f) {
                Color popColor = impact > 0.02f ? seatImpactColor(impactTone) : new Color(0.96f, 0.72f, 0.24f, 0.92f);
                shapes.setColor(popColor.r, popColor.g, popColor.b, popColor.a * (0.16f + handPop * 0.28f));
                shapes.rect(bounds.x + 38f, bounds.y + 5f, Math.max(68f, bounds.width - 48f), 24f);
            }
            if (!player.online) {
                shapes.setColor(0.02f, 0.025f, 0.03f, 0.28f);
                shapes.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            }

            if (canCatch) {
                float catchWidth = 74f;
                Rectangle catchBounds = new Rectangle(bounds.x + bounds.width - catchWidth, bounds.y - 34f, catchWidth, 30f);
                catchMakaoBoundsByPlayer.put(player.id, catchBounds);
                shapes.setColor(0.78f, 0.12f, 0.08f, 0.95f);
                shapes.rect(catchBounds.x, catchBounds.y, catchBounds.width, catchBounds.height);
            }
        }
        shapes.end();

        batch.begin();
        for (int i = 0; i < count; i++) {
            MakaoPlayer player = opponents.get(i);
            Rectangle bounds = animatedSeatBounds(opponentSeatBounds(i, count), player.id, i);
            boolean current = player.id.equals(state.currentPlayerId);
            boolean missingMakao = state.isMakaoMissing(player.id);
            boolean canCatch = missingMakao && state.canCatchMakao(player.id);
            int handCount = playerHandCount(state, player);
            float handPop = seatHandPopAmount(player.id);
            float cardX = opponentSeatCardX(bounds);
            float cardY = opponentSeatCardY(bounds);
            for (int c = 0; c < Math.min(3, Math.max(1, handCount)); c++) {
                float popScale = 1f + handPop * 0.09f;
                drawCardBack(cardX + c * 5f, cardY + c * 1.6f + handPop * 3f, 24f, 36f, -6f + c * 4f, popScale, new Color(1f, 1f, 1f, 0.9f));
            }

            labelFont.setColor(current ? new Color(1f, 0.86f, 0.42f, 1f) : new Color(0.88f, 0.86f, 0.76f, 0.95f));
            float textAreaX = bounds.x + 42f;
            float textAreaWidth = Math.max(54f, bounds.width - 48f);
            float textCenterX = textAreaX + textAreaWidth / 2f;
            drawCenteredFullPlayerName(labelFont, player.name, textCenterX, bounds.y + 41f, textAreaWidth, 0.20f);

            labelFont.setColor(handPop > 0.02f ? new Color(1f, 0.9f, 0.5f, 1f) : new Color(0.92f, 0.82f, 0.62f, 0.92f));
            String meta = state.isMakaoReady(player.id) ? "MAKAO" : cardCountLabel(handCount);
            drawCenteredOpponentMeta(meta, playerPauseTurns(state, player), textCenterX, bounds.y + 21f + handPop * 4f);

            if (canCatch) {
                Rectangle catchBounds = catchMakaoBoundsByPlayer.get(player.id);
                messageFont.setColor(1f, 0.86f, 0.66f, 1f);
                drawCentered(messageFont, "złap", catchBounds.x + catchBounds.width / 2f, catchBounds.y + 23f);
            }
        }
        batch.end();
    }

    private Rectangle animatedSeatBounds(Rectangle base, String playerId, int index) {
        if (base == null) return null;
        float impact = seatImpactAmount(playerId);
        float x = base.x;
        float y = base.y;
        if (impact > 0.02f) {
            x += MathUtils.sin(elapsed * 50f + index * 1.31f) * 5.5f * impact;
            y += MathUtils.sin(elapsed * 42f + index * 0.83f) * 2.4f * impact;
        }
        return new Rectangle(x, y, base.width, base.height);
    }

    private float currentSeatPulseAmount(boolean current) {
        if (!current) return 0f;
        return 0.5f + MathUtils.sin(elapsed * 4.4f) * 0.5f;
    }

    private float seatHandPopAmount(String playerId) {
        return timerWave(seatHandPopTimers.get(playerId), SEAT_HAND_POP_SECONDS);
    }

    private float seatImpactAmount(String playerId) {
        return timerWave(seatImpactTimers.get(playerId), SEAT_IMPACT_SECONDS);
    }

    private float timerWave(Float timer, float duration) {
        if (timer == null || timer <= 0f || duration <= 0f) return 0f;
        float phase = 1f - MathUtils.clamp(timer / duration, 0f, 1f);
        return MathUtils.sin(phase * MathUtils.PI);
    }

    private Color seatImpactColor(BadgeTone tone) {
        if (tone == BadgeTone.PENALTY) return new Color(0.88f, 0.18f, 0.08f, 0.96f);
        if (tone == BadgeTone.PAUSE) return new Color(0.36f, 0.72f, 0.94f, 0.92f);
        if (tone == BadgeTone.REQUEST) return new Color(0.96f, 0.74f, 0.25f, 0.92f);
        return new Color(0.94f, 0.72f, 0.28f, 0.86f);
    }

    private void drawEventBubbles() {
        if (requestDeclarationOpen || jokerDeclarationOpen || eventBubbles.size == 0) return;
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || state.players.isEmpty()) return;
        Map<EventBubble, Rectangle> boundsByBubble = layoutEventBubbleBounds(state);
        if (boundsByBubble.isEmpty()) return;

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        for (EventBubble bubble : eventBubbles) {
            if (bubble == null || bubble.text.isEmpty()) continue;
            Rectangle bounds = boundsByBubble.get(bubble);
            if (bounds == null) continue;
            float alpha = eventBubbleAlpha(bubble);
            Color accent = eventBubbleAccent(bubble);

            shapes.setColor(0.02f, 0.026f, 0.03f, 0.86f * alpha);
            shapes.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            shapes.setColor(accent.r, accent.g, accent.b, accent.a * alpha);
            shapes.rect(bounds.x, bounds.y, 4f, bounds.height);
            shapes.rect(bounds.x, bounds.y + bounds.height - 3f, bounds.width, 3f);
        }
        shapes.end();

        batch.begin();
        for (EventBubble bubble : eventBubbles) {
            if (bubble == null || bubble.text.isEmpty()) continue;
            Rectangle bounds = boundsByBubble.get(bubble);
            if (bounds == null) continue;
            float alpha = eventBubbleAlpha(bubble);
            Color accent = eventBubbleAccent(bubble);
            Rectangle iconBounds = eventBubbleIconBounds(bubble, bounds);
            if (iconBounds != null) {
                batch.setColor(0.06f, 0.072f, 0.078f, 0.62f * alpha);
                batch.draw(whitePixelTexture, iconBounds.x - 4f, iconBounds.y - 4f, iconBounds.width + 8f, iconBounds.height + 8f);
                drawEventBubbleIcon(bubble, iconBounds, accent, alpha);
            }
            messageFont.setColor(1f, 0.9f, 0.68f, alpha);
            messageFont.draw(batch, compactText(bubble.text, eventBubbleTextLimit()), eventBubbleTextX(bubble, bounds), bounds.y + 29f);
        }
        batch.end();
    }

    private Map<EventBubble, Rectangle> layoutEventBubbleBounds(MakaoGameState state) {
        Map<EventBubble, Rectangle> layout = new HashMap<>();
        Array<Rectangle> placed = new Array<>();
        for (EventBubble bubble : eventBubbles) {
            if (bubble == null || bubble.text.isEmpty()) continue;
            Rectangle base = eventBubbleBaseBounds(state, bubble);
            Rectangle resolved = resolveEventBubbleBounds(state, base, placed);
            if (resolved == null) continue;
            layout.put(bubble, resolved);
            placed.add(resolved);
        }
        return layout;
    }

    private Rectangle eventBubbleBaseBounds(MakaoGameState state, EventBubble bubble) {
        Rectangle seat = opponentSeatBoundsForPlayer(state, bubble.playerId);
        if (seat == null) return null;

        glyphLayout.setText(messageFont, compactText(bubble.text, eventBubbleTextLimit()));
        float maxWidth = eventBubbles.size >= 5 ? 280f : 360f;
        float iconSpace = eventBubbleIconSpace(bubble);
        float width = MathUtils.clamp(glyphLayout.width + 34f + iconSpace, 150f + iconSpace, maxWidth + iconSpace);
        float height = 42f;
        float seatCenterX = seat.x + seat.width / 2f;
        float x;
        if (seatCenterX < WORLD_WIDTH * 0.42f) {
            x = seat.x + seat.width + 10f;
        } else if (seatCenterX > WORLD_WIDTH * 0.58f) {
            x = seat.x - width - 10f;
        } else {
            x = seatCenterX - width / 2f;
        }
        float y = seat.y < 320f ? seat.y + seat.height + 9f : seat.y - height - 10f;
        float age = bubble.duration - bubble.timer;
        y += MathUtils.clamp(age * 10f, 0f, 10f);

        return new Rectangle(
            MathUtils.clamp(x, 24f, WORLD_WIDTH - width - 24f),
            MathUtils.clamp(y, 188f, WORLD_HEIGHT - height - 24f),
            width,
            height
        );
    }

    private int eventBubbleTextLimit() {
        return eventBubbles.size >= 5 ? 22 : 30;
    }

    private boolean eventBubbleHasIcon(EventBubble bubble) {
        return bubble != null && bubble.iconKind != EventBubbleIconKind.NONE;
    }

    private float eventBubbleIconSpace(EventBubble bubble) {
        return eventBubbleHasIcon(bubble) ? 34f : 0f;
    }

    private float eventBubbleTextX(EventBubble bubble, Rectangle bounds) {
        return bounds.x + 14f + eventBubbleIconSpace(bubble);
    }

    private Rectangle eventBubbleIconBounds(EventBubble bubble, Rectangle bounds) {
        if (!eventBubbleHasIcon(bubble) || bounds == null) return null;
        return new Rectangle(bounds.x + 9f, bounds.y + 8f, 26f, 26f);
    }

    private Rectangle resolveEventBubbleBounds(MakaoGameState state, Rectangle base, Array<Rectangle> placed) {
        if (base == null) return null;
        float step = base.height + 10f;
        float leftX = 26f;
        float rightX = WORLD_WIDTH - base.width - 26f;
        float centerX = WORLD_WIDTH / 2f - base.width / 2f;
        float[] xCandidates = { base.x, leftX, rightX, centerX, base.x - 28f, base.x + 28f };
        float[] yOffsets = { 0f, step, -step, step * 2f, -step * 2f, step * 3f, -step * 3f };
        for (float yOffset : yOffsets) {
            for (float candidateX : xCandidates) {
                Rectangle candidate = clampedEventBubbleRect(candidateX, base.y + yOffset, base.width, base.height);
                if (eventBubbleFits(state, candidate, placed)) return candidate;
            }
        }

        for (float candidateX : new float[] { leftX, rightX, centerX }) {
            for (float candidateY = WORLD_HEIGHT - base.height - 26f; candidateY >= 188f; candidateY -= step) {
                Rectangle candidate = clampedEventBubbleRect(candidateX, candidateY, base.width, base.height);
                if (eventBubbleFits(state, candidate, placed)) return candidate;
            }
        }

        for (float candidateY = WORLD_HEIGHT - base.height - 26f; candidateY >= 188f; candidateY -= 26f) {
            for (float candidateX = 24f; candidateX <= WORLD_WIDTH - base.width - 24f; candidateX += 40f) {
                Rectangle candidate = clampedEventBubbleRect(candidateX, candidateY, base.width, base.height);
                if (eventBubbleFits(state, candidate, placed)) return candidate;
            }
        }
        return null;
    }

    private Rectangle clampedEventBubbleRect(float x, float y, float width, float height) {
        return new Rectangle(
            MathUtils.clamp(x, 24f, WORLD_WIDTH - width - 24f),
            MathUtils.clamp(y, 188f, WORLD_HEIGHT - height - 24f),
            width,
            height
        );
    }

    private boolean eventBubbleFits(MakaoGameState state, Rectangle bounds, Array<Rectangle> placed) {
        if (bounds == null) return false;
        if (!eventBubbleAvoidsTableBlockers(state, bounds)) return false;
        for (Rectangle other : placed) {
            if (intersectsPadded(bounds, other, 8f)) return false;
        }
        return true;
    }

    private boolean eventBubbleAvoidsTableBlockers(MakaoGameState state, Rectangle bounds) {
        if (bounds == null) return false;
        if (intersectsPadded(bounds, drawPileVisualBounds(), 12f)) return false;
        if (intersectsPadded(bounds, discardPileVisualBounds(), 12f)) return false;
        if (intersectsPadded(bounds, topStatusBounds(), 8f)) return false;
        Rectangle badgeBlocker = activeBadgeBlockerBounds(state);
        if (badgeBlocker != null && intersectsPadded(bounds, badgeBlocker, 8f)) return false;
        if (intersectsOpponentSeatBlocker(state, bounds)) return false;
        return true;
    }

    private boolean intersectsOpponentSeatBlocker(MakaoGameState state, Rectangle bounds) {
        if (state == null || bounds == null) return false;
        ArrayList<MakaoPlayer> opponents = opponentPlayers(state);
        int count = Math.min(7, opponents.size());
        for (int i = 0; i < count; i++) {
            Rectangle seat = opponentSeatBounds(i, count);
            if (intersectsPadded(bounds, seat, 5f)) return true;
        }
        return false;
    }

    private Rectangle activeBadgeBlockerBounds(MakaoGameState state) {
        if (tableStateBadgeInfo(state).isEmpty()) return null;
        return new Rectangle(
            discardPileBounds.x + PILE_WIDTH + 4f,
            discardPileBounds.y + PILE_HEIGHT + 4f,
            WORLD_WIDTH - discardPileBounds.x - PILE_WIDTH - 28f,
            88f
        );
    }

    private Rectangle drawPileVisualBounds() {
        return new Rectangle(drawPileBounds.x - 18f, drawPileBounds.y - 18f, drawPileBounds.width + 36f, drawPileBounds.height + 36f);
    }

    private Rectangle discardPileVisualBounds() {
        return new Rectangle(discardPileBounds.x - 42f, discardPileBounds.y - 28f, discardPileBounds.width + 96f, discardPileBounds.height + 64f);
    }

    private boolean intersectsPadded(Rectangle a, Rectangle b, float padding) {
        return a.x < b.x + b.width + padding
            && a.x + a.width > b.x - padding
            && a.y < b.y + b.height + padding
            && a.y + a.height > b.y - padding;
    }

    private float eventBubbleAlpha(EventBubble bubble) {
        float age = Math.max(0f, bubble.duration - bubble.timer);
        float fadeIn = MathUtils.clamp(age / 0.16f, 0f, 1f);
        float fadeOut = MathUtils.clamp(bubble.timer / 0.36f, 0f, 1f);
        return Math.min(fadeIn, fadeOut);
    }

    private Color eventBubbleAccent(EventBubble bubble) {
        if (bubble.tone == BadgeTone.PENALTY) return new Color(0.86f, 0.18f, 0.1f, 0.94f);
        if (bubble.tone == BadgeTone.PAUSE) return new Color(0.36f, 0.72f, 0.92f, 0.9f);
        if (bubble.tone == BadgeTone.REQUEST) return new Color(0.94f, 0.71f, 0.25f, 0.92f);
        return new Color(0.82f, 0.68f, 0.36f, 0.86f);
    }

    private void drawEventBubbleIcon(EventBubble bubble, Rectangle bounds, Color accent, float alpha) {
        if (bubble == null || bounds == null || bubble.iconKind == EventBubbleIconKind.NONE) return;
        batch.setColor(accent.r, accent.g, accent.b, 0.18f * alpha);
        batch.draw(whitePixelTexture, bounds.x, bounds.y, bounds.width, bounds.height);
        batch.setColor(Color.WHITE);

        switch (bubble.iconKind) {
            case CARD:
                drawEventBubbleCardIcon(bubble.iconCard, bounds, alpha);
                return;
            case JOKER:
                drawEventBubbleJokerIcon(bubble.iconCard, bounds, alpha);
                return;
            case DRAW:
                drawCardBack(bounds.x + bounds.width / 2f, bounds.y + bounds.height / 2f, 19f, 28f, -5f, 1f, new Color(1f, 1f, 1f, 0.94f * alpha));
                drawEventBubbleAmount("×" + Math.max(1, bubble.iconAmount), bounds, alpha);
                return;
            case PENALTY:
                if (requestBangIconRegion != null) {
                    drawIconRegion(requestBangIconRegion, bounds, alpha);
                } else {
                    drawEventBubbleIconText("!", bounds, alpha);
                }
                if (bubble.iconAmount > 0) drawEventBubbleAmount("+" + bubble.iconAmount, bounds, alpha);
                return;
            case PAUSE:
                if (pauseIconRegion != null) {
                    drawIconRegion(pauseIconRegion, bounds, alpha);
                } else {
                    drawEventBubbleIconText("4", bounds, alpha);
                }
                if (bubble.iconAmount > 0) drawEventBubbleAmount(String.valueOf(Math.max(1, bubble.iconAmount)), bounds, alpha);
                return;
            case MAKAO:
                drawEventBubbleIconText("M", bounds, alpha);
                return;
            case CATCH:
                if (requestBangIconRegion != null) {
                    drawIconRegion(requestBangIconRegion, bounds, alpha);
                } else {
                    drawEventBubbleIconText("!", bounds, alpha);
                }
                return;
            case PASS:
                if (requestNoIconRegion != null) {
                    drawIconRegion(requestNoIconRegion, bounds, alpha);
                } else {
                    drawEventBubbleIconText("pas", bounds, alpha);
                }
                return;
            case REQUEST:
                drawEventBubbleRequestIcon(bubble.iconCard, bounds, alpha);
                return;
            default:
                return;
        }
    }

    private void drawEventBubbleRequestIcon(MakaoCard card, Rectangle bounds, float alpha) {
        if (card != null && card.suit != null && !card.suit.isEmpty()) {
            TextureRegion suitRequest = requestSuitIconRegion(card.suit);
            if (suitRequest != null) {
                drawIconRegion(suitRequest, bounds, alpha);
            } else {
                drawBatchSuitIcon(card.suit, bounds.x + 6f, bounds.y + 5f, bounds.width - 12f, bounds.height - 10f, alpha);
            }
            return;
        }
        if (card != null && card.rank != null && !card.rank.isEmpty()) {
            TextureRegion rankRequest = requestRankIconRegion(card.rank);
            if (rankRequest != null) {
                drawIconRegion(rankRequest, bounds, alpha);
            } else {
                drawEventBubbleIconText(rankLabelForValue(card.rank), bounds, alpha);
            }
            return;
        }
        if (requestBangIconRegion != null) {
            drawIconRegion(requestBangIconRegion, bounds, alpha);
        } else {
            drawEventBubbleIconText("!", bounds, alpha);
        }
    }

    private void drawEventBubbleCardIcon(MakaoCard card, Rectangle bounds, float alpha) {
        if (card == null) {
            drawCardBack(bounds.x + bounds.width / 2f, bounds.y + bounds.height / 2f, 19f, 28f, -4f, 1f, new Color(1f, 1f, 1f, 0.92f * alpha));
            return;
        }
        if (MakaoCard.RANK_JOKER.equals(card.rank)) {
            drawEventBubbleJokerIcon(card, bounds, alpha);
            return;
        }
        TextureRegion region = cardRegionFor(card);
        if (region != null) {
            drawCardTexture(region, bounds.x + bounds.width / 2f, bounds.y + bounds.height / 2f, 20f, 30f, -3f, 1f, new Color(1f, 1f, 1f, 0.96f * alpha));
            return;
        }

        drawCardTexture(cardFrontTexture, bounds.x + bounds.width / 2f, bounds.y + bounds.height / 2f, 21f, 31f, -3f, 1f, new Color(1f, 0.96f, 0.84f, 0.95f * alpha));
        TextureRegion rankIcon = requestRankIconRegion(card.rank);
        if (rankIcon != null) {
            drawIconRegion(rankIcon, new Rectangle(bounds.x + 4f, bounds.y + 14f, 20f, 12f), alpha);
        } else {
            drawEventBubbleIconText(rankLabelForValue(card.rank), new Rectangle(bounds.x + 3f, bounds.y + 11f, 22f, 15f), alpha);
        }
        TextureRegion suitIcon = plainSuitIconRegion(card.suit);
        if (suitIcon != null) {
            drawIconRegion(suitIcon, new Rectangle(bounds.x + 9f, bounds.y + 4f, 11f, 11f), alpha);
        } else {
            drawBatchSuitIcon(card.suit, bounds.x + 9f, bounds.y + 4f, 11f, 11f, alpha);
        }
    }

    private void drawEventBubbleJokerIcon(MakaoCard card, Rectangle bounds, float alpha) {
        if (jokerIconRegion != null) {
            drawIconRegion(jokerIconRegion, bounds, alpha);
        } else {
            drawEventBubbleIconText("J", bounds, alpha);
        }
        MakaoCard declaration = card == null ? null : card.jokerDeclaration;
        if (declaration != null && declaration.suit != null) {
            TextureRegion suitIcon = plainSuitIconRegion(declaration.suit);
            Rectangle suitBounds = new Rectangle(bounds.x + bounds.width - 12f, bounds.y + 2f, 10f, 10f);
            if (suitIcon != null) {
                drawIconRegion(suitIcon, suitBounds, alpha);
            } else {
                drawBatchSuitIcon(declaration.suit, suitBounds.x, suitBounds.y, suitBounds.width, suitBounds.height, alpha);
            }
        }
    }

    private void drawEventBubbleIconText(String text, Rectangle bounds, float alpha) {
        if (text == null || text.isEmpty()) return;
        labelFont.setColor(1f, 0.91f, 0.68f, alpha);
        glyphLayout.setText(labelFont, text);
        labelFont.draw(
            batch,
            text,
            bounds.x + bounds.width / 2f - glyphLayout.width / 2f,
            bounds.y + bounds.height / 2f + glyphLayout.height / 2f
        );
    }

    private void drawEventBubbleAmount(String text, Rectangle bounds, float alpha) {
        if (text == null || text.isEmpty()) return;
        labelFont.setColor(1f, 0.96f, 0.78f, alpha);
        glyphLayout.setText(labelFont, text);
        float width = glyphLayout.width + 6f;
        float height = 16f;
        float x = bounds.x + bounds.width - width + 5f;
        float y = bounds.y - 3f;
        batch.setColor(0.015f, 0.018f, 0.02f, 0.72f * alpha);
        batch.draw(whitePixelTexture, x, y, width, height);
        batch.setColor(Color.WHITE);
        labelFont.draw(batch, text, x + 3f, y + 13f);
    }

    private Rectangle opponentSeatBounds(int index, int count) {
        float width = count <= 3 ? 188f : count <= 5 ? 164f : 146f;
        float height = 56f;
        float[][] anchors;
        if (count <= 1) {
            anchors = new float[][] { { 480f, 454f } };
        } else if (count == 2) {
            anchors = new float[][] { { 318f, 446f }, { 642f, 446f } };
        } else if (count == 3) {
            anchors = new float[][] { { 126f, 332f }, { 480f, 456f }, { 834f, 332f } };
        } else if (count == 4) {
            anchors = new float[][] { { 112f, 326f }, { 352f, 456f }, { 608f, 456f }, { 848f, 326f } };
        } else if (count == 5) {
            anchors = new float[][] { { 112f, 330f }, { 318f, 452f }, { 480f, 462f }, { 642f, 452f }, { 848f, 330f } };
        } else if (count == 6) {
            anchors = new float[][] { { 96f, 260f }, { 126f, 376f }, { 350f, 456f }, { 610f, 456f }, { 834f, 376f }, { 864f, 260f } };
        } else if (count == 7) {
            anchors = new float[][] { { 96f, 238f }, { 112f, 354f }, { 300f, 452f }, { 480f, 462f }, { 660f, 452f }, { 848f, 354f }, { 864f, 238f } };
        } else {
            float progress = count <= 1 ? 0.5f : index / (float) (count - 1);
            float x = MathUtils.lerp(118f, WORLD_WIDTH - 118f, progress);
            float y = 374f + MathUtils.sin(progress * MathUtils.PI) * 80f;
            return new Rectangle(x - width / 2f, y - height / 2f, width, height);
        }
        float x = anchors[Math.min(index, anchors.length - 1)][0];
        float y = anchors[Math.min(index, anchors.length - 1)][1];
        return new Rectangle(x - width / 2f, y - height / 2f, width, height);
    }

    private float opponentSeatCardX(Rectangle bounds) {
        return bounds.x + 20f;
    }

    private float opponentSeatCardY(Rectangle bounds) {
        return bounds.y + bounds.height / 2f + 1f;
    }

    private String cardCountLabel(int count) {
        if (count == 1) return "1 karta";
        if (count >= 2 && count <= 4) return count + " karty";
        return count + " kart";
    }

    private void drawMakaoButton() {
        if (!shouldShowMakaoButton()) return;

        boolean canDeclare = canDeclareMyMakaoNow();
        batch.begin();
        batch.setColor(canDeclare ? new Color(0.82f, 0.53f, 0.1f, 0.96f) : new Color(0.26f, 0.27f, 0.28f, 0.92f));
        batch.draw(whitePixelTexture, makaoButtonBounds.x, makaoButtonBounds.y, makaoButtonBounds.width, makaoButtonBounds.height);
        batch.setColor(Color.WHITE);
        labelFont.setColor(canDeclare ? new Color(1f, 0.9f, 0.54f, 1f) : new Color(0.86f, 0.82f, 0.72f, 1f));
        String text = "MAKAO";
        glyphLayout.setText(labelFont, text);
        labelFont.draw(
            batch,
            text,
            makaoButtonBounds.x + makaoButtonBounds.width / 2f - glyphLayout.width / 2f,
            makaoButtonBounds.y + makaoButtonBounds.height / 2f + glyphLayout.height / 2f
        );
        batch.end();

        shapes.begin(ShapeRenderer.ShapeType.Line);
        shapes.setColor(0.98f, 0.82f, 0.34f, canDeclare ? 0.84f : 0.32f);
        shapes.rect(makaoButtonBounds.x, makaoButtonBounds.y, makaoButtonBounds.width, makaoButtonBounds.height);
        shapes.end();
    }

    private void drawPassButton() {
        if (!shouldShowPassButton()) return;

        batch.begin();
        batch.setColor(0.12f, 0.34f, 0.52f, 0.96f);
        batch.draw(whitePixelTexture, passButtonBounds.x, passButtonBounds.y, passButtonBounds.width, passButtonBounds.height);
        batch.setColor(Color.WHITE);
        labelFont.setColor(0.82f, 0.95f, 1f, 1f);
        String text = "PAS";
        glyphLayout.setText(labelFont, text);
        labelFont.draw(
            batch,
            text,
            passButtonBounds.x + passButtonBounds.width / 2f - glyphLayout.width / 2f,
            passButtonBounds.y + passButtonBounds.height / 2f + glyphLayout.height / 2f
        );
        batch.end();

        shapes.begin(ShapeRenderer.ShapeType.Line);
        shapes.setColor(0.42f, 0.78f, 0.95f, 0.88f);
        shapes.rect(passButtonBounds.x, passButtonBounds.y, passButtonBounds.width, passButtonBounds.height);
        shapes.end();
    }

    private String[] rankRequestOptions() {
        if (nativeRoomState != null && "values_5_to_10".equals(nativeRoomState.jackRequestMode)) {
            return REQUEST_RANKS_BASIC;
        }
        return REQUEST_RANKS_WITH_NON_BATTLE_KINGS;
    }

    private void drawRequestDeclaration() {
        if (!requestDeclarationOpen || isWebLaunchedNativeTable()) return;

        boolean suitRequest = "suit".equals(requestDeclarationType);
        String[] rankOptions = rankRequestOptions();
        shapes.begin(ShapeRenderer.ShapeType.Filled);
        Rectangle panel = requestPanelBounds();
        float headerHeight = 26f;
        shapes.setColor(0.045f, 0.055f, 0.052f, 0.5f);
        shapes.rect(panel.x, panel.y + panel.height - headerHeight, panel.width, headerHeight);
        shapes.setColor(0.9f, 0.68f, 0.25f, 0.8f);
        shapes.rect(panel.x, panel.y + panel.height - headerHeight, panel.width, 2f);
        shapes.rect(panel.x, panel.y + panel.height - 2f, panel.width, 2f);

        int count = suitRequest ? JOKER_SUITS.length : rankOptions.length;
        for (int i = 0; i < count; i++) {
            drawRequestButton(requestChoiceBounds(i, count, suitRequest ? 58f : 50f));
        }
        drawRequestButton(requestNoneBounds());
        if (suitRequest) {
            for (int i = 0; i < JOKER_SUITS.length; i++) {
                if (requestSuitIconRegion(JOKER_SUITS[i]) == null) {
                    drawSuitIcon(JOKER_SUITS[i], requestChoiceBounds(i, JOKER_SUITS.length, 58f), 1f);
                }
            }
        }
        shapes.end();

        batch.begin();
        messageFont.setColor(0.96f, 0.84f, 0.55f, 0.98f);
        String header = suitRequest ? "kolor" : "wartość";
        drawCenteredWithIcon(
            messageFont,
            requestBangIconRegion == null ? "! " + header : header,
            requestBangIconRegion,
            panel.x + panel.width / 2f,
            panel.y + panel.height - 4f,
            22f,
            6f
        );
        if (!suitRequest) {
            for (int i = 0; i < rankOptions.length; i++) {
                Rectangle bounds = requestChoiceBounds(i, rankOptions.length, 50f);
                TextureRegion icon = requestRankIconRegion(rankOptions[i]);
                if (icon != null) {
                    drawIconRegion(icon, bounds, 1f);
                } else {
                    drawButtonText(bounds, rankLabelForValue(rankOptions[i]), false, messageFont);
                }
            }
        } else {
            for (int i = 0; i < JOKER_SUITS.length; i++) {
                Rectangle bounds = requestChoiceBounds(i, JOKER_SUITS.length, 58f);
                TextureRegion icon = requestSuitIconRegion(JOKER_SUITS[i]);
                if (icon != null) {
                    drawIconRegion(icon, bounds, 1f);
                } else {
                    drawRequestBang(bounds);
                    drawBatchSuitIcon(JOKER_SUITS[i], bounds.x + 19f, bounds.y + 8f, 30f, 30f, 1f);
                }
            }
        }
        drawIconLabelButton(requestNoneBounds(), requestNoIconRegion, "bez", messageFont);
        batch.end();
    }

    private void drawJokerDeclaration() {
        if (!jokerDeclarationOpen || isWebLaunchedNativeTable()) return;

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        Rectangle panel = jokerPanelBounds();
        shapes.setColor(0.025f, 0.032f, 0.034f, 0.9f);
        shapes.rect(panel.x, panel.y, panel.width, panel.height);
        shapes.setColor(0.95f, 0.72f, 0.25f, 0.92f);
        shapes.rect(panel.x, panel.y, panel.width, 2.5f);
        shapes.rect(panel.x, panel.y + panel.height - 2.5f, panel.width, 2.5f);
        shapes.rect(panel.x, panel.y + panel.height - 40f, panel.width, 1.5f);
        shapes.setColor(0.95f, 0.72f, 0.25f, 0.2f);
        shapes.rect(panel.x + 18f, panel.y + 52f, panel.width - 36f, 1f);

        if (jokerRankLocked) {
            drawShapeButton(jokerLockedRankBounds(), true, true);
        } else {
            for (int i = 0; i < JOKER_RANKS.length; i++) {
                drawShapeButton(jokerRankBounds(i), safeEquals(jokerDeclarationRank, JOKER_RANKS[i]), false);
            }
        }
        for (int i = 0; i < JOKER_SUITS.length; i++) {
            drawShapeButton(jokerSuitBounds(i), safeEquals(jokerDeclarationSuit, JOKER_SUITS[i]), false);
        }
        drawShapeButton(jokerCancelBounds(), false, false);
        drawShapeButton(jokerPlayBounds(), true, false);
        drawShapeButton(jokerPreviewBounds(), false, true);
        for (int i = 0; i < JOKER_SUITS.length; i++) {
            drawSuitIcon(JOKER_SUITS[i], jokerSuitBounds(i), safeEquals(jokerDeclarationSuit, JOKER_SUITS[i]) ? 1f : 0.88f);
        }
        shapes.end();

        batch.begin();
        messageFont.setColor(0.96f, 0.84f, 0.55f, 1f);
        drawCenteredWithIcon(messageFont, "joker", jokerIconRegion, panel.x + panel.width / 2f, panel.y + panel.height - 9f, 26f, 8f);

        if (jokerRankLocked) {
            drawRankIconOrText(jokerLockedRankBounds(), jokerDeclarationRank, messageFont);
        } else {
            for (int i = 0; i < JOKER_RANKS.length; i++) {
                drawRankIconOrText(jokerRankBounds(i), JOKER_RANKS[i], messageFont);
            }
        }
        messageFont.setColor(0.96f, 0.86f, 0.58f, 1f);
        Rectangle preview = jokerPreviewBounds();
        if (!drawJokerDeclarationGraphic(preview, jokerDeclarationRank, jokerDeclarationSuit, 1f)) {
            String previewText = "joker → " + cardTag(MakaoCard.create(null, jokerDeclarationRank, jokerDeclarationSuit));
            glyphLayout.setText(messageFont, previewText);
            messageFont.draw(batch, previewText, preview.x + 14f, preview.y + preview.height / 2f + glyphLayout.height / 2f);
            drawBatchSuitIcon(jokerDeclarationSuit, preview.x + preview.width - 42f, preview.y + 7f, 28f, 28f, 1f);
        }
        drawButtonText(jokerCancelBounds(), "anuluj", false, messageFont);
        drawButtonText(jokerPlayBounds(), "zagraj", false, messageFont);
        batch.end();
    }

    private void drawShapeButton(Rectangle bounds, boolean selected, boolean locked) {
        if (selected) {
            shapes.setColor(0.9f, 0.7f, 0.22f, 0.92f);
        } else if (locked) {
            shapes.setColor(0.2f, 0.24f, 0.24f, 0.9f);
        } else {
            shapes.setColor(0.14f, 0.18f, 0.18f, 0.94f);
        }
        shapes.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        shapes.setColor(0.95f, 0.82f, 0.45f, selected ? 0.9f : 0.42f);
        shapes.rectLine(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y, 2f);
        shapes.rectLine(bounds.x, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height, 2f);
        shapes.rectLine(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height, 2f);
        shapes.rectLine(bounds.x + bounds.width, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height, 2f);
    }

    private void drawRequestButton(Rectangle bounds) {
        shapes.setColor(0.05f, 0.065f, 0.06f, 0.48f);
        shapes.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        shapes.setColor(0.95f, 0.82f, 0.45f, 0.74f);
        shapes.rectLine(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y, 2f);
        shapes.rectLine(bounds.x, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height, 2f);
        shapes.rectLine(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height, 2f);
        shapes.rectLine(bounds.x + bounds.width, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height, 2f);
    }

    private void drawRequestBang(Rectangle bounds) {
        messageFont.setColor(0.9f, 0.12f, 0.08f, 1f);
        messageFont.draw(batch, "!", bounds.x + 9f, bounds.y + bounds.height - 8f);
    }

    private void drawSuitIcon(String suit, Rectangle bounds, float alpha) {
        float cx = bounds.x + bounds.width / 2f;
        float cy = bounds.y + bounds.height / 2f;
        float size = Math.min(bounds.width, bounds.height) * 0.32f;
        boolean red = "hearts".equals(suit) || "diamonds".equals(suit);
        shapes.setColor(red ? new Color(0.78f, 0.08f, 0.06f, alpha) : new Color(0.9f, 0.88f, 0.76f, alpha));

        if ("hearts".equals(suit)) {
            shapes.circle(cx - size * 0.42f, cy + size * 0.28f, size * 0.56f);
            shapes.circle(cx + size * 0.42f, cy + size * 0.28f, size * 0.56f);
            shapes.triangle(cx - size * 1.08f, cy + size * 0.15f, cx + size * 1.08f, cy + size * 0.15f, cx, cy - size * 1.2f);
        } else if ("diamonds".equals(suit)) {
            shapes.triangle(cx, cy + size * 1.35f, cx + size * 0.92f, cy, cx, cy - size * 1.35f);
            shapes.triangle(cx, cy + size * 1.35f, cx - size * 0.92f, cy, cx, cy - size * 1.35f);
        } else if ("clubs".equals(suit)) {
            shapes.circle(cx, cy + size * 0.52f, size * 0.54f);
            shapes.circle(cx - size * 0.58f, cy - size * 0.04f, size * 0.54f);
            shapes.circle(cx + size * 0.58f, cy - size * 0.04f, size * 0.54f);
            shapes.rect(cx - size * 0.16f, cy - size * 0.98f, size * 0.32f, size * 0.98f);
            shapes.triangle(cx - size * 0.5f, cy - size * 0.98f, cx + size * 0.5f, cy - size * 0.98f, cx, cy - size * 0.48f);
        } else if ("spades".equals(suit)) {
            shapes.circle(cx - size * 0.48f, cy - size * 0.12f, size * 0.56f);
            shapes.circle(cx + size * 0.48f, cy - size * 0.12f, size * 0.56f);
            shapes.triangle(cx - size * 1.08f, cy, cx + size * 1.08f, cy, cx, cy + size * 1.35f);
            shapes.rect(cx - size * 0.16f, cy - size * 1.1f, size * 0.32f, size * 0.88f);
            shapes.triangle(cx - size * 0.52f, cy - size * 1.1f, cx + size * 0.52f, cy - size * 1.1f, cx, cy - size * 0.56f);
        }
    }

    private void drawBatchSuitIcon(String suit, float x, float y, float width, float height, float alpha) {
        Texture texture = suitTextureFor(suit);
        if (texture == null) return;
        batch.setColor(1f, 1f, 1f, alpha);
        batch.draw(texture, x, y, width, height);
        batch.setColor(Color.WHITE);
    }

    private void drawIconRegion(TextureRegion region, Rectangle bounds, float alpha) {
        if (region == null || bounds == null) return;
        float regionWidth = Math.max(1f, region.getRegionWidth());
        float regionHeight = Math.max(1f, region.getRegionHeight());
        float scale = Math.min(bounds.width / regionWidth, bounds.height / regionHeight);
        float width = regionWidth * scale;
        float height = regionHeight * scale;
        float x = bounds.x + (bounds.width - width) / 2f;
        float y = bounds.y + (bounds.height - height) / 2f;
        batch.setColor(1f, 1f, 1f, alpha);
        batch.draw(region, x, y, width, height);
        batch.setColor(Color.WHITE);
    }

    private void drawCenteredWithIcon(BitmapFont font, String text, TextureRegion icon, float centerX, float y, float iconSize, float gap) {
        BitmapFont activeFont = font == null ? labelFont : font;
        glyphLayout.setText(activeFont, text);
        float iconWidth = icon == null ? 0f : iconSize;
        float iconGap = icon == null ? 0f : gap;
        float totalWidth = glyphLayout.width + iconWidth + iconGap;
        float x = centerX - totalWidth / 2f;
        if (icon != null) {
            drawIconRegion(icon, new Rectangle(x, y - iconSize + 5f, iconSize, iconSize), 1f);
            x += iconWidth + iconGap;
        }
        activeFont.draw(batch, text, x, y);
    }

    private void drawIconLabelButton(Rectangle bounds, TextureRegion icon, String text, BitmapFont font) {
        if (icon == null) {
            drawButtonText(bounds, text, false, font);
            return;
        }
        BitmapFont activeFont = font == null ? labelFont : font;
        glyphLayout.setText(activeFont, text);
        float iconSize = Math.min(32f, bounds.height - 10f);
        float gap = 8f;
        float totalWidth = iconSize + gap + glyphLayout.width;
        float x = bounds.x + bounds.width / 2f - totalWidth / 2f;
        drawIconRegion(icon, new Rectangle(x, bounds.y + bounds.height / 2f - iconSize / 2f, iconSize, iconSize), 1f);
        activeFont.setColor(new Color(0.94f, 0.9f, 0.76f, 1f));
        activeFont.draw(batch, text, x + iconSize + gap, bounds.y + bounds.height / 2f + glyphLayout.height / 2f);
    }

    private void drawRankIconOrText(Rectangle bounds, String rank, BitmapFont font) {
        TextureRegion icon = requestRankIconRegion(rank);
        if (icon != null) {
            drawIconRegion(icon, bounds, 1f);
            return;
        }
        drawButtonText(bounds, rankLabelForValue(rank), false, font);
    }

    private boolean drawJokerDeclarationGraphic(Rectangle bounds, String rank, String suit, float alpha) {
        TextureRegion rankIcon = requestRankIconRegion(rank);
        if (jokerIconRegion == null || jokerArrowIconRegion == null || rankIcon == null) return false;
        float centerY = bounds.y + bounds.height / 2f;
        float jokerSize = Math.min(32f, bounds.height - 8f);
        float arrowWidth = 26f;
        float rankWidth = 46f;
        float suitSize = 26f;
        float gap = 8f;
        float totalWidth = jokerSize + gap + arrowWidth + gap + rankWidth + gap + suitSize;
        float x = bounds.x + Math.max(8f, (bounds.width - totalWidth) / 2f);
        drawIconRegion(jokerIconRegion, new Rectangle(x, centerY - jokerSize / 2f, jokerSize, jokerSize), alpha);
        x += jokerSize + gap;
        drawIconRegion(jokerArrowIconRegion, new Rectangle(x, centerY - 14f, arrowWidth, 28f), alpha);
        x += arrowWidth + gap;
        drawIconRegion(rankIcon, new Rectangle(x, centerY - 17f, rankWidth, 34f), alpha);
        x += rankWidth + gap;
        TextureRegion suitIcon = plainSuitIconRegion(suit);
        if (suitIcon != null) {
            drawIconRegion(suitIcon, new Rectangle(x, centerY - suitSize / 2f, suitSize, suitSize), alpha);
        } else {
            drawBatchSuitIcon(suit, x, centerY - suitSize / 2f, suitSize, suitSize, alpha);
        }
        return true;
    }

    private TextureRegion requestRankIconRegion(String rank) {
        if (rank == null) return null;
        return requestRankIconRegions.get(rank);
    }

    private TextureRegion requestSuitIconRegion(String suit) {
        return suit == null ? null : requestSuitIconRegions.get(suit);
    }

    private TextureRegion plainSuitIconRegion(String suit) {
        return suit == null ? null : plainSuitIconRegions.get(suit);
    }

    private TextureRegion activeBadgeIconRegion(ActiveEffectBadge badge) {
        if (badge == null) return null;
        if (badge.tone == BadgeTone.REQUEST && badge.suit != null) {
            TextureRegion suitRequest = requestSuitIconRegion(badge.suit);
            return suitRequest == null ? requestBangIconRegion : suitRequest;
        }
        if (badge.tone == BadgeTone.REQUEST) return requestBangIconRegion;
        if (badge.tone == BadgeTone.JOKER) return jokerIconRegion;
        if (badge.tone == BadgeTone.PAUSE) return pauseIconRegion == null ? requestRankIconRegion("4") : pauseIconRegion;
        return null;
    }

    private boolean shouldDrawGraphicJokerBadge(ActiveEffectBadge badge) {
        return badge != null
            && badge.tone == BadgeTone.JOKER
            && jokerIconRegion != null
            && jokerArrowIconRegion != null
            && requestRankIconRegion(badge.rank) != null;
    }

    private Texture suitTextureFor(String suit) {
        if ("hearts".equals(suit)) return heartIconTexture;
        if ("diamonds".equals(suit)) return diamondIconTexture;
        if ("clubs".equals(suit)) return clubIconTexture;
        if ("spades".equals(suit)) return spadeIconTexture;
        return null;
    }

    private String rankLabelForValue(String rank) {
        if ("ace".equals(rank)) return "A";
        if (JACK_REQUEST_RANK_NON_BATTLE_KING.equals(rank)) return "K♣/♦";
        if ("king".equals(rank)) return "K";
        if ("queen".equals(rank)) return "D";
        if ("jack".equals(rank)) return "W";
        if (MakaoCard.RANK_JOKER.equals(rank)) return "Joker";
        return rank == null ? "" : rank;
    }

    private String rankNamePl(String rank) {
        if ("ace".equals(rank)) return "As";
        if (JACK_REQUEST_RANK_NON_BATTLE_KING.equals(rank)) return "Król trefl/karo";
        if ("king".equals(rank)) return "Król";
        if ("queen".equals(rank)) return "Dama";
        if ("jack".equals(rank)) return "Walet";
        if (MakaoCard.RANK_JOKER.equals(rank)) return "Joker";
        return rank == null ? "" : rank;
    }

    private void drawButtonText(Rectangle bounds, String text, boolean red) {
        drawButtonText(bounds, text, red, labelFont);
    }

    private void drawButtonText(Rectangle bounds, String text, boolean red, BitmapFont font) {
        BitmapFont activeFont = font == null ? labelFont : font;
        glyphLayout.setText(activeFont, text);
        activeFont.setColor(red ? new Color(0.76f, 0.12f, 0.1f, 1f) : new Color(0.94f, 0.9f, 0.76f, 1f));
        activeFont.draw(
            batch,
            text,
            bounds.x + bounds.width / 2f - glyphLayout.width / 2f,
            bounds.y + bounds.height / 2f + glyphLayout.height / 2f
        );
    }

    private int playerHandCount(MakaoGameState state, MakaoPlayer player) {
        Integer count = state.handCounts.get(player.id);
        if (count != null) return count;
        if (player.id.equals(state.myPlayerId)) return state.myHand.size();
        return player.handCount;
    }

    private int playerPauseTurns(MakaoGameState state, MakaoPlayer player) {
        Integer pauseTurns = state.pauseTurnsByPlayer.get(player.id);
        return pauseTurns == null ? player.pauseTurns : pauseTurns;
    }

    private void drawOpponentMeta(String text, int pauseTurns, float x, float y) {
        String safeText = text == null ? "" : text;
        labelFont.draw(batch, safeText, x, y);
        if (pauseTurns <= 0) return;

        glyphLayout.setText(labelFont, safeText);
        float iconSize = 20f;
        float iconX = x + glyphLayout.width + 7f;
        float iconY = y - 17f;
        if (pauseIconRegion != null) {
            drawIconRegion(pauseIconRegion, new Rectangle(iconX, iconY, iconSize, iconSize), 0.96f);
            labelFont.draw(batch, String.valueOf(pauseTurns), iconX + iconSize + 3f, y);
        } else {
            labelFont.draw(batch, pauseTag(pauseTurns), iconX, y);
        }
    }

    private void drawCenteredOpponentMeta(String text, int pauseTurns, float centerX, float y) {
        String safeText = text == null ? "" : text;
        glyphLayout.setText(labelFont, safeText);
        float iconSize = 20f;
        float groupWidth = glyphLayout.width;
        if (pauseTurns > 0) {
            String pauseText = String.valueOf(pauseTurns);
            glyphLayout.setText(labelFont, pauseText);
            groupWidth += 7f + iconSize + 3f + glyphLayout.width;
        }
        float x = centerX - groupWidth / 2f;
        labelFont.draw(batch, safeText, x, y);
        if (pauseTurns <= 0) return;

        glyphLayout.setText(labelFont, safeText);
        float iconX = x + glyphLayout.width + 7f;
        float iconY = y - 17f;
        if (pauseIconRegion != null) {
            drawIconRegion(pauseIconRegion, new Rectangle(iconX, iconY, iconSize, iconSize), 0.96f);
            labelFont.draw(batch, String.valueOf(pauseTurns), iconX + iconSize + 3f, y);
        } else {
            labelFont.draw(batch, pauseTag(pauseTurns), iconX, y);
        }
    }

    private void drawFullPlayerName(BitmapFont font, String name, float x, float y, float maxWidth, float minScale) {
        String clean = cleanDisplayName(name);
        float safeMaxWidth = Math.max(1f, maxWidth);
        BitmapFont.BitmapFontData data = font.getData();
        float previousScaleX = data.scaleX;
        float previousScaleY = data.scaleY;

        glyphLayout.setText(font, clean);
        float scale = glyphLayout.width <= safeMaxWidth
            ? 1f
            : safeMaxWidth / Math.max(1f, glyphLayout.width);
        scale = MathUtils.clamp(scale, Math.max(0.16f, minScale), 1f);

        data.setScale(previousScaleX * scale, previousScaleY * scale);
        font.draw(batch, clean, x, y);
        data.setScale(previousScaleX, previousScaleY);
    }

    private void drawCenteredFullPlayerName(BitmapFont font, String name, float centerX, float y, float maxWidth, float minScale) {
        String clean = cleanDisplayName(name);
        float safeMaxWidth = Math.max(1f, maxWidth);
        BitmapFont.BitmapFontData data = font.getData();
        float previousScaleX = data.scaleX;
        float previousScaleY = data.scaleY;

        glyphLayout.setText(font, clean);
        float scale = glyphLayout.width <= safeMaxWidth
            ? 1f
            : safeMaxWidth / Math.max(1f, glyphLayout.width);
        scale = MathUtils.clamp(scale, Math.max(0.16f, minScale), 1f);

        data.setScale(previousScaleX * scale, previousScaleY * scale);
        glyphLayout.setText(font, clean);
        font.draw(batch, clean, centerX - glyphLayout.width / 2f, y);
        data.setScale(previousScaleX, previousScaleY);
    }

    private String cleanDisplayName(String name) {
        if (name == null) return "?";
        String clean = name.trim().replaceAll("\\s+", " ");
        return clean.isEmpty() ? "?" : clean;
    }

    private Rectangle jokerPanelBounds() {
        float ease = smoothstep(jokerPanelTimer);
        return new Rectangle(166f, 308f + (1f - ease) * 18f, 628f, 188f);
    }

    private Rectangle jokerRankBounds(int index) {
        Rectangle panel = jokerPanelBounds();
        float width = 48f;
        float height = 38f;
        float gap = 7f;
        int columns = 7;
        int row = index / columns;
        int column = index % columns;
        float startX = panel.x + 22f;
        float startY = panel.y + 112f;
        return new Rectangle(startX + column * (width + gap), startY - row * (height + 9f), width, height);
    }

    private Rectangle jokerLockedRankBounds() {
        Rectangle panel = jokerPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 65f, 378f, 85f);
    }

    private Rectangle jokerSuitBounds(int index) {
        Rectangle panel = jokerPanelBounds();
        float width = 62f;
        float height = 40f;
        float gap = 10f;
        int column = index % 2;
        int row = index / 2;
        float startX = panel.x + 438f;
        float startY = panel.y + 112f;
        return new Rectangle(startX + column * (width + gap), startY - row * (height + 9f), width, height);
    }

    private Rectangle jokerPreviewBounds() {
        Rectangle panel = jokerPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 12f, 340f, 38f);
    }

    private Rectangle jokerCancelBounds() {
        Rectangle panel = jokerPanelBounds();
        return new Rectangle(panel.x + 374f, panel.y + 12f, 108f, 38f);
    }

    private Rectangle jokerPlayBounds() {
        Rectangle panel = jokerPanelBounds();
        return new Rectangle(panel.x + 496f, panel.y + 12f, 110f, 38f);
    }

    private Rectangle requestPanelBounds() {
        boolean suitRequest = "suit".equals(requestDeclarationType);
        float width = suitRequest ? 526f : 624f;
        float ease = smoothstep(requestPanelTimer);
        return new Rectangle(WORLD_WIDTH / 2f - width / 2f, 406f + (1f - ease) * 16f, width, 78f);
    }

    private Rectangle requestChoiceBounds(int index, int count, float width) {
        Rectangle panel = requestPanelBounds();
        float height = 42f;
        float gap = count > 4 ? 10f : 13f;
        float total = count * width + (count - 1) * gap;
        float startX = panel.x + 16f;
        return new Rectangle(startX + index * (width + gap), panel.y + 10f, width, height);
    }

    private Rectangle requestNoneBounds() {
        Rectangle panel = requestPanelBounds();
        return new Rectangle(panel.x + panel.width - 198f, panel.y + 10f, 180f, 42f);
    }

    private String compactText(String text, int maxChars) {
        if (text == null) return "";
        if (text.length() <= maxChars) return text;
        return text.substring(0, Math.max(1, maxChars - 1)) + "…";
    }

    private String fitTextToWidth(BitmapFont font, String text, float maxWidth) {
        if (text == null) return "";
        String clean = text.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty()) return "";
        glyphLayout.setText(font, clean);
        if (glyphLayout.width <= maxWidth) return clean;
        for (int limit = clean.length() - 1; limit >= 1; limit--) {
            String candidate = clean.substring(0, limit) + "…";
            glyphLayout.setText(font, candidate);
            if (glyphLayout.width <= maxWidth) return candidate;
        }
        return "…";
    }

    private String serverErrorNotice(String message) {
        if (message == null || message.trim().isEmpty()) return "Ruch nie został przyjęty";
        String normalized = message.toLowerCase(Locale.ROOT);
        if (normalized.contains("first selected card cannot be played")) {
            return latestState != null && "draw_penalty".equals(latestState.activeEffectType)
                ? "Nie przebija kary"
                : "Nie pasuje";
        }
        if (normalized.contains("active penalty rules")) return "Nie przebija kary";
        if (normalized.contains("only play the card you just drawn")) return "Zacznij od dobranej";
        if (normalized.contains("only play multiple cards of the same rank")) return "Ten sam symbol";
        if (normalized.contains("not your turn")) return "Czekaj na swoją turę";
        if (normalized.contains("another player")) return "To nie Twoja kara";
        if (normalized.contains("invalid cards selected")) return "Nieprawidłowy wybór";
        if (normalized.contains("ready")) return "czekam na gotowość";
        if (normalized.contains("host")) return "czekaj na hosta";
        return "Ruch nie został przyjęty";
    }

    private String humanGameStatus(MakaoGameState state) {
        if (state == null) return "";
        String fallback = state.buildStatusText();
        String candidate = state.statusText == null || state.statusText.trim().isEmpty()
            ? fallback
            : state.statusText.trim();
        String normalized = candidate.toLowerCase(Locale.ROOT);
        if (normalized.contains("serwer")
            || normalized.contains("synchroniz")
            || normalized.contains("potwierdz")
            || normalized.contains("czekam na ruch")) {
            return fallback;
        }
        return candidate;
    }

    private boolean isConnectionRecoveryNotice(String message) {
        if (message == null) return false;
        String normalized = message.toLowerCase(Locale.ROOT);
        return normalized.contains("połączyć")
            || normalized.contains("połączenia")
            || normalized.contains("connection")
            || normalized.contains("timeout")
            || normalized.contains("transport");
    }

    private void drawCard(NativeCard card, float width, float height, boolean allowDim) {
        drawCard(card, width, height, allowDim, true);
    }

    private void drawCard(NativeCard card, float width, float height, boolean allowDim, boolean allowDeclaredJokerBadge) {
        Color tint = Color.WHITE;
        if (allowDim && card.dimmed) {
            tint = solidCardsEnabled
                ? new Color(0.78f, 0.82f, 0.86f, 1f)
                : new Color(0.9f, 0.92f, 0.93f, 0.88f);
        }

        drawCardTexture(shadowTexture, card.x + 5f, card.y - 6f, width, height, card.angle, card.scale, Color.WHITE);
        TextureRegion cardRegion = cardRegionFor(card.model);
        if (cardRegion != null) {
            drawCardTexture(cardRegion, card.x, card.y, width, height, card.angle, card.scale, tint);
        } else {
            drawCardTexture(cardFrontTexture, card.x, card.y, width, height, card.angle, card.scale, tint);
            drawCardText(card, width, height, tint);
        }
        if (allowDeclaredJokerBadge) {
            drawDeclaredJokerBadge(card, width, height, tint);
        }
    }

    private void drawDeclaredJokerBadge(NativeCard card, float width, float height, Color tint) {
        if (card == null || card.model == null || card.model.jokerDeclaration == null) return;
        Matrix4 oldTransform = batch.getTransformMatrix().cpy();
        Matrix4 cardTransform = new Matrix4()
            .translate(card.x, card.y, 0f)
            .rotate(0f, 0f, 1f, card.angle)
            .scale(card.scale, card.scale, 1f);
        batch.setTransformMatrix(cardTransform);

        MakaoCard declaration = card.model.jokerDeclaration;
        TextureRegion rankIcon = requestRankIconRegion(declaration.rank);
        boolean graphic = jokerArrowIconRegion != null && rankIcon != null;
        String text = "→ " + cardTag(declaration);
        glyphLayout.setText(labelFont, text);
        float badgeWidth = graphic ? 112f : Math.max(72f, glyphLayout.width + 16f);
        batch.setColor(0.08f, 0.06f, 0.04f, 0.74f * tint.a);
        batch.draw(whitePixelTexture, -width / 2f + 8f, -height / 2f + 8f, badgeWidth, 26f);
        if (graphic) {
            float x = -width / 2f + 13f;
            float y = -height / 2f + 11f;
            drawIconRegion(jokerArrowIconRegion, new Rectangle(x, y, 22f, 20f), tint.a);
            drawIconRegion(rankIcon, new Rectangle(x + 26f, y - 2f, 30f, 24f), tint.a);
            TextureRegion suitIcon = plainSuitIconRegion(declaration.suit);
            if (suitIcon != null) {
                drawIconRegion(suitIcon, new Rectangle(x + 62f, y - 1f, 24f, 24f), tint.a);
            } else {
                drawBatchSuitIcon(declaration.suit, x + 62f, y - 1f, 24f, 24f, tint.a);
            }
        } else {
            batch.setColor(Color.WHITE);
            labelFont.setColor(1f, 0.86f, 0.42f, tint.a);
            labelFont.draw(batch, text, -width / 2f + 14f, -height / 2f + 28f);
        }

        batch.setTransformMatrix(oldTransform);
    }

    private void drawCardText(NativeCard card, float width, float height, Color tint) {
        Matrix4 oldTransform = batch.getTransformMatrix().cpy();
        Matrix4 cardTransform = new Matrix4()
            .translate(card.x, card.y, 0f)
            .rotate(0f, 0f, 1f, card.angle)
            .scale(card.scale, card.scale, 1f);
        batch.setTransformMatrix(cardTransform);

        boolean declaredJoker = MakaoCard.RANK_JOKER.equals(card.model.rank) && card.model.jokerDeclaration != null;
        MakaoCard displayModel = card.model;
        Color textColor = displayModel.isRed() ? new Color(0.68f, 0.08f, 0.08f, tint.a) : new Color(0.05f, 0.07f, 0.08f, tint.a);
        cardFont.setColor(textColor);
        labelFont.setColor(textColor);

        String rank = displayModel.rankLabel();
        String suit = displayModel.suitShort();
        String cornerRank = rank;
        String cornerSuit = declaredJoker ? "" : suit;
        cardFont.draw(batch, cornerRank, -width / 2f + 10f, height / 2f - 12f);
        labelFont.draw(batch, cornerSuit, -width / 2f + 12f, height / 2f - 42f);

        glyphLayout.setText(cardFont, rank);
        cardFont.draw(batch, rank, -glyphLayout.width / 2f, declaredJoker ? 8f : 10f);
        glyphLayout.setText(labelFont, suit);
        labelFont.draw(batch, suit, -glyphLayout.width / 2f, declaredJoker ? -22f : -18f);

        batch.setTransformMatrix(oldTransform);
    }

    private void drawCardTexture(Texture texture, float centerX, float centerY, float width, float height, float angle, float scale, Color tint) {
        batch.setColor(tint);
        batch.draw(
            texture,
            centerX - width / 2f,
            centerY - height / 2f,
            width / 2f,
            height / 2f,
            width,
            height,
            scale,
            scale,
            angle,
            0,
            0,
            texture.getWidth(),
            texture.getHeight(),
            false,
            false
        );
        batch.setColor(Color.WHITE);
    }

    private void drawCardTexture(TextureRegion region, float centerX, float centerY, float width, float height, float angle, float scale, Color tint) {
        batch.setColor(tint);
        batch.draw(
            region,
            centerX - width / 2f,
            centerY - height / 2f,
            width / 2f,
            height / 2f,
            width,
            height,
            scale,
            scale,
            angle
        );
        batch.setColor(Color.WHITE);
    }

    private void drawCardBack(float centerX, float centerY, float width, float height, float angle, float scale, Color tint) {
        if (bubuBackTexture != null && bubuBackTexture.isLoaded()) {
            drawCardTexture(bubuBackTexture.getRegion(), centerX, centerY, width, height, angle, scale, tint);
            return;
        }
        TextureRegion back = cardAtlas == null ? null : cardAtlas.findRegion("back");
        if (back != null) {
            drawCardTexture(back, centerX, centerY, width, height, angle, scale, tint);
        } else {
            drawCardTexture(cardBackTexture, centerX, centerY, width, height, angle, scale, tint);
        }
    }

    private TextureRegion cardRegionFor(MakaoCard model) {
        if (cardAtlas == null || model == null) return null;
        if (MakaoCard.RANK_JOKER.equals(model.rank)) {
            return cardAtlas.findRegion("joker-a");
        }
        MakaoCard displayModel = model;
        if (displayModel.rank == null || displayModel.suit == null) return null;
        return cardAtlas.findRegion(displayModel.rank + "-" + displayModel.suit);
    }

    private void drawCentered(BitmapFont font, String text, float centerX, float y) {
        glyphLayout.setText(font, text);
        font.draw(batch, text, centerX - glyphLayout.width / 2f, y);
    }

    private void drawCenteredFitted(BitmapFont font, String text, float centerX, float y, float maxWidth, float minScale) {
        drawCenteredScaledFitted(font, text, centerX, y, maxWidth, 1f, minScale);
    }

    private void drawCenteredScaledFitted(BitmapFont font, String text, float centerX, float y, float maxWidth, float desiredScale, float minScale) {
        if (font == null || text == null) return;
        String clean = text.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty()) return;
        BitmapFont.BitmapFontData data = font.getData();
        float previousScaleX = data.scaleX;
        float previousScaleY = data.scaleY;

        data.setScale(previousScaleX * desiredScale, previousScaleY * desiredScale);
        glyphLayout.setText(font, clean);
        float scale = glyphLayout.width <= maxWidth
            ? 1f
            : maxWidth / Math.max(1f, glyphLayout.width);
        scale = MathUtils.clamp(scale, Math.max(0.12f, minScale), 1f);

        data.setScale(previousScaleX * desiredScale * scale, previousScaleY * desiredScale * scale);
        glyphLayout.setText(font, clean);
        font.draw(batch, clean, centerX - glyphLayout.width / 2f, y);
        data.setScale(previousScaleX, previousScaleY);
    }

    private void drawCardFromPile() {
        if (handleNetworkDrawPilePull()) return;
        if (prototypeState == null) return;
        if (drawPileCount <= 0) {
            clearDrawInsertSlot();
            showNotice("talia pusta → tasowanie");
            emitFeedback(FeedbackIntent.SHUFFLE);
            return;
        }
        emitFeedback(FeedbackIntent.DRAW);
        selectedCards.clear();
        selectedCard = null;
        captureDrawInsertSlot();

        MakaoCard model = randomCard();
        triggerDrawPileRecoil();
        startDrawFlightToHand(model);
        prototypeState.drawPileCount = Math.max(0, prototypeState.drawPileCount - 1);
        prototypeState.addCardToHand(model);
        prototypeState.hasDrawnCardThisTurn = true;
        prototypeState.drawnCardInstanceId = model.cardInstanceId;
        prototypeState.statusText = "dobrano " + model.tableLabel();
        applyGameState(prototypeState);
        layoutHandTargets();
    }

    private boolean handleNetworkDrawPilePull() {
        if (nativeClient == null) return false;
        if (!nativeClient.isConnected()) {
            clearDrawInsertSlot();
            nativeStatusText = STATUS_RETURNING_TO_TABLE;
            trace("draw_pull blocked=not_connected");
            nativeClient.connect();
            return true;
        }
        if (!nativeClient.hasRoom()) {
            clearDrawInsertSlot();
            nativeStatusText = "Dotknij talii, aby utworzyć pokój";
            trace("draw_pull blocked=no_room");
            return true;
        }
        if (nativeClient.isLobby()) {
            clearDrawInsertSlot();
            nativeStatusText = "Lobby gotowe. Dotknij stosu, aby rozpocząć.";
            trace("draw_pull blocked=lobby");
            return true;
        }
        if (nativeClient.isPlaying()) {
            if (pendingDrawRequest) {
                trace("draw_pull blocked=pending_draw " + stateDebug(latestState));
                return true;
            }
            if (latestState != null && latestState.isActiveDrawPenaltyForMe()) {
                selectedCards.clear();
                selectedCard = null;
                pendingDrawRequest = true;
                captureDrawInsertSlot();
                startPendingDrawFlightToHand();
                trace("draw_pull emit=draw_card_penalty insert=" + pendingDrawInsertIndex + " " + stateDebug(latestState));
                if (!nativeClient.drawCard()) {
                    pendingDrawRequest = false;
                    clearDrawInsertSlot();
                    cancelNewestUnboundLocalDrawFlight();
                    showNotice(STATUS_MOMENT);
                    trace("draw_pull emit_failed=draw_card_penalty");
                }
                return true;
            }
            if (latestState != null && latestState.isActiveSkipForMe()) {
                clearDrawInsertSlot();
                playOptionalSound(tapSound);
                nativeStatusText = "omijam turę…";
                trace("draw_pull emit=accept_skip " + stateDebug(latestState));
                if (!nativeClient.acceptSkip()) {
                    showNotice(STATUS_MOMENT);
                    trace("draw_pull emit_failed=accept_skip");
                }
                return true;
            }
            if (latestState != null && latestState.hasDrawnCardThisTurn) {
                clearDrawInsertSlot();
                nativeStatusText = "Zagraj albo pas";
                trace("draw_pull blocked=already_drawn " + stateDebug(latestState));
                return true;
            }
            if (latestState != null && !latestState.isMyTurn()) {
                clearDrawInsertSlot();
                nativeStatusText = "Czekaj na swoją turę";
                trace("draw_pull blocked=not_my_turn " + stateDebug(latestState));
                return true;
            }
            selectedCards.clear();
            selectedCard = null;
            pendingDrawRequest = true;
            captureDrawInsertSlot();
            startPendingDrawFlightToHand();
            trace("draw_pull emit=draw_card insert=" + pendingDrawInsertIndex + " " + stateDebug(latestState));
            if (!nativeClient.drawCard()) {
                pendingDrawRequest = false;
                clearDrawInsertSlot();
                cancelNewestUnboundLocalDrawFlight();
                showNotice(STATUS_MOMENT);
                trace("draw_pull emit_failed=draw_card");
            }
            return true;
        }
        return false;
    }

    private boolean handleNetworkDrawPileTap() {
        if (nativeClient == null) return false;
        if (!nativeClient.isConnected()) {
            nativeStatusText = STATUS_RETURNING_TO_TABLE;
            trace("draw_tap blocked=not_connected");
            nativeClient.connect();
            return true;
        }
        if (!nativeClient.hasRoom()) {
            playOptionalSound(tapSound);
            trace("draw_tap emit=create_room");
            nativeClient.createRoom();
            return true;
        }
        if (nativeClient.isLobby()) {
            nativeStatusText = "Lobby gotowe. Dotknij stosu, aby rozpocząć.";
            trace("draw_tap blocked=lobby");
            return true;
        }
        if (nativeClient.isPlaying()) {
            if (pendingDrawRequest) {
                trace("draw_tap blocked=pending_draw " + stateDebug(latestState));
                return true;
            }
            if (latestState != null && latestState.isActiveSkipForMe()) {
                playOptionalSound(tapSound);
                trace("draw_tap emit=accept_skip " + stateDebug(latestState));
                if (!nativeClient.acceptSkip()) {
                    showNotice(STATUS_MOMENT);
                    trace("draw_tap emit_failed=accept_skip");
                }
                return true;
            }
            if (latestState != null && latestState.isActiveDrawPenaltyForMe()) {
                String notice = latestState.hasDrawnCardThisTurn && latestState.drawnCardInstanceId != null
                    ? "Zagraj pierwszą kartą albo przeciągnij talię dalej"
                    : "Przeciągnij talię, aby dobrać kartę kary";
                showIllegalNotice(notice);
                trace("draw_tap blocked=penalty_needs_pull " + stateDebug(latestState));
                return true;
            }
            if (latestState != null && latestState.hasDrawnCardThisTurn) {
                return submitPassTurn("draw_tap");
            }
            if (latestState != null && !latestState.isMyTurn()) {
                nativeStatusText = "Czekaj na swoją turę";
                trace("draw_tap blocked=not_my_turn " + stateDebug(latestState));
                return true;
            }
            showIllegalNotice(latestState != null && latestState.isActiveDrawPenaltyForMe()
                ? "Przesuń w dół, aby przyjąć karę"
                : "Przesuń w dół, aby dobrać");
            trace("draw_tap blocked=needs_pull " + stateDebug(latestState));
            return true;
        }
        return false;
    }

    private MakaoCard randomCard() {
        String[] ranks = { "ace", "king", "queen", "jack", "10", "9", "8", "7", "6", "5", "4", "3", "2" };
        String[] suits = { "hearts", "diamonds", "clubs", "spades" };
        String rank = ranks[MathUtils.random(ranks.length - 1)];
        String suit = suits[MathUtils.random(suits.length - 1)];
        return MakaoCard.create("proto_draw_" + nextPrototypeCardId++, rank, suit);
    }

    private void playCardToDiscard(NativeCard card) {
        if (card == null) return;
        resetPendingPlayTargetToDiscardCenter();
        Array<NativeCard> cardsToPlay = cardsForPlay(card);
        if (cardsToPlay.size == 0) return;
        if (!allowsMultipleCards() && cardsToPlay.size > 1) {
            showIllegalNotice("W tym pokoju zagrywasz jedną kartę");
            return;
        }
        NativeCard firstCardToPlay = cardsToPlay.first();
        trace("play_attempt cards=" + cardsDebug(cardsToPlay)
            + " legal=" + isPrototypePlayable(firstCardToPlay.model)
            + " target=" + Math.round(pendingPlayTargetX) + "," + Math.round(pendingPlayTargetY)
            + " " + stateDebug(latestState));
        if (nativeClient != null && nativeClient.isPlaying()) {
            if (!NativeReliableActionRules.canSubmitDependentAction(nativeClient.hasPendingGameAction())) {
                showNotice(STATUS_MOMENT);
                trace("play_blocked=pending_reliable_action");
                return;
            }
            if (pendingPlayedCardIds.size > 0) {
                showNotice(STATUS_MOMENT);
                trace("play_blocked=pending_play");
                return;
            }
            if (latestState != null && !latestState.isMyTurn()) {
                showIllegalNotice("Czekaj na swoją turę");
                trace("play_blocked=not_my_turn");
                return;
            }
            if (!isPrototypePlayable(firstCardToPlay.model)) {
                showIllegalNotice(illegalCardNotice());
                trace("play_blocked=illegal_card card=" + cardDebug(firstCardToPlay.model));
                return;
            }
            if (latestState != null
                && latestState.hasDrawnCardThisTurn
                && latestState.drawnCardInstanceId != null
                && !latestState.drawnCardInstanceId.equals(cardsToPlay.first().model.cardInstanceId)) {
                showIllegalNotice("Zacznij od dobranej");
                trace("play_blocked=drawn_card_required first=" + cardDebug(cardsToPlay.first().model));
                return;
            }
            if (isMoveBlockedByMissingMakao(cardsToPlay)) {
                selectedCards.clear();
                selectedCards.addAll(cardsToPlay);
                selectedCard = cardsToPlay.peek();
                showIllegalNotice("Kliknij Makao");
                trace("play_blocked=makao_required");
                layoutHandTargets();
                return;
            }
            if (containsJoker(cardsToPlay)) {
                trace("play_needs_joker_declaration");
                openJokerDeclaration(cardsToPlay);
                return;
            }
            prepareCardsForPlay(cardsToPlay, null);
            return;
        }
        if (isMoveBlockedByMissingMakao(cardsToPlay)) {
            selectedCards.clear();
            selectedCards.addAll(cardsToPlay);
            selectedCard = cardsToPlay.peek();
            showIllegalNotice("Kliknij Makao");
            layoutHandTargets();
            return;
        }
        if (containsJoker(cardsToPlay)) {
            openJokerDeclaration(cardsToPlay);
            return;
        }
        prepareCardsForPlay(cardsToPlay, null);
    }

    private void playCardsLocally(Array<NativeCard> cardsToPlay, Map<String, MakaoCard> jokerDeclarations) {
        rememberLocalDiscardMove(cardsToPlay, jokerDeclarations);
        emitFeedback(FeedbackIntent.PLAY);
        MakaoCard playedModel = resolveLocalJoker(cardsToPlay.peek().model, jokerDeclarations);
        int index = 0;
        for (NativeCard selected : cardsToPlay) {
            hand.removeValue(selected, true);
            startThrowFlight(selected, true, resolveLocalJoker(selected.model, jokerDeclarations), index++, cardsToPlay.size);
        }
        if (selectedCards.size > 0) selectedCards.clear();
        selectedCard = null;
        draggedCard = null;

        if (prototypeState != null) {
            for (NativeCard selected : cardsToPlay) {
                prototypeState.removeCardFromHand(selected.model.cardInstanceId);
            }
            syncPrototypeMakaoAfterHandChange();
            prototypeState.topCard = playedModel;
            prototypeState.discardPileCount += cardsToPlay.size;
            prototypeState.statusText = cardsToPlay.size == 1
                ? "zagrano " + playedModel.tableLabel()
                : "zagrano " + cardsToPlay.size + " kart";
            applyGameState(prototypeState);
        } else {
            layoutHandTargets();
        }
    }

    private MakaoCard resolveLocalJoker(MakaoCard card, Map<String, MakaoCard> jokerDeclarations) {
        if (card == null
            || !MakaoCard.RANK_JOKER.equals(card.rank)
            || jokerDeclarations == null
            || !jokerDeclarations.containsKey(card.cardInstanceId)) {
            return card;
        }
        return new MakaoCard(card.cardInstanceId, card.rank, card.suit, jokerDeclarations.get(card.cardInstanceId));
    }

    private void rememberLocalDiscardMove(Array<NativeCard> cardsToPlay, Map<String, MakaoCard> jokerDeclarations) {
        latestLocalDiscardMove.clear();
        if (cardsToPlay == null) return;
        for (NativeCard selected : cardsToPlay) {
            if (selected == null || selected.model == null) continue;
            latestLocalDiscardMove.add(resolveLocalJoker(selected.model, jokerDeclarations));
        }
    }

    private void syncPrototypeMakaoAfterHandChange() {
        if (prototypeState == null || prototypeState.myPlayerId == null) return;
        String playerId = prototypeState.myPlayerId;
        int handSize = prototypeState.myHand.size();
        if (handSize == 1) {
            if (!prototypeState.isMakaoReady(playerId)) {
                prototypeState.makaoByPlayer.put(playerId, false);
                prototypeState.missingMakaoByPlayer.put(playerId, true);
                prototypeState.makaoCatchAtByPlayer.put(playerId, System.currentTimeMillis() + 5000L);
            }
            return;
        }
        prototypeState.makaoByPlayer.remove(playerId);
        prototypeState.missingMakaoByPlayer.remove(playerId);
        prototypeState.makaoCatchAtByPlayer.remove(playerId);
    }

    private Array<NativeCard> cardsForPlay(NativeCard card) {
        Array<NativeCard> cards = new Array<>();
        if (card == null) return cards;
        if (isCardSelected(card) && selectedCards.size > 0) {
            cards.addAll(selectedCards);
            return normalizeCardsForPlay(cards);
        }
        cards.add(card);
        return cards;
    }

    private Array<NativeCard> normalizeCardsForPlay(Array<NativeCard> cards) {
        if (cards == null || cards.size <= 1) return cards;
        int forcedDrawnIndex = drawnCardIndex(cards);
        if (forcedDrawnIndex > 0) {
            return moveCardToFront(cards, forcedDrawnIndex, "drawn");
        }
        if (isPrototypePlayable(cards.first().model)) return cards;
        for (int i = 1; i < cards.size; i++) {
            NativeCard candidate = cards.get(i);
            if (candidate != null && candidate.model != null && isPrototypePlayable(candidate.model)) {
                return moveCardToFront(cards, i, "legal_first");
            }
        }
        return cards;
    }

    private int drawnCardIndex(Array<NativeCard> cards) {
        if (latestState == null
            || !latestState.hasDrawnCardThisTurn
            || latestState.drawnCardInstanceId == null
            || cards == null) {
            return -1;
        }
        for (int i = 0; i < cards.size; i++) {
            NativeCard card = cards.get(i);
            if (card != null
                && card.model != null
                && latestState.drawnCardInstanceId.equals(card.model.cardInstanceId)) {
                return i;
            }
        }
        return -1;
    }

    private Array<NativeCard> moveCardToFront(Array<NativeCard> cards, int index, String reason) {
        if (cards == null || index <= 0 || index >= cards.size) return cards;
        Array<NativeCard> ordered = new Array<>();
        ordered.add(cards.get(index));
        for (int i = 0; i < cards.size; i++) {
            if (i != index) ordered.add(cards.get(i));
        }
        trace("play_order_normalized reason=" + reason
            + " from=" + cardsDebug(cards)
            + " to=" + cardsDebug(ordered));
        return ordered;
    }

    private boolean containsJoker(Array<NativeCard> cards) {
        for (NativeCard card : cards) {
            if (card != null && MakaoCard.RANK_JOKER.equals(card.model.rank)) return true;
        }
        return false;
    }

    private boolean shouldShowMakaoButton() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || state.gameOver) return false;
        return (state.myHand.size() == 1 && state.isMyMakaoMissing())
            || canArmMakaoForSelectedMove();
    }

    private boolean shouldShowPassButton() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        return state != null
            && !state.gameOver
            && state.isMyTurn()
            && state.hasDrawnCardThisTurn
            && state.drawnCardInstanceId != null
            && !state.isActiveDrawPenaltyForMe()
            && !state.isActiveSkipForMe()
            && !pendingDrawRequest
            && pendingPlayedCardIds.size == 0
            && !requestDeclarationOpen
            && !jokerDeclarationOpen;
    }

    private boolean selectedMovePlaysLastCards() {
        if (selectedCards.size == 0) return false;
        Array<NativeCard> cards = cardsForPlay(selectedCards.peek());
        if (cards.size != selectedCards.size) return false;
        int remaining = hand.size - cards.size;
        return hand.size > 1 && remaining == 0;
    }

    private boolean canArmMakaoForSelectedMove() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        return state != null
            && !state.gameOver
            && state.isMyTurn()
            && !state.isMyMakaoReady()
            && selectedMovePlaysLastCards();
    }

    private boolean isMoveBlockedByMissingMakao(Array<NativeCard> cardsToPlay) {
        if (cardsToPlay == null || cardsToPlay.size == 0) return false;
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || state.isMyMakaoReady()) return false;
        int remaining = hand.size - cardsToPlay.size;
        return hand.size > 1 && remaining == 0;
    }

    private boolean canDeclareMyMakaoNow() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state != null && state.canDeclareMyMakaoNow()) return true;
        return canArmMakaoForSelectedMove();
    }

    private boolean handleMakaoButtonTap() {
        if (!shouldShowMakaoButton()) return false;
        playOptionalSound(tapSound);
        if (!canDeclareMyMakaoNow()) {
            return true;
        }
        if (nativeClient != null && nativeClient.isConnected()) {
            boolean emitted = nativeClient.declareMakao(latestState == null ? 0 : latestState.stateVersion);
            if (!emitted) {
                showNotice(STATUS_MOMENT);
                return true;
            }
            nativeStatusText = "MAKAO deklaruję…";
            emitFeedback(FeedbackIntent.ARM_TICK);
            return true;
        }
        if (prototypeState != null) {
            prototypeState.makaoByPlayer.put(prototypeState.myPlayerId, true);
            prototypeState.missingMakaoByPlayer.remove(prototypeState.myPlayerId);
            prototypeState.makaoCatchAtByPlayer.remove(prototypeState.myPlayerId);
            latestState = prototypeState.copy();
            nativeStatusText = "MAKAO gotowe";
            emitFeedback(FeedbackIntent.MAKAO);
            return true;
        }
        return true;
    }

    private void openJokerDeclaration(Array<NativeCard> cardsToPlay) {
        pendingJokerCardsToPlay.clear();
        pendingJokerCardsToPlay.addAll(cardsToPlay);
        String forcedRank = firstNonJokerRank(cardsToPlay);
        String forcedSuit = firstNonJokerSuit(cardsToPlay);
        String activeEffectType = activeJokerResponseEffectType();
        boolean forcedSkipResponse = "skip_turn".equals(activeEffectType);
        jokerRankLocked = forcedRank != null || forcedSkipResponse;
        jokerDeclarationRank = forcedSkipResponse ? "4" : (forcedRank == null ? defaultJokerRank() : forcedRank);
        jokerDeclarationSuit = forcedSuit == null ? defaultJokerSuit() : forcedSuit;
        jokerDeclarationOpen = true;
        jokerPanelTimer = 0f;
        draggedCard = null;
        draggingDrawCard = false;
        clearThrowIntent();
        nativeStatusText = forcedSkipResponse
            ? "joker jako 4 albo przyjmij pauzę"
            : "joker wybierz wartość i kolor";
        emitFeedback(FeedbackIntent.ARM_TICK);
        layoutHandTargets();
        emitHybridJokerChoiceOpen();
    }

    private void closeJokerDeclaration() {
        boolean wasOpen = jokerDeclarationOpen;
        jokerDeclarationOpen = false;
        jokerPanelTimer = 0f;
        jokerRankLocked = false;
        pendingJokerCardsToPlay.clear();
        if (wasOpen) emitHybridOverlayEvent("joker_choice_close", null);
    }

    private String firstNonJokerRank(Array<NativeCard> cards) {
        for (NativeCard card : cards) {
            if (card != null
                && card.model != null
                && card.model.rank != null
                && !MakaoCard.RANK_JOKER.equals(card.model.rank)) {
                return card.model.rank;
            }
        }
        return null;
    }

    private String firstNonJokerSuit(Array<NativeCard> cards) {
        for (NativeCard card : cards) {
            if (card != null
                && card.model != null
                && !MakaoCard.RANK_JOKER.equals(card.model.rank)
                && card.model.suit != null
                && !card.model.suit.isEmpty()) {
                return card.model.suit;
            }
        }
        return null;
    }

    private String defaultJokerRank() {
        if ("skip_turn".equals(activeJokerResponseEffectType())) return "4";
        MakaoCard top = effectiveTopCard();
        if (top != null
            && top.rank != null
            && !top.rank.isEmpty()
            && !MakaoCard.RANK_JOKER.equals(top.rank)) {
            return top.rank;
        }
        return "2";
    }

    private String activeJokerResponseEffectType() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null) return null;
        if (state.activeEffectTargetPlayerId != null
            && !state.activeEffectTargetPlayerId.equals(state.myPlayerId)) {
            return null;
        }
        return state.activeEffectType;
    }

    private String[] jokerRankOptions() {
        if ("skip_turn".equals(activeJokerResponseEffectType())) return new String[] { "4" };
        return JOKER_RANKS;
    }

    private String defaultJokerSuit() {
        MakaoCard top = effectiveTopCard();
        if (top != null && top.suit != null && !top.suit.isEmpty()) {
            return top.suit;
        }
        return "hearts";
    }

    private MakaoCard effectiveTopCard() {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        MakaoCard top = visibleTopCard(state);
        if (top != null) {
            return top.jokerDeclaration == null ? top : top.jokerDeclaration;
        }
        return null;
    }

    private boolean handleJokerDeclarationTouch(float x, float y) {
        if (!jokerPanelBounds().contains(x, y)) {
            closeJokerDeclaration();
            nativeStatusText = "joker anulowany";
            playOptionalSound(tapSound);
            layoutHandTargets();
            return true;
        }
        if (jokerCancelBounds().contains(x, y)) {
            closeJokerDeclaration();
            nativeStatusText = "joker anulowany";
            playOptionalSound(tapSound);
            layoutHandTargets();
            return true;
        }
        if (jokerPlayBounds().contains(x, y)) {
            confirmJokerDeclaration();
            return true;
        }
        if (!jokerRankLocked) {
            String[] rankOptions = jokerRankOptions();
            for (int i = 0; i < rankOptions.length; i++) {
                if (jokerRankBounds(i).contains(x, y)) {
                    jokerDeclarationRank = rankOptions[i];
                    playOptionalSound(tapSound);
                    return true;
                }
            }
        }
        for (int i = 0; i < JOKER_SUITS.length; i++) {
            if (jokerSuitBounds(i).contains(x, y)) {
                jokerDeclarationSuit = JOKER_SUITS[i];
                playOptionalSound(tapSound);
                return true;
            }
        }
        return true;
    }

    private void confirmJokerDeclaration() {
        if (pendingJokerCardsToPlay.size == 0) {
            closeJokerDeclaration();
            return;
        }
        if (nativeClient != null
            && nativeClient.isPlaying()
            && !NativeReliableActionRules.canSubmitDependentAction(nativeClient.hasPendingGameAction())) {
            showNotice(STATUS_MOMENT);
            emitHybridJokerChoiceOpen();
            return;
        }
        if (!NativePlayRules.isJokerRankAllowed(activeJokerResponseEffectType(), jokerDeclarationRank)) {
            showIllegalNotice("Joker musi być zadeklarowany jako 4");
            emitHybridJokerChoiceOpen();
            return;
        }
        Array<NativeCard> cardsToPlay = new Array<>();
        cardsToPlay.addAll(pendingJokerCardsToPlay);
        Map<String, MakaoCard> declarations = new HashMap<>();
        MakaoCard declaration = MakaoCard.create(null, jokerDeclarationRank, jokerDeclarationSuit);
        for (NativeCard card : cardsToPlay) {
            if (card != null && card.model != null && MakaoCard.RANK_JOKER.equals(card.model.rank)) {
                declarations.put(card.model.cardInstanceId, declaration);
            }
        }
        boolean submitted = prepareCardsForPlay(cardsToPlay, declarations);
        if (!NativeReliableActionRules.shouldCloseChoiceAfterSubmission(submitted)) {
            emitHybridJokerChoiceOpen();
            return;
        }
        closeJokerDeclaration();
        emitFeedback(nativeClient != null && nativeClient.isPlaying()
            ? FeedbackIntent.ARM_TICK
            : FeedbackIntent.SPECIAL);
    }

    private boolean prepareCardsForPlay(Array<NativeCard> cardsToPlay, Map<String, MakaoCard> jokerDeclarations) {
        String requestType = requestTypeFor(cardsToPlay, jokerDeclarations);
        if (requestType != null) {
            openRequestDeclaration(cardsToPlay, jokerDeclarations, requestType);
            return true;
        }
        return completeCardsPlay(cardsToPlay, jokerDeclarations, null, null);
    }

    private String requestTypeFor(Array<NativeCard> cardsToPlay, Map<String, MakaoCard> jokerDeclarations) {
        if (cardsToPlay == null || cardsToPlay.size == 0) return null;
        MakaoCard first = effectivePlayedCard(cardsToPlay.first().model, jokerDeclarations);
        if (first == null) return null;
        if ("ace".equals(first.rank)) return "suit";
        if ("jack".equals(first.rank)) return "rank";
        return null;
    }

    private MakaoCard effectivePlayedCard(MakaoCard card, Map<String, MakaoCard> jokerDeclarations) {
        if (card == null) return null;
        if (MakaoCard.RANK_JOKER.equals(card.rank)
            && jokerDeclarations != null
            && jokerDeclarations.containsKey(card.cardInstanceId)) {
            return jokerDeclarations.get(card.cardInstanceId);
        }
        return card.jokerDeclaration == null ? card : card.jokerDeclaration;
    }

    private void openRequestDeclaration(Array<NativeCard> cardsToPlay, Map<String, MakaoCard> jokerDeclarations, String requestType) {
        pendingRequestCardsToPlay.clear();
        pendingRequestCardsToPlay.addAll(cardsToPlay);
        pendingRequestJokerDeclarations.clear();
        if (jokerDeclarations != null) {
            pendingRequestJokerDeclarations.putAll(jokerDeclarations);
        }
        requestDeclarationType = requestType;
        requestDeclarationOpen = true;
        requestPanelTimer = 0f;
        draggedCard = null;
        draggingDrawCard = false;
        clearThrowIntent();
        nativeStatusText = "wybierz";
        emitFeedback(FeedbackIntent.ARM_TICK);
        layoutHandTargets();
        emitHybridRequestChoiceOpen();
    }

    private void closeRequestDeclaration() {
        boolean wasOpen = requestDeclarationOpen;
        requestDeclarationOpen = false;
        requestPanelTimer = 0f;
        requestDeclarationType = "";
        pendingRequestCardsToPlay.clear();
        pendingRequestJokerDeclarations.clear();
        if (wasOpen) emitHybridOverlayEvent("request_choice_close", null);
    }

    private void emitHybridJokerChoiceOpen() {
        if (!jokerDeclarationOpen || !isWebLaunchedNativeTable()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("rankLocked", jokerRankLocked);
            payload.put("selectedRank", jokerDeclarationRank);
            payload.put("selectedSuit", jokerDeclarationSuit);
            payload.put("jokerCount", countJokerCards(pendingJokerCardsToPlay));
            payload.put("cardCount", pendingJokerCardsToPlay.size);
            payload.put("ranks", jsonArray(jokerRankOptions()));
            payload.put("suits", jsonArray(JOKER_SUITS));
            emitHybridOverlayEvent("joker_choice_open", payload);
        } catch (JSONException ignored) {
            // Choice fallback remains in GDX for non-hybrid launches.
        }
    }

    private void emitHybridRequestChoiceOpen() {
        if (!requestDeclarationOpen || !isWebLaunchedNativeTable()) return;
        try {
            boolean suitRequest = "suit".equals(requestDeclarationType);
            JSONObject payload = new JSONObject();
            payload.put("requestType", requestDeclarationType);
            payload.put("allowNone", true);
            payload.put("options", jsonArray(suitRequest ? JOKER_SUITS : rankRequestOptions()));
            emitHybridOverlayEvent("request_choice_open", payload);
        } catch (JSONException ignored) {
            // Choice fallback remains in GDX for non-hybrid launches.
        }
    }

    private int countJokerCards(Array<NativeCard> cards) {
        int count = 0;
        if (cards == null) return count;
        for (NativeCard card : cards) {
            if (card != null && card.model != null && MakaoCard.RANK_JOKER.equals(card.model.rank)) {
                count++;
            }
        }
        return count;
    }

    private JSONArray jsonArray(String[] values) {
        JSONArray array = new JSONArray();
        if (values == null) return array;
        for (String value : values) {
            array.put(value);
        }
        return array;
    }

    private boolean isValidRequestChoice(String requestType, String value) {
        if ("none".equals(value)) return true;
        if ("suit".equals(requestType)) return containsValue(JOKER_SUITS, value);
        if ("rank".equals(requestType)) return containsValue(rankRequestOptions(), value);
        return false;
    }

    private boolean containsValue(String[] values, String value) {
        if (values == null || value == null) return false;
        for (String candidate : values) {
            if (safeEquals(candidate, value)) return true;
        }
        return false;
    }

    private boolean handleRequestDeclarationTouch(float x, float y) {
        if (!requestPanelBounds().contains(x, y)) return cancelRequestDeclaration();
        if (requestNoneBounds().contains(x, y)) {
            confirmRequestDeclaration("none");
            return true;
        }
        boolean suitRequest = "suit".equals(requestDeclarationType);
        if (suitRequest) {
            for (int i = 0; i < JOKER_SUITS.length; i++) {
                if (requestChoiceBounds(i, JOKER_SUITS.length, 58f).contains(x, y)) {
                    confirmRequestDeclaration(JOKER_SUITS[i]);
                    return true;
                }
            }
        } else {
            String[] rankOptions = rankRequestOptions();
            for (int i = 0; i < rankOptions.length; i++) {
                if (requestChoiceBounds(i, rankOptions.length, 50f).contains(x, y)) {
                    confirmRequestDeclaration(rankOptions[i]);
                    return true;
                }
            }
        }
        return true;
    }

    private boolean cancelRequestDeclaration() {
        closeRequestDeclaration();
        nativeStatusText = "anulowano";
        playOptionalSound(tapSound);
        layoutHandTargets();
        return true;
    }

    private void confirmRequestDeclaration(String value) {
        if (pendingRequestCardsToPlay.size == 0) {
            closeRequestDeclaration();
            return;
        }
        Array<NativeCard> cardsToPlay = new Array<>();
        cardsToPlay.addAll(pendingRequestCardsToPlay);
        Map<String, MakaoCard> declarations = new HashMap<>();
        declarations.putAll(pendingRequestJokerDeclarations);
        String requestType = requestDeclarationType;
        boolean submitted;
        if ("suit".equals(requestType)) {
            submitted = completeCardsPlay(cardsToPlay, declarations, value, null);
        } else {
            submitted = completeCardsPlay(cardsToPlay, declarations, null, value);
        }
        if (!NativeReliableActionRules.shouldCloseChoiceAfterSubmission(submitted)) {
            emitHybridRequestChoiceOpen();
            return;
        }
        closeRequestDeclaration();
        emitFeedback(nativeClient != null && nativeClient.isPlaying()
            ? FeedbackIntent.ARM_TICK
            : FeedbackIntent.SPECIAL);
    }

    private boolean completeCardsPlay(Array<NativeCard> cardsToPlay, Map<String, MakaoCard> jokerDeclarations, String suitRequest, String rankRequest) {
        if (nativeClient != null && nativeClient.isPlaying()) {
            return sendCardsToServer(cardsToPlay, jokerDeclarations, suitRequest, rankRequest);
        } else {
            playCardsLocally(cardsToPlay, jokerDeclarations);
            return true;
        }
    }

    private boolean sendCardsToServer(Array<NativeCard> cardsToPlay, Map<String, MakaoCard> jokerDeclarations, String suitRequest, String rankRequest) {
        List<MakaoCard> models = new ArrayList<>(cardsToPlay.size);
        for (NativeCard selected : cardsToPlay) {
            models.add(selected.model);
        }
        int expectedStateVersion = latestState == null ? 0 : latestState.stateVersion;
        boolean emitted = nativeClient.playCards(models, jokerDeclarations, suitRequest, rankRequest, expectedStateVersion);
        if (!emitted) {
            trace("play_emit_failed cards=" + cardsDebug(cardsToPlay));
            showNotice(STATUS_MOMENT);
            return false;
        }
        rememberLocalDiscardMove(cardsToPlay, jokerDeclarations);
        pendingPlayedCardIds.clear();
        for (NativeCard selected : cardsToPlay) {
            pendingPlayedCardIds.add(selected.model.cardInstanceId);
        }
        trace("play_emit cards=" + cardsDebug(cardsToPlay)
            + " suitRequest=" + suitRequest
            + " rankRequest=" + rankRequest
            + " pending=" + pendingPlayedCardIds.size);
        selectedCards.clear();
        selectedCard = null;
        draggedCard = null;
        layoutHandTargets();
        return true;
    }

    private void startThrowFlight(NativeCard card, boolean toDiscard) {
        startThrowFlight(card, toDiscard, null);
    }

    private void startThrowFlight(NativeCard card, boolean toDiscard, MakaoCard modelOverride) {
        startThrowFlight(card, toDiscard, modelOverride, 0);
    }

    private void startThrowFlight(NativeCard card, boolean toDiscard, MakaoCard modelOverride, int stackIndex) {
        startThrowFlight(card, toDiscard, modelOverride, stackIndex, 1);
    }

    private void startThrowFlight(NativeCard card, boolean toDiscard, MakaoCard modelOverride, int stackIndex, int stackCount) {
        if (card == null) return;
        if (!isSanePlayTarget()) resetPendingPlayTargetToDiscardCenter();
        CardFlight flight = new CardFlight(card.copy(), toDiscard);
        if (modelOverride != null) {
            flight.card.model = modelOverride;
        }
        if (toDiscard) {
            flight.localDiscardFlight = true;
            flight.landingDiscardModel = flight.card.model;
            flight.landingDiscardCardInstanceId = flight.card.model == null ? null : flight.card.model.cardInstanceId;
            handFocusHoldTimer = 0f;
            tableRevealHoldTimer = 0f;
        }
        flight.startX = card.x;
        flight.startY = card.y;
        flight.startAngle = card.angle;
        flight.startScale = card.scale;
        float stackFan = stackCount <= 1 ? 0f : stackIndex - (stackCount - 1f) / 2f;
        flight.endX = pendingPlayTargetX + stackFan * 11f;
        flight.endY = pendingPlayTargetY + Math.abs(stackFan) * 2.5f;
        flight.endAngle = MathUtils.clamp(card.angle * 0.18f + stackFan * 4.4f + MathUtils.random(-4f, 4f), -12f, 12f);
        flight.endScale = 1.12f;
        float speedFactor = Math.min(1f, Math.abs(dragVelocityY) / 1200f);
        flight.duration = NativeCardMotion.throwFlightSeconds(speedFactor);
        flight.arc = MathUtils.lerp(46f, 82f, speedFactor);
        flight.startDelay = NativeCardMotion.throwStackDelaySeconds(stackIndex);
        flight.silentLanding = stackIndex < Math.max(1, stackCount) - 1;
        flight.landFeedbackIntent = FeedbackIntent.LAND_PLAY;
        flights.add(flight);
    }

    private float discardCenterX() {
        return discardPileBounds.x + discardPileBounds.width / 2f;
    }

    private float discardCenterY() {
        return discardPileBounds.y + discardPileBounds.height / 2f;
    }

    private void resetPendingPlayTargetToDiscardCenter() {
        boolean willFan = discardTop != null || (latestState != null && latestState.topCard != null) || (prototypeState != null && prototypeState.topCard != null);
        pendingPlayTargetX = discardTopVisualX(willFan);
        pendingPlayTargetY = discardTopVisualY(willFan);
    }

    private boolean isSanePlayTarget() {
        return pendingPlayTargetX >= discardPileBounds.x - 24f
            && pendingPlayTargetX <= discardPileBounds.x + discardPileBounds.width + 24f
            && pendingPlayTargetY >= discardPileBounds.y - 24f
            && pendingPlayTargetY <= discardPileBounds.y + discardPileBounds.height + 24f;
    }

    private void startDrawFlightToHand(MakaoCard revealModel) {
        startDrawFlightToHand(revealModel, 0);
    }

    private void startDrawFlightToHand(MakaoCard revealModel, int drawStackIndex) {
        startDrawFlightToHand(revealModel, drawStackIndex, false);
    }

    private void startPendingDrawFlightToHand() {
        triggerDrawPileRecoil();
        startDrawFlightToHand(null, 0, true);
    }

    private void startDrawFlightToHand(MakaoCard revealModel, int drawStackIndex, boolean awaitingAuthoritativeState) {
        NativeCard ghost = new NativeCard(MakaoCard.create("draw_flight_" + nextPrototypeCardId++, "?", null));
        ghost.x = draggingDrawCard ? drawDragX : drawPileBounds.x + drawPileBounds.width / 2f;
        ghost.y = draggingDrawCard ? drawDragY : drawPileBounds.y + drawPileBounds.height / 2f;
        ghost.angle = draggingDrawCard ? drawDragAngle : 0f;
        ghost.scale = draggingDrawCard ? drawDragScale : 1f;
        ghost.targetScale = ghost.scale;

        CardFlight flight = new CardFlight(ghost, false);
        flight.faceDown = true;
        flight.flipToFace = revealModel != null;
        flight.revealModel = revealModel;
        flight.landingCardInstanceId = revealModel == null ? null : revealModel.cardInstanceId;
        flight.awaitingAuthoritativeState = awaitingAuthoritativeState;
        flight.startDelay = NativeCardMotion.drawStartDelaySeconds(drawStackIndex);
        flight.landFeedbackIntent = FeedbackIntent.LAND_DRAW;
        flight.startX = ghost.x;
        flight.startY = ghost.y;
        flight.startAngle = ghost.angle;
        flight.startScale = ghost.scale;
        flight.detachX = ghost.x + MathUtils.random(-8f, 10f) + Math.min(drawStackIndex, 3) * 2.5f;
        flight.detachY = ghost.y + MathUtils.random(18f, 26f) + Math.min(drawStackIndex, 3) * 1.5f;
        flight.detachAngle = ghost.angle + MathUtils.random(-5f, 5f);
        flight.detachScale = ghost.scale * 1.04f;
        flight.endX = WORLD_WIDTH / 2f + MathUtils.random(-96f, 96f) + Math.min(drawStackIndex, 3) * 3f;
        flight.endY = HAND_Y + 34f;
        flight.endAngle = MathUtils.random(-12f, 12f);
        flight.endScale = 1f;
        flight.duration = NativeCardMotion.drawFlightSeconds(drawStackIndex, MathUtils.random(-1f, 1f));
        flight.arc = MathUtils.random(64f, 82f) + Math.min(drawStackIndex, 3) * 4f;
        flights.add(flight);
    }

    private void triggerDrawPileRecoil() {
        drawPileRecoilTimer = DRAW_RECOIL_SECONDS;
    }

    private void delayNewestFlight(float seconds) {
        if (flights.size == 0) return;
        CardFlight flight = flights.peek();
        if (flight != null && flight.elapsed <= 0f) {
            flight.startDelay = Math.max(flight.startDelay, seconds);
        }
    }

    private void delayActiveDiscardFlights(float seconds) {
        for (CardFlight flight : flights) {
            if (flight != null && flight.toDiscard && flight.elapsed <= 0f) {
                flight.startDelay = Math.max(flight.startDelay, seconds);
            }
        }
    }

    private NativeCard findHandCardById(String cardInstanceId) {
        if (cardInstanceId == null) return null;
        for (NativeCard card : hand) {
            if (cardInstanceId.equals(card.model.cardInstanceId)) return card;
        }
        return null;
    }

    private boolean handleNetworkDiscardTap() {
        if (nativeClient == null || !nativeClient.isConnected() || !nativeClient.hasRoom()) return false;
        if (nativeClient.isLobby()) {
            playOptionalSound(tapSound);
            lobbyDealPreviewTimer = LOBBY_DEAL_PREVIEW_SECONDS;
            nativeStatusText = "Rozdaję…";
            nativeClient.startGame();
            return true;
        }
        return false;
    }

    private boolean handlePassButtonTap() {
        if (!shouldShowPassButton()) return false;
        return submitPassTurn("pass_button");
    }

    private boolean submitPassTurn(String source) {
        playOptionalSound(tapSound);
        selectedCards.clear();
        selectedCard = null;
        draggedCard = null;
        clearThrowIntent();
        layoutHandTargets();

        if (nativeClient != null && nativeClient.isPlaying()) {
            nativeStatusText = "Pas…";
            trace(source + " emit=pass_turn " + stateDebug(latestState));
            if (!nativeClient.passTurn()) {
                showNotice(STATUS_MOMENT);
                trace(source + " emit_failed=pass_turn");
            }
            return true;
        }

        if (prototypeState != null && prototypeState.isMyTurn()) {
            prototypeState.hasDrawnCardThisTurn = false;
            prototypeState.drawnCardInstanceId = null;
            prototypeState.currentPlayerId = "opponent";
            latestState = prototypeState.copy();
            nativeStatusText = "Pas";
            return true;
        }

        return false;
    }

    private String catchMakaoTargetAt(float x, float y) {
        for (Map.Entry<String, Rectangle> entry : catchMakaoBoundsByPlayer.entrySet()) {
            if (entry.getValue().contains(x, y)) return entry.getKey();
        }
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || state.players.isEmpty()) return null;

        ArrayList<MakaoPlayer> opponents = opponentPlayers(state);
        int count = Math.min(7, opponents.size());
        for (int i = 0; i < count; i++) {
            MakaoPlayer player = opponents.get(i);
            if (player == null || !state.isMakaoMissing(player.id) || !state.canCatchMakao(player.id)) continue;
            Rectangle bounds = opponentSeatBounds(i, count);
            float catchWidth = 74f;
            Rectangle catchBounds = new Rectangle(bounds.x + bounds.width - catchWidth - 10f, bounds.y - 42f, catchWidth + 20f, 48f);
            if (catchBounds.contains(x, y)) return player.id;
        }
        return null;
    }

    private boolean handleCatchMakaoTap(String targetPlayerId) {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || targetPlayerId == null || !state.isMakaoMissing(targetPlayerId)) return false;
        playOptionalSound(tapSound);
        if (!state.canCatchMakao(targetPlayerId)) {
            nativeStatusText = "MAKAO czas";
            return true;
        }
        if (nativeClient != null && nativeClient.isConnected()) {
            nativeClient.catchMakao(targetPlayerId, state.stateVersion);
            return true;
        }
        if (prototypeState != null) {
            prototypeState.makaoByPlayer.remove(targetPlayerId);
            prototypeState.missingMakaoByPlayer.remove(targetPlayerId);
            prototypeState.makaoCatchAtByPlayer.remove(targetPlayerId);
            prototypeState.statusText = "MAKAO złapano";
            applyGameState(prototypeState);
            return true;
        }
        return true;
    }

    private boolean isInsideDiscard(float x, float y) {
        return discardPileBounds.contains(x, y);
    }

    private boolean isNearDiscard(float x, float y, float padding) {
        return x >= discardPileBounds.x - padding
            && x <= discardPileBounds.x + discardPileBounds.width + padding
            && y >= discardPileBounds.y - padding
            && y <= discardPileBounds.y + discardPileBounds.height + padding;
    }

    private boolean isInsidePlayTable(float x, float y) {
        if (isInsideDiscard(x, y)) return true;
        return x >= 350f && x <= 740f && y >= 170f && y <= 420f;
    }

    private boolean isInsideDrawPile(float x, float y) {
        return drawPileBounds.contains(x, y);
    }

    private boolean isInsideHandBand(float y) {
        return y <= 185f;
    }

    private void startDrawDrag(float x, float y) {
        playOptionalSound(tapSound);
        if (feedback != null) feedback.lightImpact();
        selectedCard = null;
        selectedCards.clear();
        draggedCard = null;
        draggingDrawCard = true;
        drawPullArmed = false;
        drawDragX = x;
        drawDragY = y;
        drawDragAngle = 0f;
        drawDragScale = 1.06f;
        layoutHandTargets();
    }

    private void updateDrawDrag(float x, float y) {
        updateDragVelocity(x, y);
        drawDragX = x;
        drawDragY = y;
        boolean wasArmed = drawPullArmed;
        drawPullArmed = isDrawPullGesture(x, y);
        if (!wasArmed && drawPullArmed) {
            emitFeedback(FeedbackIntent.ARM_TICK);
        }
        float lean = MathUtils.clamp(dragVelocityX / 120f, -10f, 10f);
        drawDragAngle = MathUtils.lerpAngleDeg(drawDragAngle, lean, 0.24f);
        drawDragScale = MathUtils.lerp(drawDragScale, drawPullArmed ? 1.12f : 1.06f, 0.24f);
        clearThrowIntent();
        layoutHandTargets();
    }

    private boolean isDrawPullGesture(float x, float y) {
        float downwardDistance = dragStartY - y;
        boolean releasedIntoHand = y <= DRAW_RELEASE_Y && downwardDistance >= DRAW_PULL_MIN_DISTANCE;
        boolean fastPullDown = y <= drawPileBounds.y && dragVelocityY <= -520f;
        return releasedIntoHand || fastPullDown;
    }

    private NativeCard findTopHandCard(float x, float y) {
        for (int i = hand.size - 1; i >= 0; i--) {
            NativeCard card = hand.get(i);
            if (card.hiddenByFlight) continue;
            if (isPendingPlayed(card)) continue;
            if (card.hit(x, y, CARD_WIDTH, CARD_HEIGHT)) return card;
        }
        return null;
    }

    private boolean isThrowGesture(float x, float y) {
        return isThrowGesture(x, y, draggedCard);
    }

    private boolean isThrowGesture(float x, float y, NativeCard referenceCard) {
        float score = throwIntentScore(x, y, referenceCard);
        return score >= THROW_ARM_SCORE || (dragThrowArmed && score >= THROW_KEEP_ARM_SCORE);
    }

    private boolean isThrowCancelGesture(float x, float y, float moved) {
        if (moved < TAP_MOVE_THRESHOLD) return false;
        float downwardDistance = dragStartY - y;
        return downwardDistance >= THROW_CANCEL_MIN_DOWNWARD_DISTANCE;
    }

    private void cancelCardThrowGesture(NativeCard releasedCard) {
        selectedCards.clear();
        selectedCard = null;
        draggedCard = null;
        clearThrowIntent();
        if (releasedCard != null) {
            releasedCard.targetScale = 1f;
        }
        nativeStatusText = "rzut anulowany";
        trace("card_drag_cancel moved_down " + stateDebug(latestState));
        layoutHandTargets();
    }

    private float throwIntentScore(float x, float y, NativeCard referenceCard) {
        float upwardDistance = y - dragStartY;
        if (upwardDistance <= 0f) return 0f;
        if (isInsideDiscard(x, y) && upwardDistance >= 10f) return 1f;
        if (isNearDiscard(x, y, 82f) && upwardDistance >= 18f) return 0.95f;
        if (referenceCard != null && isNearDiscard(referenceCard.x, referenceCard.y, 64f) && upwardDistance >= 18f) return 0.95f;

        float horizontalDistance = Math.abs(x - dragStartX);
        float directionScore = MathUtils.clamp(
            upwardDistance / (upwardDistance + horizontalDistance * 0.62f),
            0f,
            1f
        );
        float nearDiscardScore = throwDiscardProximityScore(x, y, referenceCard)
            * MathUtils.clamp(upwardDistance / 24f, 0f, 1f);
        float tableScore = isInsidePlayTable(x, y)
            ? MathUtils.clamp((upwardDistance - 8f) / THROW_TABLE_MIN_UPWARD_DISTANCE, 0f, 1f)
            : 0f;
        float clearUpwardScore = y >= THROW_ZONE_Y
            ? MathUtils.clamp(upwardDistance / THROW_MIN_UPWARD_DISTANCE, 0f, 1f) * directionScore
            : 0f;
        float flickScore = y >= HAND_Y + 46f
            ? MathUtils.clamp(dragVelocityY / THROW_MIN_UPWARD_VELOCITY, 0f, 1f)
                * MathUtils.clamp(upwardDistance / 28f, 0f, 1f)
                * MathUtils.clamp(directionScore + 0.24f, 0f, 1f)
            : 0f;
        return Math.max(Math.max(nearDiscardScore, tableScore), Math.max(clearUpwardScore, flickScore));
    }

    private float throwDiscardProximityScore(float x, float y, NativeCard referenceCard) {
        float pointerScore = paddedRectProximityScore(x, y, discardPileBounds, THROW_NEAR_DISCARD_PADDING, 76f);
        if (referenceCard == null) return pointerScore;
        float cardScore = paddedRectProximityScore(
            referenceCard.x,
            referenceCard.y,
            discardPileBounds,
            THROW_NEAR_DISCARD_PADDING * 0.72f,
            58f
        );
        return Math.max(pointerScore, cardScore);
    }

    private float paddedRectProximityScore(float x, float y, Rectangle rect, float padding, float fadeDistance) {
        float minX = rect.x - padding;
        float maxX = rect.x + rect.width + padding;
        float minY = rect.y - padding;
        float maxY = rect.y + rect.height + padding;
        float dx = x < minX ? minX - x : (x > maxX ? x - maxX : 0f);
        float dy = y < minY ? minY - y : (y > maxY ? y - maxY : 0f);
        float distance = (float) Math.sqrt(dx * dx + dy * dy);
        return 1f - MathUtils.clamp(distance / fadeDistance, 0f, 1f);
    }

    private void updateThrowIntent(float x, float y, NativeCard referenceCard) {
        float score = throwIntentScore(x, y, referenceCard);
        boolean wasArmed = dragThrowArmed;
        boolean shouldArm = score >= THROW_ARM_SCORE || (dragThrowArmed && score >= THROW_KEEP_ARM_SCORE);
        if (!wasArmed && shouldArm) {
            emitFeedback(FeedbackIntent.ARM_TICK);
        }
        dragThrowArmed = shouldArm;
        throwIntentAmount = MathUtils.lerp(throwIntentAmount, shouldArm ? 1f : score, 0.34f);
    }

    private void clearThrowIntent() {
        dragThrowArmed = false;
        throwIntentAmount = 0f;
    }

    private void updateDragVelocity(float x, float y) {
        float delta = Math.max(1f / 120f, elapsed - lastDragTime);
        dragVelocityX = (x - lastDragX) / delta;
        dragVelocityY = (y - lastDragY) / delta;
        lastDragX = x;
        lastDragY = y;
        lastDragTime = elapsed;
    }

    private boolean shouldSwitchToHandPan(float x, float y) {
        if (!handPanCandidate || !canPanHand() || !isInsideHandBand(dragStartY)) return false;
        if (!isInsideHandBand(y)) return false;
        float dx = x - dragStartX;
        float dy = y - dragStartY;
        if (dy > 12f) return false;
        return Math.abs(dx) >= HAND_PAN_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.35f;
    }

    private void updateHandPan(float x, float y) {
        updateDragVelocity(x, y);
        handScrollOffset = clampedHandScrollOffset(handPanStartOffset - (x - dragStartX));
        clearThrowIntent();
        layoutHandTargets();
    }

    private boolean handleNativeStartTouch(float x, float y) {
        for (StartPanel panel : StartPanel.values()) {
            if (startTabBounds(panel).contains(x, y)) {
                startPanel = panel;
                playOptionalSound(tapSound);
                if (feedback != null) feedback.lightImpact();
                return true;
            }
        }

        if (playerFieldBounds().contains(x, y)) {
            openPlayerNameInput();
            return true;
        }

        if (startPanel == StartPanel.CREATE) {
            if (roomNameFieldBounds().contains(x, y)) {
                openRoomNameInput();
                return true;
            }
            if (createRoomButtonBounds().contains(x, y)) {
                createNativeRoomFromMenu();
                return true;
            }
        } else if (startPanel == StartPanel.JOIN) {
            if (roomCodeFieldBounds().contains(x, y)) {
                openRoomCodeInput();
                return true;
            }
            if (joinRoomButtonBounds().contains(x, y)) {
                joinNativeRoomFromMenu();
                return true;
            }
        } else if (startPanel == StartPanel.SETTINGS) {
            if (serverFieldBounds().contains(x, y)) {
                openServerInput();
                return true;
            }
            if (audioToggleBounds().contains(x, y)) {
                audioEnabled = !audioEnabled;
                saveNativePreferences();
                showNotice(audioEnabled ? "dźwięk włączony" : "dźwięk wyłączony");
                if (audioEnabled) playOptionalSound(tapSound);
                return true;
            }
            if (hapticsToggleBounds().contains(x, y)) {
                hapticsEnabled = !hapticsEnabled;
                applyNativeFeedbackSettings();
                saveNativePreferences();
                if (feedback != null) feedback.lightImpact();
                showNotice(hapticsEnabled ? "wibracje włączone" : "wibracje wyłączone");
                return true;
            }
            if (solidCardsToggleBounds().contains(x, y)) {
                solidCardsEnabled = !solidCardsEnabled;
                saveNativePreferences();
                showNotice(solidCardsEnabled ? "karty pełne" : "karty miękkie");
                if (feedback != null) feedback.lightImpact();
                return true;
            }
            if (defaultServerButtonBounds().contains(x, y)) {
                menuServerUrl = NativeGameConfig.DEFAULT_SERVER_URL;
                if (!lastRoomId.isEmpty() && !safeEquals(lastRoomServerUrl, menuServerUrl)) {
                    clearLastRoom();
                }
                saveNativePreferences();
                reconnectMenuClient();
                showNotice("serwer domyślny");
                return true;
            }
        }
        return true;
    }

    private boolean handleNativeLobbyTouch(float x, float y) {
        if (lobbySettingsOpen) {
            return handleLobbySettingsTouch(x, y);
        }
        if (lobbyLeaveButtonBounds().contains(x, y)) {
            openLeaveConfirm(false);
            return true;
        }
        if (lobbySettingsButtonBounds().contains(x, y)) {
            lobbySettingsOpen = true;
            playOptionalSound(tapSound);
            if (feedback != null) feedback.lightImpact();
            return true;
        }
        if (lobbyReadyButtonBounds().contains(x, y)) {
            playOptionalSound(tapSound);
            if (nativeClient != null) {
                nativeClient.toggleReady();
            } else {
                showNotice("łączenie");
            }
            return true;
        }
        if (lobbyStartButtonBounds().contains(x, y)) {
            boolean isHost = nativeRoomState != null && nativeConfig != null && nativeRoomState.isHost(nativeConfig.clientId);
            boolean allReady = lobbyAllPlayersReady();
            playOptionalSound(tapSound);
            if (!isHost) {
                showNotice("czekaj na hosta");
                return true;
            }
            if (!lobbyHasEnoughPlayers()) {
                showNotice("czekam na gracza", FeedbackIntent.ILLEGAL);
                return true;
            }
            if (!allReady) {
                showNotice("czekam na gotowość", FeedbackIntent.ILLEGAL);
                return true;
            }
            if (nativeClient != null) {
                lobbyDealPreviewTimer = LOBBY_DEAL_PREVIEW_SECONDS;
                nativeStatusText = "Rozdaję…";
                nativeClient.startGame();
                return true;
            }
        }
        return true;
    }

    private void openLeaveConfirm(boolean inGame) {
        if (isWebLaunchedNativeTable()) {
            leaveConfirmOpen = false;
            return;
        }
        leaveConfirmOpen = true;
        leaveConfirmInGame = inGame;
        playOptionalSound(tapSound);
        if (feedback != null) feedback.lightImpact();
    }

    private boolean handleLeaveConfirmTouch(float x, float y) {
        if (isWebLaunchedNativeTable()) {
            leaveConfirmOpen = false;
            return false;
        }
        if (!leaveConfirmOpen) return false;
        if (leaveConfirmCancelButtonBounds().contains(x, y)) {
            leaveConfirmOpen = false;
            playOptionalSound(tapSound);
            return true;
        }
        if (leaveConfirmAcceptButtonBounds().contains(x, y)) {
            leaveConfirmOpen = false;
            leaveCurrentNativeRoom();
            return true;
        }
        if (!leaveConfirmPanelBounds().contains(x, y)) {
            leaveConfirmOpen = false;
            playOptionalSound(tapSound);
            return true;
        }
        return true;
    }

    private void leaveCurrentNativeRoom() {
        playOptionalSound(tapSound);
        if (feedback != null) feedback.lightImpact();
        closeJokerDeclaration();
        closeRequestDeclaration();
        selectedCards.clear();
        selectedCard = null;
        draggedCard = null;
        pendingPlayedCardIds.clear();
        pendingDrawRequest = false;
        draggingDrawCard = false;
        drawPullArmed = false;
        clearDrawInsertSlot();
        clearThrowIntent();
        nativeStatusText = leaveConfirmInGame ? "Rezygnacja…" : "Opuszczam stół…";
        if (nativeClient != null && nativeClient.hasRoom()) {
            nativeClient.leaveRoom();
            return;
        }
        nativeRoomState = null;
        startScreenVisible = nativeConfig != null && nativeConfig.debugScenario == null && !isWebLaunchedNativeTable();
        clearTableStateForShell();
        nativeStatusText = "Poza stołem";
        scheduleNativeLeaveReturn();
    }

    private void scheduleNativeLeaveReturn() {
        scheduleNativeExitReturn(NATIVE_EXIT_LEFT_ROOM);
    }

    private void scheduleNativeLobbyReturn() {
        scheduleNativeExitReturn(NATIVE_EXIT_RETURN_LOBBY);
    }

    private void scheduleNativeExitReturn(String action) {
        if (nativeExitCallback != null && nativeConfig != null && nativeConfig.debugScenario == null) {
            pendingNativeExitAction = action == null ? NATIVE_EXIT_LEFT_ROOM : action;
            pendingNativeExitFinishTimer = 0.45f;
        }
    }

    private boolean handleGameOverTouch(float x, float y) {
        MakaoGameState state = latestState != null ? latestState : prototypeState;
        if (state == null || !state.gameOver) return false;
        if (isWebLaunchedNativeTable()) return true;
        if (gameOverReplayButtonBounds().contains(x, y)) {
            playOptionalSound(tapSound);
            if (nativeClient != null && nativeClient.hasRoom()) {
                if (!canRequestRematch()) {
                    showNotice("Rewanż uruchamia host");
                    return true;
                }
                nativeClient.returnToLobby();
                return true;
            }
            seedPrototypeTable();
            return true;
        }
        if (gameOverExitButtonBounds().contains(x, y)) {
            playOptionalSound(tapSound);
            if (nativeClient != null && nativeClient.hasRoom()) {
                nativeClient.leaveRoom();
                return true;
            }
            clearLastRoom();
            startScreenVisible = nativeConfig != null && nativeConfig.debugScenario == null && !isWebLaunchedNativeTable();
            clearTableStateForShell();
            nativeStatusText = "Poza stołem";
            scheduleNativeLeaveReturn();
            return true;
        }
        return true;
    }

    private boolean handleLobbySettingsTouch(float x, float y) {
        if (lobbySettingsCloseBounds().contains(x, y)) {
            lobbySettingsOpen = false;
            playOptionalSound(tapSound);
            return true;
        }
        for (int page = 0; page < 2; page++) {
            if (lobbySettingsTabBounds(page).contains(x, y)) {
                lobbySettingsPage = page;
                playOptionalSound(tapSound);
                return true;
            }
        }
        if (!lobbySettingsSheetBounds().contains(x, y)) {
            lobbySettingsOpen = false;
            return true;
        }
        if (!isNativeLobbyHost()) {
            showNotice("ustawienia zmienia host");
            return true;
        }

        for (int i = 0; i < 6; i++) {
            Rectangle card = lobbySettingsCardBounds(i);
            if (!card.contains(x, y)) continue;
            if (lobbySettingsPage == 0) {
                return handleBasicSettingsCardTouch(i, card, x, y);
            }
            return handleRuleSettingsCardTouch(i, card, x, y);
        }
        return true;
    }

    private boolean handleBasicSettingsCardTouch(int index, Rectangle card, float x, float y) {
        if (index == 0) {
            int direction = settingsStepDirection(card, x, y);
            if (direction != 0) {
                sendRoomSetting("maxPlayers", MathUtils.clamp(nativeRoomState.maxPlayers + direction, Math.max(2, nativeRoomState.players.size()), 8));
            }
            return true;
        }
        if (index == 1) {
            int direction = settingsStepDirection(card, x, y);
            if (direction != 0) {
                sendRoomSetting("deckCount", MathUtils.clamp(nativeRoomState.deckCount + direction, 1, 3));
            }
            return true;
        }
        if (index == 2) {
            int direction = settingsStepDirection(card, x, y);
            if (direction != 0) {
                sendRoomSetting("turnTimeLimitSeconds", nextTurnLimit(nativeRoomState.turnTimeLimitSeconds, direction));
            }
            return true;
        }
        if (index == 3) {
            if (settingsLeftSegmentBounds(card).contains(x, y)) {
                sendRoomSetting("useJokers", false);
            } else if (settingsRightSegmentBounds(card).contains(x, y)) {
                sendRoomSetting("useJokers", true);
            }
            return true;
        }
        if (index == 4) {
            if (settingsLeftSegmentBounds(card).contains(x, y)) {
                sendRoomSetting("firstPlayerMode", "random_each_game");
            } else if (settingsRightSegmentBounds(card).contains(x, y)) {
                sendRoomSetting("firstPlayerId", nativeRoomState.hostId);
            }
            return true;
        }
        if (index == 5) {
            openNativeTextInput("Nazwa stołu", nativeRoomState.name == null ? menuRoomName : nativeRoomState.name, "Stół", value -> {
                String clean = cleanRoomName(value);
                if (!clean.isEmpty()) {
                    menuRoomName = clean;
                    saveNativePreferences();
                    sendRoomSetting("roomName", clean);
                }
            }, KeyboardMode.TEXT, 32);
            return true;
        }
        return true;
    }

    private boolean handleRuleSettingsCardTouch(int index, Rectangle card, float x, float y) {
        if (index == 5) {
            int direction = settingsStepDirection(card, x, y);
            if (direction != 0) {
                sendRoomSetting("makaoPenaltyCards", MathUtils.clamp(nativeRoomState.makaoPenaltyCards + direction, 0, 20));
            }
            return true;
        }
        boolean left = settingsLeftSegmentBounds(card).contains(x, y);
        boolean right = settingsRightSegmentBounds(card).contains(x, y);
        if (!left && !right) return true;
        if (index == 0) {
            sendRoomSetting("battleCounterMode", left ? "suit_or_rank" : "suit_only");
        } else if (index == 1) {
            sendRoomSetting("queenVariant", left ? "defensive_non_functional" : "warsaw_pardon");
        } else if (index == 2) {
            sendRoomSetting("queenRequestMode", left ? "cancels_request" : "blocked_by_request");
        } else if (index == 3) {
            sendRoomSetting("jackRequestMode", left ? "with_non_battle_kings" : "values_5_to_10");
        } else if (index == 4) {
            sendRoomSetting("aceJackRequestMode", left ? "optional" : "required");
        }
        return true;
    }

    private int settingsStepDirection(Rectangle card, float x, float y) {
        if (settingsMinusBounds(card).contains(x, y)) return -1;
        if (settingsPlusBounds(card).contains(x, y)) return 1;
        return 0;
    }

    private int nextTurnLimit(int current, int direction) {
        int[] options = { 0, 30, 60, 120, 300 };
        int index = 0;
        for (int i = 0; i < options.length; i++) {
            if (options[i] == current) {
                index = i;
                break;
            }
        }
        int next = MathUtils.clamp(index + direction, 0, options.length - 1);
        return options[next];
    }

    private void sendRoomSetting(String key, Object value) {
        if (nativeClient == null || nativeRoomState == null) {
            showNotice("brak pokoju");
            return;
        }
        JSONObject payload = new JSONObject();
        try {
            payload.put(key, value);
        } catch (JSONException ignored) {
            showNotice("błąd ustawień");
            return;
        }
        playOptionalSound(tapSound);
        nativeClient.updateSettings(payload);
    }

    private void createNativeRoomFromMenu() {
        menuPlayerName = cleanPlayerName(menuPlayerName);
        menuRoomName = cleanRoomName(menuRoomName);
        if (menuPlayerName.isEmpty()) {
            showNotice("wpisz pseudonim");
            return;
        }
        saveNativePreferences();
        playOptionalSound(tapSound);
        if (!ensureMenuClientConnected()) {
            nativeStatusText = "Łączenie…";
            showNotice("łączenie");
            return;
        }
        nativeClient.createRoom(menuRoomName);
    }

    private void joinNativeRoomFromMenu() {
        menuPlayerName = cleanPlayerName(menuPlayerName);
        menuRoomCode = cleanRoomCode(menuRoomCode);
        if (menuPlayerName.isEmpty()) {
            showNotice("wpisz pseudonim");
            return;
        }
        if (menuRoomCode.length() != 6) {
            showNotice("wpisz kod stołu");
            return;
        }
        saveNativePreferences();
        playOptionalSound(tapSound);
        if (!ensureMenuClientConnected()) {
            nativeStatusText = "Łączenie…";
            showNotice("łączenie");
            return;
        }
        nativeClient.joinRoom(menuRoomCode);
    }

    private void reconnectMenuClient() {
        if (nativeConfig == null || nativeConfig.debugScenario != null) return;
        if (nativeClient != null && nativeClient.hasRoom()) return;
        NativeGameConfig config = new NativeGameConfig(menuServerUrl, null, menuPlayerName, nativeConfig.clientId);
        connectNativeClient(config);
    }

    private void openPlayerNameInput() {
        openNativeTextInput("Pseudonim", menuPlayerName, "Gracz", value -> {
            menuPlayerName = cleanPlayerName(value);
            if (menuPlayerName.isEmpty()) menuPlayerName = "Gracz";
            saveNativePreferences();
            reconnectMenuClient();
        }, KeyboardMode.TEXT, PLAYER_NAME_MAX_CHARS);
    }

    private void openRoomNameInput() {
        openNativeTextInput("Nazwa stołu", menuRoomName, "Stół", value -> {
            menuRoomName = cleanRoomName(value);
            if (menuRoomName.isEmpty()) menuRoomName = "Stół";
            saveNativePreferences();
        }, KeyboardMode.TEXT, 32);
    }

    private void openRoomCodeInput() {
        openNativeTextInput("Kod stołu", menuRoomCode, "ABC123", value -> {
            menuRoomCode = cleanRoomCode(value);
            saveNativePreferences();
        }, KeyboardMode.CODE, 6);
    }

    private void openServerInput() {
        openNativeTextInput("Serwer", menuServerUrl, NativeGameConfig.DEFAULT_SERVER_URL, value -> {
            menuServerUrl = cleanServerUrl(value);
            if (menuServerUrl.isEmpty()) menuServerUrl = NativeGameConfig.DEFAULT_SERVER_URL;
            if (!lastRoomId.isEmpty() && !safeEquals(lastRoomServerUrl, menuServerUrl)) {
                clearLastRoom();
            }
            saveNativePreferences();
            reconnectMenuClient();
        }, KeyboardMode.URL, 96);
    }

    private void openNativeTextInput(String title, String text, String hint, NativeTextCommit commit) {
        openNativeTextInput(title, text, hint, commit, KeyboardMode.TEXT, 32);
    }

    private void openNativeTextInput(String title, String text, String hint, NativeTextCommit commit, KeyboardMode mode, int maxChars) {
        if (commit == null) return;
        playOptionalSound(tapSound);
        textEditorOpen = true;
        textEditorTitle = title == null ? "" : title;
        textEditorText = text == null ? "" : text;
        textEditorHint = hint == null ? "" : hint;
        textEditorCommit = commit;
        textEditorMode = mode == null ? KeyboardMode.TEXT : mode;
        textEditorMaxChars = Math.max(1, maxChars);
        keyboardSymbols = false;
        keyboardShift = textEditorMode != KeyboardMode.URL;
    }

    private Rectangle textEditorPanelBounds() {
        return new Rectangle(114f, 318f, 732f, 142f);
    }

    private Rectangle textEditorFieldBounds() {
        Rectangle panel = textEditorPanelBounds();
        return new Rectangle(panel.x + 22f, panel.y + 38f, panel.width - 44f, 48f);
    }

    private Rectangle textEditorCloseBounds() {
        Rectangle panel = textEditorPanelBounds();
        return new Rectangle(panel.x + panel.width - 58f, panel.y + panel.height - 52f, 38f, 34f);
    }

    private Rectangle keyboardBounds() {
        return new Rectangle(50f, 42f, 860f, 254f);
    }

    private Rectangle keyboardKeyBounds(int row, int column) {
        String[][] rows = textEditorKeyboardRows();
        Rectangle area = keyboardBounds();
        float rowHeight = 42f;
        float rowGap = 8f;
        float keyGap = 6f;
        String[] labels = rows[row];
        float width = (area.width - keyGap * (labels.length - 1)) / labels.length;
        float y = area.y + area.height - rowHeight - row * (rowHeight + rowGap);
        return new Rectangle(area.x + column * (width + keyGap), y, width, rowHeight);
    }

    private String[][] textEditorKeyboardRows() {
        if (keyboardSymbols) {
            return new String[][] {
                { "1", "2", "3", "4", "5", "6", "7", "8", "9", "0" },
                { "@", "#", "$", "&", "*", "(", ")", "'", "\"" },
                { "-", "_", ":", ";", "/", "?", "!", ".", "," },
                { "ABC", "SPACE", "CLR", "DEL", "OK" }
            };
        }
        if (textEditorMode == KeyboardMode.CODE) {
            return new String[][] {
                { "1", "2", "3", "4", "5", "6", "7", "8", "9", "0" },
                { "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P" },
                { "A", "S", "D", "F", "G", "H", "J", "K", "L" },
                { "Z", "X", "C", "V", "B", "N", "M", "CLR", "DEL", "OK" }
            };
        }
        if (textEditorMode == KeyboardMode.URL) {
            return new String[][] {
                { "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P" },
                { "A", "S", "D", "F", "G", "H", "J", "K", "L" },
                { "SHIFT", "Z", "X", "C", "V", "B", "N", "M", "DEL" },
                { "123", ".", "/", ":", "-", "_", "@", "OK" }
            };
        }
        return new String[][] {
            { "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P" },
            { "A", "S", "D", "F", "G", "H", "J", "K", "L" },
            { "SHIFT", "Z", "X", "C", "V", "B", "N", "M", "DEL" },
            { "123", "SPACE", ".", "-", "CLR", "OK" }
        };
    }

    private void drawTextEditorOverlay() {
        if (!textEditorOpen) return;
        Rectangle panel = textEditorPanelBounds();
        Rectangle field = textEditorFieldBounds();
        Rectangle close = textEditorCloseBounds();
        String[][] rows = textEditorKeyboardRows();

        shapes.begin(ShapeRenderer.ShapeType.Filled);
        shapes.setColor(0.005f, 0.008f, 0.012f, 0.68f);
        shapes.rect(0f, 0f, WORLD_WIDTH, WORLD_HEIGHT);
        shapes.setColor(0.018f, 0.025f, 0.036f, 0.98f);
        shapes.rect(panel.x, panel.y, panel.width, panel.height);
        shapes.setColor(0.94f, 0.72f, 0.28f, 0.32f);
        shapes.rectLine(panel.x, panel.y, panel.x + panel.width, panel.y, 2f);
        shapes.rectLine(panel.x, panel.y + panel.height, panel.x + panel.width, panel.y + panel.height, 2f);
        shapes.setColor(0.01f, 0.016f, 0.024f, 0.96f);
        shapes.rect(field.x, field.y, field.width, field.height);
        shapes.setColor(0.28f, 0.34f, 0.42f, 0.46f);
        shapes.rectLine(field.x, field.y, field.x + field.width, field.y, 1.5f);
        shapes.rectLine(field.x, field.y + field.height, field.x + field.width, field.y + field.height, 1.5f);
        shapes.setColor(0.12f, 0.10f, 0.10f, 0.94f);
        shapes.rect(close.x, close.y, close.width, close.height);

        for (int row = 0; row < rows.length; row++) {
            for (int column = 0; column < rows[row].length; column++) {
                Rectangle key = keyboardKeyBounds(row, column);
                String label = rows[row][column];
                boolean action = isKeyboardActionKey(label);
                boolean active = ("SHIFT".equals(label) && keyboardShift) || ("123".equals(label) && keyboardSymbols) || "OK".equals(label);
                if (active) {
                    shapes.setColor(0.26f, 0.30f, 0.46f, 0.98f);
                } else if (action) {
                    shapes.setColor(0.10f, 0.13f, 0.18f, 0.96f);
                } else {
                    shapes.setColor(0.055f, 0.068f, 0.088f, 0.96f);
                }
                shapes.rect(key.x, key.y, key.width, key.height);
                shapes.setColor(0.28f, 0.34f, 0.42f, 0.30f);
                shapes.rectLine(key.x, key.y, key.x + key.width, key.y, 1f);
                shapes.rectLine(key.x, key.y + key.height, key.x + key.width, key.y + key.height, 1f);
            }
        }
        shapes.end();

        batch.begin();
        messageFont.setColor(1f, 0.92f, 0.66f, 1f);
        messageFont.draw(batch, textEditorTitle, panel.x + 22f, panel.y + panel.height - 22f);
        labelFont.setColor(0.66f, 0.72f, 0.8f, 1f);
        labelFont.draw(batch, textEditorText.length() + "/" + textEditorMaxChars, panel.x + 22f, panel.y + 20f);
        drawCentered(messageFont, "X", close.x + close.width / 2f, close.y + 25f);

        String value = textEditorText == null ? "" : textEditorText;
        String displayedValue = value.isEmpty() ? textEditorHint : value;
        messageFont.setColor(value.isEmpty() ? new Color(0.48f, 0.54f, 0.62f, 1f) : new Color(0.94f, 0.94f, 0.88f, 1f));
        drawCenteredFitted(messageFont, displayedValue, field.x + field.width / 2f, field.y + 31f, field.width - 26f, 0.62f);

        for (int row = 0; row < rows.length; row++) {
            for (int column = 0; column < rows[row].length; column++) {
                Rectangle key = keyboardKeyBounds(row, column);
                String label = keyboardDisplayLabel(rows[row][column]);
                labelFont.setColor("OK".equals(rows[row][column]) ? new Color(0.86f, 1f, 0.88f, 1f) : new Color(0.92f, 0.9f, 0.78f, 1f));
                drawCenteredFitted(labelFont, label, key.x + key.width / 2f, key.y + 27f, key.width - 10f, 0.56f);
            }
        }
        batch.end();
    }

    private boolean handleTextEditorTouch(float x, float y) {
        if (textEditorCloseBounds().contains(x, y)) {
            closeTextEditor(false);
            return true;
        }
        String[][] rows = textEditorKeyboardRows();
        for (int row = 0; row < rows.length; row++) {
            for (int column = 0; column < rows[row].length; column++) {
                if (keyboardKeyBounds(row, column).contains(x, y)) {
                    handleKeyboardKey(rows[row][column]);
                    return true;
                }
            }
        }
        return true;
    }

    private void handleKeyboardKey(String key) {
        playOptionalSound(tapSound);
        if ("OK".equals(key)) {
            closeTextEditor(true);
            return;
        }
        if ("DEL".equals(key)) {
            if (!textEditorText.isEmpty()) {
                textEditorText = textEditorText.substring(0, textEditorText.length() - 1);
            }
            return;
        }
        if ("CLR".equals(key)) {
            textEditorText = "";
            return;
        }
        if ("SHIFT".equals(key)) {
            keyboardShift = !keyboardShift;
            return;
        }
        if ("123".equals(key)) {
            keyboardSymbols = true;
            return;
        }
        if ("ABC".equals(key)) {
            keyboardSymbols = false;
            return;
        }
        appendTextEditorKey("SPACE".equals(key) ? " " : key);
    }

    private void appendTextEditorKey(String key) {
        if (key == null || key.isEmpty() || textEditorText.length() >= textEditorMaxChars) return;
        String value = key;
        if (value.length() == 1 && Character.isLetter(value.charAt(0))) {
            if (textEditorMode == KeyboardMode.CODE) {
                value = value.toUpperCase(Locale.ROOT);
            } else {
                value = keyboardShift ? value.toUpperCase(Locale.ROOT) : value.toLowerCase(Locale.ROOT);
                if (keyboardShift && textEditorMode == KeyboardMode.TEXT) keyboardShift = false;
            }
        }
        if (textEditorMode == KeyboardMode.CODE && !value.matches("[A-Z0-9]")) return;
        if (textEditorMode == KeyboardMode.URL && value.trim().isEmpty()) return;
        if (textEditorMode == KeyboardMode.URL) value = value.toLowerCase(Locale.ROOT);
        textEditorText = (textEditorText + value).substring(0, Math.min(textEditorMaxChars, textEditorText.length() + value.length()));
    }

    private void closeTextEditor(boolean commit) {
        NativeTextCommit pendingCommit = textEditorCommit;
        String value = textEditorText == null ? "" : textEditorText;
        textEditorOpen = false;
        textEditorCommit = null;
        if (commit && pendingCommit != null) {
            pendingCommit.commit(value);
        }
    }

    private boolean isKeyboardActionKey(String label) {
        return "SHIFT".equals(label)
            || "123".equals(label)
            || "ABC".equals(label)
            || "SPACE".equals(label)
            || "CLR".equals(label)
            || "DEL".equals(label)
            || "OK".equals(label);
    }

    private String keyboardDisplayLabel(String label) {
        if ("SHIFT".equals(label)) return keyboardShift ? "SHIFT" : "shift";
        if ("SPACE".equals(label)) return "spacja";
        if ("CLR".equals(label)) return "czyść";
        if (label.length() == 1 && Character.isLetter(label.charAt(0)) && textEditorMode != KeyboardMode.CODE) {
            return keyboardShift ? label.toUpperCase(Locale.ROOT) : label.toLowerCase(Locale.ROOT);
        }
        return label;
    }

    private String cleanPlayerName(String value) {
        if (value == null) return "";
        String cleaned = value.trim().replaceAll("\\s+", " ");
        return cleaned.substring(0, Math.min(PLAYER_NAME_MAX_CHARS, cleaned.length()));
    }

    private String cleanRoomName(String value) {
        if (value == null) return "";
        String cleaned = value.trim().replaceAll("\\s+", " ");
        return cleaned.substring(0, Math.min(28, cleaned.length()));
    }

    private String cleanRoomCode(String value) {
        if (value == null) return "";
        String cleaned = value.toUpperCase().replaceAll("[^A-Z0-9]", "");
        return cleaned.substring(0, Math.min(6, cleaned.length()));
    }

    private String cleanServerUrl(String value) {
        if (value == null) return "";
        String cleaned = value.trim().replaceAll("\\s+", "");
        if (cleaned.isEmpty()) return "";
        return new NativeGameConfig(cleaned, null, "Gracz", "preview").serverUrl;
    }

    @Override
    public boolean touchDown(int screenX, int screenY, int pointer, int button) {
        viewport.unproject(touchPoint.set(screenX, screenY, 0f));
        touchStartedInHandBand = false;
        handPanCandidate = false;
        if (textEditorOpen) {
            return handleTextEditorTouch(touchPoint.x, touchPoint.y);
        }
        if (leaveConfirmOpen) {
            return handleLeaveConfirmTouch(touchPoint.x, touchPoint.y);
        }
        if (shouldShowNativeStartScreen()) {
            return handleNativeStartTouch(touchPoint.x, touchPoint.y);
        }
        if (shouldShowNativeLobbyScreen()) {
            return handleNativeLobbyTouch(touchPoint.x, touchPoint.y);
        }
        if (handleGameOverTouch(touchPoint.x, touchPoint.y)) {
            return true;
        }
        if (shouldShowGameLeaveButton() && gameLeaveButtonBounds().contains(touchPoint.x, touchPoint.y)) {
            openLeaveConfirm(true);
            return true;
        }
        dragStartX = touchPoint.x;
        dragStartY = touchPoint.y;
        lastDragX = touchPoint.x;
        lastDragY = touchPoint.y;
        lastDragTime = elapsed;
        dragVelocityX = 0f;
        dragVelocityY = 0f;
        clearThrowIntent();
        panningHand = false;
        touchStartedInHandBand = isInsideHandBand(touchPoint.y);
        handPanCandidate = canPanHand() && touchStartedInHandBand;
        if (touchStartedInHandBand) {
            handFocusHoldTimer = HAND_FOCUS_HOLD_SECONDS;
            tableRevealHoldTimer = 0f;
        }
        handPanStartOffset = handScrollOffset;
        handScrollVelocity = 0f;

        if (requestDeclarationOpen) {
            touchStartedInHandBand = false;
            handPanCandidate = false;
            if (isWebLaunchedNativeTable()) return true;
            return handleRequestDeclarationTouch(touchPoint.x, touchPoint.y);
        }

        if (jokerDeclarationOpen) {
            touchStartedInHandBand = false;
            handPanCandidate = false;
            if (isWebLaunchedNativeTable()) return true;
            return handleJokerDeclarationTouch(touchPoint.x, touchPoint.y);
        }

        String catchMakaoTarget = catchMakaoTargetAt(touchPoint.x, touchPoint.y);
        if (catchMakaoTarget != null && handleCatchMakaoTap(catchMakaoTarget)) {
            touchStartedInHandBand = false;
            handPanCandidate = false;
            return true;
        }

        if (passButtonBounds.contains(touchPoint.x, touchPoint.y) && handlePassButtonTap()) {
            touchStartedInHandBand = false;
            handPanCandidate = false;
            return true;
        }

        if (makaoButtonBounds.contains(touchPoint.x, touchPoint.y) && handleMakaoButtonTap()) {
            touchStartedInHandBand = false;
            handPanCandidate = false;
            return true;
        }

        if (isInsideDrawPile(touchPoint.x, touchPoint.y)) {
            startDrawDrag(touchPoint.x, touchPoint.y);
            return true;
        }

        NativeCard card = findTopHandCard(touchPoint.x, touchPoint.y);
        if (card == null) {
            if (handPanCandidate) {
                panningHand = true;
                layoutHandTargets();
                return true;
            }
            if (isInsidePlayTable(touchPoint.x, touchPoint.y) && selectedCard != null) {
                playCardToDiscard(selectedCard);
                return true;
            }
            if (isInsideDiscard(touchPoint.x, touchPoint.y) && handleNetworkDiscardTap()) {
                return true;
            }
            if (touchStartedInHandBand) {
                return true;
            }
            selectedCard = null;
            selectedCards.clear();
            layoutHandTargets();
            return false;
        }

        draggedCard = card;
        dragOffsetX = touchPoint.x - card.x;
        dragOffsetY = touchPoint.y - card.y;
        card.targetScale = 1.16f;
        clearThrowIntent();
        layoutHandTargets();
        return true;
    }

    @Override
    public boolean touchDragged(int screenX, int screenY, int pointer) {
        viewport.unproject(touchPoint.set(screenX, screenY, 0f));
        if (textEditorOpen) return true;
        if (leaveConfirmOpen) return true;
        if (shouldShowNativeStartScreen() || shouldShowNativeLobbyScreen()) return true;
        if (panningHand) {
            updateHandPan(touchPoint.x, touchPoint.y);
            return true;
        }
        if (draggingDrawCard) {
            updateDrawDrag(touchPoint.x, touchPoint.y);
            return true;
        }
        if (draggedCard == null) return false;

        if (shouldSwitchToHandPan(touchPoint.x, touchPoint.y)) {
            draggedCard = null;
            selectedCard = selectedCards.size > 0 ? selectedCards.peek() : null;
            panningHand = true;
            updateHandPan(touchPoint.x, touchPoint.y);
            return true;
        }

        updateDragVelocity(touchPoint.x, touchPoint.y);
        draggedCard.x = touchPoint.x - dragOffsetX;
        draggedCard.y = touchPoint.y - dragOffsetY;
        float lean = MathUtils.clamp(dragVelocityX / 85f, -16f, 16f);
        draggedCard.angle = MathUtils.lerpAngleDeg(draggedCard.angle, lean, 0.22f);
        draggedCard.scale = MathUtils.lerp(draggedCard.scale, 1.16f, 0.22f);
        updateThrowIntent(touchPoint.x, touchPoint.y, draggedCard);
        return true;
    }

    @Override
    public boolean touchUp(int screenX, int screenY, int pointer, int button) {
        viewport.unproject(touchPoint.set(screenX, screenY, 0f));
        if (textEditorOpen) return true;
        if (leaveConfirmOpen) return true;
        if (shouldShowNativeStartScreen() || shouldShowNativeLobbyScreen()) return true;
        if (panningHand) {
            float moved = Math.abs(touchPoint.x - dragStartX) + Math.abs(touchPoint.y - dragStartY);
            updateHandPan(touchPoint.x, touchPoint.y);
            handScrollVelocity = MathUtils.clamp(-dragVelocityX, -HAND_PAN_MAX_VELOCITY, HAND_PAN_MAX_VELOCITY);
            panningHand = false;
            handPanCandidate = false;
            if (moved < TAP_MOVE_THRESHOLD && handleHandDoubleTap(touchPoint.x, touchPoint.y)) {
                handScrollVelocity = 0f;
                return true;
            }
            layoutHandTargets();
            return true;
        }
        if (draggingDrawCard) {
            float moved = Math.abs(touchPoint.x - dragStartX) + Math.abs(touchPoint.y - dragStartY);
            updateDrawDrag(touchPoint.x, touchPoint.y);
            if (moved < TAP_MOVE_THRESHOLD) {
                clearDrawInsertSlot();
                if (!handleNetworkDrawPileTap()) {
                    showIllegalNotice("Przesuń w dół, aby dobrać");
                }
            } else if (isDrawPullGesture(touchPoint.x, touchPoint.y)) {
                drawCardFromPile();
            } else {
                clearDrawInsertSlot();
                nativeStatusText = "dobieranie anulowane";
            }
            draggingDrawCard = false;
            drawPullArmed = false;
            layoutHandTargets();
            return true;
        }
        NativeCard releasedCard = draggedCard;
        draggedCard = null;

        if (releasedCard == null) {
            float moved = Math.abs(touchPoint.x - dragStartX) + Math.abs(touchPoint.y - dragStartY);
            if (touchStartedInHandBand && moved < TAP_MOVE_THRESHOLD && handleHandDoubleTap(touchPoint.x, touchPoint.y)) {
                return true;
            }
            if (touchStartedInHandBand) {
                selectedCard = null;
                selectedCards.clear();
                layoutHandTargets();
                return true;
            }
            return false;
        }

        float moved = Math.abs(touchPoint.x - dragStartX) + Math.abs(touchPoint.y - dragStartY);
        updateDragVelocity(touchPoint.x, touchPoint.y);
        if (isThrowCancelGesture(touchPoint.x, touchPoint.y, moved)) {
            cancelCardThrowGesture(releasedCard);
            return true;
        }
        if (isThrowGesture(touchPoint.x, touchPoint.y, releasedCard)) {
            clearThrowIntent();
            playCardToDiscard(releasedCard);
            return true;
        }

        if (moved < TAP_MOVE_THRESHOLD) {
            clearThrowIntent();
            if (handleHandDoubleTap(touchPoint.x, touchPoint.y)) {
                return true;
            }
            playOptionalSound(tapSound);
            toggleCardSelection(releasedCard);
            return true;
        }
        clearThrowIntent();
        layoutHandTargets();
        return true;
    }

    private boolean handleHandDoubleTap(float x, float y) {
        if (!isInsideHandBand(y)) return false;
        float dt = elapsed - lastHandTapTime;
        float dx = x - lastHandTapX;
        float dy = y - lastHandTapY;
        lastHandTapTime = elapsed;
        lastHandTapX = x;
        lastHandTapY = y;
        if (dt < 0f || dt > HAND_DOUBLE_TAP_SECONDS) return false;
        if (dx * dx + dy * dy > HAND_DOUBLE_TAP_DISTANCE * HAND_DOUBLE_TAP_DISTANCE) return false;
        selectedCards.clear();
        selectedCard = null;
        sortHandAscending();
        return true;
    }

    private void sortHandAscending() {
        if (hand.size <= 1) return;
        handSortAscending = true;
        hand.sort(Comparator
            .comparingInt((NativeCard card) -> rankSortValue(card.model))
            .thenComparingInt(card -> suitSortValue(card.model))
            .thenComparing(card -> card.model == null || card.model.cardInstanceId == null ? "" : card.model.cardInstanceId));
        handOrderIds.clear();
        StringBuilder sortedLabels = new StringBuilder();
        for (NativeCard card : hand) {
            String id = cardOrderId(card.model);
            if (id != null) handOrderIds.add(id);
            if (card.model != null) {
                if (sortedLabels.length() > 0) sortedLabels.append(',');
                sortedLabels.append(card.model.tableLabel());
            }
        }
        trace("hand_sort order=" + sortedLabels);
        selectedCard = selectedCards.size > 0 ? selectedCards.peek() : null;
        sortWaveTimer = SORT_WAVE_DURATION;
        emitFeedback(FeedbackIntent.SORT);
        showNotice("sortowanie");
        layoutHandTargets();
    }

    @Override
    public boolean touchCancelled(int screenX, int screenY, int pointer, int button) {
        if (leaveConfirmOpen) return true;
        if (shouldShowNativeStartScreen() || shouldShowNativeLobbyScreen()) return true;
        draggedCard = null;
        draggingDrawCard = false;
        clearDrawInsertSlot();
        panningHand = false;
        handPanCandidate = false;
        touchStartedInHandBand = false;
        handScrollVelocity = 0f;
        clearThrowIntent();
        drawPullArmed = false;
        layoutHandTargets();
        return true;
    }

    @Override
    public boolean keyDown(int keycode) {
        return false;
    }

    @Override
    public boolean keyUp(int keycode) {
        return false;
    }

    @Override
    public boolean keyTyped(char character) {
        return false;
    }

    @Override
    public boolean mouseMoved(int screenX, int screenY) {
        return false;
    }

    @Override
    public boolean scrolled(float amountX, float amountY) {
        return false;
    }

    @Override
    public void dispose() {
        if (nativeClient != null) nativeClient.disconnect();
        if (feedback != null) feedback.cancel();
        batch.dispose();
        shapes.dispose();
        titleFont.dispose();
        labelFont.dispose();
        messageFont.dispose();
        cardFont.dispose();
        cardFrontTexture.dispose();
        cardBackTexture.dispose();
        glowTexture.dispose();
        shadowTexture.dispose();
        whitePixelTexture.dispose();
        heartIconTexture.dispose();
        diamondIconTexture.dispose();
        clubIconTexture.dispose();
        spadeIconTexture.dispose();
        if (iconGameplayTexture != null) iconGameplayTexture.dispose();
        if (cardAtlas != null) cardAtlas.dispose();
        if (tableBackgroundTexture != null) tableBackgroundTexture.dispose();
        if (homeBackgroundTexture != null) homeBackgroundTexture.dispose();
        if (bubuBackTexture != null) bubuBackTexture.dispose();
        if (tapSound != null) tapSound.dispose();
        if (playSound != null) playSound.dispose();
        if (drawSound != null) drawSound.dispose();
        if (landSound != null) landSound.dispose();
        if (sortSound != null) sortSound.dispose();
        if (shuffleSound != null) shuffleSound.dispose();
        if (illegalSound != null) illegalSound.dispose();
        if (specialSound != null) specialSound.dispose();
        if (makaoSound != null) makaoSound.dispose();
        if (turnPingSound != null) turnPingSound.dispose();
    }

    private BitmapFont loadUiFont(String path, int size, float borderWidth) {
        try {
            if (Gdx.files.internal(path).exists()) {
                FreeTypeFontGenerator generator = new FreeTypeFontGenerator(Gdx.files.internal(path));
                FreeTypeFontGenerator.FreeTypeFontParameter parameter = new FreeTypeFontGenerator.FreeTypeFontParameter();
                parameter.size = size;
                parameter.borderWidth = borderWidth;
                parameter.borderColor = new Color(0.035f, 0.03f, 0.025f, 0.95f);
                parameter.color = new Color(0.96f, 0.88f, 0.66f, 1f);
                parameter.characters = FreeTypeFontGenerator.DEFAULT_CHARS + "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ♥♦♣♠→×…";
                BitmapFont font = generator.generateFont(parameter);
                generator.dispose();
                return font;
            }
        } catch (RuntimeException err) {
            if (Gdx.app != null) {
                Gdx.app.error("MakaoGdxGame", "Nie udało się załadować fontu: " + path, err);
            }
        }

        BitmapFont fallback = new BitmapFont();
        fallback.getData().setScale(size / 18f);
        return fallback;
    }

    private Texture createSolidTexture(Color color) {
        Pixmap pixmap = new Pixmap(1, 1, Pixmap.Format.RGBA8888);
        pixmap.setColor(color);
        pixmap.fill();
        Texture texture = new Texture(pixmap);
        pixmap.dispose();
        return texture;
    }

    private Texture createSuitTexture(String suit) {
        Pixmap pixmap = new Pixmap(64, 64, Pixmap.Format.RGBA8888);
        pixmap.setBlending(Pixmap.Blending.SourceOver);
        pixmap.setColor(0f, 0f, 0f, 0f);
        pixmap.fill();
        boolean red = "hearts".equals(suit) || "diamonds".equals(suit);
        pixmap.setColor(red ? new Color(0.78f, 0.08f, 0.06f, 1f) : new Color(0.08f, 0.09f, 0.09f, 1f));

        if ("hearts".equals(suit)) {
            pixmap.fillCircle(23, 24, 12);
            pixmap.fillCircle(41, 24, 12);
            pixmap.fillTriangle(12, 29, 52, 29, 32, 54);
        } else if ("diamonds".equals(suit)) {
            pixmap.fillTriangle(32, 6, 54, 32, 32, 58);
            pixmap.fillTriangle(32, 6, 10, 32, 32, 58);
        } else if ("clubs".equals(suit)) {
            pixmap.fillCircle(32, 20, 12);
            pixmap.fillCircle(21, 36, 12);
            pixmap.fillCircle(43, 36, 12);
            pixmap.fillRectangle(29, 34, 6, 20);
            pixmap.fillTriangle(22, 55, 42, 55, 32, 43);
        } else if ("spades".equals(suit)) {
            pixmap.fillCircle(23, 37, 12);
            pixmap.fillCircle(41, 37, 12);
            pixmap.fillTriangle(12, 34, 52, 34, 32, 8);
            pixmap.fillRectangle(29, 36, 6, 18);
            pixmap.fillTriangle(22, 55, 42, 55, 32, 43);
        }

        Texture texture = new Texture(pixmap);
        texture.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        pixmap.dispose();
        return texture;
    }

    private Texture createRoundedCardTexture(Color fill, Color border, boolean backPattern) {
        int width = 160;
        int height = 240;
        int radius = 18;
        Pixmap pixmap = new Pixmap(width, height, Pixmap.Format.RGBA8888);
        pixmap.setBlending(Pixmap.Blending.SourceOver);
        pixmap.setColor(0f, 0f, 0f, 0f);
        pixmap.fill();

        fillRoundedRect(pixmap, 0, 0, width, height, radius, border);
        fillRoundedRect(pixmap, 5, 5, width - 10, height - 10, radius - 3, fill);

        if (backPattern) {
            pixmap.setColor(0.75f, 0.62f, 0.32f, 0.42f);
            for (int i = -height; i < width; i += 24) {
                pixmap.drawLine(i, 0, i + height, height);
            }
            pixmap.setColor(0.07f, 0.12f, 0.18f, 0.54f);
            fillRoundedRect(pixmap, 42, 60, 76, 120, 10, new Color(0.07f, 0.12f, 0.18f, 0.54f));
        }

        Texture texture = new Texture(pixmap);
        texture.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
        pixmap.dispose();
        return texture;
    }

    private void fillRoundedRect(Pixmap pixmap, int x, int y, int width, int height, int radius, Color color) {
        pixmap.setColor(color);
        pixmap.fillRectangle(x + radius, y, width - radius * 2, height);
        pixmap.fillRectangle(x, y + radius, width, height - radius * 2);
        pixmap.fillCircle(x + radius, y + radius, radius);
        pixmap.fillCircle(x + width - radius - 1, y + radius, radius);
        pixmap.fillCircle(x + radius, y + height - radius - 1, radius);
        pixmap.fillCircle(x + width - radius - 1, y + height - radius - 1, radius);
    }

    private Sound loadOptionalSound(String path) {
        try {
            if (Gdx.files.internal(path).exists()) {
                return Gdx.audio.newSound(Gdx.files.internal(path));
            }
        } catch (RuntimeException ignored) {
            return null;
        }
        return null;
    }

    private Sound loadFirstOptionalSound(String... paths) {
        for (String path : paths) {
            Sound sound = loadOptionalSound(path);
            if (sound != null) return sound;
        }
        return null;
    }

    private void loadGameplayIconRegions() {
        iconGameplayTexture = loadOptionalTexture("native/ui/icon_gameplay.png");
        pauseIconRegion = null;
        requestRankIconRegions.clear();
        requestSuitIconRegions.clear();
        plainSuitIconRegions.clear();
        if (iconGameplayTexture == null) return;

        requestBangIconRegion = iconRegion(31, 67, 80, 77);
        requestNoIconRegion = iconRegion(738, 169, 108, 82);
        jokerIconRegion = iconRegion(26, 332, 104, 97);
        jokerArrowIconRegion = iconRegion(704, 352, 38, 45);
        pauseIconRegion = iconRegion(915, 499, 82, 82);

        requestRankIconRegions.put("2", iconRegion(325, 67, 80, 77));
        requestRankIconRegions.put("3", iconRegion(418, 67, 80, 77));
        requestRankIconRegions.put("4", iconRegion(511, 67, 80, 77));
        requestRankIconRegions.put("5", iconRegion(603, 67, 77, 77));
        requestRankIconRegions.put("6", iconRegion(696, 67, 78, 77));
        requestRankIconRegions.put("7", iconRegion(789, 67, 78, 77));
        requestRankIconRegions.put("8", iconRegion(883, 67, 78, 77));
        requestRankIconRegions.put("9", iconRegion(976, 67, 78, 77));
        requestRankIconRegions.put("10", iconRegion(1072, 67, 78, 77));
        requestRankIconRegions.put("jack", iconRegion(1165, 67, 82, 77));
        requestRankIconRegions.put("queen", iconRegion(1259, 67, 82, 77));
        requestRankIconRegions.put("king", iconRegion(1352, 67, 82, 77));
        requestRankIconRegions.put("ace", iconRegion(1446, 67, 82, 77));

        requestSuitIconRegions.put("hearts", iconRegion(232, 168, 110, 83));
        requestSuitIconRegions.put("diamonds", iconRegion(350, 168, 98, 83));
        requestSuitIconRegions.put("clubs", iconRegion(455, 168, 100, 83));
        requestSuitIconRegions.put("spades", iconRegion(559, 168, 99, 83));

        plainSuitIconRegions.put("hearts", iconRegion(282, 181, 53, 56));
        plainSuitIconRegions.put("diamonds", iconRegion(394, 181, 47, 56));
        plainSuitIconRegions.put("clubs", iconRegion(505, 181, 43, 56));
        plainSuitIconRegions.put("spades", iconRegion(607, 181, 44, 56));
    }

    private Texture loadOptionalTexture(String path) {
        try {
            if (Gdx.files.internal(path).exists()) {
                Texture texture = new Texture(Gdx.files.internal(path));
                texture.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
                return texture;
            }
        } catch (RuntimeException err) {
            if (Gdx.app != null) {
                Gdx.app.error("MakaoGdxGame", "Nie udało się załadować tekstury: " + path, err);
            }
        }
        return null;
    }

    private TextureRegion iconRegion(int x, int y, int width, int height) {
        return iconGameplayTexture == null ? null : new TextureRegion(iconGameplayTexture, x, y, width, height);
    }

    private TextureAtlas loadOptionalCardAtlas() {
        try {
            if (Gdx.files.internal("native/cards/cards.atlas").exists()) {
                return new TextureAtlas(Gdx.files.internal("native/cards/cards.atlas"));
            }
        } catch (RuntimeException err) {
            if (Gdx.app != null) {
                Gdx.app.error("MakaoGdxGame", "Nie udało się załadować atlasu kart", err);
            }
        }
        return null;
    }

    private void emitFeedback(FeedbackIntent intent) {
        if (intent == null) return;
        switch (intent) {
            case DRAW:
                playOptionalSound(drawSound, 0.45f);
                if (feedback != null) feedback.draw();
                break;
            case PLAY:
                playOptionalSound(playSound, 0.45f);
                if (feedback != null) feedback.playCard();
                break;
            case LAND_DRAW:
                playOptionalSound(landSound, 0.28f);
                if (feedback != null) feedback.softImpact();
                break;
            case LAND_PLAY:
                playOptionalSound(landSound, 0.36f);
                if (feedback != null) feedback.softImpact();
                break;
            case LAND_REMOTE_DRAW:
                playOptionalSound(landSound, 0.22f);
                break;
            case LAND_REMOTE_PLAY:
                playOptionalSound(landSound, 0.3f);
                break;
            case ILLEGAL:
                playOptionalSound(illegalSound, 0.45f);
                if (feedback != null) feedback.illegal();
                break;
            case REQUEST:
                playOptionalSound(specialSound, 0.3f);
                if (feedback != null) feedback.mediumImpact();
                break;
            case MAKAO:
                playOptionalSound(makaoSound, 0.36f);
                if (feedback != null) feedback.makao();
                break;
            case SPECIAL:
                playOptionalSound(specialSound, 0.28f);
                if (feedback != null) feedback.mediumImpact();
                break;
            case OPPONENT_EVENT:
                playOptionalSound(turnPingSound, 0.25f);
                break;
            case SORT:
                playOptionalSound(sortSound, 0.32f);
                if (feedback != null) feedback.sort();
                break;
            case SHUFFLE:
                playOptionalSound(shuffleSound, 0.45f);
                if (feedback != null) feedback.shuffle();
                break;
            case ARM_TICK:
                if (feedback != null) feedback.tick();
                break;
            default:
                break;
        }
    }

    private void playOptionalSound(Sound sound) {
        playOptionalSound(sound, 0.45f);
    }

    private void playOptionalSound(Sound sound, float volume) {
        if (!audioEnabled) return;
        if (sound != null) {
            sound.play(volume);
        }
    }

    private void showNotice(String text) {
        showNotice(text, null);
    }

    private void showNotice(String text, FeedbackIntent feedbackIntent) {
        noticeText = text == null ? "" : text;
        noticeTimer = noticeText.isEmpty() ? 0f : (noticeText.length() > 24 ? 2.35f : 1.85f);
        if (!noticeText.isEmpty()) noticeOnLeft = !noticeOnLeft;
        emitHybridOverlayToast(noticeText, feedbackIntent);
        if (feedbackIntent != null) emitFeedback(feedbackIntent);
    }

    private void emitHybridOverlayToast(String text, FeedbackIntent feedbackIntent) {
        if (!isWebLaunchedNativeTable() || hybridOverlayEventCallback == null) return;
        String clean = text == null ? "" : text.trim();
        if (clean.isEmpty()) return;
        try {
            String level = feedbackIntent == FeedbackIntent.ILLEGAL ? "error" : "info";
            String title = feedbackIntent == FeedbackIntent.ILLEGAL ? "Błąd ruchu" : "Stół";
            int durationMs = clean.length() > 24 ? 3200 : 2400;
            JSONObject payload = new JSONObject();
            payload.put("level", level);
            payload.put("title", title);
            payload.put("message", clean);
            payload.put("durationMs", durationMs);
            emitHybridOverlayEvent("toast", payload);
        } catch (JSONException ignored) {
            // Toasts are best-effort; table rendering and input must not depend on the overlay bridge.
        }
    }

    private void showSessionRefreshResult(boolean success, String message) {
        String clean = message == null ? "" : message.trim();
        if (clean.isEmpty()) {
            clean = success ? "Wróciliśmy do stołu." : "Nie udało się wrócić do stołu.";
        }
        noticeText = clean;
        noticeTimer = clean.length() > 24 ? 2.35f : 1.85f;
        noticeOnLeft = !noticeOnLeft;
        if (!isWebLaunchedNativeTable() || hybridOverlayEventCallback == null) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("success", success);
            payload.put("message", clean);
            emitHybridOverlayEvent("session_refresh_result", payload);
        } catch (JSONException ignored) {
            // Synchronizacja stanu nie może zależeć od komunikatu warstwy React.
        }
    }

    private void emitHybridGameOverIfNeeded(MakaoGameState state) {
        if (!isWebLaunchedNativeTable() || hybridOverlayEventCallback == null || state == null) return;
        if (!state.gameOver) {
            lastHybridGameOverKey = "";
            return;
        }

        String key = (state.roomId == null ? "" : state.roomId)
            + ":" + state.stateVersion
            + ":" + (state.winnerId == null ? "" : state.winnerId);
        if (key.equals(lastHybridGameOverKey)) return;
        lastHybridGameOverKey = key;

        try {
            JSONObject payload = new JSONObject();
            payload.put("roomId", state.roomId == null ? "" : state.roomId);
            payload.put("stateVersion", state.stateVersion);
            payload.put("winnerId", state.winnerId == null ? "" : state.winnerId);
            payload.put("winnerName", cleanDisplayName(state.resolvePlayerName(state.winnerId)));
            payload.put("didWin", state.winnerId != null && state.winnerId.equals(state.myPlayerId));
            payload.put("canReturnLobby", canRequestRematch());
            payload.put("endReason", state.endReason == null ? "" : state.endReason);
            payload.put("leftPlayerName", state.lastLeftPlayerName == null ? "" : state.lastLeftPlayerName);
            emitHybridOverlayEvent("game_over", payload);
        } catch (JSONException ignored) {
            // Game-over overlay is best-effort; the table state remains authoritative.
        }
    }

    private void emitHybridTurnStatus(MakaoGameState state) {
        if (!isWebLaunchedNativeTable() || hybridOverlayEventCallback == null || state == null) return;
        String currentPlayerId = state.currentPlayerId == null ? "" : state.currentPlayerId;
        String myPlayerId = state.myPlayerId == null ? "" : state.myPlayerId;
        String key = (state.roomId == null ? "" : state.roomId)
            + ":" + state.stateVersion
            + ":" + currentPlayerId
            + ":" + state.gameOver
            + ":false";
        if (key.equals(lastHybridTurnStatusKey)) return;
        lastHybridTurnStatusKey = key;

        try {
            JSONObject payload = new JSONObject();
            payload.put("roomId", state.roomId == null ? "" : state.roomId);
            payload.put("stateVersion", state.stateVersion);
            payload.put("currentPlayerId", currentPlayerId);
            payload.put("currentPlayerName", cleanDisplayName(state.resolvePlayerName(currentPlayerId)));
            payload.put("myPlayerId", myPlayerId);
            payload.put("isMyTurn", !currentPlayerId.isEmpty() && currentPlayerId.equals(myPlayerId));
            payload.put("gameOver", state.gameOver);
            payload.put("paused", false);
            emitHybridOverlayEvent("turn_status", payload);
        } catch (JSONException ignored) {
            // Turn status in the web overlay is best-effort; GDX remains the table renderer.
        }
    }

    private void emitHybridOverlayEvent(String type, JSONObject payload) {
        if (!isWebLaunchedNativeTable() || hybridOverlayEventCallback == null) return;
        hybridOverlayEventCallback.emit(type, payload == null ? null : payload.toString());
    }

    private void showIllegalNotice(String text) {
        trace("notice_illegal " + text);
        nativeStatusText = text;
        showNotice(text, FeedbackIntent.ILLEGAL);
    }

    private void trace(String message) {
        if (Gdx.app != null) {
            Gdx.app.log("MakaoTrace", message == null ? "" : message);
        }
    }

    private String stateDebug(MakaoGameState state) {
        if (state == null) return "state=null";
        return "turn=" + state.currentPlayerId
            + " me=" + state.myPlayerId
            + " myTurn=" + state.isMyTurn()
            + " hand=" + (state.myHand == null ? 0 : state.myHand.size())
            + " drawn=" + state.drawnCardInstanceId
            + " hasDrawn=" + state.hasDrawnCardThisTurn
            + " effect=" + state.activeEffectType
            + " target=" + state.activeEffectTargetPlayerId
            + " reqRank=" + state.activeEffectRequestedRank
            + " reqSuit=" + state.activeEffectRequestedSuit
            + " amount=" + state.activeEffectAmount
            + " penaltyDrawn=" + state.activeEffectPenaltyDrawnCount
            + " penaltyRemaining=" + state.activeEffectPenaltyRemainingCount
            + " top=" + cardDebug(state.topCard);
    }

    private String cardsDebug(Array<NativeCard> cards) {
        if (cards == null || cards.size == 0) return "[]";
        StringBuilder builder = new StringBuilder("[");
        for (int i = 0; i < cards.size; i++) {
            if (i > 0) builder.append(",");
            NativeCard card = cards.get(i);
            builder.append(card == null ? "null" : cardDebug(card.model));
        }
        builder.append("]");
        return builder.toString();
    }

    private String cardDebug(MakaoCard card) {
        if (card == null) return "null";
        return card.cardInstanceId + ":" + card.rank + ":" + card.suit;
    }

    private enum BadgeTone {
        DEFAULT,
        REQUEST,
        PENALTY,
        PAUSE,
        JOKER
    }

    private enum EventBubbleIconKind {
        NONE,
        CARD,
        DRAW,
        PENALTY,
        PAUSE,
        MAKAO,
        CATCH,
        PASS,
        JOKER,
        REQUEST
    }

    private static final class ActiveEffectBadge {
        static final ActiveEffectBadge EMPTY = new ActiveEffectBadge("", "", null, BadgeTone.DEFAULT);

        final String title;
        final String detail;
        final String suit;
        final BadgeTone tone;
        final String rank;

        ActiveEffectBadge(String title, String detail, String suit, BadgeTone tone) {
            this(title, detail, suit, tone, null);
        }

        ActiveEffectBadge(String title, String detail, String suit, BadgeTone tone, String rank) {
            this.title = title == null ? "" : title;
            this.detail = detail == null ? "" : detail;
            this.suit = suit;
            this.tone = tone == null ? BadgeTone.DEFAULT : tone;
            this.rank = rank;
        }

        boolean isEmpty() {
            return title.isEmpty();
        }

        Color accentColor() {
            if (tone == BadgeTone.PENALTY) return new Color(0.86f, 0.18f, 0.1f, 0.94f);
            if (tone == BadgeTone.PAUSE) return new Color(0.36f, 0.72f, 0.92f, 0.9f);
            if (tone == BadgeTone.JOKER) return new Color(0.82f, 0.62f, 0.95f, 0.9f);
            if (tone == BadgeTone.REQUEST) return new Color(0.94f, 0.71f, 0.25f, 0.92f);
            return new Color(0.94f, 0.71f, 0.25f, 0.86f);
        }
    }

    private static final class EventBubble {
        final String playerId;
        final String text;
        final BadgeTone tone;
        final float duration;
        final EventBubbleIconKind iconKind;
        final MakaoCard iconCard;
        final int iconAmount;
        float timer;

        EventBubble(String playerId, String text, BadgeTone tone, float duration) {
            this(playerId, text, tone, duration, EventBubbleIconKind.NONE, null, 0);
        }

        EventBubble(
            String playerId,
            String text,
            BadgeTone tone,
            float duration,
            EventBubbleIconKind iconKind,
            MakaoCard iconCard,
            int iconAmount
        ) {
            this.playerId = playerId;
            this.text = text == null ? "" : text;
            this.tone = tone == null ? BadgeTone.DEFAULT : tone;
            this.duration = duration;
            this.iconKind = iconKind == null ? EventBubbleIconKind.NONE : iconKind;
            this.iconCard = iconCard;
            this.iconAmount = iconAmount;
            this.timer = duration;
        }
    }

    private static final class NativeCard {
        MakaoCard model;
        float x;
        float y;
        float targetX;
        float targetY;
        float angle;
        float targetAngle;
        float scale = 1f;
        float targetScale = 1f;
        boolean dimmed;
        boolean hiddenByFlight;

        NativeCard(MakaoCard model) {
            this.model = model;
        }

        NativeCard copy() {
            NativeCard card = new NativeCard(model);
            card.x = x;
            card.y = y;
            card.targetX = targetX;
            card.targetY = targetY;
            card.angle = angle;
            card.targetAngle = targetAngle;
            card.scale = scale;
            card.targetScale = targetScale;
            card.dimmed = dimmed;
            card.hiddenByFlight = hiddenByFlight;
            return card;
        }

        boolean hit(float px, float py, float width, float height) {
            float localX = px - x;
            float localY = py - y;
            float radians = -angle * MathUtils.degreesToRadians;
            float cos = MathUtils.cos(radians);
            float sin = MathUtils.sin(radians);
            float rotatedX = localX * cos - localY * sin;
            float rotatedY = localX * sin + localY * cos;
            float halfWidth = width * scale / 2f;
            float halfHeight = height * scale / 2f;
            return Math.abs(rotatedX) <= halfWidth && Math.abs(rotatedY) <= halfHeight;
        }
    }

    private static final class CardFlight {
        final NativeCard card;
        final boolean toDiscard;
        float startX;
        float startY;
        float detachX;
        float detachY;
        float endX;
        float endY;
        float startAngle;
        float detachAngle;
        float endAngle;
        float startScale;
        float detachScale;
        float endScale;
        float duration = 0.3f;
        float elapsed;
        float arc;
        float startDelay;
        boolean faceDown;
        boolean flipToFace;
        boolean silentLanding;
        boolean tableRevealFlight;
        boolean localDiscardFlight;
        boolean awaitingAuthoritativeState;
        MakaoCard revealModel;
        MakaoCard landingDiscardModel;
        String landingCardInstanceId;
        String landingDiscardCardInstanceId;
        FeedbackIntent landFeedbackIntent;

        CardFlight(NativeCard card, boolean toDiscard) {
            this.card = card;
            this.toDiscard = toDiscard;
        }
    }
}
