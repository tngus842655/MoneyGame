// 앱인토스(토스 미니앱) 인앱 광고 연동 브리지.
// - 배너: TossAds.initialize → #adBanner 슬롯에 attachBanner
// - 보상형: loadFullScreenAd로 미리 로드해 두고, 게임이 요청하면 showFullScreenAd
// 토스 앱 밖(일반 브라우저)에서는 isSupported()가 false라서 아무것도 하지 않고,
// 게임은 window.AdsBridge가 없으면 시뮬레이션 광고로 폴백한다.
// 구글플레이(Capacitor) 쪽 같은 역할은 js/admob-ads.js가 맡는다.
(() => {
'use strict';

// ─── 광고 그룹 ID ───
// 지금은 앱인토스 공식 테스트 ID. 출시 전에 콘솔에서 발급받은 실제 ID로 교체하세요.
const AD_GROUP = {
  banner: 'ait-ad-test-banner-id',      // 배너 광고 - 리스트형
  rewarded: 'ait-ad-test-rewarded-id',  // 보상형 광고 (통 흔들기 / 동전 제거 / 부활 공용)
};
const SHOW_WAIT_MS = 15000;   // 표시 요청 시 로드가 안 끝났으면 이만큼까지만 기다림
const NO_DISMISS_MS = 10000;  // 일부 안드로이드 토스앱(5.255.0)은 dismissed가 오지 않아 보상 후 타임아웃으로 마무리

const sdk = window.AppsInToss;

function supported(fn) {
  try { return !!(fn && fn.isSupported()); } catch (e) { return false; }
}
const rewardedSupported = () => !!sdk && supported(sdk.loadFullScreenAd) && supported(sdk.showFullScreenAd);
const bannerSupported = () => !!sdk && !!sdk.TossAds && supported(sdk.TossAds.initialize) && supported(sdk.TossAds.attachBanner);

// ---------------------------------------------------------------- 보상형
let rewardedReady = false;
let rewardedLoading = false;
let waitingShow = null;   // 로드가 끝나는 대로 표시해 달라는 예약 { cbs, timer }

function loadRewarded() {
  if (!rewardedSupported() || rewardedReady || rewardedLoading) return;
  rewardedLoading = true;
  const failLoad = (error) => {
    rewardedLoading = false;
    console.error('[toss-ads] 보상형 광고 로드 실패:', error);
    if (waitingShow) {
      const w = waitingShow;
      waitingShow = null;
      clearTimeout(w.timer);
      w.cbs.onFail(error);
    }
  };
  try {
    sdk.loadFullScreenAd({
      options: { adGroupId: AD_GROUP.rewarded },
      onEvent: (event) => {
        if (event.type !== 'loaded') return;
        rewardedLoading = false;
        rewardedReady = true;
        if (waitingShow) {
          const w = waitingShow;
          waitingShow = null;
          clearTimeout(w.timer);
          showLoaded(w.cbs);
        }
      },
      onError: failLoad,
    });
  } catch (e) {
    failLoad(e);
  }
}

function showLoaded(cbs) {
  rewardedReady = false;   // 광고는 1회용: 표시 시작과 함께 소모
  let earned = false;
  let finished = false;
  let noDismissTimer = 0;
  // dismissed가 안 오는 토스앱 대비 2차 안전망: 보상 확정 후 웹뷰가 다시
  // 보이는 순간(네이티브 광고 닫힘)을 감지해 타임아웃(10초)보다 먼저 마무리
  const onVisible = () => {
    if (earned && document.visibilityState === 'visible') setTimeout(finish, 300);
  };
  const cleanup = () => {
    clearTimeout(noDismissTimer);
    document.removeEventListener('visibilitychange', onVisible);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    cleanup();
    loadRewarded();        // 다음 광고 미리 로드 (load → show → load 패턴)
    cbs.onFinish(earned);
  };
  const fail = (error) => {
    if (finished) return;
    finished = true;
    cleanup();
    console.error('[toss-ads] 보상형 광고 표시 실패:', error);
    loadRewarded();
    cbs.onFail(error);
  };
  try {
    sdk.showFullScreenAd({
      options: { adGroupId: AD_GROUP.rewarded },
      onEvent: (event) => {
        switch (event.type) {
          case 'show':
            if (cbs.onShow) cbs.onShow();
            break;
          case 'userEarnedReward':
            // 보상 지급은 이 이벤트에서만 확정 (dismissed만으로는 지급 금지).
            // 횟수 차감 같은 회계 처리는 여기서 바로 알림 — dismissed가 늦거나
            // 안 와도 차감/배지가 즉시 반영되게 함 (기능 실행은 finish에서)
            earned = true;
            if (cbs.onEarned) { try { cbs.onEarned(); } catch (e) {} }
            document.addEventListener('visibilitychange', onVisible);
            noDismissTimer = setTimeout(finish, NO_DISMISS_MS);
            break;
          case 'dismissed':
            finish();
            break;
          case 'failedToShow':
            fail(new Error('failedToShow'));
            break;
        }
      },
      onError: fail,
    });
  } catch (e) {
    fail(e);
  }
}

// cbs: { onShow?, onEarned?, onFinish(earned), onFail(error) }
// - onEarned: 보상 확정(userEarnedReward) 즉시 1회 호출 — 횟수 차감 등 회계 처리용
// - onFinish/onFail 중 정확히 하나만 호출됨 (기능 실행은 여기서)
function showRewarded(cbs) {
  if (!rewardedSupported()) { cbs.onFail(new Error('unsupported')); return; }
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
function startBanner() {
  if (!bannerSupported()) return false;
  try {
    sdk.TossAds.initialize({
      callbacks: {
        onInitialized: attachBanner,
        onInitializationFailed: (error) => {
          console.error('[toss-ads] 배너 SDK 초기화 실패:', error);
          loadRewarded();   // 배너가 실패해도 보상형은 이어서 준비
        },
      },
    });
  } catch (e) {
    console.error('[toss-ads] 배너 SDK 초기화 실패:', e);
    return false;
  }
  return true;
}

function attachBanner() {
  const el = document.getElementById('adBanner');
  if (!el) { loadRewarded(); return; }
  // 문서 요구사항: 부착 대상 엘리먼트는 비어 있어야 하고, 너비는 화면 100% (고정형 높이 96px)
  el.textContent = '';
  document.body.classList.add('toss-banner');
  window.dispatchEvent(new Event('resize'));   // 캔버스 레이아웃 재계산 (game.js fit)

  // 광고 그룹은 한 번에 하나씩만 로드하라는 가이드 대응: 배너가 자리 잡은 뒤 보상형 로드
  let chained = false;
  const chainRewarded = () => {
    if (chained) return;
    chained = true;
    clearTimeout(chainTimer);
    loadRewarded();
  };
  const chainTimer = setTimeout(chainRewarded, 4000);   // 배너 이벤트가 안 와도 보상형은 준비

  try {
    sdk.TossAds.attachBanner(AD_GROUP.banner, el, {
      theme: 'auto',
      tone: 'blackAndWhite',
      variant: 'expanded',
      callbacks: {
        onAdRendered: chainRewarded,
        onNoFill: () => { console.warn('[toss-ads] 배너: 표시할 광고가 없음'); chainRewarded(); },
        onAdFailedToRender: (payload) => {
          console.error('[toss-ads] 배너 렌더링 실패:', payload && payload.error);
          chainRewarded();
        },
      },
    });
  } catch (e) {
    // 부착 실패: 자리표시자 상태로 되돌리고 보상형 준비는 계속
    console.error('[toss-ads] 배너 부착 실패:', e);
    document.body.classList.remove('toss-banner');
    el.textContent = 'AD · 배너 광고 영역';
    window.dispatchEvent(new Event('resize'));
    chainRewarded();
  }
}

// 시작: 배너 먼저(바로 보이는 지면), 이어서 보상형 미리 로드
if (!startBanner()) loadRewarded();

// 광고 브리지는 토스·AdMob 두 벌이 있고 게임은 window.AdsBridge 하나만 본다.
// 토스 광고를 실제로 띄울 수 있을 때만 자리를 차지한다 — 그래야 다음에 로드되는
// js/admob-ads.js가 "이미 브리지가 있으니 물러난다"는 판단을 제대로 할 수 있다.
if (rewardedSupported()) {
  window.AdsBridge = {
    rewardedAvailable: rewardedSupported,
    showRewarded,
  };
}
})();
