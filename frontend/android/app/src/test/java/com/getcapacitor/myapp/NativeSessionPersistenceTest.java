package com.getcapacitor.myapp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import pl.makao.zeznajomymi.gdx.net.NativeSessionPersistence;
import pl.makao.zeznajomymi.gdx.rules.NativeReliableActionRules;

public class NativeSessionPersistenceTest {
    @Test
    public void onlyDurabilityFailureRetriesTheSameNativeIntent() {
        assertEquals(true, NativeReliableActionRules.shouldRetry("PERSISTENCE_FAILED", true));
        assertEquals(false, NativeReliableActionRules.shouldRetry("STATE_VERSION_MISMATCH", true));
        assertEquals(false, NativeReliableActionRules.shouldRetry("PERSISTENCE_FAILED", false));
    }

    @Test
    public void dependentJokerPlayWaitsForMakaoAckAndKeepsChoiceOnFailedSubmit() {
        assertFalse(NativeReliableActionRules.canSubmitDependentAction(true));
        assertTrue(NativeReliableActionRules.canSubmitDependentAction(false));
        assertFalse(NativeReliableActionRules.shouldCloseChoiceAfterSubmission(false));
        assertTrue(NativeReliableActionRules.shouldCloseChoiceAfterSubmission(true));
    }

    @Test
    public void resumeTokenIsScopedToServerRoomAndClient() {
        NativeSessionPersistence persistence = new NativeSessionPersistence(new MemoryStore());
        persistence.saveResumeToken("https://makao.example/path", "abc123", "client-a", "secret");

        assertEquals("secret", persistence.loadResumeToken("https://makao.example/other", "ABC123", "client-a"));
        assertNull(persistence.loadResumeToken("https://other.example", "ABC123", "client-a"));
        assertNull(persistence.loadResumeToken("https://makao.example", "XYZ789", "client-a"));
        assertNull(persistence.loadResumeToken("https://makao.example", "ABC123", "client-b"));
    }

    @Test
    public void pendingMoveSurvivesRestartWithPayloadAndBaseVersionUntilAckCleanup() {
        MemoryStore store = new MemoryStore();
        NativeSessionPersistence first = new NativeSessionPersistence(store);
        NativeSessionPersistence.PendingAction action = new NativeSessionPersistence.PendingAction(
            "action-1",
            "play_cards",
            "{\"cardIds\":[\"card-1\"]}",
            17
        );
        first.savePendingAction("https://makao.example", "ABC123", "client-a", action);

        NativeSessionPersistence afterRestart = new NativeSessionPersistence(store);
        assertEquals(action, afterRestart.loadPendingAction("https://makao.example", "ABC123", "client-a"));

        afterRestart.clearPendingAction("https://makao.example", "ABC123", "client-a");
        assertNull(afterRestart.loadPendingAction("https://makao.example", "ABC123", "client-a"));
    }

    @Test
    public void pendingLeaveSurvivesRestartAndCarriesResumeTokenUntilConfirmed() {
        MemoryStore store = new MemoryStore();
        NativeSessionPersistence first = new NativeSessionPersistence(store);
        NativeSessionPersistence.PendingLeave leave = new NativeSessionPersistence.PendingLeave(
            "leave-1",
            "ABC123",
            "client-a",
            "secret"
        );
        first.savePendingLeave("https://makao.example", "ABC123", "client-a", leave);

        NativeSessionPersistence afterRestart = new NativeSessionPersistence(store);
        assertEquals(leave, afterRestart.loadPendingLeave("https://makao.example", "ABC123", "client-a"));

        afterRestart.clearPendingLeave("https://makao.example", "ABC123", "client-a");
        assertNull(afterRestart.loadPendingLeave("https://makao.example", "ABC123", "client-a"));
    }

    private static final class MemoryStore implements NativeSessionPersistence.Store {
        private final Map<String, String> values = new HashMap<>();

        @Override
        public String getString(String key) {
            return values.get(key);
        }

        @Override
        public void putString(String key, String value) {
            values.put(key, value);
        }

        @Override
        public void remove(String key) {
            values.remove(key);
        }
    }
}
