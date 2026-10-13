package pl.makao.zeznajomymi.gdx.rules;

public final class NativePlayRules {
    private NativePlayRules() {
    }

    public static boolean isMultipleCardPlayEnabled(Boolean value) {
        return value == null || value;
    }

    public static boolean canStageAnotherCard(boolean allowMultipleCards, int selectedCount, boolean alreadySelected) {
        return alreadySelected || allowMultipleCards || selectedCount <= 0;
    }

    public static boolean isJokerRankAllowed(String activeEffectType, String rank) {
        if (rank == null || rank.isEmpty() || "joker".equals(rank)) return false;
        return !"skip_turn".equals(activeEffectType) || "4".equals(rank);
    }
}
