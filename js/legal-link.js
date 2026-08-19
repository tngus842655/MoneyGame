// 개인정보처리방침 링크를 실행 환경에 맞는 방법으로 연다.
// 웹뷰 안에서 그냥 이동해 버리면 게임 화면이 정책 페이지로 덮여 돌아올 방법이 없으므로,
// 각 플랫폼이 제공하는 "닫기 버튼 있는" 브라우저로 띄운다.
//   - 앱인토스: AppsInToss.openURL (토스 인앱 브라우저)
//   - Capacitor(안드로이드): Browser.open (크롬 커스텀 탭)
//   - 일반 브라우저: 손대지 않고 <a target="_blank"> 기본 동작에 맡김
// (in-toss 클래스는 js/toss-safearea.js가 붙이므로 이 파일은 그 뒤에 로드해야 한다)
(() => {
'use strict';

const link = document.getElementById('linkPrivacy');
if (!link) return;

const cap = window.Capacitor;
let native = false;
try { native = !!(cap && cap.isNativePlatform && cap.isNativePlatform()); } catch (e) {}

const inToss = document.body.classList.contains('in-toss');
if (!native && !inToss) return;   // 일반 브라우저는 기본 동작 그대로

// 네이티브 구현 호출용 프록시 (capacitor-bridge.js의 App 등록과 같은 방식)
let Browser = null;
if (native) {
  try { Browser = window.capacitorExports.registerPlugin('Browser'); } catch (e) {}
  if (!Browser) {
    console.error('[legal-link] Browser 플러그인 등록 실패 — 링크를 기본 동작으로 둡니다');
    return;
  }
}

link.addEventListener('click', (e) => {
  e.preventDefault();
  try {
    const opened = native ? Browser.open({ url: link.href }) : window.AppsInToss.openURL(link.href);
    if (opened && opened.catch) opened.catch(fail);
  } catch (err) {
    fail(err);
  }
});

function fail(err) {
  console.error('[legal-link] 정책 페이지 열기 실패:', err);
}
})();
