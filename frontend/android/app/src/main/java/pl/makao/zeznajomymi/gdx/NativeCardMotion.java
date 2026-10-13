package pl.makao.zeznajomymi.gdx;

/**
 * Timing and easing for the small, physical card motions used at the native table.
 *
 * <p>This class deliberately has no LibGDX or Android dependencies so the feel-critical
 * bounds can be checked by ordinary JVM tests.</p>
 */
final class NativeCardMotion {
    static final float DISCARD_SETTLE_SECONDS = 0.32f;
    static final float DRAW_DETACH_PHASE = 0.34f;

    private static final float THROW_SLOW_SECONDS = 0.56f;
    private static final float THROW_FAST_SECONDS = 0.42f;
    private static final float THROW_STACK_STAGGER_SECONDS = 0.065f;

    private static final float DRAW_MIN_SECONDS = 1.02f;
    private static final float DRAW_MAX_SECONDS = 1.24f;
    private static final float DRAW_STACK_DURATION_SECONDS = 0.035f;
    private static final float DRAW_STAGGER_SECONDS = 0.12f;
    private static final int DRAW_STACK_DURATION_LIMIT = 3;

    private NativeCardMotion() {
    }

    static float throwFlightSeconds(float releaseSpeedProgress) {
        return lerp(THROW_SLOW_SECONDS, THROW_FAST_SECONDS, clamp01(releaseSpeedProgress));
    }

    static float throwStackDelaySeconds(int stackIndex) {
        return Math.max(0, stackIndex) * THROW_STACK_STAGGER_SECONDS;
    }

    static float drawFlightSeconds(int drawStackIndex, float variation) {
        float randomRangeProgress = (clamp(variation, -1f, 1f) + 1f) / 2f;
        float stackDuration = Math.min(Math.max(0, drawStackIndex), DRAW_STACK_DURATION_LIMIT)
            * DRAW_STACK_DURATION_SECONDS;
        return lerp(DRAW_MIN_SECONDS, DRAW_MAX_SECONDS, randomRangeProgress) + stackDuration;
    }

    static float drawStartDelaySeconds(int drawStackIndex) {
        return Math.max(0, drawStackIndex) * DRAW_STAGGER_SECONDS;
    }

    static float advanceFlightElapsed(
        float elapsed,
        float delta,
        float duration,
        boolean awaitingAuthoritativeState
    ) {
        float next = Math.max(0f, elapsed) + Math.max(0f, delta);
        if (!awaitingAuthoritativeState) return next;
        return Math.min(next, Math.max(0f, duration) * DRAW_DETACH_PHASE);
    }

    /** The reference table gives a thrown card a decisive release and a soft landing. */
    static float throwTravelProgress(float progress) {
        float t = clamp01(progress);
        float remaining = 1f - t;
        return 1f - remaining * remaining * remaining;
    }

    /** Drawn cards accelerate and brake evenly after separating from the pile. */
    static float drawTravelProgress(float progress) {
        return smoothstep(progress);
    }

    static float detachProgress(float progress) {
        return smoothstep(progress);
    }

    private static float smoothstep(float progress) {
        float t = clamp01(progress);
        return t * t * (3f - 2f * t);
    }

    private static float clamp01(float value) {
        return clamp(value, 0f, 1f);
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(value, max));
    }

    private static float lerp(float from, float to, float progress) {
        return from + (to - from) * progress;
    }
}
