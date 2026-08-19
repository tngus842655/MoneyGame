(() => {
'use strict';

const { Engine, Bodies, Body, Composite, Events } = Matter;

// ---------------------------------------------------------------- constants
const W = 420, H = 740;
const TAU = Math.PI * 2;
const WALL_X = 10;            // inner edge of side walls
const FLOOR_TOP = H - 16;     // top edge of the floor
const DROP_Y = 104;           // y where held piece hovers
const LINE_Y = 165;           // game-over line
const OVER_MS = 2000;         // 위험 상태가 이 시간 연속 유지되면 게임오버
const COMBO_MS = 5000;        // 이 시간 안에 연달아 합치면 콤보 유지
const SPAWN_TIERS = 4;        // droppable tiers (coins only)
const SPAWN_WEIGHTS = [5, 3, 2, 1.2];
const FONT = '"Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const METALS = {
  copper: { light:'#f0bd8d', base:'#d3924f', dark:'#a96a2f', text:'#7a4a1e' },
  silver: { light:'#f4f7f9', base:'#d5dade', dark:'#a7afb8', text:'#68707c' },
  gold:   { light:'#f9e6a4', base:'#e8c25c', dark:'#c39a33', text:'#8a6a1a' },
};

const MODES = {
  krw: {
    key:'krw', name:'원화', symbol:'₩',
    format: v => v.toLocaleString('ko-KR') + '원',
    tiers: [
      { kind:'coin', r:24, value:10,    label:'10',  sub:'원', metal:'copper' },
      { kind:'coin', r:30, value:50,    label:'50',  sub:'원', metal:'silver' },
      { kind:'coin', r:37, value:100,   label:'100', sub:'원', metal:'silver' },
      { kind:'coin', r:45, value:500,   label:'500', sub:'원', metal:'gold'   },
      { kind:'bill', w:124, h:58, value:1000,  corner:'1000',  name:'천원',   base:'#b7d3ee', edge:'#6e97c4', ink:'#3c6a9e', face:0 },
      { kind:'bill', w:148, h:70, value:5000,  corner:'5000',  name:'오천원', base:'#f6cfae', edge:'#d89a6a', ink:'#a5622e', face:1 },
      { kind:'bill', w:176, h:83, value:10000, corner:'10000', name:'만원',   base:'#bce3c3', edge:'#6fae7f', ink:'#3f7d51', face:2 },
      { kind:'bill', w:205, h:97, value:50000, corner:'50000', name:'오만원', base:'#f7dfa0', edge:'#d9b24a', ink:'#96731f', face:3 },
    ],
  },
  usd: {
    key:'usd', name:'달러', symbol:'$',
    format: v => v < 100
      ? v + '¢'
      : '$' + (v / 100).toLocaleString('en-US', { minimumFractionDigits: v % 100 ? 2 : 0, maximumFractionDigits: 2 }),
    tiers: [
      { kind:'coin', r:24, value:1,     label:'1',   sub:'¢', metal:'copper' },
      { kind:'coin', r:30, value:5,     label:'5',   sub:'¢', metal:'silver' },
      { kind:'coin', r:37, value:10,    label:'10',  sub:'¢', metal:'silver' },
      { kind:'coin', r:45, value:25,    label:'25',  sub:'¢', metal:'gold'   },
      { kind:'bill', w:124, h:58, value:100,   corner:'1',   name:'ONE',     base:'#c9dcc1', edge:'#87a983', ink:'#4e7a4a', face:0 },
      { kind:'bill', w:148, h:70, value:500,   corner:'5',   name:'FIVE',    base:'#d6d1ea', edge:'#9a92c4', ink:'#655a9e', face:1 },
      { kind:'bill', w:176, h:83, value:1000,  corner:'10',  name:'TEN',     base:'#f3d5b2', edge:'#cf9f6b', ink:'#a4713a', face:2 },
      { kind:'bill', w:205, h:97, value:10000, corner:'100', name:'HUNDRED', base:'#b9d9e1', edge:'#6fa6b4', ink:'#3f7b8c', face:3 },
    ],
  },
};

// ---------------------------------------------------------------- helpers
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function randTier() {
  const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
  let t = Math.random() * total;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    t -= SPAWN_WEIGHTS[i];
    if (t <= 0) return i;
  }
  return 0;
}
function halfW(def) { return def.kind === 'coin' ? def.r : def.w / 2; }
function halfH(def) { return def.kind === 'coin' ? def.r : def.h / 2; }

// ---------------------------------------------------------------- audio
// 효과음/배경음악을 각각 켜고 끌 수 있게 분리 (localStorage로 기기별 유지)
let audioCtx = null, sfxMuted = false, bgmMuted = false;
try {
  sfxMuted = localStorage.getItem('money-merge-mute-sfx') === '1';
  bgmMuted = localStorage.getItem('money-merge-mute-bgm') === '1';
} catch (e) {}
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  // Safari can land in a non-standard 'interrupted' state after calls/screen lock
  if (audioCtx && audioCtx.state !== 'running') audioCtx.resume();
}
function blip(freq, dur = 0.1, type = 'triangle', vol = 0.12, slide = 1, delay = 0) {
  if (sfxMuted || !audioCtx || audioCtx.state !== 'running') return;
  const t = audioCtx.currentTime + delay;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  drop:  () => blip(200, 0.06, 'sine', 0.07, 0.7),
  merge: t  => { blip(300 + t * 70, 0.12, 'triangle', 0.13, 1.5); blip((300 + t * 70) * 1.5, 0.1, 'triangle', 0.09, 1.4, 0.05); },
  jackpot: () => { [520, 660, 780, 1040].forEach((f, i) => blip(f, 0.16, 'triangle', 0.12, 1.1, i * 0.09)); },
  over: () => { [440, 350, 262].forEach((f, i) => blip(f, 0.22, 'sine', 0.12, 0.9, i * 0.18)); },
  record: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, 0.14, 'triangle', 0.12, 1.05, i * 0.07)); },
};

// 배경음악: 플레이 중에만 작게 깔림 (메뉴/게임오버/광고/백그라운드에서는 일시정지)
const BGM_VOL = 0.08;   // 효과음이 묻히지 않는 배경음악 볼륨
const bgm = new Audio('public/bgm/puzzle.mp3');
bgm.loop = true;
// iOS 웹뷰는 <audio>의 volume 속성을 무시하고 항상 최대 볼륨으로 재생한다.
// 실제로 줄이려면 WebAudio 게인 노드를 거쳐야 함 — 연결 성공 시 element 볼륨은
// 1로 두고 게인으로만 조절, 실패(구형 브라우저 등) 시 volume 폴백.
bgm.volume = BGM_VOL;
let bgmGain = null;
function ensureBgmChain() {
  if (bgmGain || !audioCtx) return;
  try {
    const src = audioCtx.createMediaElementSource(bgm);   // 엘리먼트당 1회만 가능
    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = BGM_VOL;
    src.connect(bgmGain);
    bgmGain.connect(audioCtx.destination);
    bgm.volume = 1;   // 게인과 이중으로 줄지 않게
  } catch (e) {}      // 실패하면 volume(0.08) 폴백 유지
}
function playBgm() {
  if (bgmMuted) return;
  ensureAudio();
  ensureBgmChain();
  const p = bgm.play();
  if (p && p.catch) p.catch(() => {});   // 자동재생 차단 등 실패는 조용히 무시
}
function pauseBgm() { bgm.pause(); }

