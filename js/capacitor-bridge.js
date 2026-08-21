// Capacitor(안드로이드 네이티브 포장)에서 하드웨어 뒤로가기 버튼을 처리한다.
// 리스너를 등록하지 않으면 안드로이드 기본 동작이 그대로 실행돼서, 게임 도중
// 뒤로가기 한 번에 앱이 꺼져 버린다.
// 토스 앱·일반 브라우저에서는 네이티브 플랫폼이 아니므로 이 파일 전체가 no-op이 된다.
(() => {
'use strict';

const cap = window.Capacitor;
let native = false;
try { native = !!(cap && cap.isNativePlatform && cap.isNativePlatform()); } catch (e) {}
if (!native) return;

// 플러그인 JS는 npm import(번들러 필요) 대신 lib/capacitor.js가 노출하는 registerPlugin으로
// 직접 만든다. 네이티브 쪽 구현은 `npm run build:android`(cap sync)가 이미 붙여 두었고,
// 여기서 만드는 건 그 네이티브 구현을 호출하는 프록시일 뿐이다.
let App = null;
try { App = window.capacitorExports.registerPlugin('App'); } catch (e) {}
if (!App) {
  console.error('[capacitor] App 플러그인 등록 실패 — lib/capacitor.js 로드와 @capacitor/app 설치를 확인하세요');
  return;
}

document.body.classList.add('in-app');

const shown = (id) => {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden');
};
const tap = (id) => {
  const el = document.getElementById(id);
  if (el) el.click();
};

// 위에 떠 있는 레이어부터 차례로 닫는다 (index.html의 z-index 순서와 동일).
// 각 화면의 취소/닫기 버튼을 그대로 눌러서, 판 정리·점수 저장은 game.js 로직에 맡긴다.
function handleBack() {
  if (shown('adPlay'))     return;                           // 광고 재생 중엔 무시
  if (shown('updateDlg'))  { tap('btnUpdateLater');   return; }   // 업데이트 안내 → 나중에
  if (shown('nickEditor')) { tap('btnNickCancel');    return; }
  if (shown('adConfirm'))  { tap('btnAdCancel');      return; }
  if (shown('confirmDlg')) { tap('btnConfirmCancel'); return; }
  if (shown('rank'))       { tap('btnRankClose');     return; }
  if (shown('over'))       { tap('btnMenu');          return; }   // 게임 오버 → 처음으로
  if (!shown('menu'))      { tap('btnHome');          return; }   // 플레이 중 → 나가기 재확인 팝업
  armExit();                                                      // 홈 화면 → 종료
}

// 홈에서 한 번 잘못 눌러 앱이 꺼지지 않도록, 안내를 띄우고 시간 안에 다시 눌러야 종료한다.
const EXIT_WINDOW_MS = 2000;
let exitArmedUntil = 0;
let toastTimer = 0;

function armExit() {
  const toast = document.getElementById('backToast');
  clearTimeout(toastTimer);
  if (Date.now() < exitArmedUntil) {
    // 종료 시도와 함께 상태를 되돌린다 — 종료가 실패해도 다음엔 다시 두 번 눌러야 한다
    exitArmedUntil = 0;
    if (toast) toast.classList.remove('show');
    try { App.exitApp(); } catch (e) { console.error('[capacitor] 앱 종료 실패:', e); }
    return;
  }
  exitArmedUntil = Date.now() + EXIT_WINDOW_MS;
  if (!toast) return;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), EXIT_WINDOW_MS);
}

try {
  App.addListener('backButton', handleBack);
} catch (e) {
  console.error('[capacitor] 뒤로가기 리스너 등록 실패:', e);
}
})();
