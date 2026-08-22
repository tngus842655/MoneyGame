// 관리자 기기 광고 차단 — 배너·보상형 모두 실제 광고를 부르지 않는다.
// 관리자가 운영 중 광고를 계속 보면 무효 트래픽(광고 정책 위반) 소지가 있어서다.
// 기능(흔들기/제거/부활)은 광고 제거 구매자와 같은 흐름으로 광고 없이 실행된다.
//
// 판별은 서버 RPC(is_admin, admin_keys 등록 기기)라 비동기인데 광고 스크립트는
// 로드 즉시 시작한다. 그래서 지난 세션 결과를 localStorage에 캐시해 부팅 시점
// (동기)에 쓰고, 서버 답이 오면 캐시를 갱신한다 — 관리자 기기의 맨 첫 실행에만
// 광고가 잠깐 붙었다가 (답이 오는 즉시 걷힘) 이후 실행부터는 처음부터 안 붙는다.
// 캐시를 손으로 심으면 광고 없이 기능을 쓸 수 있지만 매 세션 서버가 false를
// 주는 즉시 지워지고, 점수는 어차피 서버 상한이 지키는 구조라 감수한다.
//
// 소비처: js/toss-ads.js·js/admob-ads.js(광고 건너뜀), js/game.js(광고 없는
// 기능 실행·문구), js/admin.js(홈 📊 버튼 표시), index.html(body.admin-free CSS)
(() => {
'use strict';

const KEY = 'money-merge-admin';
let active = false;
try { active = localStorage.getItem(KEY) === '1'; } catch (e) {}
const listeners = [];

function apply() {
  document.body.classList.toggle('admin-free', active);
  window.dispatchEvent(new Event('resize'));   // 배너 자리가 생기고 없어짐 — 캔버스 재계산
}

function set(v) {
  if (v !== active) {
    active = v;
    try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) {}
    apply();
    for (const fn of listeners) { try { fn(active); } catch (e) {} }
  }
}

window.AdminMode = {
  active: () => active,
  onChange: (fn) => listeners.push(fn),
};

// 스크립트는 body 끝에서 로드되므로 바로 반영해도 안전 — 광고 스크립트(뒤에 로드)가
// 부팅 시점에 body.admin-free와 AdminMode.active()를 볼 수 있어야 한다
if (active) apply();

// 서버 확인 — supabase-init(즉시)와 ranking.js(뒤에 로드)가 준비될 때까지 재시도.
// RPC 실패(오프라인 등)에는 캐시를 유지한다 — 관리자 기기가 광고로 돌아가지 않게.
let tries = 0;
(function check() {
  const sb = window.supabaseClient;
  const pid = window.Ranking && window.Ranking.playerId && window.Ranking.playerId();
  if (!sb || !pid) {
    if (++tries <= 10) setTimeout(check, 1000);
    return;
  }
  sb.rpc('is_admin', { p_player_id: pid })
    .then(({ data, error }) => { if (!error) set(data === true); })
    .catch(() => {});
})();
})();
