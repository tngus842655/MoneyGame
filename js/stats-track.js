// 통계 수집 — 접속(하루 1회)과 보상형 광고 시청을 Supabase에 기록한다.
// 식별자는 랭킹과 같은 기기별 player_id(window.Ranking.playerId)를 쓴다.
// 통계용 데이터라 실패해도 조용히 넘어간다 — 게임·광고 동작에 영향을 주지 않는다.
// 관리자 화면(js/admin.js)이 이 기록을 집계해 보여준다 (db/admin_stats.sql).
(() => {
'use strict';

// 토스/구글플레이 판별용 body 클래스는 앞서 로드된 스크립트들이 붙여 둔다
// (in-toss: js/toss-safearea.js, in-app: js/capacitor-bridge.js)
function platform() {
  if (document.body.classList.contains('in-toss')) return 'toss';
  if (document.body.classList.contains('in-app')) return 'android';
  return 'web';
}

function pid() {
  return window.Ranking && window.Ranking.playerId ? window.Ranking.playerId() : null;
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// 하루 한 번만 서버를 부른다. 기록이 서버에 닿은 뒤에만 날짜를 저장하므로
// 네트워크가 안 좋아 실패하면 다음 실행에서 다시 시도된다.
// (localStorage가 지워져 중복으로 불려도 서버 pk가 하루 1행을 보장한다)
const KEY_DAY = 'money-merge-visit-day';

function recordVisit() {
  const sb = window.supabaseClient;
  const p = pid();
  if (!sb || !p) return;
  let last = null;
  try { last = localStorage.getItem(KEY_DAY); } catch (e) {}
  if (last === today()) return;
  const day = today();
  sb.rpc('record_visit', { p_player_id: p, p_platform: platform() })
    .then(({ error }) => {
      if (!error) { try { localStorage.setItem(KEY_DAY, day); } catch (e) {} }
    }, () => {});
}

recordVisit();
// 앱을 켜둔 채 자정을 넘기고 다음 날 다시 여는 경우
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) recordVisit();
});

window.StatsTrack = {
  // 보상형 광고 시청 확정(userEarnedReward) 시 game.js가 부른다.
  // placement: 'shake' | 'clean' | 'revive'
  adView(placement) {
    const sb = window.supabaseClient;
    const p = pid();
    if (!sb || !p) return;
    sb.rpc('record_ad_view', { p_player_id: p, p_platform: platform(), p_placement: placement })
      .then(() => {}, () => {});
  },
};
})();