// ---------------------------------------------------------------- state
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let mode = null;
let state = 'menu';               // menu | playing | over
let engine = null;
let score = 0;
let best = { krw: 0, usd: 0 };
let queue = [];                   // [current, next]
let canDrop = true;
let pendingNextAt = 0;            // timestamp when next piece becomes ready
let aimX = W / 2;
let aiming = false;
let activePointerId = null;
let roundStartBest = 0;
let overTimer = 0;
let combo = 0;
let comboExpires = 0;
let raining = false;         // 잭팟 후 보너스 레인 (입력 잠금)
let rainPlan = [];
let rainEndsAt = 0;
let autoDrop = false;        // ⚡ 토글: 길게 누르면 자동 드롭
let aimStartAt = 0;
let autoDroppedThisHold = false;
let shakeUntil = 0;          // 🌀 통 흔들기 종료 시각 (흔드는 동안 게임오버 없음)
let adOpen = false;          // 광고 팝업 열림 (물리·입력 정지)
let pendingAdAction = null;  // 'shake' | 'clean'
let adCountdown = null;
const MAX_FEAT = 3;          // 한 판에 흔들기/동전제거 각각 최대 사용 횟수
let featUses = { shake: MAX_FEAT, clean: MAX_FEAT };
let reviveUsed = false;      // 📺 부활은 한 판에 1회
let scoreSubmitted = false;  // 랭킹 중복 제출 방지 (한 판에 1번만)
let lastCheckpointScore = 0; // 백그라운드 전환 시 스냅샷 중복 방지용
const LIVE_SUBMIT_MS = 20000; // 플레이 중 실시간 랭킹 반영 주기
let lastLiveSubmitAt = 0;
let lastLiveScore = 0;       // 마지막으로 실시간 반영한 점수 (오른 경우에만 재전송)
let filling = false;         // ⏩ 자동 진행: 4/5 높이까지 동전 자동 투하
let fillNextAt = 0;
let fillSpawned = 0;
const FILL_TARGET = 0.8;     // 채움 목표 (놀이 공간 높이의 4/5)
const FILL_MAX_SPAWN = 120;  // 무한 투하 방지 상한
let danger = false;
let newRecord = false;
let floatTexts = [];
let particles = [];
let clouds = [
  { x: 60,  y: 120, s: 1.0, v: 0.008 },
  { x: 260, y: 210, s: 0.7, v: 0.012 },
  { x: 150, y: 320, s: 0.55, v: 0.01 },
];
const mergeSet = new Set();
let mergeQueue = [];

try {
  best.krw = +localStorage.getItem('money-merge-best-krw') || 0;
  best.usd = +localStorage.getItem('money-merge-best-usd') || 0;
} catch (e) {}

// 최고 기록을 서버(best_scores) 기준으로 동기화 — ranking.js가 로드 후
// '이번주' 내 기록(get_my_rank('week'))을 조회해서 호출한다. 서버가 랭킹의 실제
// 기준이므로 응답이 오면 로컬 캐시보다 우선한다 (주가 바뀌거나 DB에서 기록이
// 지워져 낮아지는 것도 그대로 반영).
// 조회 실패 시에는 아예 호출되지 않아 로컬 캐시가 유지된다 (오프라인 안전).
window.applyServerBest = sv => {
  sv = +sv || 0;
  // 진행 중인 판에서 이미 얻은 점수 아래로는 내리지 않음 (방금 세운 기록 보호)
  const floor = (state === 'playing' && mode && mode.key === 'krw') ? score : 0;
  const next = Math.max(sv, floor);
  if (next === best.krw) return;
  best.krw = next;
  try { localStorage.setItem('money-merge-best-krw', String(next)); } catch (e) {}
  // 판 도중 도착하면 새 기록 판정 기준도 서버 값으로 재설정
  if (state === 'playing' && mode && mode.key === 'krw' && !newRecord) {
    roundStartBest = sv;
  }
};

// ---------------------------------------------------------------- physics
function initEngine() {
  engine = Engine.create();
  engine.gravity.y = 1;
  const opts = { isStatic: true, friction: 0.6 };
  Composite.add(engine.world, [
    Bodies.rectangle(WALL_X - 40, H / 2, 80, H * 3, opts),          // left
    Bodies.rectangle(W - WALL_X + 40, H / 2, 80, H * 3, opts),      // right
    Bodies.rectangle(W / 2, FLOOR_TOP + 45, W * 2, 90, opts),       // floor
  ]);
  Events.on(engine, 'collisionStart', collectMerges);
  Events.on(engine, 'collisionActive', collectMerges);
}

function collectMerges(e) {
  for (const pair of e.pairs) {
    const a = pair.bodyA, b = pair.bodyB;
    const ma = a.plugin && a.plugin.money, mb = b.plugin && b.plugin.money;
    if (!ma || !mb || ma.tier !== mb.tier) continue;
    if (mergeSet.has(a.id) || mergeSet.has(b.id)) continue;
    mergeSet.add(a.id); mergeSet.add(b.id);
    mergeQueue.push([a, b]);
  }
}

function makePiece(tier, x, y) {
  const def = mode.tiers[tier];
  const phys = { restitution: 0.08, friction: 0.35, frictionStatic: 0.5, density: 0.0012 };
  let body;
  if (def.kind === 'coin') {
    body = Bodies.circle(x, y, def.r, phys);
  } else {
    body = Bodies.rectangle(x, y, def.w, def.h, { ...phys, chamfer: { radius: Math.min(14, def.h * 0.2) } });
  }
  body.plugin.money = { tier, born: performance.now() };
  Composite.add(engine.world, body);
  return body;
}

function moneyBodies() {
  return Composite.allBodies(engine.world).filter(b => b.plugin && b.plugin.money);
}

function processMerges(now) {
  for (const [a, b] of mergeQueue) {
    if (a.plugin.money.dead || b.plugin.money.dead) continue;
    const tier = a.plugin.money.tier;
    const def = mode.tiers[tier];
    const mx = (a.position.x + b.position.x) / 2;
    const my = (a.position.y + b.position.y) / 2;
    const vx = (a.velocity.x + b.velocity.x) / 2;
    const vy = (a.velocity.y + b.velocity.y) / 2;
    a.plugin.money.dead = b.plugin.money.dead = true;
    Composite.remove(engine.world, a);
    Composite.remove(engine.world, b);

    if (tier >= mode.tiers.length - 1) {
      // two biggest bills → jackpot: bonus, board reset, then a bonus rain
      let total = def.value * 4;
      if (state === 'playing') total = mergeScore(total, now).total;
      spawnBurst(mx, my, 34, ['#ffd76e', '#ffe9a8', '#fff', '#f7b2c4']);
      floatTexts.push({ x: mx, y: my, text: '💸 잭팟! +' + mode.format(total), t: 0, life: 1600, size: 24, color: '#e0608a' });
      sfx.jackpot();
      if (state === 'playing') startRain(now);
    } else {
      const nDef = mode.tiers[tier + 1];
      // clamp with the rotated extents, or a tilted bill can spawn inside the floor/walls
      const ang = nDef.kind === 'coin' ? 0 : a.angle;
      const extX = Math.abs(Math.cos(ang)) * halfW(nDef) + Math.abs(Math.sin(ang)) * halfH(nDef);
      const extY = Math.abs(Math.cos(ang)) * halfH(nDef) + Math.abs(Math.sin(ang)) * halfW(nDef);
      const nx = Math.min(W - WALL_X - extX, Math.max(WALL_X + extX, mx));
      const ny = Math.min(FLOOR_TOP - extY, my);
      const nb = makePiece(tier + 1, nx, ny);
      Body.setVelocity(nb, { x: vx, y: Math.min(vy, 0) - 1 });
      Body.setAngle(nb, ang);
      let total = nDef.value, comboNow = 0;
      if (state === 'playing') ({ total, combo: comboNow } = mergeScore(nDef.value, now));
      spawnBurst(mx, my, 10 + tier * 2, ['#fff', '#ffe9a8', hexA('#ffd76e', 0.9)]);
      floatTexts.push({ x: mx, y: my - 10, text: '+' + mode.format(total), t: 0, life: 1000, size: 15 + tier, color: '#f2789f' });
      if (comboNow >= 2) {
        floatTexts.push({ x: mx, y: my - 36, text: `🔥 ${comboNow}콤보!`, t: 0, life: 1100, size: Math.min(15 + comboNow * 2, 26), color: '#ff8c42' });
      }
      sfx.merge(tier);
    }
  }
  mergeQueue = [];
  mergeSet.clear();
}

