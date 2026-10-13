package pl.makao.zeznajomymi.gdx;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.badlogic.gdx.graphics.OrthographicCamera;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.utils.viewport.FitViewport;

import org.junit.Test;

import java.lang.reflect.Field;

import pl.makao.zeznajomymi.gdx.model.MakaoCard;
import pl.makao.zeznajomymi.gdx.model.MakaoGameState;

public class MakaoGdxGameInputTest {
    @Test
    @SuppressWarnings({ "rawtypes", "unchecked" })
    public void makaoButtonReleaseDoesNotClearSelectedFinalJokerPair() throws Exception {
        MakaoGdxGame game = new MakaoGdxGame();
        setField(game, "viewport", new IdentityViewport());

        MakaoGameState state = new MakaoGameState();
        state.roomId = "TEST01";
        state.myPlayerId = "player_a";
        state.currentPlayerId = "player_a";
        state.allowMultipleCards = true;
        state.topCard = MakaoCard.create("top_10_clubs", "10", "clubs");
        state.myHand.add(MakaoCard.create("final_10_diamonds", "10", "diamonds"));
        state.myHand.add(MakaoCard.create("final_joker", "joker", null));
        game.applyGameState(state);

        Array hand = (Array) getField(game, "hand");
        Array selectedCards = (Array) getField(game, "selectedCards");
        selectedCards.addAll(hand);
        setField(game, "selectedCard", selectedCards.peek());

        assertTrue(game.touchDown(760, 180, 0, 0));
        game.touchUp(760, 180, 0, 0);

        assertEquals(2, selectedCards.size);
    }

    private static Object getField(Object target, String name) throws Exception {
        Field field = MakaoGdxGame.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(target);
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = MakaoGdxGame.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static final class IdentityViewport extends FitViewport {
        IdentityViewport() {
            super(960f, 540f, new OrthographicCamera());
        }

        @Override
        public Vector3 unproject(Vector3 screenCoords) {
            return screenCoords;
        }
    }
}
