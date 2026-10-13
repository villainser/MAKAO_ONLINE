package pl.makao.zeznajomymi.gdx;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.Texture;
import com.badlogic.gdx.graphics.g2d.TextureAtlas;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.utils.Disposable;

public final class NativeTableSkin {
    private static final String LOG_TAG = "NativeTableSkin";

    public static final String TABLE_DIR = "native/table";
    public static final String TABLE_BACKGROUND_PATH = TABLE_DIR + "/vertical_table.png";
    public static final String HOME_BACKGROUND_PATH = TABLE_DIR + "/home_bg.png";

    public static final String CLASSIC_DECK_DIR = "native/cards";
    public static final String CLASSIC_DECK_ATLAS_PATH = CLASSIC_DECK_DIR + "/cards.atlas";
    public static final String CLASSIC_DECK_METADATA_PATH = CLASSIC_DECK_DIR + "/cards.json";

    public static final String BUBU_DECK_DIR = "native/decks/bubu";
    public static final String BUBU_DECK_ATLAS_PATH = BUBU_DECK_DIR + "/cards.atlas";
    public static final String BUBU_DECK_METADATA_PATH = BUBU_DECK_DIR + "/cards.json";
    public static final String BUBU_DUDU_BACK_PATH = BUBU_DECK_DIR + "/backend_card.png";

    public static final String CARD_BACK_REGION_NAME = "back";

    private NativeTableSkin() {
    }

    public enum DeckSkin {
        CLASSIC(
            CLASSIC_DECK_DIR,
            CLASSIC_DECK_ATLAS_PATH,
            CLASSIC_DECK_METADATA_PATH,
            null,
            CARD_BACK_REGION_NAME
        ),
        BUBU(
            BUBU_DECK_DIR,
            BUBU_DECK_ATLAS_PATH,
            BUBU_DECK_METADATA_PATH,
            BUBU_DUDU_BACK_PATH,
            CARD_BACK_REGION_NAME
        );

        private final String directoryPath;
        private final String atlasPath;
        private final String metadataPath;
        private final String standaloneBackPath;
        private final String backRegionName;

        DeckSkin(String directoryPath, String atlasPath, String metadataPath, String standaloneBackPath, String backRegionName) {
            this.directoryPath = directoryPath;
            this.atlasPath = atlasPath;
            this.metadataPath = metadataPath;
            this.standaloneBackPath = standaloneBackPath;
            this.backRegionName = backRegionName;
        }

        public String getDirectoryPath() {
            return directoryPath;
        }

        public String getAtlasPath() {
            return atlasPath;
        }

        public String getMetadataPath() {
            return metadataPath;
        }

        public String getStandaloneBackPath() {
            return standaloneBackPath;
        }

        public String getBackRegionName() {
            return backRegionName;
        }
    }

    public static LoadedTexture loadTableBackground() {
        return loadOptionalTexture(TABLE_BACKGROUND_PATH);
    }

    public static LoadedTexture loadHomeBackground() {
        return loadOptionalTexture(HOME_BACKGROUND_PATH);
    }

    public static LoadedTexture loadBubuDuduBack() {
        return loadOptionalTexture(BUBU_DUDU_BACK_PATH);
    }

    public static LoadedTexture loadDeckBackTexture(DeckSkin deckSkin) {
        if (deckSkin == null || deckSkin.getStandaloneBackPath() == null) {
            return LoadedTexture.empty(null);
        }
        return loadOptionalTexture(deckSkin.getStandaloneBackPath());
    }

    public static TextureAtlas loadDeckAtlas(DeckSkin deckSkin) {
        if (deckSkin == null) {
            return null;
        }
        return loadOptionalAtlas(deckSkin.getAtlasPath());
    }

    public static TextureRegion findDeckBack(TextureAtlas atlas, DeckSkin deckSkin) {
        if (deckSkin == null) {
            return null;
        }
        return findDeckRegion(atlas, deckSkin.getBackRegionName());
    }

    public static TextureRegion findDeckRegion(TextureAtlas atlas, String regionName) {
        if (atlas == null || isBlank(regionName)) {
            return null;
        }
        return atlas.findRegion(regionName);
    }

    public static TextureAtlas loadOptionalAtlas(String path) {
        try {
            FileHandle file = internalFile(path);
            if (file == null || !file.exists()) {
                return null;
            }
            return new TextureAtlas(file);
        } catch (RuntimeException err) {
            logLoadError("atlasu", path, err);
            return null;
        }
    }

    public static LoadedTexture loadOptionalTexture(String path) {
        try {
            FileHandle file = internalFile(path);
            if (file == null || !file.exists()) {
                return LoadedTexture.empty(path);
            }
            Texture texture = new Texture(file);
            texture.setFilter(Texture.TextureFilter.Linear, Texture.TextureFilter.Linear);
            texture.setWrap(Texture.TextureWrap.ClampToEdge, Texture.TextureWrap.ClampToEdge);
            return LoadedTexture.loaded(path, texture);
        } catch (RuntimeException err) {
            logLoadError("tekstury", path, err);
            return LoadedTexture.empty(path);
        }
    }

    public static boolean assetExists(String path) {
        try {
            FileHandle file = internalFile(path);
            return file != null && file.exists();
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static FileHandle internalFile(String path) {
        if (isBlank(path) || Gdx.files == null) {
            return null;
        }
        return Gdx.files.internal(path);
    }

    private static boolean isBlank(String value) {
        return value == null || value.length() == 0;
    }

    private static void logLoadError(String assetType, String path, RuntimeException err) {
        if (Gdx.app != null) {
            Gdx.app.error(LOG_TAG, "Nie udało się załadować " + assetType + ": " + path, err);
        }
    }

    public static final class LoadedTexture implements Disposable {
        private final String path;
        private final Texture texture;
        private final TextureRegion region;
        private boolean disposed;

        private LoadedTexture(String path, Texture texture) {
            this.path = path;
            this.texture = texture;
            this.region = texture == null ? null : new TextureRegion(texture);
        }

        private static LoadedTexture loaded(String path, Texture texture) {
            return new LoadedTexture(path, texture);
        }

        private static LoadedTexture empty(String path) {
            return new LoadedTexture(path, null);
        }

        public boolean isLoaded() {
            return texture != null;
        }

        public String getPath() {
            return path;
        }

        public Texture getTexture() {
            return texture;
        }

        public TextureRegion getRegion() {
            return region;
        }

        @Override
        public void dispose() {
            if (!disposed && texture != null) {
                texture.dispose();
            }
            disposed = true;
        }
    }
}
