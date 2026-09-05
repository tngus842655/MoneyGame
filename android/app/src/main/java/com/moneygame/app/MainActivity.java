package com.moneygame.app;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 시스템 글꼴 크기 무시 (2026-08-30, NewWorld와 같은 결정) — 웹뷰는 기기 fontScale을
        // textZoom으로 반영해(실기기 제보 1.7배) 홈 문구가 과다 줄바꿈되는 등 레이아웃이
        // 깨진다. 게임 UI는 clamp()·vmin의 자체 크기 체계를 쓰므로 100으로 고정한다.
        WebSettings settings = this.bridge.getWebView().getSettings();
        settings.setTextZoom(100);

        applyOrientationPolicy(getResources().getConfiguration());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // 폴더블을 펼치거나 접으면 smallestScreenWidthDp가 바뀐다 (configChanges에 있어 재생성은 없음)
        applyOrientationPolicy(newConfig);
    }

    // 화면 방향 정책 (2026-09-05). 매니페스트의 screenOrientation="portrait"는 지웠다 —
    // Play 콘솔이 '대형 화면 지원' 권장 조치로 잡았고, Android 16(targetSdk 36)은 sw600dp
    // 이상에서 그 값을 어차피 무시한다. 대신 폰(sw < 600dp)에서만 런타임으로 세로를 고정해
    // 지금까지의 동작을 그대로 두고, 태블릿·펼친 폴더블은 회전을 허용한다. 게임은
    // game.js fit()이 남는 공간을 하늘·잔디로 채우므로 가로 화면에서도 그대로 돈다.
    // (setTextZoom과는 무관 — 글꼴 확대 고정은 위에서 그대로 유지된다.)
    private void applyOrientationPolicy(Configuration config) {
        boolean compact = config.smallestScreenWidthDp < 600;
        setRequestedOrientation(compact
            ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }
}
