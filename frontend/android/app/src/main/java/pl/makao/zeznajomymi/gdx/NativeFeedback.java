package pl.makao.zeznajomymi.gdx;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.badlogic.gdx.Gdx;

@SuppressWarnings("deprecation")
public final class NativeFeedback {
    private static final int DEFAULT_AMPLITUDE = VibrationEffect.DEFAULT_AMPLITUDE;
    private static final int MAX_AMPLITUDE = 255;
    private static final int MAX_DURATION_MS = 900;
    private static final NativeFeedback LIBGDX_ONLY = new NativeFeedback(null);

    private final Vibrator vibrator;
    private boolean enabled = true;

    public enum Type {
        LIGHT(10L, 70),
        TICK(7L, 48),
        SOFT(34L, 135),
        MEDIUM(46L, 210),
        WARNING(new long[] { 0L, 72L, 42L, 56L }, new int[] { 0, 235, 0, 195 }),
        DRAW(new long[] { 0L, 7L, 160L, 34L }, new int[] { 0, 48, 0, 135 }),
        PLAY(new long[] { 0L, 18L, 18L, 46L, 28L, 24L }, new int[] { 0, 115, 0, 235, 0, 165 }),
        ILLEGAL(new long[] { 0L, 72L, 42L, 56L }, new int[] { 0, 235, 0, 195 }),
        SORT(new long[] { 0L, 10L, 22L, 12L, 24L, 16L }, new int[] { 0, 80, 0, 120, 0, 165 }),
        SHUFFLE(new long[] { 0L, 18L, 24L, 20L, 24L, 24L, 26L, 30L }, new int[] { 0, 95, 0, 135, 0, 175, 0, 215 }),
        MAKAO(new long[] { 0L, 36L, 30L, 62L, 32L, 38L }, new int[] { 0, 155, 0, 240, 0, 190 });

        private final long durationMs;
        private final int amplitude;
        private final long[] patternMs;
        private final int[] patternAmplitudes;

        Type(long durationMs, int amplitude) {
            this.durationMs = durationMs;
            this.amplitude = amplitude;
            this.patternMs = null;
            this.patternAmplitudes = null;
        }

        Type(long[] patternMs, int[] patternAmplitudes) {
            this.durationMs = 0L;
            this.amplitude = DEFAULT_AMPLITUDE;
            this.patternMs = patternMs;
            this.patternAmplitudes = patternAmplitudes;
        }

        private boolean isPattern() {
            return patternMs != null && patternMs.length > 0;
        }
    }

    public NativeFeedback(Context context) {
        this.vibrator = resolveVibrator(context);
    }

    public static NativeFeedback create(Context context) {
        return new NativeFeedback(context);
    }

    public static NativeFeedback libGdxOnly() {
        return LIBGDX_ONLY;
    }

    public NativeFeedback setEnabled(boolean enabled) {
        this.enabled = enabled;
        return this;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean hasVibrator() {
        if (vibrator == null) return Gdx.input != null;
        try {
            return vibrator.hasVibrator();
        } catch (RuntimeException ignored) {
            return Gdx.input != null;
        }
    }

    public boolean draw() {
        return trigger(Type.DRAW);
    }

    public boolean lightImpact() {
        return trigger(Type.LIGHT);
    }

    public boolean tick() {
        return trigger(Type.TICK);
    }

    public boolean softImpact() {
        return trigger(Type.SOFT);
    }

    public boolean mediumImpact() {
        return trigger(Type.MEDIUM);
    }

    public boolean warningBump() {
        return trigger(Type.WARNING);
    }

    public boolean playCard() {
        return trigger(Type.PLAY);
    }

    public boolean illegal() {
        return trigger(Type.ILLEGAL);
    }

    public boolean shuffle() {
        return trigger(Type.SHUFFLE);
    }

    public boolean sort() {
        return trigger(Type.SORT);
    }

    public boolean makao() {
        return trigger(Type.MAKAO);
    }

    public boolean trigger(Type type) {
        if (type == null) return false;
        if (type.isPattern()) return vibrate(type.patternMs, type.patternAmplitudes);
        return vibrate(type.durationMs, type.amplitude);
    }

    public boolean vibrate(long durationMs) {
        return vibrate(durationMs, DEFAULT_AMPLITUDE);
    }

    public boolean vibrate(long durationMs, int amplitude) {
        if (!enabled || durationMs <= 0L) return false;
        long safeDurationMs = Math.min(durationMs, MAX_DURATION_MS);
        if (vibrateAndroid(safeDurationMs, amplitude)) return true;
        return vibrateLibGdx(safeDurationMs);
    }

    public boolean vibrate(long[] patternMs, int[] amplitudes) {
        if (!enabled || patternMs == null || patternMs.length == 0) return false;
        if (vibrateAndroid(patternMs, amplitudes)) return true;
        return vibrateLibGdx(totalActiveDuration(patternMs, amplitudes));
    }

    public boolean cancel() {
        boolean cancelled = false;
        if (vibrator != null) {
            try {
                vibrator.cancel();
                cancelled = true;
            } catch (RuntimeException ignored) {
                cancelled = false;
            }
        }
        return cancelled;
    }

    private boolean vibrateAndroid(long durationMs, int amplitude) {
        if (vibrator == null) return false;
        try {
            if (!vibrator.hasVibrator()) return false;
            vibrator.vibrate(VibrationEffect.createOneShot(durationMs, clampAmplitude(amplitude)));
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private boolean vibrateAndroid(long[] patternMs, int[] amplitudes) {
        if (vibrator == null) return false;
        try {
            if (!vibrator.hasVibrator()) return false;
            int[] safeAmplitudes = normalizeAmplitudes(patternMs, amplitudes);
            vibrator.vibrate(VibrationEffect.createWaveform(patternMs, safeAmplitudes, -1));
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private static boolean vibrateLibGdx(long durationMs) {
        if (durationMs <= 0L || Gdx.input == null) return false;
        try {
            Gdx.input.vibrate(toIntDuration(durationMs));
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static Vibrator resolveVibrator(Context context) {
        if (context == null) return null;
        Context appContext = context.getApplicationContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) appContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager != null ? manager.getDefaultVibrator() : null;
        }
        return (Vibrator) appContext.getSystemService(Context.VIBRATOR_SERVICE);
    }

    private static int clampAmplitude(int amplitude) {
        if (amplitude == DEFAULT_AMPLITUDE) return DEFAULT_AMPLITUDE;
        return Math.max(1, Math.min(amplitude, MAX_AMPLITUDE));
    }

    private static int[] normalizeAmplitudes(long[] patternMs, int[] amplitudes) {
        if (amplitudes == null || amplitudes.length != patternMs.length) return null;
        int[] normalized = new int[amplitudes.length];
        for (int i = 0; i < amplitudes.length; i++) {
            normalized[i] = patternMs[i] <= 0L ? 0 : clampAmplitude(amplitudes[i]);
        }
        return normalized;
    }

    private static long totalActiveDuration(long[] patternMs, int[] amplitudes) {
        long totalMs = 0L;
        for (int i = 0; i < patternMs.length; i++) {
            boolean active = amplitudes == null || amplitudes.length != patternMs.length || amplitudes[i] > 0;
            if (active) totalMs += Math.max(0L, patternMs[i]);
        }
        return Math.min(totalMs, MAX_DURATION_MS);
    }

    private static int toIntDuration(long durationMs) {
        return (int) Math.min(durationMs, MAX_DURATION_MS);
    }
}
