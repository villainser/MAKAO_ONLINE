package pl.makao.zeznajomymi.gdx;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NativeCardMotionTest {
    private static final float EPSILON = 0.0001f;

    @Test
    public void throwAndSettleMatchTheReferenceTableTiming() {
        float slowSingle = NativeCardMotion.throwFlightSeconds(0f)
            + NativeCardMotion.DISCARD_SETTLE_SECONDS;
        float fastSingle = NativeCardMotion.throwFlightSeconds(1f)
            + NativeCardMotion.DISCARD_SETTLE_SECONDS;
        float slowLastCardInThreeCardStack = NativeCardMotion.throwStackDelaySeconds(2)
            + slowSingle;

        assertEquals(0.74f, fastSingle, EPSILON);
        assertEquals(0.88f, slowSingle, EPSILON);
        assertEquals(1.01f, slowLastCardInThreeCardStack, EPSILON);
    }

    @Test
    public void drawTimingMatchesTheReferenceTableAndKeepsAReadableStackWave() {
        assertEquals(1.02f, NativeCardMotion.drawFlightSeconds(0, -1f), EPSILON);
        assertEquals(1.24f, NativeCardMotion.drawFlightSeconds(0, 1f), EPSILON);
        assertEquals(1.345f, NativeCardMotion.drawFlightSeconds(3, 1f), EPSILON);
        assertEquals(1.345f, NativeCardMotion.drawFlightSeconds(20, 1f), EPSILON);
        assertEquals(0.60f, NativeCardMotion.drawStartDelaySeconds(5), EPSILON);
        assertEquals(2.40f, NativeCardMotion.drawStartDelaySeconds(20), EPSILON);
    }

    @Test
    public void travelCurvesAreBoundedMonotonicAndComeToRest() {
        assertCurveIsBoundedAndMonotonic(true);
        assertCurveIsBoundedAndMonotonic(false);

        assertEquals(0f, NativeCardMotion.throwTravelProgress(-1f), EPSILON);
        assertEquals(1f, NativeCardMotion.throwTravelProgress(2f), EPSILON);
        assertEquals(0f, NativeCardMotion.drawTravelProgress(-1f), EPSILON);
        assertEquals(1f, NativeCardMotion.drawTravelProgress(2f), EPSILON);
        assertEquals(0.875f, NativeCardMotion.throwTravelProgress(0.5f), EPSILON);
        assertEquals(0.5f, NativeCardMotion.drawTravelProgress(0.5f), EPSILON);
    }

    @Test
    public void pendingDrawCannotLandBeforeAuthoritativeState() {
        float duration = NativeCardMotion.drawFlightSeconds(0, 0f);
        float elapsed = 0f;
        for (int i = 0; i < 120; i++) {
            elapsed = NativeCardMotion.advanceFlightElapsed(elapsed, 1f / 60f, duration, true);
        }

        float detachHold = duration * NativeCardMotion.DRAW_DETACH_PHASE;
        assertEquals(detachHold, elapsed, EPSILON);
        assertTrue(elapsed < duration);

        float released = NativeCardMotion.advanceFlightElapsed(elapsed, 0.1f, duration, false);
        assertTrue(released > detachHold);
    }

    private static void assertCurveIsBoundedAndMonotonic(boolean throwCurve) {
        float previous = -1f;
        for (int i = 0; i <= 100; i++) {
            float input = i / 100f;
            float value = throwCurve
                ? NativeCardMotion.throwTravelProgress(input)
                : NativeCardMotion.drawTravelProgress(input);
            assertTrue(value >= 0f && value <= 1f);
            assertTrue(value + EPSILON >= previous);
            previous = value;
        }
        assertEquals(0f, throwCurve
            ? NativeCardMotion.throwTravelProgress(0f)
            : NativeCardMotion.drawTravelProgress(0f), EPSILON);
        assertEquals(1f, throwCurve
            ? NativeCardMotion.throwTravelProgress(1f)
            : NativeCardMotion.drawTravelProgress(1f), EPSILON);
    }
}
