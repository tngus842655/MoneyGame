(() => {
'use strict';

// ================================================================ 닉네임
const ADJ = ['용감한', '재빠른', '부유한', '행복한', '반짝이는', '느긋한', '열정적인', '귀여운', '씩씩한', '현명한', '수줍은', '통큰'];
const ANI = ['다람쥐', '고양이', '펭귄', '수달', '토끼', '여우', '판다', '햄스터', '고래', '부엉이', '치타', '오리'];

function myName() {
  let n = null;
  try { n = localStorage.getItem('money-merge-nick'); } catch (e) {}
  if (!n) {
    n = ADJ[(Math.random() * ADJ.length) | 0] + ' ' + ANI[(Math.random() * ANI.length) | 0] + (100 + (Math.random() * 900) | 0);
    try { localStorage.setItem('money-merge-nick', n); } catch (e) {}
  }
  return n;
}

// ================================================================ 기간 계산
function startOfWeekISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);   // 월요일 시작
  return d.toISOString();
}
function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function prevMonthRange() {
  const d = new Date();
  return {
    start: new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString(),
    end: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
  };
}

// ================================================================ 데이터 어댑터
// [Supabase 연동 지점]
// 1) supabase-js 로드 후 어디선가:  window.supabaseClient = supabase.createClient(URL, ANON_KEY)
// 2) 테이블 스키마 예시:
//      create table scores (
//        id bigint generated always as identity primary key,
//        nickname text not null,
//        score bigint not null,
//        created_at timestamptz not null default now()
//      );
//      create index scores_created_score on scores (created_at, score desc);
// 3) window.supabaseClient 가 있으면 자동으로 실데이터를 쓰고, 없으면 목데이터로 동작합니다.
//    ※ 같은 유저의 최고 기록만 남기려면 nickname unique + upsert 방식으로 바꾸거나
//      뷰/rpc 로 dedupe 하는 걸 추천 (아래 쿼리는 단순 전체 삽입 기준).
const API = {
  async fetchRanking(period) {   // 'week' | 'month' | 'hall'
    const sb = window.supabaseClient;
    if (sb) {
      if (period === 'hall') {
        const { start, end } = prevMonthRange();
        const { data, error } = await sb.from('scores')
          .select('nickname, score')
          .gte('created_at', start).lt('created_at', end)
          .order('score', { ascending: false })
          .limit(100);
        if (error) throw error;
        return data;
      }
      const since = period === 'week' ? startOfWeekISO() : startOfMonthISO();
      const { data, error } = await sb.from('scores')
        .select('nickname, score')
        .gte('created_at', since)
        .order('score', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    }
    return mockRanking(period);
  },

  async submitScore(score) {
    if (!score || score <= 0) return;
    const sb = window.supabaseClient;
    if (sb) {
      const { error } = await sb.from('scores').insert({ nickname: myName(), score });
      if (error) throw error;
    }
    // 목 모드에서는 저장할 곳이 없으므로 무시 (내 최고 기록은 localStorage 기준으로 표시)
  },
};

// ================================================================ 목데이터 (Supabase 연동 전 UI 확인용)
function mockRanking(period) {
  const count = period === 'hall' ? 100 : 1000;
  let seed = period === 'hall' ? 77 : period === 'week' ? 11 : 33;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  let s = period === 'week' ? 4200000 : period === 'month' ? 9800000 : 15000000;
  const rows = [];
  for (let i = 0; i < count; i++) {
    s = Math.max(1200, Math.floor(s * (0.955 + rand() * 0.04)));
    rows.push({
      nickname: ADJ[(rand() * ADJ.length) | 0] + ' ' + ANI[(rand() * ANI.length) | 0] + (100 + (rand() * 900) | 0),
      score: s,
    });
  }
  // 이번주/이번달 목데이터에는 내 최고 기록을 끼워넣어 위치 확인 가능하게
  if (period !== 'hall') {
    let best = 0;
    try { best = +localStorage.getItem('money-merge-best-krw') || 0; } catch (e) {}
    if (best > 0) {
      const idx = rows.findIndex(r => r.score <= best);
      const meRow = { nickname: myName(), score: best, me: true };
      if (idx === -1) rows.push(meRow); else rows.splice(idx, 0, meRow);
      rows.length = Math.min(rows.length, count);
    }
  }
  return rows;
}

// ================================================================ 랭킹 화면
const rankEl = document.getElementById('rank');
const listEl = document.getElementById('rankList');
const tabBtns = [...document.querySelectorAll('#rankTabs button')];
let curTab = 'week';
const cache = {};

const fmt = v => v.toLocaleString('ko-KR') + '원';

function el(cls, html) {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

function podium(rows) {
  const wrap = document.createElement('div');
  wrap.className = 'podium';
  const order = [[1, 'second', '🥈'], [0, 'first', '👑'], [2, 'third', '🥉']];
  for (const [i, cls, medal] of order) {
    const r = rows[i];
    const col = document.createElement('div');
    col.className = 'pCol ' + cls;
    col.innerHTML = `<div class="pMedal">${medal}</div><div class="pNick"></div><div class="pPts">${r ? fmt(r.score) : ''}</div><div class="pBlock">${i + 1}</div>`;
    col.querySelector('.pNick').textContent = r ? r.nickname : '-';
    wrap.appendChild(col);
  }
  return wrap;
}

function renderList(tab, rows) {
  listEl.innerHTML = '';
  if (!rows || !rows.length) {
    listEl.appendChild(el('rankMsg', '아직 기록이 없어요!'));
    return;
  }
  const frag = document.createDocumentFragment();
  if (tab === 'hall') {
    frag.appendChild(el('rankCap', '👑 지난달 명예의 전당 TOP 100'));
    frag.appendChild(podium(rows.slice(0, 3)));
    rows.slice(3).forEach((r, i) => {
      const rank = i + 4;
      frag.appendChild(rowSimple(r, rank, rank <= 10));
    });
  } else {
    rows.forEach((r, i) => {
      const rank = i + 1;
      frag.appendChild(rowSimple(r, rank, rank <= 10));
    });
  }
  listEl.appendChild(frag);
}

function rowSimple(r, rank, hot) {
  const cls = ['rankRow'];
  if (rank === 1) cls.push('t1');
  else if (rank === 2) cls.push('t2');
  else if (rank === 3) cls.push('t3');
  else if (hot) cls.push('hot');
  if (r.me) cls.push('me');
  const no = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
  const d = el(cls.join(' '), `<span class="no">${no}</span><span class="nick"></span><span class="pts">${fmt(r.score)}</span>`);
  d.querySelector('.nick').textContent = r.nickname;
  return d;
}

async function select(tab) {
  curTab = tab;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  listEl.innerHTML = '';
  listEl.appendChild(el('rankMsg', '불러오는 중…'));
  try {
    if (!cache[tab]) cache[tab] = await API.fetchRanking(tab);
    if (curTab !== tab) return;                    // 로딩 중 탭 전환 시 무시
    renderList(tab, cache[tab]);
  } catch (e) {
    if (curTab !== tab) return;
    listEl.innerHTML = '';
    listEl.appendChild(el('rankMsg', '랭킹을 불러오지 못했어요 😢'));
  }
}

function open() {
  for (const k of Object.keys(cache)) delete cache[k];   // 열 때마다 새로 조회
  rankEl.classList.remove('hidden');
  select(curTab);
}
function close() {
  rankEl.classList.add('hidden');
}

document.getElementById('btnRank').addEventListener('click', open);
document.getElementById('btnRankClose').addEventListener('click', close);
tabBtns.forEach(b => b.addEventListener('click', () => select(b.dataset.tab)));

// ================================================================ 외부 노출
window.Ranking = {
  open,
  close,
  myName,
  submitScore: score => Promise.resolve(API.submitScore(score)).catch(() => {}),
};
})();
