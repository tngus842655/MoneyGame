// 광고 단위 ID를 한 곳에 모아 둔다. 플레이스토어 정식 출시로 승격하기 전에
// USE_TEST_ADS를 false로 바꾸고 REAL에 AdMob 콘솔에서 발급받은 ID를 넣으면 된다.
//
// ⚠️ 테스트 ID인 채로 정식 출시하면 광고 수익이 0원이다. 비공개 테스트 트랙까지는 이대로가 정상.
// ⚠️ 실제 ID로 바꾼 뒤에는 본인 기기에서 절대 광고를 클릭하지 말 것.
//    무효 트래픽으로 판정되면 AdMob 계정이 정지된다. 확인은 반드시 테스트 ID로.
//
// AndroidManifest.xml의 com.google.android.gms.ads.APPLICATION_ID(앱 ID)도
// 같이 바꿔야 한다 — 그건 네이티브 쪽이라 이 파일로는 안 바뀐다.
(() => {
'use strict';

const USE_TEST_ADS = true;

// 구글이 공개한 공식 테스트 광고 단위 (안드로이드용). 아무나 써도 되고 항상 광고가 나온다.
// https://developers.google.com/admob/android/test-ads
const TEST = {
  banner:   'ca-app-pub-3940256099942544/6300978111',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

// AdMob 콘솔 > 앱 > 광고 단위에서 발급받은 실제 ID
const REAL = {
  banner:   '',
  rewarded: '',
};

const picked = USE_TEST_ADS ? TEST : REAL;

window.ADS_CONFIG = {
  testing: USE_TEST_ADS,
  banner: picked.banner,
  rewarded: picked.rewarded,
  // 실제 ID로 바꿨는데 값을 안 채운 경우를 조용히 넘기지 않는다
  ready: !!(picked.banner && picked.rewarded),
};

if (!window.ADS_CONFIG.ready) {
  console.error('[ads-config] 광고 단위 ID가 비어 있습니다. USE_TEST_ADS를 확인하거나 REAL을 채우세요.');
}
})();
