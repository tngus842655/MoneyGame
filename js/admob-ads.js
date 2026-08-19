// 구글플레이(Capacitor 네이티브) 인앱 광고 연동 브리지.
// - 배너: 화면 하단에 네이티브 배너를 띄운다. 웹 쪽 #adBanner 자리표시자와 같은 위치.
// - 보상형: 미리 로드해 두고, 게임이 요청하면 표시한다.
// 토스 앱·일반 브라우저에서는 네이티브 플랫폼이 아니라 이 파일 전체가 no-op이 되고,
// 게임은 js/toss-ads.js가 올린 브리지나 시뮬레이션 광고로 그대로 폴백한다.
//
// 광고 단위 ID는 js/ads-config.js 한 곳에만 있다.
(() => {
'use strict';

const cap = window.Capacitor;
let native = false;
try { native = !!(cap && cap.isNativePlatform && cap.isNativePlatform()); } catch (e) {}
if (!native) return;

// 토스 안에서는 토스 SDK 광고를 쓴다. 두 브리지가 겹치지 않게 여기서 물러난다.
// (앱인토스 미니앱은 네이티브 플랫폼이 아니라 사실상 걸릴 일이 없지만, 순서가 바뀌어도 안전하게)
if (window.AdsBridge) return;

const cfg = window.ADS_CONFIG;
if (!cfg || !cfg.ready) {
  console.error('[admob] 광고 설정이 없어 광고를 켜지 않습니다 — js/ads-config.js 확인');
  return;
}

// 플러그인 JS는 npm import(번들러 필요) 대신 lib/capacitor.js가 노출하는 registerPlugin으로
// 직접 만든다. 네이티브 구현은 `npm run build:android`(cap sync)가 이미 붙여 두었다.
let AdMob = null;
try { AdMob = window.capacitorExports.registerPlugin('AdMob'); } catch (e) {}
if (!AdMob) {
  console.error('[admob] 플러그인 등록 실패 — lib/capacitor.js와 @capacitor-community/admob 설치를 확인하세요');
  return;
}

const SHOW_WAIT_MS = 15000;   // 표시 요청 시 로드가 안 끝났으면 이만큼까지만 기다림

// ---------------------------------------------------------------- 보상형
let rewardedReady = false;
let rewardedLoading = false;
let waitingShow = null;   // 로드가 끝나는 대로 표시해 달라는 예약 { cbs, timer }
let current = null;       // 표시 중인 광고의 콜백 { cbs, earned, finished }

function loadRewarded() {
  if (rewardedReady || rewardedLoading) return;
  rewardedLoading = true;
  AdMob.prepareRewardVideoAd({ adId: cfg.rewarded, isTesting: cfg.testing })
    .catch((error) => {
      // 실패 이벤트(onRewardedVideoAdFailedToLoad)로도 들어오지만, 호출 자체가
      // 거부되는 경우(플러그인 미초기화 등)는 여기서만 잡힌다
      rewardedLoading = false;
      console.error('[admob] 보상형 광고 로드 실패:', error);
      failWaiting(error);
    });
}

function failWaiting(error) {
  if (!waitingShow) return;
  const w = waitingShow;
  waitingShow = null;
  clearTimeout(w.timer);
  w.cbs.onFail(error);
}

// 표시가 끝났을 때(보상 확정 여부와 무관) 정확히 한 번만 마무리한다
function finishCurrent() {
  if (!current || current.finished) return;
  current.finished = true;
  const { cbs, earned } = current;
  current = null;
  loadRewarded();          // 다음 광고 미리 로드 (load -> show -> load 패턴)
  cbs.onFinish(earned);
}

function failCurrent(error) {
  if (!current || current.finished) return;
  current.finished = true;
  const { cbs } = current;
  current = null;
  console.error('[admob] 보상형 광고 표시 실패:', error);
  loadRewarded();
  cbs.onFail(error);
}

AdMob.addListener('onRewardedVideoAdLoaded', () => {
  rewardedLoading = false;
  rewardedReady = true;
  if (!waitingShow) return;
  const w = waitingShow;
  waitingShow = null;
  clearTimeout(w.timer);
  showLoaded(w.cbs);
});

AdMob.addListener('onRewardedVideoAdFailedToLoad', (error) => {
  rewardedLoading = false;
  rewardedReady = false;
  console.error('[admob] 보상형 광고 로드 실패:', error);
  failWaiting(error || new Error('failedToLoad'));
});

AdMob.addListener('onRewardedVideoAdShowed', () => {
  if (current && current.cbs.onShow) current.cbs.onShow();
});

// 보상 지급은 이 이벤트에서만 확정한다 (닫힘만으로는 지급 금지).
// 횟수 차감 같은 회계 처리는 즉시 알리고, 기능 실행은 finish에서 한다 — toss-ads.js와 같은 규칙.
AdMob.addListener('onRewardedVideoAdReward', () => {
  if (!current) return;
  current.earned = true;
  if (current.cbs.onEarned) { try { current.cbs.onEarned(); } catch (e) {} }
});

AdMob.addListener('onRewardedVideoAdDismissed', finishCurrent);
AdMob.addListener('onRewardedVideoAdFailedToShow', (error) => failCurrent(error || new Error('failedToShow')));

function showLoaded(cbs) {
  rewardedReady = false;   // 광고는 1회용: 표시 시작과 함께 소모
  current = { cbs, earned: false, finished: false };
  AdMob.showRewardVideoAd().catch((error) => failCurrent(error));
}

// cbs: { onShow?, onEarned?, onFinish(earned), onFail(error) }
// - onEarned: 보상 확정 즉시 1회 호출 - 횟수 차감 등 회계 처리용
// - onFinish/onFail 중 정확히 하나만 호출됨 (기능 실행은 여기서)
function showRewarded(cbs) {
  if (current) { cbs.onFail(new Error('busy')); return; }
  if (waitingShow) { cbs.onFail(new Error('busy')); return; }
  if (rewardedReady) { showLoaded(cbs); return; }
  waitingShow = {
    cbs,
    timer: setTimeout(() => {
      waitingShow = null;
      cbs.onFail(new Error('timeout'));
    }, SHOW_WAIT_MS),
  };
  loadRewarded();
}

// ---------------------------------------------------------------- 배너
// 네이티브 배너는 웹뷰 위에 얹히므로, 웹 쪽 자리표시자(#adBanner)를 투명하게 비워
// 어두운 막대가 배너 옆으로 삐져나오지 않게 한다. 위치는 body.in-app(=화면 하단 정렬)이 맞춰 준다.
function startBanner() {
  AdMob.showBanner({
    adId: cfg.banner,
    adSize: 'BANNER',            // 320x50dp 고정. #adBanner 자리(60px)와 거의 같아 레이아웃이 안 흔들린다
    position: 'BOTTOM_CENTER',   // 플러그인이 하단 시스템 인셋만큼 띄워 준다 (내비게이션 바 위)
    margin: 0,
    isTesting: cfg.testing,
  }).catch((error) => console.error('[admob] 배너 표시 실패:', error));
}

AdMob.addListener('bannerAdLoaded', () => {
  const el = document.getElementById('adBanner');
  if (!el) return;
  el.textContent = '';
  document.body.classList.add('admob-banner');
  window.dispatchEvent(new Event('resize'));   // 캔버스 레이아웃 재계산 (game.js fit)
});

AdMob.addListener('bannerAdFailedToLoad', (error) => {
  console.error('[admob] 배너 로드 실패:', error);
  // 자리표시자를 원래대로 두면 어두운 막대가 남는다. 배너가 없으면 자리도 없애는 게 낫다.
  const el = document.getElementById('adBanner');
  if (!el) return;
  el.textContent = '';
  document.body.classList.add('admob-banner');
  window.dispatchEvent(new Event('resize'));
});

// ---------------------------------------------------------------- 시작
// initialize가 끝나기 전에 배너/보상형을 요청하면 무시되므로 반드시 이어서 호출한다.
AdMob.initialize({ initializeForTesting: cfg.testing })
  .then(() => {
    startBanner();
    loadRewarded();
  })
  .catch((error) => console.error('[admob] 초기화 실패:', error));

window.AdsBridge = {
  rewardedAvailable: () => true,
  showRewarded,
};
})();
