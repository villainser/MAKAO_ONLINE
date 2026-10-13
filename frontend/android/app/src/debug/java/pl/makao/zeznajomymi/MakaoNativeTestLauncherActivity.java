package pl.makao.zeznajomymi;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Debug-build-only ADB entry point. The production native table remains non-exported. */
public final class MakaoNativeTestLauncherActivity extends Activity {
    private static final int NATIVE_TABLE_REQUEST = 1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) return;
        Intent nativeTable = new Intent(this, MakaoNativeActivity.class);
        if (getIntent() != null && getIntent().getExtras() != null) {
            nativeTable.putExtras(getIntent().getExtras());
        }
        nativeTable.putExtra("standaloneNativeTest", true);
        startActivityForResult(nativeTable, NATIVE_TABLE_REQUEST);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == NATIVE_TABLE_REQUEST) finish();
    }
}
