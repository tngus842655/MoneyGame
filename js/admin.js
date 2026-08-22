// 관리자 통계 화면 — 홈 화면 타이틀을 연속 7번 탭하면 열린다.
// 데이터 접근 권한은 서버가 지킨다: get_admin_stats()가 admin_keys에 등록된
// player_id만 통과시키므로, 여기서 하는 일은 화면을 열지 말지뿐이다.
// 등록되지 않은 기기에서는 그 기기의 ID를 보여준다 — 새 기기를 관리자로
// 추가할 때 이 ID를 db/admin_stats.sql의 insert 예시대로 넣으면 된다.
(() => {
'use strict';

const TAPS = 7;          // 연타 횟수
const TAP_GAP_MS = 1200; // 이 간격 안에 이어서 눌러야 연타로 친다

const overlay = document.getElementById('admin');
const bodyEl = document.getElementById('adminBody');
let taps = 0;
let lastTap = 0;

document.getElementById('menuTitle').addEventListener('pointerdown', () => {
  const now = performance.now();
  taps = now - lastTap < TAP_GAP_MS ? taps + 1 : 1;
  lastTap = now;
  if (taps >= TAPS) {
    taps = 0;
    open();
  }
});

document.getElementById('btnAdminClose').addEventListener('click', () => {
  overlay.classList.add('hidden');
});

// 홈 화면 관리자 버튼 — 서버 is_admin이 true라고 답한 기기에서만 보인다.
// is_admin이 아직 DB에 없거나 호출이 실패하면 버튼은 숨겨진 채로 두고,
// 타이틀 7연타가 백업 입구로 남는다 (권한 자체는 어차피 get_admin_stats가 지킴).
const btnAdmin = document.getElementById('btnAdmin');
btnAdmin.addEventListener('click', open);

(async function showIfAdmin(retried) {
  const sb = window.supabaseClient;
  const pid = window.Ranking && window.Ranking.playerId && window.Ranking.playerId();
  if (!sb || !pid) {
    // 초기화 경합(스크립트 로드 직후) 대비 한 번만 재시도
    if (!retried) setTimeout(() => showIfAdmin(true), 1500);
    return;
  }
  try {
    const { data, error } = await sb.rpc('is_admin', { p_player_id: pid });
    if (!error && data === true) btnAdmin.classList.remove('hidden');
  } catch (e) {}
})();

async function open() {
  overlay.classList.remove('hidden');
  bodyEl.innerHTML = '<div class="rankMsg">불러오는 중…</div>';
  const sb = window.supabaseClient;
  const pid = window.Ranking && window.Ranking.playerId && window.Ranking.playerId();
  if (!sb || !pid) {
    bodyEl.innerHTML = '<div class="rankMsg">서버 연결이 없어요</div>';
    return;
  }
  try {
    const { data, error } = await sb.rpc('get_admin_stats', { p_player_id: pid });
    if (error || !data) throw error || new Error('no data');
    render(data);
  } catch (e) {
    // 관리자가 아니거나(rpc 예외) sql 미적용 — 어느 쪽이든 여기서는 ID 안내가 최선
    bodyEl.innerHTML =
      '<div class="rankMsg">관리자로 등록되지 않은 기기예요<br><br>' +
      '이 기기의 ID (등록용):<br><b class="adminPid">' + pid + '</b></div>';
  }
}

// ---------------------------------------------------------------- 집계·표
// 서버가 준 일별 기록(KST)을 이 기기의 달력으로 자른다. 주는 월요일, 달은 1일에
// 시작한다 — 랭킹·서버(kst_week_start/kst_month_start)와 같은 달력이다.
// 광고 수는 일별 값의 합이고, 주간·월간 접속자는 서버가 준 순 방문자(uniq)를 쓴다.
function render(data) {
  const daily = data.daily || [];
  const uniq = data.uniq || {};
  const byDay = new Map(daily.map(r => [r.day, r]));

  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
  const md = d => (d.getMonth() + 1) + '/' + d.getDate();
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = addDays(today, -1);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const month1st = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth1st = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  // [from, to] 구간의 일별 값 합 (양끝 포함)
  function sum(from, to, key) {
    let n = 0;
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const row = byDay.get(iso(d));
      if (row) n += row[key] || 0;
    }
    return n;
  }

  function col(from, to, visitors) {
    const shake = sum(from, to, 'shake');
    const clean = sum(from, to, 'clean');
    const revive = sum(from, to, 'revive');
    return { visitors, total: shake + clean + revive, shake, clean, revive };
  }

  const dayRow = d => (byDay.get(iso(d)) || {}).visitors || 0;
  const cols = {
    today: col(today, today, dayRow(today)),
    yesterday: col(yesterday, yesterday, dayRow(yesterday)),
    week: col(monday, today, uniq.week || 0),
    lastWeek: col(addDays(monday, -7), addDays(monday, -1), uniq.last_week || 0),
    month: col(month1st, today, uniq.month || 0),
    lastMonth: col(lastMonth1st, lastMonthEnd, uniq.last_month || 0),
  };

  function table(caption, aHead, a, bHead, b) {
    const rows = [
      ['👥 접속자', 'visitors'],
      ['📺 광고 합계', 'total'],
      ['🌀 통 흔들기', 'shake'],
      ['🧹 동전 제거', 'clean'],
      ['💚 부활', 'revive'],
    ];
    return '<div class="statCap">' + caption + '</div><table class="statTbl">' +
      '<tr><th></th><th>' + aHead + '</th><th>' + bHead + '</th></tr>' +
      rows.map(([label, key]) =>
        '<tr><td>' + label + '</td><td>' + a[key].toLocaleString() + '</td><td>' +
        b[key].toLocaleString() + '</td></tr>').join('') +
      '</table>';
  }

  // 지난 구간은 시작일만 표기 — 끝나는 날은 자명하고, 머리글이 길면
  // 고정 열 폭(31%)을 넘어 줄바꿈된다 (index.html .statTbl 참고)
  bodyEl.innerHTML =
    table('일간', '오늘 (' + md(today) + ')', cols.today, '어제 (' + md(yesterday) + ')', cols.yesterday) +
    table('주간', '이번주 (' + md(monday) + '~)', cols.week,
      '지난주 (' + md(addDays(monday, -7)) + '~)', cols.lastWeek) +
    table('월간', '이번달 (' + md(month1st) + '~)', cols.month,
      '지난달 (' + md(lastMonth1st) + '~)', cols.lastMonth) +
    '<p class="statNote">주간·월간 접속자는 순 방문자(중복 제거) 기준이라 일별 합과 다를 수 있어요</p>';
}
})();