function addScore(v) {
  score += v;
  if (score > best[mode.key]) {
    if (roundStartBest > 0 && score > roundStartBest && !newRecord) {
      newRecord = true;
      celebrateNewRecord();   // 이번 판에서 처음 넘어서는 순간 한 번만
    }
    best[mode.key] = score;
    try { localStorage.setItem('money-merge-best-' + mode.key, String(score)); } catch (e) {}
  }
}

// 🎉 최고 기록을 갱신하는 순간의 알림 연출
function celebrateNewRecord() {
  floatTexts.push({ x: W / 2, y: 260, text: '🎉 최고 기록 갱신!', t: 0, life: 2200, size: 30, color: '#e0608a' });
  spawnBurst(W / 2, 260, 40, ['#ffd76e', '#ffe9a8', '#fff', '#f7b2c4']);
  sfx.record();
}

// COMBO_MS 안에 연달아 합치면 콤보 — 콤보당 +10% 보너스 (최대 +100%)
function mergeScore(value, now) {
  combo = now < comboExpires ? combo + 1 : 1;
  comboExpires = now + COMBO_MS;
  const bonus = combo > 1 ? Math.round(value * 0.1 * Math.min(combo - 1, 10)) : 0;
  const total = value + bonus;
  addScore(total);
  return { total, combo };
}

// ---------------------------------------------------------------- bonus rain
function rainTier() {
  const w = [4, 3, 3, 2.2, 1.2, 0.6, 0.25];   // 동전 위주, 가끔 지폐 (최고 티어 제외)
  let t = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    t -= w[i];
    if (t <= 0) return i;
  }
  return 0;
}

function startRain(now) {
  raining = true;
  setFilling(false);          // 잭팟 리셋이 자동 진행보다 우선
  aiming = false;
  activePointerId = null;
  for (const b of moneyBodies()) {
    b.plugin.money.dead = true;
    spawnBurst(b.position.x, b.position.y, 5, ['#fff', '#ffe9a8', '#ffd76e']);
    Composite.remove(engine.world, b);
  }
  const count = 20 + Math.floor(Math.random() * 11);   // 20~30개
  rainPlan = [];
  let t = now + 600;
  for (let i = 0; i < count; i++) {
    const tier = rainTier();
    const margin = WALL_X + halfW(mode.tiers[tier]) + 4;
    rainPlan.push({ at: t, tier, x: margin + Math.random() * (W - margin * 2) });
    t += 90 + Math.random() * 130;
  }
  rainEndsAt = t + 1200;
}

function updateRain(now) {
  if (!raining) return;
  while (rainPlan.length && now >= rainPlan[0].at) {
    const r = rainPlan.shift();
    const b = makePiece(r.tier, r.x, DROP_Y - 20 - Math.random() * 50);
    Body.setVelocity(b, { x: (Math.random() - 0.5) * 2, y: 2 + Math.random() * 2 });
    blip(200 + r.tier * 40, 0.04, 'sine', 0.05);
  }
  if (!rainPlan.length && now >= rainEndsAt) raining = false;
}

// ⚡ 자동 드롭: 토글이 켜진 상태에서 350ms 이상 누르고 있으면 계속 떨어뜨림
function updateAuto(now) {
  if (!autoDrop || !aiming || raining || filling || !canDrop) return;
  if (now - aimStartAt < 350) return;
  drop(now);
  autoDroppedThisHold = true;
}

// ---------------------------------------------------------------- ⏩ 자동 진행
function setFilling(v) {
  filling = v;
  const btn = document.getElementById('btnFill');
  if (btn) btn.classList.toggle('on', v);
}

function startFill() {
  if (state !== 'playing' || raining || filling || adOpen) return;
  setFilling(true);
  fillSpawned = 0;
  fillNextAt = 0;
  aiming = false;
  activePointerId = null;
  floatTexts.push({ x: W / 2, y: 320, text: '⏩ 자동 진행!', t: 0, life: 1300, size: 24, color: '#8a6fd6' });
  blip(400, 0.12, 'triangle', 0.12, 1.4);
}

// 어느 정도 자리 잡은 조각이 목표 높이(4/5 지점)에 닿았는지
// 갓 스폰된 조각은 상단에서 느리게 태어나므로 나이 필터 없이는 즉시 오판된다
function fillTopReached() {
  const stopY = FLOOR_TOP - FILL_TARGET * (FLOOR_TOP - LINE_Y);
  const now = performance.now();
  for (const b of moneyBodies()) {
    if (now - b.plugin.money.born < 800) continue;   // 낙하 중인 새 조각 제외
    if (b.speed < 2 && b.bounds.min.y < stopY) return true;
  }
  return false;
}

function updateFill(now) {
  if (!filling) return;
  if (fillSpawned >= FILL_MAX_SPAWN || fillTopReached()) {
    setFilling(false);
    return;
  }
  if (now >= fillNextAt) {
    const tier = randTier();                        // 일반 드롭과 같은 동전 티어만
    const def = mode.tiers[tier];
    const margin = WALL_X + halfW(def) + 4;
    const b = makePiece(tier, margin + Math.random() * (W - margin * 2), DROP_Y - 10 - Math.random() * 30);
    Body.setVelocity(b, { x: (Math.random() - 0.5) * 1.5, y: 2 + Math.random() * 2 });
    blip(220 + tier * 40, 0.03, 'sine', 0.04);
    fillSpawned++;
    fillNextAt = now + 70 + Math.random() * 60;     // 우르르 쏟아지는 간격
  }
}

// ---------------------------------------------------------------- 🌀 통 흔들기
function startShake() {
  shakeUntil = performance.now() + 5000;
  floatTexts.push({ x: W / 2, y: 320, text: '🌀 통 흔들기!', t: 0, life: 1300, size: 24, color: '#5fa8e8' });
  blip(300, 0.15, 'triangle', 0.12, 1.4);
}

// 오뚜기처럼 통이 ±30도로 기울며 출렁임 (주기 ~0.94초)
const SHAKE_AMP = Math.PI / 6;
function shakeTilt(now) {
  return now < shakeUntil ? SHAKE_AMP * Math.sin(now / 150) : 0;
}

function updateShake(now) {
  if (now < shakeUntil) {
    const th = shakeTilt(now);
    // 기울어진 통 기준으로 중력 회전 + 수평 성분 증폭으로 화끈한 슬로싱
    engine.gravity.x = Math.sin(th) * 1.5;
    engine.gravity.y = Math.cos(th);
    // 자주 위로 튕기고 회전도 줘서 골고루 섞이게
    if (Math.random() < 0.3) {
      const bs = moneyBodies();
      if (bs.length) {
        const b = bs[(Math.random() * bs.length) | 0];
        Body.setVelocity(b, { x: b.velocity.x + (Math.random() - 0.5) * 9, y: b.velocity.y - 4 - Math.random() * 5 });
        Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.5);
      }
    }
  } else if (engine.gravity.x !== 0 || engine.gravity.y !== 1) {
    engine.gravity.x = 0;
    engine.gravity.y = 1;
  }
}

// ---------------------------------------------------------------- 🧹 동전 제거
function removeCoins() {
  let n = 0;
  for (const b of moneyBodies()) {
    if (mode.tiers[b.plugin.money.tier].kind !== 'coin') continue;
    b.plugin.money.dead = true;
    spawnBurst(b.position.x, b.position.y, 6, ['#fff', '#ffe9a8', '#ffd76e']);
    Composite.remove(engine.world, b);
    n++;
  }
  return n;
}

function cleanCoins() {
  const n = removeCoins();
  floatTexts.push({ x: W / 2, y: 320, text: `🧹 동전 ${n}개 정리!`, t: 0, life: 1300, size: 24, color: '#67b984' });
  blip(500, 0.12, 'triangle', 0.12, 1.5);
}

