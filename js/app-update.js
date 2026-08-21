// 안드로이드(구글플레이) 앱에서 스토어에 새 버전이 올라오면 업데이트 팝업을 띄운다.
// webGame(src/shared/appUpdate.ts)과 같은 설계:
//  - 최신 버전이 무엇인지는 Play가 안다 — 앱이나 DB에 버전을 따로 적어두지 않는다.
//    적어두는 방식이면 릴리스할 때마다 그 값을 같이 올려야 하고, 잊으면 조용히 멈춘다.
//  - Play가 대신 띄워주는 다이얼로그(flexible/immediate)는 쓰지 않는다. 안내만 우리가
//    하고, '업데이트'를 누르면 플레이 스토어의 이 앱 페이지를 연다(market:// 인텐트,
//    스토어가 열린 걸 확인한 뒤에 팝업을 닫는다).
//  - '나중에'를 누른 사람에게는 24시간 동안 다시 묻지 않는다.
// 토스 앱·일반 브라우저에서는 네이티브 플랫폼이 아니므로 이 파일 전체가 no-op이 된다.
(() => {
'use strict';

const cap = window.Capacitor;
let native = false;
try {
  native = !!(cap && cap.isNativePlatform && cap.isNativePlatform()
    && cap.getPlatform && cap.getPlatform() === 'android');
} catch (e) {}
if (!native) return;

// 플러그인 JS는 npm import(번들러 필요) 대신 registerPlugin 프록시로 만든다
// (js/capacitor-bridge.js와 같은 규칙 — 네이티브 구현은 cap sync가 붙여 둔다)
let AppUpdate = null;
try { AppUpdate = window.capacitorExports.registerPlugin('AppUpdate'); } catch (e) {}
if (!AppUpdate) return;

const ASKED_KEY = 'money-merge-update-asked';
const ASK_INTERVAL = 24 * 60 * 60 * 1000;   // '나중에' 후 다시 묻기까지
const UPDATE_AVAILABLE = 2;   // @capawesome/capacitor-app-update AppUpdateAvailability 값

const dlg = document.getElementById('updateDlg');
if (!dlg) return;

function askedRecently() {
  try {
    const at = +localStorage.getItem(ASKED_KEY) || 0;
    return Date.now() - at < ASK_INTERVAL;
  } catch (e) { return false; }
}

async function check() {
  try {
    if (askedRecently()) return;
    const info = await AppUpdate.getAppUpdateInfo();
    if (!info || info.updateAvailability !== UPDATE_AVAILABLE) return;
    // 물어보기 전에 기록한다 — 팝업을 띄운 것 자체가 '물었다'는 뜻이다
    try { localStorage.setItem(ASKED_KEY, String(Date.now())); } catch (e) {}
    dlg.classList.remove('hidden');
  } catch (e) {
    // Play에서 설치한 앱이 아니거나(사이드로드·로컬 빌드) 스토어에 닿지 못한 경우.
    // 업데이트 안내가 없어도 게임은 그대로 돌아야 한다.
  }
}

document.getElementById('btnUpdateNow').addEventListener('click', async () => {
  // 스토어가 열린 뒤에 닫는다 — 먼저 닫으면 인텐트가 실패했을 때 아무 일도
  // 안 일어난 것으로 보인다 (webGame에서 겪고 고친 순서 그대로)
  try { await AppUpdate.openAppStore(); } catch (e) {}
  dlg.classList.add('hidden');
});
document.getElementById('btnUpdateLater').addEventListener('click', () => {
  dlg.classList.add('hidden');
});

check();
})();
