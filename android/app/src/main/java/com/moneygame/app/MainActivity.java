package com.moneygame.app;

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
    }
}