// ---------------------------------------------------------------- 💪 부활 (1회)
function doRevive() {
  reviveUsed = true;
  // 게임오버 때 true가 됐던 제출 플래그를 풀어야 부활 후 다시 죽거나 이탈할 때
  // 최종 점수가 제출된다 (서버는 upsert로 최고점만 유지하므로 중복 제출 안전)
  scoreSubmitted = false;
  removeCoins();
  // 남은 지폐들이 즉시 위험 판정되지 않게 유예 시간 리셋
  const now = performance.now();
  for (const b of moneyBodies()) b.plugin.money.born = now;
  overTimer = 0;
  danger = false;
  canDrop = true;
  pendingNextAt = 0;
  state = 'playing';
  syncPageBg('play');
  playBgm();
  document.getElementById('over').classList.add('hidden');
  floatTexts.push({ x: W / 2, y: 320, text: '💪 부활!', t: 0, life: 1500, size: 28, color: '#e0608a' });
  sfx.jackpot();
}

// ---------------------------------------------------------------- ⚠️ 재확인 팝업 (다시하기/홈)
// 플레이 중 HUD의 🔄/🏠 를 실수로 눌러 판이 날아가지 않도록 한 번 더 확인.
// 팝업이 열린 동안은 광고 팝업처럼 물리·입력이 정지된다 (step에서 confirmOpen 체크).
let confirmOpen = false;
let pendingConfirmAction = null;   // 'restart' | 'home'

function requestConfirm(kind) {
  if (state !== 'playing') { doConfirmAction(kind); return; }   // 진행 중인 판이 없으면 바로 실행
  if (adOpen || confirmOpen) return;
  pendingConfirmAction = kind;
  confirmOpen = true;
  aiming = false;
  activePointerId = null;
  const texts = {
    restart: { title: '🔄 다시하기', text: '지금 판을 처음부터 다시 시작할까요?\n지금까지 모은 점수는 랭킹에 저장돼요.' },
    home:    { title: '🏠 처음으로', text: '게임을 그만두고 첫 화면으로 나갈까요?\n지금까지 모은 점수는 랭킹에 저장돼요.' },
  };
  document.getElementById('confirmTitle').textContent = texts[kind].title;
  document.getElementById('confirmText').textContent = texts[kind].text;
  document.getElementById('confirmDlg').classList.remove('hidden');
}

function closeConfirm() {
  confirmOpen = false;
  pendingConfirmAction = null;
  document.getElementById('confirmDlg').classList.add('hidden');
}

function doConfirmAction(kind) {
  finalizeAbandon(false);
  if (kind === 'restart') { if (mode) startGame(mode.key); }
  else goMenu();
}

// ---------------------------------------------------------------- 📺 광고 게이트
function requestAdFeature(kind) {
  if (adOpen) return;
  if (kind === 'revive') {
    if (state !== 'over' || reviveUsed) return;
  } else {
    if (state !== 'playing' || raining || filling) return;
    if (featUses[kind] <= 0) return;
    if (kind === 'shake' && performance.now() < shakeUntil) return;
  }
  pendingAdAction = kind;
  adOpen = true;
  aiming = false;
  activePointerId = null;
  if (kind === 'revive') {
    // 게임오버 버튼 자체가 이미 "광고 보고 부활"이므로 확인 없이 바로 광고 재생
    playAd();
    return;
  }
  const coinLabel = mode.key === 'krw' ? '500원 이하 동전' : '25¢ 이하 동전';
  const texts = {
    shake: '광고를 보면 통을 좌우로 5초간 흔들어서\n돈을 골고루 섞을 수 있어요!',
    clean: `광고를 보면 ${coinLabel}을 모두 제거해서\n공간을 확보할 수 있어요!`,
  };
  document.getElementById('adConfirmText').textContent = texts[kind];
  document.getElementById('adConfirm').classList.remove('hidden');
}

function closeAd() {
  adOpen = false;
  pendingAdAction = null;
  if (adCountdown) { clearInterval(adCountdown); adCountdown = null; }
  document.getElementById('adConfirm').classList.add('hidden');
  document.getElementById('adPlay').classList.add('hidden');
  // 실광고 로딩 표시에서 바꾼 요소 원복
  document.getElementById('adBox').classList.remove('hidden');
  document.getElementById('adCount').classList.remove('hidden');
  document.getElementById('adPlayMsg').textContent = '잠시 후 기능이 실행됩니다…';
  if (state === 'playing') playBgm();
}

// 토스 앱·구글플레이 앱 안이면 실제 보상형 광고, 밖(일반 브라우저)이면 시뮬레이션 광고.
// 브리지는 js/toss-ads.js 또는 js/admob-ads.js 중 하나가 올린다 (둘 다 같은 인터페이스).
function playAd() {
  if (!pendingAdAction) return;   // 확인 팝업 흐름 밖에서 불리면 무시
  const bridge = window.AdsBridge;
  if (bridge && bridge.rewardedAvailable()) playRewardedAd(bridge);
  else playTestAd();
}

// 광고 시청 완료(userEarnedReward) 시에만 기능 실행 — 중간에 닫으면 사용 안 됨
function playRewardedAd(bridge) {
  pauseBgm();
  document.getElementById('adConfirm').classList.add('hidden');
  const adPlayEl = document.getElementById('adPlay');
  document.getElementById('adBox').classList.add('hidden');
  document.getElementById('adCount').classList.add('hidden');
  document.getElementById('adPlayMsg').textContent = '📺 광고 불러오는 중…';
  adPlayEl.classList.remove('hidden');
  let charged = false;   // onEarned에서 횟수를 이미 차감했는지 (onFinish 중복 차감 방지)
  bridge.showRewarded({
    onShow: () => adPlayEl.classList.add('hidden'),   // 네이티브 광고가 화면을 덮음
    // 보상 확정 즉시 횟수 차감 + 배지 갱신 — 일부 토스앱은 dismissed가 늦거나
    // 안 와서(최대 10초 타임아웃) onFinish만 기다리면 차감 표시가 한참 늦게 보임
    onEarned: () => {
      const action = pendingAdAction;
      if (action && action !== 'revive' && state === 'playing' && featUses[action] > 0) {
        featUses[action]--;
        updateFeatUi();
        charged = true;
      }
    },
    onFinish: (earned) => {
      const action = pendingAdAction;
      closeAd();
      if (!earned) {
        floatTexts.push({ x: W / 2, y: 320, text: '광고를 끝까지 보면 사용할 수 있어요', t: 0, life: 1600, size: 16, color: '#8a90a5' });
        return;
      }
      blip(880, 0.12, 'triangle', 0.1);
      if (action === 'revive') {
        if (state === 'over' && !reviveUsed) doRevive();
      } else if (state === 'playing' && action && (charged || featUses[action] > 0)) {
        if (!charged) {          // onEarned를 못 받은 경우의 안전망 (기존 동작)
          featUses[action]--;
          updateFeatUi();
        }
        if (action === 'shake') startShake();
        else if (action === 'clean') cleanCoins();
      }
    },
    onFail: () => {
      closeAd();
      floatTexts.push({ x: W / 2, y: 320, text: '광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요', t: 0, life: 1800, size: 15, color: '#8a90a5' });
    },
  });
}

function playTestAd() {
  pauseBgm();
  document.getElementById('adConfirm').classList.add('hidden');
  const adPlayEl = document.getElementById('adPlay');
  const countEl = document.getElementById('adCount');
  let n = 3;
  countEl.textContent = String(n);
  adPlayEl.classList.remove('hidden');
  adCountdown = setInterval(() => {
    n--;
    if (n > 0) {
      countEl.textContent = String(n);
      blip(600, 0.05, 'sine', 0.06);
    } else {
      const action = pendingAdAction;
      closeAd();
      blip(880, 0.12, 'triangle', 0.1);
      if (action === 'revive') {
        if (state === 'over' && !reviveUsed) doRevive();
      } else if (state === 'playing' && action && featUses[action] > 0) {
        featUses[action]--;
        updateFeatUi();
        if (action === 'shake') startShake();
        else if (action === 'clean') cleanCoins();
      }
    }
  }, 1000);
}

function spawnBurst(x, y, n, colors) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = 1 + Math.random() * 3.5;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
      r: 2 + Math.random() * 3.5,
      color: colors[(Math.random() * colors.length) | 0],
      t: 0, life: 500 + Math.random() * 400,
    });
  }
}

