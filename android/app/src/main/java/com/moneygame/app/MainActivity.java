package com.moneygame.app;

import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Capacitor 8 SystemBars 플러그인이 시스템 바 인셋을 웹(env(safe-area-inset-*))으로 그대로
    // 넘겨 주는 최소 웹뷰 버전 (SystemBars.java의 WEBVIEW_VERSION_WITH_SAFE_AREA_FIX와 같은 값)
    private static final int WEBVIEW_SAFE_AREA_MIN = 140;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 엣지투엣지 (2026-09-05, Play 콘솔 권장 조치 "일부 사용자에게는 더 넓은 화면이
        // 표시되지 않을 수 있습니다"). Android 15+(targetSdk 35+)는 시스템이 강제해 이미
        // 캔버스가 상태바 뒤까지 깔리고 HUD가 safe area만큼 내려온 배치였다(index.html의
        // --sat/--sab). 이전 버전은 우리가 켜 줘야 같은 화면이 된다. 단 Capacitor 8
        // SystemBars는 웹뷰 140 미만이면 Android 15 미만에서 인셋을 웹으로 넘기지 않아
        // HUD가 상태바에 가리므로, 그 조합(구형 웹뷰 + Android 14 이하)은 지금처럼
        // 시스템 바 안쪽 배치로 둔다.
        // ⚠️ 반드시 super.onCreate 뒤에 부른다 (2026-09-06 실기기 확인). EdgeToEdge.enable은
        // window.getDecorView()를 건드려 데코 뷰를 그 시점의 테마로 만들어 버리는데, super.onCreate
        // 전이면 런치 테마(AppTheme.NoActionBarLaunch = Theme.SplashScreen, 제목 바 있음)로
        // 만들어지고, 이후 BridgeActivity가 AppTheme.NoActionBar로 바꿔도 이미 만들어진
        // 데코 뷰는 안 바뀐다 → 화면 위에 "머니 게임" 제목의 시스템 액션바(290px)가 남아
        // 웹뷰가 그 아래부터 시작했다 (versionCode 9·10·11 초기 빌드, S23·Android 16).
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM
                || webViewMajorVersion() >= WEBVIEW_SAFE_AREA_MIN) {
            EdgeToEdge.enable(this);
        }
        // 시스템 글꼴 크기 무시 (2026-08-30, NewWorld와 같은 결정) — 웹뷰는 기기 fontScale을
        // textZoom으로 반영해(실기기 제보 1.7배) 홈 문구가 과다 줄바꿈되는 등 레이아웃이
        // 깨진다. 게임 UI는 clamp()·vmin의 자체 크기 체계를 쓰므로 100으로 고정한다.
        WebSettings settings = this.bridge.getWebView().getSettings();
        settings.setTextZoom(100);

        applyOrientationPolicy(getResources().getConfiguration());
    }

    // 설치된 웹뷰(크롬)의 메이저 버전. 알 수 없으면 0 — 엣지투엣지를 켜지 않는 쪽으로 기운다.
    private static int webViewMajorVersion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return 0;
        try {
            PackageInfo info = WebView.getCurrentWebViewPackage();
            if (info != null && info.versionName != null) {
                return Integer.parseInt(info.versionName.split("\\.")[0]);
            }
        } catch (Exception e) {
            // 웹뷰가 없거나 꺼진 기기 — 어차피 BridgeActivity가 no_webview 화면을 띄운다
        }
        return 0;
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
