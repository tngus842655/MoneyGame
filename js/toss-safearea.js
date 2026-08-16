// 앱인토스 전체화면(투명 내비게이션 바) 대응.
// 내비게이션 바가 투명해지면 웹뷰가 화면 전체(상태바 뒤까지)로 확장되므로,
// SDK의 SafeAreaInsets 값을 CSS 변수(--sat/--sab/--sal/--sar)로 옮겨서
// 게임 영역이 상태바·홈 인디케이터에 가리지 않게 한다.
// 토스 앱 밖(일반 브라우저)에서는 SDK 호출이 throw → CSS의 env() 폴백이 그대로 적용된다.
// 토스 안에서는 body에 .in-toss 클래스가 붙어, 네이티브 더보기(⋯)·닫기(X) 버튼과
// 겹치는 우상단 UI(#btnRank, 랭킹 패널 헤더)를 CSS(--pill)로 아래로 내린다.
(() => {
'use strict';

const sdk = window.AppsInToss;
const root = document.documentElement;

function apply(ins) {
  if (!ins || typeof ins.top !== 'number') return false;
  root.style.setProperty('--sat', ins.top + 'px');
  root.style.setProperty('--sab', (ins.bottom || 0) + 'px');
  root.style.setProperty('--sal', (ins.left || 0) + 'px');
  root.style.setProperty('--sar', (ins.right || 0) + 'px');
  return true;
}

let inToss = false;
try { inToss = apply(sdk && sdk.SafeAreaInsets && sdk.SafeAreaInsets.get()); } catch (e) {}

// SafeAreaInsets가 없는 구버전 토스 앱 대비: 광고 API 지원 여부로도 토스 환경 감지
if (!inToss) {
  try { inToss = !!(sdk && sdk.loadFullScreenAd && sdk.loadFullScreenAd.isSupported()); } catch (e) {}
}

if (inToss) {
  document.body.classList.add('in-toss');
  try {
    sdk.SafeAreaInsets.subscribe({
      onEvent: (ins) => { if (apply(ins)) window.dispatchEvent(new Event('resize')); },
    });
  } catch (e) {}
  window.dispatchEvent(new Event('resize'));   // 캔버스 레이아웃 재계산 (game.js fit)
}
})();
