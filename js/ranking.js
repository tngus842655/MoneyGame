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

// 기기별 플레이어 식별자. 닉네임을 바꿔도 과거 기록을 함께 갱신하기 위해 사용.
function playerId() {
  let p = null;
  try { p = localStorage.getItem('money-merge-pid'); } catch (e) {}
  if (!p) {
    p = (crypto.randomUUID && crypto.randomUUID()) ||
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    try { localStorage.setItem('money-merge-pid', p); } catch (e) {}
  }
  return p;
}

// 정식 회원가입 없이 닉네임만 유저가 직접 지정 (localStorage 기기별 저장)
function setName(raw) {
  const n = String(raw || '').trim().slice(0, 10);
  if (!n) return false;
  try { localStorage.setItem('money-merge-nick', n); } catch (e) {}
  refreshNickDisplays();
  // 과거 기록의 닉네임까지 갱신한 뒤, 열려 있는 랭킹 목록을 새로 고침
  Promise.resolve(API.renamePlayer(n)).catch(() => {}).then(() => {
    if (!rankEl.classList.contains('hidden')) reload();
  });
  return true;
}

function refreshNickDisplays() {
  const n = myName();
  const a = document.getElementById('rankMeName');
  const b = document.getElementById('finalNickName');
  if (a) a.textContent = n;
  if (b) b.textContent = n;
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
// window.supabaseClient 가 있으면 실데이터, 없으면 목데이터로 동작합니다.
//
// 저장 구조는 두 가지를 지원하며 서버 상태를 자동 감지해 전환합니다:
//  - v2 (권장, db/ranking_v2.sql 적용 후): 아이디(player_id)당 주간/월간 버킷별
//    최고기록 1행만 upsert. 판마다 행이 쌓이지 않고, 랭킹에 같은 사람이 중복으로
//    올라오지 않는다. 명예의전당은 지난달 월간 버킷을 그대로 읽는다.
//    쓰기/읽기 모두 security definer rpc(submit_score / get_ranking)로만 접근.
//  - v1 (legacy): scores 테이블에 판마다 insert 후 기간 필터로 조회.
// player_id 컬럼/함수 적용 여부 (null=미확인). 마이그레이션 전에도 게임이 멈추지 않도록 자동 감지.
let playerIdSupported = null;
const isMissingPlayerId = e =>
  /player_id/i.test((e && (e.message || e.details || e.hint)) || '');

// v2 스키마(best_scores + rpc) 적용 여부 (null=미확인). 함수가 없으면 v1로 자동 폴백.
let v2Supported = null;
const isMissingV2 = e =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' ||
    /could not find the function|does not exist/i.test(e.message || ''));