// ---------------------------------------------------------------- game flow
// 토스 전체화면에서는 상태바 뒤 영역(body 배경)이 그대로 보이므로,
// 캔버스 상단과 같은 색으로 맞춰야 화면이 한 장처럼 이어진다.
// - play: 캔버스 하늘 그라데이션의 맨 위 색 (#b7dcf5, drawBackground)
// - overlay: 메뉴/게임오버/랭킹 오버레이 색을 하늘 위에 합성한 색
function syncPageBg(kind) {
  if (!document.body.classList.contains('in-toss')) return;
  document.body.style.background = kind === 'play' ? '#b7dcf5' : '#d4edfb';
}

function startGame(modeKey) {
  mode = MODES[modeKey];
  if (!engine) initEngine();
  resetBoard();
  syncPageBg('play');
  // 지난 판/지난 세션에서 자동 드롭을 켜둔 채 시작하면 사용법을 한 번 상기
  if (autoDrop) {
    floatTexts.push({ x: W / 2, y: 300, text: '자동 드롭 ON — 꾹 누르고 있으면 계속 떨어져요', t: 0, life: 2000, size: 15, color: '#e8961e' });
  }
  state = 'playing';
  playBgm();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('over').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('hudR').classList.remove('hidden');
}

function resetBoard() {
  for (const b of moneyBodies()) Composite.remove(engine.world, b);
  mergeQueue = [];
  mergeSet.clear();
  floatTexts = [];
  particles = [];
  score = 0;
  overTimer = 0;
  danger = false;
  newRecord = false;
  roundStartBest = best[mode.key];
  canDrop = true;
  pendingNextAt = 0;
  aimX = W / 2;
  aiming = false;
  activePointerId = null;
  combo = 0;
  comboExpires = 0;
  raining = false;
  rainPlan = [];
  rainEndsAt = 0;
  autoDroppedThisHold = false;
  shakeUntil = 0;
  if (engine) { engine.gravity.x = 0; engine.gravity.y = 1; }
  closeAd();
  closeConfirm();
  featUses = { shake: MAX_FEAT, clean: MAX_FEAT };
  reviveUsed = false;
  scoreSubmitted = false;
  lastCheckpointScore = 0;
  lastLiveSubmitAt = performance.now();   // 시작 직후가 아니라 한 주기 뒤부터 반영
  lastLiveScore = 0;
  setFilling(false);
  fillSpawned = 0;
  fillNextAt = 0;
  updateFeatUi();
  queue = [randTier(), randTier()];
}

function drop(now) {
  if (state !== 'playing' || !canDrop || raining || filling) return;
  const def = mode.tiers[queue[0]];
  const x = Math.min(W - WALL_X - halfW(def) - 2, Math.max(WALL_X + halfW(def) + 2, aimX));
  makePiece(queue[0], x, DROP_Y);
  sfx.drop();
  canDrop = false;
  pendingNextAt = now + 550;
}

function updateQueue(now) {
  if (!canDrop && pendingNextAt && now >= pendingNextAt) {
    queue.shift();
    queue.push(randTier());
    canDrop = true;
    pendingNextAt = 0;
  }
}

function checkGameOver(now, dt) {
  danger = false;
  for (const b of moneyBodies()) {
    if (now - b.plugin.money.born < 1500) continue;          // 갓 떨어진 돈은 1.5초 유예
    if (b.position.y < LINE_Y && b.speed < 1.2) {            // 중심이 선 위 + 거의 정지 상태만 위험
      danger = true;
      break;
    }
  }
  if (danger) overTimer += dt;
  else overTimer = 0;                                        // 선 아래로 내려가면 즉시 리셋
  if (overTimer > OVER_MS) gameOver();
}

function gameOver() {
  state = 'over';
  pauseBgm();
  sfx.over();
  if (!scoreSubmitted && window.Ranking) {
    scoreSubmitted = true;
    window.Ranking.submitScore(score);   // 랭킹 서버에 기록 제출
  }
  const overEl = document.getElementById('over');
  document.getElementById('finalScore').textContent = mode.format(score);
  document.getElementById('finalBest').textContent =
    (newRecord ? '🎉 새 기록! ' : '👑 이번주 최고 ') + mode.format(best[mode.key]);
  document.getElementById('btnRevive').classList.toggle('hidden', reviveUsed);
  if (window.Ranking) window.Ranking.refreshNickDisplays();
  setTimeout(() => {
    if (state !== 'over') return;
    overEl.classList.remove('hidden');
    syncPageBg('overlay');
  }, 600);
}

// 재시작/홈/탭종료처럼 이번 판이 확실히 끝나는 이탈: 그 시점 점수를 확정 제출
function finalizeAbandon(beacon) {
  if (state !== 'playing' || scoreSubmitted || score <= 0 || !window.Ranking) return;
  scoreSubmitted = true;
  if (beacon) window.Ranking.submitScoreBeacon(score);
  else window.Ranking.submitScore(score);
}

// 플레이 중 점수가 오르면 주기적으로 랭킹에 실시간 반영.
// v2(upsert)에서만 실제 전송되므로 아무리 자주 보내도 아이디당 최고기록 1행만 유지된다.
// (v1 폴백에서는 행이 판마다 늘어나는 문제 때문에 ranking.js가 조용히 건너뜀)
function maybeLiveSubmit(now) {
  if (score <= lastLiveScore || now - lastLiveSubmitAt < LIVE_SUBMIT_MS) return;
  if (!window.Ranking || !window.Ranking.submitScoreLive) return;
  lastLiveSubmitAt = now;
  lastLiveScore = score;
  window.Ranking.submitScoreLive(score);
}

// 탭 백그라운드 전환처럼 다시 돌아와 이어할 수도 있는 경우: 진행 상황을 스냅샷만 저장
// (scoreSubmitted를 확정하지 않아, 나중에 진짜 게임오버로 이어지면 최종 점수가 정상 제출됨)
function checkpointAbandon() {
  if (state !== 'playing' || scoreSubmitted || score <= lastCheckpointScore || !window.Ranking) return;
  lastCheckpointScore = score;
  window.Ranking.submitScoreBeacon(score);
}

function goMenu() {
  state = 'menu';
  syncPageBg('overlay');
  pauseBgm();
  if (engine) for (const b of moneyBodies()) Composite.remove(engine.world, b);
  closeAd();
  closeConfirm();
  document.getElementById('over').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('hudR').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
}

// ---------------------------------------------------------------- drawing
function drawCoin(c, def, forcePlain) {
  const r = def.r, pal = METALS[def.metal];
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.62, pal.base);
  g.addColorStop(1, pal.dark);
  c.beginPath(); c.arc(0, 0, r, 0, TAU);
  c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(2, r * 0.09);
  c.strokeStyle = pal.dark; c.stroke();

  // rim ticks
  c.strokeStyle = hexA(pal.dark, 0.5);
  c.lineWidth = 1.5;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    c.beginPath();
    c.moveTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
    c.lineTo(Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96);
    c.stroke();
  }

  // inner disc
  c.beginPath(); c.arc(0, 0, r * 0.7, 0, TAU);
  c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill();
  c.lineWidth = 1.2; c.strokeStyle = hexA(pal.dark, 0.45); c.stroke();

  // label
  c.fillStyle = pal.text;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `800 ${r * (def.label.length <= 2 ? 0.6 : 0.48)}px ${FONT}`;
  c.fillText(def.label, 0, -r * 0.08);
  c.font = `700 ${r * 0.3}px ${FONT}`;
  c.fillText(def.sub, 0, r * 0.4);

  // shine
  if (!forcePlain) {
    c.beginPath(); c.arc(0, 0, r * 0.82, -TAU * 0.42, -TAU * 0.3);
    c.lineWidth = r * 0.1; c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
  }
}

