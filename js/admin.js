// 관리자 통계 화면 — 홈 화면 타이틀을 연속 7번 탭하면 열린다.
// 데이터 접근 권한은 서버가 지킨다: get_admin_stats()가 admin_keys에 등록된
// player_id만 통과시키므로, 여기서 하는 일은 화면을 열지 말지뿐이다.
// 등록되지 않은 기기에서는 그 기기의 ID를 보여준다 — 새 기기를 관리자로
// 추가할 때 이 ID를 db/admin_stats.sql의 insert 예시대로 넣으면 된다.
//
// 플랫폼 탭 (전체 / 앱인토스 / 플레이스토어): 서버 응답에 플랫폼별 슬라이스
// (platforms.toss / .android / .web)가 같이 오므로, 탭 전환은 서버 왕복 없이
// 같은 표를 다른 슬라이스로 다시 그리는 것뿐이다. 브라우저(web) 접속분은 개발
// 확인용이라 탭을 따로 두지 않고 '전체'에만 들어간다 (안내문으로 표시).
(() => {
'use strict';

const TAPS = 7;          // 연타 횟수
const TAP_GAP_MS = 1200; // 이 간격 안에 이어서 눌러야 연타로 친다
const TAB_KEY = 'money-merge-admin-tab';   // 마지막으로 본 탭 — 다음에 열 때 그대로
const TABS = ['all', 'toss', 'android'];   // index.html #adminTabs의 data-pf와 같아야 한다

const overlay = document.getElementById('admin');
const bodyEl = document.getElementById('adminBody');
const tabsEl = document.getElementById('adminTabs');
let taps = 0;
let lastTap = 0;
let stats = null;   // 마지막 서버 응답 — 탭을 바꿀 때 재사용
let tab = 'all';
try { const t = localStorage.getItem(TAB_KEY); if (TABS.includes(t)) tab = t; } catch (e) {}

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

tabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-pf]');
  if (btn && TABS.includes(btn.dataset.pf)) selectTab(btn.dataset.pf);
});

function selectTab(pf) {
  tab = pf;
  try { localStorage.setItem(TAB_KEY, pf); } catch (e) {}
  for (const b of tabsEl.querySelectorAll('button[data-pf]')) {
    b.classList.toggle('active', b.dataset.pf === pf);
  }
  if (stats) render(stats, pf);
}

// 홈 화면 관리자 버튼 — 서버 is_admin이 true라고 답한 기기에서만 보인다.
// 판별(RPC + localStorage 캐시)은 js/admin-mode.js가 한 번만 하고, 여기서는
// 그 결과를 구독만 한다. 판별이 실패하면 버튼은 숨겨진 채로 두고,
// 타이틀 7연타가 백업 입구로 남는다 (권한 자체는 어차피 get_admin_stats가 지킴).
const btnAdmin = document.getElementById('btnAdmin');
btnAdmin.addEventListener('click', open);

if (window.AdminMode) {
  btnAdmin.classList.toggle('hidden', !window.AdminMode.active());
  window.AdminMode.onChange((on) => btnAdmin.classList.toggle('hidden', !on));
}

async function open() {
  overlay.classList.remove('hidden');
  tabsEl.classList.add('hidden');            // 데이터가 와야 탭이 의미 있다
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
    stats = data;
    tabsEl.classList.remove('hidden');
    selectTab(tab);
  } catch (e) {
    // 관리자가 아니거나(rpc 예외) sql 미적용 — 어느 쪽이든 여기서는 ID 안내가 최선
    stats = null;
    bodyEl.innerHTML =
      '<div class="rankMsg">관리자로 등록되지 않은 기기예요<br><br>' +
      '이 기기의 ID (등록용):<br><b class="adminPid">' + pid + '</b></div>';
  }
}

// 탭이 볼 슬라이스. '전체'는 최상위 daily/uniq (전 플랫폼 합산 — platforms를 모르는
// 옛 번들과 같은 형식), 플랫폼 탭은 platforms.<pf>. platforms가 없으면 서버 SQL이
// 옛 버전이라는 뜻이라 안내만 띄운다.
function slice(data, pf) {
  if (pf === 'all') return { daily: data.daily || [], uniq: data.uniq || {} };
  return data.platforms && data.platforms[pf];
}

// ---------------------------------------------------------------- 집계·표
// 서버가 준 일별 기록(KST)을 이 기기의 달력으로 자른다. 주는 월요일, 달은 1일에
// 시작한다 — 랭킹·서버(kst_week_start/kst_month_start)와 같은 달력이다.
// 광고 수는 일별 값의 합이고, 주간·월간 접속자는 서버가 준 순 방문자(uniq)를 쓴다.
function render(data, pf) {
  const s = slice(data, pf);
  if (!s) {
    bodyEl.innerHTML = '<div class="rankMsg">플랫폼별 집계가 아직 없어요<br><br>' +
      '<small>db/admin_stats.sql을 Supabase에 다시 적용하면 보여요</small></div>';
    return;
  }
  const daily = s.daily || [];
  const uniq = s.uniq || {};
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

  // '전체' 탭에만: 브라우저 접속분이 섞여 있음을 알린다 (플랫폼 탭 합 ≠ 전체인 이유)
  const web = pf === 'all' && data.platforms && data.platforms.web;
  const webMonth = web && web.uniq ? (web.uniq.month || 0) : 0;

  // 지난 구간은 시작일만 표기 — 끝나는 날은 자명하고, 머리글이 길면
  // 고정 열 폭(31%)을 넘어 줄바꿈된다 (index.html .statTbl 참고)
  bodyEl.innerHTML =
    table('일간', '오늘 (' + md(today) + ')', cols.today, '어제 (' + md(yesterday) + ')', cols.yesterday) +
    table('주간', '이번주 (' + md(monday) + '~)', cols.week,
      '지난주 (' + md(addDays(monday, -7)) + '~)', cols.lastWeek) +
    table('월간', '이번달 (' + md(month1st) + '~)', cols.month,
      '지난달 (' + md(lastMonth1st) + '~)', cols.lastMonth) +
    '<p class="statNote">주간·월간 접속자는 순 방문자(중복 제거) 기준이라 일별 합과 다를 수 있어요' +
    (webMonth ? '<br>🌐 브라우저 접속분은 전체에만 들어 있어요 (이번달 ' + webMonth.toLocaleString() + '명)' : '') +
    '</p>';
  bodyEl.scrollTop = 0;
}
})();