const API = {
  async fetchRanking(period) {   // 'week' | 'month' | 'hall'
    const sb = window.supabaseClient;
    if (sb) {
      // v2: 구간별 최고기록 테이블에서 조회 (내 행은 is_me로 표시)
      if (v2Supported !== false) {
        const { data, error } = await sb.rpc('get_ranking', { p_period: period, p_player_id: playerId() });
        if (!error) {
          v2Supported = true;
          return (data || []).map(r => ({ nickname: r.nickname, score: r.score, me: r.is_me }));
        }
        if (!isMissingV2(error)) throw error;
        v2Supported = false;   // 마이그레이션 전 → v1으로 계속
      }
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
      // v2: 이번주/이번달 버킷에 upsert — 같은 판/같은 구간에 여러 번 제출돼도
      // 아이디당 최고기록 1행만 남는다 (낮은 점수는 서버에서 무시).
      if (v2Supported !== false) {
        const { error } = await sb.rpc('submit_score', {
          p_player_id: playerId(), p_nickname: myName(), p_score: score,
        });
        if (!error) { v2Supported = true; return; }
        if (!isMissingV2(error)) throw error;
        v2Supported = false;   // 마이그레이션 전 → v1으로 계속
      }
      const row = { nickname: myName(), score };
      if (playerIdSupported !== false) row.player_id = playerId();
      let { error } = await sb.from('scores').insert(row);
      if (error && isMissingPlayerId(error)) {
        // player_id 컬럼 마이그레이션 전이면 닉네임/점수만으로 재시도
        playerIdSupported = false;
        ({ error } = await sb.from('scores').insert({ nickname: row.nickname, score }));
      } else if (!error) {
        playerIdSupported = true;
      }
      if (error) throw error;
    }
    // 목 모드에서는 저장할 곳이 없으므로 무시 (내 최고 기록은 localStorage 기준으로 표시)
  },

  // 닉네임 변경 시 내가 남긴 과거 기록의 닉네임도 함께 갱신.
  // anon에 update 권한을 주지 않기 위해 security definer 함수(rename_player)를 호출한다.
  async renamePlayer(nickname) {
    const sb = window.supabaseClient;
    if (!sb || playerIdSupported === false) return;
    const { error } = await sb.rpc('rename_player', { p_player_id: playerId(), p_nickname: nickname });
    if (error) playerIdSupported = false;   // 함수/컬럼 미적용 상태면 이후 조용히 건너뜀
  },

  // 탭 종료/백그라운드 전환처럼 페이지가 곧 죽을 수 있는 시점 전용.
  // supabase-js의 일반 fetch는 언로드 중 취소될 수 있어, keepalive fetch로 REST를 직접 호출.
  submitScoreBeacon(score) {
    if (!score || score <= 0) return;
    const cfg = window.supabaseConfig;
    if (!cfg) return;   // 목 모드: 저장할 서버가 없음
    let url, body;
    if (v2Supported !== false) {
      // v2: rpc upsert — 스냅샷이 여러 번 저장돼도 구간별 최고기록 1행만 남는다
      url = `${cfg.url}/rest/v1/rpc/submit_score`;
      body = { p_player_id: playerId(), p_nickname: myName(), p_score: score };
    } else {
      url = `${cfg.url}/rest/v1/scores`;
      body = { nickname: myName(), score };
      if (playerIdSupported !== false) body.player_id = playerId();
    }
    try {
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.anonKey,
          'Authorization': `Bearer ${cfg.anonKey}`,
        },
        body: JSON.stringify(body),
      }).catch(() => {});
    } catch (e) {}
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

function reload() {
  for (const k of Object.keys(cache)) delete cache[k];
  select(curTab);
}

function open() {
  for (const k of Object.keys(cache)) delete cache[k];   // 열 때마다 새로 조회
  refreshNickDisplays();
  rankEl.classList.remove('hidden');
  select(curTab);
}
function close() {
  rankEl.classList.add('hidden');
}

document.getElementById('btnRank').addEventListener('click', open);
document.getElementById('btnRankClose').addEventListener('click', close);
tabBtns.forEach(b => b.addEventListener('click', () => select(b.dataset.tab)));

// ================================================================ 닉네임 편집
const nickEl = document.getElementById('nickEditor');
const nickInput = document.getElementById('nickInput');

function openNickEditor() {
  nickInput.value = myName();
  nickEl.classList.remove('hidden');
  setTimeout(() => nickInput.focus(), 0);
}
function closeNickEditor() {
  nickEl.classList.add('hidden');
}
function saveNick() {
  if (setName(nickInput.value)) closeNickEditor();
  else nickInput.focus();
}

document.getElementById('btnEditNick1').addEventListener('click', openNickEditor);
document.getElementById('btnEditNick2').addEventListener('click', openNickEditor);
document.getElementById('btnNickSave').addEventListener('click', saveNick);
document.getElementById('btnNickCancel').addEventListener('click', closeNickEditor);
nickInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveNick(); });

refreshNickDisplays();

// ================================================================ 외부 노출
window.Ranking = {
  open,
  close,
  myName,
  setName,
  refreshNickDisplays,
  submitScore: score => Promise.resolve(API.submitScore(score)).catch(() => {}),
  submitScoreBeacon: score => API.submitScoreBeacon(score),
};
})();