function drawFace(c, style, ink, w, h, symbol) {
  const ox = w * 0.155, oy = h * 0.3;
  const ex = ox * 0.48, ey = -oy * 0.18;
  const eyeR = Math.max(2, h * 0.042);
  c.fillStyle = ink; c.strokeStyle = ink;
  c.lineWidth = Math.max(1.4, h * 0.022); c.lineCap = 'round';
  c.textAlign = 'center'; c.textBaseline = 'middle';

  if (style === 0) {           // dot eyes
    c.beginPath(); c.arc(-ex, ey, eyeR, 0, TAU); c.fill();
    c.beginPath(); c.arc(ex, ey, eyeR, 0, TAU); c.fill();
  } else if (style === 1) {    // happy closed eyes ⌒⌒
    c.beginPath(); c.arc(-ex, ey + eyeR, eyeR * 1.5, Math.PI, TAU); c.stroke();
    c.beginPath(); c.arc(ex, ey + eyeR, eyeR * 1.5, Math.PI, TAU); c.stroke();
  } else if (style === 2) {    // star eyes
    c.font = `800 ${h * 0.11}px ${FONT}`;
    c.fillText('✦', -ex, ey); c.fillText('✦', ex, ey);
  } else {                     // currency-symbol eyes
    c.font = `800 ${h * 0.12}px ${FONT}`;
    c.fillText(symbol, -ex, ey); c.fillText(symbol, ex, ey);
  }

  // mouth
  if (style === 3) {
    c.beginPath(); c.arc(0, oy * 0.22, ox * 0.3, 0, Math.PI); c.fill();
  } else {
    c.beginPath(); c.arc(0, oy * 0.18, ox * 0.3, TAU * 0.08, TAU * 0.42); c.stroke();
  }

  // blush
  c.fillStyle = 'rgba(255,150,160,0.5)';
  c.beginPath(); c.arc(-ox * 0.78, oy * 0.28, h * 0.045, 0, TAU); c.fill();
  c.beginPath(); c.arc(ox * 0.78, oy * 0.28, h * 0.045, 0, TAU); c.fill();
  c.lineCap = 'butt';
}

function drawBill(c, def, symbol) {
  const w = def.w, h = def.h;
  const rr = Math.min(12, h * 0.16);

  roundRect(c, -w / 2, -h / 2, w, h, rr);
  c.fillStyle = def.base; c.fill();
  c.lineWidth = 3; c.strokeStyle = def.edge; c.stroke();

  // inner dashed frame
  roundRect(c, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, rr * 0.6);
  c.setLineDash([5, 4]);
  c.lineWidth = 1.4; c.strokeStyle = hexA(def.edge, 0.85); c.stroke();
  c.setLineDash([]);

  // watermark circles
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath(); c.arc(-w * 0.31, 0, h * 0.2, 0, TAU); c.fill();
  c.beginPath(); c.arc(w * 0.31, 0, h * 0.2, 0, TAU); c.fill();

  // corner numbers
  c.fillStyle = def.ink;
  c.font = `800 ${h * 0.17}px ${FONT}`;
  c.textBaseline = 'top';
  c.textAlign = 'left';  c.fillText(def.corner, -w / 2 + 11, -h / 2 + 9);
  c.textAlign = 'right'; c.fillText(def.corner, w / 2 - 11, -h / 2 + 9);
  c.textBaseline = 'bottom';
  c.textAlign = 'left';  c.fillText(def.corner, -w / 2 + 11, h / 2 - 8);
  c.textAlign = 'right'; c.fillText(def.corner, w / 2 - 11, h / 2 - 8);

  // portrait oval + face
  c.beginPath(); c.ellipse(0, 0, w * 0.155, h * 0.3, 0, 0, TAU);
  c.fillStyle = '#fffdf2'; c.fill();
  c.lineWidth = 2; c.strokeStyle = def.edge; c.stroke();
  drawFace(c, def.face, def.ink, w, h, symbol);

  // name
  c.fillStyle = hexA(def.ink, 0.9);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = `700 ${h * 0.13}px ${FONT}`;
  c.fillText(def.name, 0, h / 2 - 7);
}

function drawPiece(c, def) {
  if (def.kind === 'coin') drawCoin(c, def);
  else drawBill(c, def, mode.symbol);
}

