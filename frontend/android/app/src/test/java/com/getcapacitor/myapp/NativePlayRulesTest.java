package com.getcapacitor.myapp;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import pl.makao.zeznajomymi.gdx.rules.NativePlayRules;

public class NativePlayRulesTest {
    @Test
    public void existingRoomsDefaultToMultipleCardsEnabled() {
        assertTrue(NativePlayRules.isMultipleCardPlayEnabled(null));
        assertTrue(NativePlayRules.isMultipleCardPlayEnabled(Boolean.TRUE));
        assertFalse(NativePlayRules.isMultipleCardPlayEnabled(Boolean.FALSE));
    }

    @Test
    public void disabledMultipleCardsStopsSecondStagedCard() {
        assertTrue(NativePlayRules.canStageAnotherCard(false, 0, false));
        assertFalse(NativePlayRules.canStageAnotherCard(false, 1, false));
        assertTrue(NativePlayRules.canStageAnotherCard(false, 1, true));
    }

    @Test
    public void jokerCanOnlyDeclareFourAgainstActivePause() {
        assertTrue(NativePlayRules.isJokerRankAllowed("skip_turn", "4"));
        assertFalse(NativePlayRules.isJokerRankAllowed("skip_turn", "3"));
        assertTrue(NativePlayRules.isJokerRankAllowed(null, "3"));
    }
}
