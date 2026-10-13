package pl.makao.zeznajomymi.gdx.rules;

public final class NativeReliableActionRules {
    private NativeReliableActionRules() {
    }

    public static boolean shouldRetry(String code, boolean retryable) {
        return retryable && "PERSISTENCE_FAILED".equals(code);
    }

    public static boolean canSubmitDependentAction(boolean hasPendingGameAction) {
        return !hasPendingGameAction;
    }

    public static boolean shouldCloseChoiceAfterSubmission(boolean submitted) {
        return submitted;
    }
}