function drawBackground(now, dt) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#b7dcf5');
  g.addColorStop(0.65, '#e2f3fc');
  g.addColorStop(1, '#eefaf0');
  ctx.fillStyle = g;
  // 흔들기 회전 중에는 모서리가 비지 않게 넓게 칠함
  if (now < shakeUntil) ctx.fillRect(-W, -H, W * 3, H * 3);
  else ctx.fillRect(0, 0, W, H);

  // clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const cl of clouds) {
    cl.x += cl.v * dt;
    if (cl.x > W + 70) cl.x = -70;
    const s = cl.s;
    ctx.beginPath();
    ctx.arc(cl.x, cl.y, 22 * s, 0, TAU);
    ctx.arc(cl.x + 24 * s, cl.y - 8 * s, 17 * s, 0, TAU);
    ctx.arc(cl.x + 46 * s, cl.y, 19 * s, 0, TAU);
    ctx.arc(cl.x + 22 * s, cl.y + 9 * s, 16 * s, 0, TAU);
    ctx.fill();
  }

  // hills
  ctx.fillStyle = '#aedaa5';
  ctx.beginPath(); ctx.ellipse(W * 0.22, H + 30, 270, 105, 0, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = '#93cf8e';
  ctx.beginPath(); ctx.ellipse(W * 0.82, H + 40, 290, 125, 0, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = '#7cc47c';
  if (now < shakeUntil) ctx.fillRect(-W, H - 22, W * 3, 22 + H);
  else ctx.fillRect(0, H - 22, W, 22);

  if (state === 'menu') return;

  // side guide lines (pink / blue, like the sample)
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(247,143,179,0.8)';
  ctx.beginPath(); ctx.moveTo(WALL_X, LINE_Y); ctx.lineTo(WALL_X, FLOOR_TOP); ctx.stroke();
  ctx.strokeStyle = 'rgba(95,168,232,0.8)';
  ctx.beginPath(); ctx.moveTo(W - WALL_X, LINE_Y); ctx.lineTo(W - WALL_X, FLOOR_TOP); ctx.stroke();

  // danger line
  const flashing = overTimer > 0;
  const alpha = flashing ? 0.45 + 0.4 * Math.sin(now / 70) : 0.3;
  ctx.setLineDash([8, 7]);
  ctx.lineWidth = flashing ? 3 : 2;
  ctx.strokeStyle = `rgba(240,80,95,${Math.max(0.15, alpha)})`;
  ctx.beginPath(); ctx.moveTo(WALL_X, LINE_Y); ctx.lineTo(W - WALL_X, LINE_Y); ctx.stroke();
  ctx.setLineDash([]);
}

function drawBodies() {
  for (const b of moneyBodies()) {
    const def = mode.tiers[b.plugin.money.tier];
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    drawPiece(ctx, def);
    ctx.restore();
  }
}

function drawHeld(now) {
  if (state !== 'playing' || !canDrop || raining || filling) return;
  const def = mode.tiers[queue[0]];
  const x = Math.min(W - WALL_X - halfW(def) - 2, Math.max(WALL_X + halfW(def) + 2, aimX));
  const y = DROP_Y + Math.sin(now / 300) * 3;

  // guide line
  ctx.setLineDash([6, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(90,110,140,0.25)';
  ctx.beginPath(); ctx.moveTo(x, y + halfH(def)); ctx.lineTo(x, FLOOR_TOP); ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.translate(x, y);
  drawPiece(ctx, def);
  ctx.restore();
}

function drawHud() {
  if (state === 'menu') return;

  // score pill — 금액만 표시. 최고 기록 갱신 중이면 (최고) 접두 + 금색 강조
  const hudNow = performance.now();
  const pw = 216, ph = 44, px = W / 2 - pw / 2, py = 10;
  if (newRecord) {
    const glow = 0.5 + 0.5 * Math.sin(hudNow / 180);
    ctx.save();
    ctx.shadowColor = `rgba(255,170,40,${0.35 + 0.45 * glow})`;
    ctx.shadowBlur = 12 + 10 * glow;
    roundRect(ctx, px, py, pw, ph, 22);
    ctx.fillStyle = 'rgba(255,178,64,0.97)'; ctx.fill();
    ctx.restore();
    roundRect(ctx, px, py, pw, ph, 22);
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,235,170,${0.6 + 0.4 * glow})`; ctx.stroke();
  } else {
    roundRect(ctx, px, py, pw, ph, 22);
    ctx.fillStyle = 'rgba(247,143,179,0.95)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 21px ${FONT}`;
  ctx.fillText((newRecord ? '(최고) ' : '') + mode.format(score), W / 2, py + ph / 2 + 1);

  if (combo >= 2 && hudNow < comboExpires) {
    ctx.fillStyle = '#ff8c42';
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(`🔥 ${combo} 콤보!`, W / 2, py + ph + 16);
  }
  if (raining) {
    ctx.fillStyle = `rgba(224,96,138,${0.7 + 0.3 * Math.sin(hudNow / 120)})`;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText('💰 보너스 타임!', W / 2, 132);
  }
  if (filling) {
    ctx.fillStyle = `rgba(138,111,214,${0.7 + 0.3 * Math.sin(hudNow / 120)})`;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText('⏩ 자동 진행 중', W / 2, 132);
  }
  if (hudNow < shakeUntil) {
    ctx.fillStyle = `rgba(95,168,232,${0.7 + 0.3 * Math.sin(hudNow / 120)})`;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(`🌀 흔드는 중! ${Math.ceil((shakeUntil - hudNow) / 1000)}초`, W / 2, 158);
  }

  // 위험 카운트다운 게이지 (남은 시간이 줄어드는 바)
  if (state === 'playing' && overTimer > 0) {
    const remain = Math.max(0, OVER_MS - overTimer);
    const frac = remain / OVER_MS;
    const bw = 160, bh = 10, bx = W / 2 - bw / 2, by = LINE_Y - 28;
    roundRect(ctx, bx, by, bw, bh, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    if (frac > 0) {
      roundRect(ctx, bx, by, Math.max(bh, bw * frac), bh, 5);
      ctx.fillStyle = '#f0505f';
      ctx.fill();
    }
    ctx.fillStyle = '#f0505f';
    ctx.font = `800 14px ${FONT}`;
    ctx.fillText(`⚠️ ${(remain / 1000).toFixed(1)}초`, W / 2, by - 11);
  }

}

function drawFx(dt) {
  for (const p of particles) {
    p.t += dt;
    p.x += p.vx * dt * 0.06;
    p.y += p.vy * dt * 0.06;
    p.vy += dt * 0.009;
    const a = Math.max(0, 1 - p.t / p.life);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  particles = particles.filter(p => p.t < p.life);

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of floatTexts) {
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) continue;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    ctx.font = `800 ${f.size}px ${FONT}`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeText(f.text, f.x, f.y - k * 46);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - k * 46);
  }
  ctx.globalAlpha = 1;
  floatTexts = floatTexts.filter(f => f.t < f.life);

  // danger tint
  if (state === 'playing' && overTimer > 0) {
    ctx.fillStyle = `rgba(240,80,95,${0.05 + 0.05 * Math.sin(performance.now() / 70)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------------------------------------------------------------- main loop
function step(now, dt) {
  if (adOpen || confirmOpen) return;   // 광고/재확인 팝업 동안 게임 일시정지
  if (engine && state !== 'menu') {
    if (state === 'playing') updateShake(now);
    Engine.update(engine, dt);
    processMerges(now);
    if (state === 'playing') {
      updateRain(now);
      updateFill(now);
      updateAuto(now);
      updateQueue(now);
      if (raining || filling || now < shakeUntil) {
        danger = false;
        overTimer = 0;
      } else {
        checkGameOver(now, dt);
      }
      if (combo && now >= comboExpires) combo = 0;
      maybeLiveSubmit(now);
    }
  }
}

function render(now, dt) {
  // 흔들기 연출: 통 바닥 중심을 축으로 배경+돈이 통째로 기울어짐 (오뚜기)
  const th = shakeTilt(now);
  if (th) {
    ctx.save();
    ctx.translate(W / 2, FLOOR_TOP);
    ctx.rotate(th);
    ctx.translate(-W / 2, -FLOOR_TOP);
  }
  drawBackground(now, dt);
  if (engine && state !== 'menu' && mode) {
    drawBodies();
    drawFx(dt);
  }
  if (th) ctx.restore();
  if (engine && state !== 'menu' && mode) {
    drawHeld(now);
    drawHud();
  }
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(33, now - last);
  last = now;
  step(now, dt);
  render(now, dt);
}

// ---------------------------------------------------------------- input
function toGameX(e) {
  const rect = canvas.getBoundingClientRect();
  return (e.clientX - rect.left) / rect.width * W;
}
canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  if (state !== 'playing' || raining || filling) return;
  if (e.button !== 0 || !e.isPrimary) return;
  aiming = true;
  activePointerId = e.pointerId;
  aimX = toGameX(e);
  aimStartAt = performance.now();
  autoDroppedThisHold = false;
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (state !== 'playing') return;
  // while aiming only the initiating pointer steers; otherwise mouse hover aims
  if (aiming ? e.pointerId === activePointerId : e.pointerType === 'mouse') aimX = toGameX(e);
});
window.addEventListener('pointerup', e => {
  ensureAudio();
  if (!aiming || e.pointerId !== activePointerId) return;
  aiming = false;
  activePointerId = null;
  if (state !== 'playing') return;
  if (autoDroppedThisHold) {          // 자동 드롭이 이미 나갔으면 릴리즈 드롭 생략
    autoDroppedThisHold = false;
    return;
  }
  aimX = toGameX(e);
  drop(performance.now());
});
window.addEventListener('pointercancel', e => {
  if (e.pointerId === activePointerId) { aiming = false; activePointerId = null; }
});
window.addEventListener('blur', () => { aiming = false; activePointerId = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseBgm(); return; }   // 백그라운드에서는 배경음악도 멈춤
  ensureAudio();
  if (state === 'playing' && !adOpen) playBgm();
});

// ---------------------------------------------------------------- buttons & menu
document.querySelectorAll('#menu button.mode').forEach(btn => {
  btn.addEventListener('click', () => { ensureAudio(); startGame(btn.dataset.mode); });
});
document.getElementById('btnAgain').addEventListener('click', () => startGame(mode.key));
document.getElementById('btnMenu').addEventListener('click', goMenu);
document.getElementById('btnHome').addEventListener('click', () => requestConfirm('home'));
document.getElementById('btnRestart').addEventListener('click', () => requestConfirm('restart'));
document.getElementById('btnConfirmOk').addEventListener('click', () => {
  const a = pendingConfirmAction;
  closeConfirm();
  if (a) doConfirmAction(a);
});
document.getElementById('btnConfirmCancel').addEventListener('click', closeConfirm);

// 탭 종료/새로고침 시에도 진행 중이던 점수를 잃지 않도록 저장.
// visibilitychange(hidden)는 백그라운드 전환에서도 뜨므로 확정 짓지 않고 스냅샷만 남겨
// 다시 돌아와 이어하다 진짜 게임오버가 나면 최종 점수가 정상적으로 덮어 제출되게 한다.
window.addEventListener('pagehide', () => finalizeAbandon(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) checkpointAbandon(); });
// 효과음/배경음악 개별 토글
const btnSfx = document.getElementById('btnSfx');
const btnBgm = document.getElementById('btnBgm');
function renderSoundBtns() {
  // 꺼짐 표시는 두 버튼 모두 같은 빨간 빗금(CSS .mutedOff)으로 통일
  btnSfx.classList.toggle('mutedOff', sfxMuted);
  btnBgm.classList.toggle('mutedOff', bgmMuted);
}
btnSfx.addEventListener('click', () => {
  ensureAudio();
  sfxMuted = !sfxMuted;
  try { localStorage.setItem('money-merge-mute-sfx', sfxMuted ? '1' : '0'); } catch (e) {}
  renderSoundBtns();
  if (!sfxMuted) blip(660, 0.08, 'triangle', 0.1);   // 켜짐 확인음
});
btnBgm.addEventListener('click', () => {
  ensureAudio();
  bgmMuted = !bgmMuted;
  try { localStorage.setItem('money-merge-mute-bgm', bgmMuted ? '1' : '0'); } catch (e) {}
  renderSoundBtns();
  if (bgmMuted) pauseBgm();
  else if (state === 'playing' && !adOpen) playBgm();
});
renderSoundBtns();
const btnAuto = document.getElementById('btnAuto');
try { autoDrop = localStorage.getItem('money-merge-auto') === '1'; } catch (e) {}
btnAuto.classList.toggle('on', autoDrop);
btnAuto.addEventListener('click', () => {
  autoDrop = !autoDrop;
  btnAuto.classList.toggle('on', autoDrop);
  try { localStorage.setItem('money-merge-auto', autoDrop ? '1' : '0'); } catch (e) {}
  // 아이콘만으로는 "꾹 누르면 자동"이 전달되지 않아, 토글할 때마다 사용법을 화면에 안내
  floatTexts.push(autoDrop
    ? { x: W / 2, y: 300, text: '자동 드롭 ON — 꾹 누르고 있으면 계속 떨어져요!', t: 0, life: 2000, size: 16, color: '#e8961e' }
    : { x: W / 2, y: 300, text: '자동 드롭 OFF', t: 0, life: 1100, size: 15, color: '#8a90a5' });
});
const btnShake = document.getElementById('btnShake');
const btnClean = document.getElementById('btnClean');
btnShake.addEventListener('click', () => { ensureAudio(); requestAdFeature('shake'); });
btnClean.addEventListener('click', () => { ensureAudio(); requestAdFeature('clean'); });
document.getElementById('btnFill').addEventListener('click', () => {
  ensureAudio();
  if (filling) setFilling(false);   // 진행 중 다시 누르면 취소
  else startFill();
});
document.getElementById('btnRevive').addEventListener('click', () => { ensureAudio(); requestAdFeature('revive'); });
document.getElementById('btnAdOk').addEventListener('click', playAd);
document.getElementById('btnAdCancel').addEventListener('click', closeAd);

// 남은 횟수 배지 + 소진 시 빨간 비활성화
function updateFeatUi() {
  for (const [kind, btn] of [['shake', btnShake], ['clean', btnClean]]) {
    const left = featUses[kind];
    // 배지는 실제 요소의 텍스트로 그린다. data 속성 + CSS attr()로 그리던 때는
    // 광고가 웹뷰를 덮은 사이 값이 바뀌면 돌아와도 옛 숫자가 남아 있었다 (index.html .cnt 참고)
    const cnt = btn.querySelector('.cnt');
    if (cnt) cnt.textContent = left;
    btn.dataset.count = left;   // 디버깅·테스트용으로 남겨 둔다
    btn.classList.toggle('off', left <= 0);
    btn.disabled = left <= 0;
  }
}
updateFeatUi();

// evolution chain previews on the menu
function buildChain(elId, m) {
  const el = document.getElementById(elId);
  const SC = 0.4;
  m.tiers.forEach((def, i) => {
    if (i > 0) {
      const a = document.createElement('span');
      a.className = 'arrow'; a.textContent = '▸';
      el.appendChild(a);
    }
    const s = document.createElement('span');
    if (def.kind === 'coin') {
      const pal = METALS[def.metal];
      const d = def.r * 2 * SC;
      s.className = 'coin';
      s.style.width = s.style.height = d + 'px';
      s.style.background = `radial-gradient(circle at 35% 30%, ${pal.light}, ${pal.base} 60%, ${pal.dark})`;
      s.style.color = pal.text;
      s.style.fontSize = Math.max(7, d * 0.34) + 'px';
      s.textContent = def.label;
    } else {
      s.className = 'bill';
      s.style.width = def.w * SC + 'px';
      s.style.height = def.h * SC + 'px';
      s.style.background = def.base;
      s.style.borderColor = def.edge;
      s.style.color = def.ink;
      s.style.fontSize = Math.max(8, def.h * SC * 0.34) + 'px';
      s.textContent = def.corner;
    }
    el.appendChild(s);
  });
}
buildChain('chainKrw', MODES.krw);

// 메뉴 콤보 안내 — 문구의 초 수가 COMBO_MS와 항상 일치하도록 여기서 채움
document.getElementById('comboTip').textContent =
  `🔥 ${COMBO_MS / 1000}초 안에 연달아 합치면 콤보! 콤보당 +10% 보너스 (최대 2배)`;

// ---------------------------------------------------------------- canvas fit
function fit() {
  // 하단 배너 높이 실측: 자리표시자 60px / 토스 실배너 96px (+마진 2px)
  const adEl = document.getElementById('adBanner');
  const bannerH = (adEl.offsetHeight || 60) + 2;
  // 전체화면 웹뷰에서는 body 패딩이 safe area(상태바/홈 인디케이터) 몫 — 가용 영역에서 제외
  const bodyCS = getComputedStyle(document.body);
  const padV = (parseFloat(bodyCS.paddingTop) || 0) + (parseFloat(bodyCS.paddingBottom) || 0);
  const padH = (parseFloat(bodyCS.paddingLeft) || 0) + (parseFloat(bodyCS.paddingRight) || 0);
  let s = Math.min((window.innerWidth - padH) / W, (window.innerHeight - padV - bannerH) / H);
  if (!isFinite(s) || s <= 0) s = 1;
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
  // 토스 실배너는 화면 너비 100%가 규격이라 CSS(.toss-banner)가 담당
  if (document.body.classList.contains('toss-banner')) adEl.style.width = '';
  else adEl.style.width = W * s + 'px';
  // backing store follows displayed size × current DPR (re-read: zoom/monitor changes)
  const bs = Math.min(3, s * (window.devicePixelRatio || 1));
  const bw = Math.round(W * bs), bh = Math.round(H * bs);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- 첫 로딩 스플래시 해제
// 토스 웹뷰는 열리는 전환 동안 뷰포트가 작게 시작했다가 전체화면으로 커진다.
// 그 중간 크기로 계산된 레이아웃이 잠깐 보이지 않도록 스플래시로 가리고,
// 토스 안에서는 뷰포트 높이가 기기 화면 높이에 거의 도달(=전체화면 완료)하고
// 크기가 연속 6프레임 동일해질 때까지 기다린다 (최소 0.25초, 최대 2.5초 안전망).
(() => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const inToss = document.body.classList.contains('in-toss');
  const t0 = performance.now();
  let lastW = -1, lastH = -1, stableFrames = 0;
  function waitStable() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === lastW && h === lastH) stableFrames++;
    else { stableFrames = 0; lastW = w; lastH = h; }
    const fullscreen = !inToss || h >= (screen.height || 0) * 0.85;
    const elapsed = performance.now() - t0;
    if ((stableFrames >= 6 && elapsed >= 250 && fullscreen) || elapsed >= 2500) {
      fit();   // 안정된 최종 크기로 한 번 더 계산해 두고 공개
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 350);
      return;
    }
    requestAnimationFrame(waitStable);
  }
  requestAnimationFrame(waitStable);
})();

requestAnimationFrame(loop);

// debug / automation hook
window.__mm = {
  start: k => startGame(k),
  aim: x => { aimX = x; },
  drop: () => drop(performance.now()),
  spawn: (t, x, y) => makePiece(t, x, y),
  bodies: () => moneyBodies(),
  tick: (frames = 1) => {
    const now = performance.now();
    for (let i = 0; i < frames; i++) step(now, 16.7);
    render(now, 16.7);
  },
  info: () => ({
    state, score,
    canDrop, combo, raining, filling, autoDrop, adOpen,
    shaking: performance.now() < shakeUntil,
    queue: [...queue],
    bodies: engine ? moneyBodies().map(b => ({ t: b.plugin.money.tier, x: +b.position.x.toFixed(1), y: +b.position.y.toFixed(1) })) : [],
  }),
};
})();
