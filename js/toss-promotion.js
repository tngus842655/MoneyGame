// 앱인토스 프로모션 — "매일 게임하면 5원 지급" (혜택탭 미션 "1분 게임하고 5원받기",
// 콘솔 등록 2026-08-22, ~9/30).
// 게임 진행 시간을 하루 단위로 누적해 1분이 되면 grantPromotionReward로 토스포인트 5원을
// 지급한다. 지급되면 토스가 자체 토스트('머니 게임에서 5원을 지급했어요')를 띄우므로
// 앱은 따로 알리지 않는다.
//
// **매일 1회, 종료일까지 반복 지급이다.** 누적 시간과 지급 기록을 날짜로 묶어 자정이
// 지나면 처음부터 다시 센다 — 콘솔의 '1인 하루 최대 5원' 한도와 같은 주기다. 저장소를
// 지워 우회해도 토스 서버의 하루 한도가 같은 날 중복 지급을 막는다(4113).
// 단, 지급 불가(4110)가 오면 그 사람은 앞으로도 못 받는 것으로 보고 영구히 멈춘다 —
// 미니게임30 운영에서 1인 누적 총액이 상한(혜택탭 금액 기준으로 추정)에 걸리면 4110이
// 계속 나오는 것을 봤다. 매일 지급이 계속되는지는 라이브 초기에 지급 내역으로 확인할 것.
//
// - 시간은 game.js step()이 매 프레임 tick(dt)으로 넘겨준다. 광고/재확인 팝업 중에는
//   step이 멈추고 dt가 33ms로 클램프되어 백그라운드 시간도 안 실리므로, 여기 누적값은
//   "실제로 게임이 돌아간 시간"이다. 판이 바뀌거나 앱을 껐다 켜도 같은 날이면 이어진다.
// - 카운트다운 필(59초→1초)은 이 파일이 DOM으로 직접 그린다. 게임오버/메뉴로 나가면
//   tick이 끊기므로 워치독이 잠시 뒤 필을 숨긴다 — game.js에 숨김 훅이 필요 없다.
// - 토스 밖(일반 브라우저·구글플레이)에서는 SDK가 없어 아무것도 하지 않는다.
//
// 운영 코드다. 지급 테스트 번들은 make-dist.mjs --promo-test가 dist에서 테스트 접두사가
// 붙은 코드로 바꿔 만든다 — 소스에 테스트용 코드를 직접 적지 말 것. 광고 쪽 전례처럼
// 테스트 식별자 문자열은 주석으로라도 검수 번들에 실으면 안 된다 (scripts/make-dist.mjs 참고).
(() => {
'use strict';

const PROMOTION_CODE = '01M0KBFJXX4RHCG76YVFSP51M2';
const AMOUNT = 5;                 // 콘솔 '지급 금액'과 같아야 한다 (초과 시 4114 거절)
const REQUIRED_MS = 60 * 1000;    // 지급 조건: 게임 진행 1분
// 콘솔 종료일과 같다. 콘솔에서 연장하면 여기도 같이 미루고 재배포해야 한다.
const ENDS_TS = new Date('2026-09-30T23:59:59+09:00').getTime();
const KEY_DAY = 'money-merge-promo-day';    // 지급받은 날 (YYYY-MM-DD) — 다음 날 다시 받는다
const KEY_DONE = 'money-merge-promo-done';  // '1'이면 영구 지급 불가(4110) — 더는 시도 안 함
const KEY_MS = 'money-merge-promo-ms';      // 오늘 누적 진행 ms ("YYYY-MM-DD:12345")

const sdk = window.AppsInToss;
let available = false;
try {
  available = !!(sdk && sdk.grantPromotionReward && sdk.grantPromotionReward.isSupported())
    && Date.now() < ENDS_TS;
} catch (e) {}

if (!available) {
  window.TossPromotion = { tick() {} };
  return;
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

let granted = false;    // 오늘치 지급 완료 (영구 불가 포함)
let rejected = false;   // 한 번 거절당하면 이번 실행에서는 더 두드리지 않는다
let running = false;

// 오늘 지급 여부·누적 진행 시간 불러오기 (날짜가 바뀌었으면 0부터)
let playedMs = 0;
try {
  granted = localStorage.getItem(KEY_DONE) === '1' || localStorage.getItem(KEY_DAY) === today();
  const saved = (localStorage.getItem(KEY_MS) || '').split(':');
  if (saved[0] === today()) playedMs = Math.max(0, parseInt(saved[1], 10) || 0);
} catch (e) {}
let savedAt = playedMs;

// ---------------------------------------------------------------- 카운트다운 필
// 우상단, 토스 네이티브 ⋯/X 아래 (in-toss #menuSound와 같은 좌표 계열)
const pill = document.createElement('div');
pill.id = 'promoTimer';
pill.className = 'hidden';
document.getElementById('gameArea').appendChild(pill);

let lastTickAt = 0;
let lastShownSec = 0;

function updatePill() {
  const remain = REQUIRED_MS - playedMs;
  // 59초부터 1초까지 거꾸로 — 처음 1초는 59로 고정, 마지막 1초는 1로 표시
  const sec = Math.min(59, Math.max(1, Math.ceil(remain / 1000)));
  if (sec !== lastShownSec) {
    lastShownSec = sec;
    pill.textContent = '🎁 5원까지 ' + sec + '초';
  }
  pill.classList.remove('hidden');
}

// 게임오버·메뉴 복귀로 tick이 끊기면 필을 숨긴다
setInterval(() => {
  if (lastTickAt && performance.now() - lastTickAt > 400) {
    lastTickAt = 0;
    pill.classList.add('hidden');
    persist();
  }
}, 250);

function persist() {
  if (playedMs === savedAt) return;
  savedAt = playedMs;
  try { localStorage.setItem(KEY_MS, today() + ':' + Math.round(playedMs)); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ---------------------------------------------------------------- 지급
function markGrantedToday() {
  granted = true;
  try { localStorage.setItem(KEY_DAY, today()); } catch (e) {}
}

function markBlockedForever() {
  granted = true;
  try { localStorage.setItem(KEY_DONE, '1'); } catch (e) {}
}

async function grant() {
  running = true;
  pill.classList.add('hidden');
  try {
    const result = await sdk.grantPromotionReward({
      params: { promotionCode: PROMOTION_CODE, amount: AMOUNT },
    });
    // 성공은 { key } 하나뿐. 나머지는 { errorCode, message } | 'ERROR' | undefined(버전 미달)
    if (result && typeof result === 'object' && 'key' in result) {
      markGrantedToday();   // 토스 토스트가 뜨는 것으로 안내 끝 — 내일 다시 센다
      return;
    }
    rejected = true;
    const code = result && typeof result === 'object' ? String(result.errorCode) : String(result);
    if (code === '4110') markBlockedForever();       // 이 사람에게는 더 나갈 수 없음
    else if (code === '4113') markGrantedToday();    // 오늘은 이미 지급됨 — 내일 다시
    // 예산 부족(4112) 등은 세션 플래그만 — 충전되면 다음 실행에서 다시 시도된다.
    console.warn('[toss-promotion] 지급 거절:', code, result);
  } catch (e) {
    rejected = true;
    console.error('[toss-promotion] 지급 실패:', e);
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------- 게임 훅
// game.js step()이 playing 상태에서 매 프레임 부른다. dt는 ms (≤33).
function tick(dt) {
  if (granted || rejected || running) return;
  playedMs += dt;
  lastTickAt = performance.now();
  if (playedMs >= REQUIRED_MS) {
    persist();
    grant();
    return;
  }
  updatePill();
  if (playedMs - savedAt > 3000) persist();   // 앱이 갑자기 꺼져도 진행분 보존
}

window.TossPromotion = { tick };

// ---------------------------------------------------------------- 이벤트 고지
// 홈 화면의 정적 고지 문구(index.html #promoNote)를 토스 안에서만 보이게 한다.
// 조건·주기·조기 종료 가능성 고지는 프로모션 운영 요건이다.
const note = document.getElementById('promoNote');
if (note) note.classList.remove('hidden');
})();
