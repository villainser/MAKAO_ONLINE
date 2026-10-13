package pl.makao.zeznajomymi;

import android.content.Context;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;

import java.util.ArrayList;
import java.util.List;

public class HybridGameRootLayout extends FrameLayout {
    private static final int TARGET_NONE = 0;
    private static final int TARGET_WEB = 1;
    private static final int TARGET_GDX = 2;
    private static final float HIT_SLOP_PX = 10f;

    private final List<RectF> overlayHitRegions = new ArrayList<>();
    private View webTarget;
    private View gdxTarget;
    private boolean hybridActive;
    private int activeTarget = TARGET_NONE;
    private float overlayViewportWidth;
    private float overlayViewportHeight;

    public HybridGameRootLayout(Context context) {
        super(context);
        setClipChildren(false);
        setClipToPadding(false);
    }

    public void setTouchTargets(View webTarget, View gdxTarget) {
        this.webTarget = webTarget;
        this.gdxTarget = gdxTarget;
    }

    public void setHybridActive(boolean hybridActive) {
        this.hybridActive = hybridActive;
        activeTarget = TARGET_NONE;
        if (!hybridActive) {
            overlayHitRegions.clear();
            overlayViewportWidth = 0f;
            overlayViewportHeight = 0f;
        }
    }

    public void setOverlayHitRegions(List<RectF> regions, float viewportWidth, float viewportHeight) {
        overlayHitRegions.clear();
        if (regions != null) {
            overlayHitRegions.addAll(regions);
        }
        overlayViewportWidth = Math.max(0f, viewportWidth);
        overlayViewportHeight = Math.max(0f, viewportHeight);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (!hybridActive || webTarget == null || gdxTarget == null) {
            return super.dispatchTouchEvent(event);
        }

        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            activeTarget = isInOverlayHitRegion(event.getX(), event.getY()) ? TARGET_WEB : TARGET_GDX;
        } else if (activeTarget == TARGET_NONE) {
            activeTarget = TARGET_GDX;
        }

        View target = activeTarget == TARGET_WEB ? webTarget : gdxTarget;
        boolean handled = target != null && target.dispatchTouchEvent(event);

        if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
            activeTarget = TARGET_NONE;
        }
        return handled || hybridActive;
    }

    private boolean isInOverlayHitRegion(float x, float y) {
        if (overlayHitRegions.isEmpty()) return false;
        float scaleX = overlayViewportWidth > 0f ? getWidth() / overlayViewportWidth : 1f;
        float scaleY = overlayViewportHeight > 0f ? getHeight() / overlayViewportHeight : 1f;
        for (RectF cssRect : overlayHitRegions) {
            float left = cssRect.left * scaleX - HIT_SLOP_PX;
            float top = cssRect.top * scaleY - HIT_SLOP_PX;
            float right = cssRect.right * scaleX + HIT_SLOP_PX;
            float bottom = cssRect.bottom * scaleY + HIT_SLOP_PX;
            if (x >= left && x <= right && y >= top && y <= bottom) {
                return true;
            }
        }
        return false;
    }
}
