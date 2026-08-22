// IconScout에서 받은 화폐 원본(brand/money/bill-*-raw.png, 2000×2000 여백 포함)을
// 게임 스프라이트로 가공한다.
//   1) 낱장 지폐: 회전각을 자동 탐색해 수평으로 세우고(트림 후 bbox 높이 최소각)
//      투명 여백만 잘라낸다 — 물결 실루엣·둥근 모서리를 그대로 남긴다.
//      (예전엔 변별 정밀 트림으로 bbox를 꽉 채웠지만 "지폐가 잘려 보인다"는
//      피드백으로 폐기 — 남는 둘레 투명부는 게임 쪽이 bleed 그리기와 chamfer
//      물리로 흡수한다. drawBill/makePiece 참고.)
//   2) 돈다발(100000): 실루엣 훼손 없는 완만한 기준으로만 변을 다듬는다(아래).
//   3) 게임 해상도로 축소해 public/money/ 에 저장한다 (make-dist가 public/만 복사).
//
// 출력 비율이 바뀌면 js/game.js 티어의 w/h도 같은 비율로 맞춰야 한다.
//
//   node tools/money-assets.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'public/money';
mkdirSync(OUT, { recursive: true });

const TARGET_W = 640;        // 게임 내 최대 표시 폭(돈다발 ~195px) × 3배율이면 충분
const TRIM = { threshold: 40 };   // 흐린 그림자 가장자리까지 제거

async function levelAngle(src, maxDeg) {
  // 수평이 될수록 트림 bbox 높이가 작아진다 — 0~maxDeg를 1° 단위로 탐색
  let best = { angle: 0, h: Infinity };
  for (let a = 0; a <= maxDeg; a++) {
    const buf = await sharp(src)
      .rotate(a, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .trim(TRIM).png().toBuffer();
    const m = await sharp(buf).metadata();
    if (m.height < best.h) best = { angle: a, h: m.height };
  }
  return best.angle;
}

// 돈다발 실루엣의 convex hull을 구해 물리 다각형용 좌표를 출력한다.
// 결과는 bbox 중심 원점, 폭/높이에 대한 비율(-0.5~0.5) — js/game.js의
// STACK_HULL/STACK_HULL_OFFSET에 복사해 쓴다. 아트를 바꾸면 다시 돌려서 갱신.
async function printHull(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const op = (x, y) => data[(y * W + x) * C + 3] > 32;

  // 경계 픽셀 수집 (행별 좌/우 끝, 열별 상/하 끝이면 hull에 충분)
  const pts = [];
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (op(x, y)) { if (l < 0) l = x; r = x; }
    if (l >= 0) pts.push([l, y], [r, y]);
  }
  // convex hull — Andrew's monotone chain
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  let hull = lower.slice(0, -1).concat(upper.slice(0, -1));

  // 단순화: 제거 시 면적 손실(이웃 셋 삼각형)이 가장 작은 꼭짓점부터 덜어낸다.
  // convex에서 꼭짓점 제거는 그 부분이 안쪽으로 들어오는 것 — 물리가 아트보다
  // 커지는(갭이 생기는) 방향이 아니라서 안전하다.
  const triArea = (a, b, c) => Math.abs(cross(a, b, c)) / 2;
  while (hull.length > 12) {
    let bi = 0, ba = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[(i + hull.length - 1) % hull.length], c = hull[(i + 1) % hull.length];
      const ar = triArea(a, hull[i], c);
      if (ar < ba) { ba = ar; bi = i; }
    }
    hull.splice(bi, 1);
  }

  // 다각형 centroid — Matter의 body.position이 여기가 되므로, 그리기에서
  // bbox 중심과의 차이를 보정해야 한다
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < hull.length; i++) {
    const [x0, y0] = hull[i], [x1, y1] = hull[(i + 1) % hull.length];
    const f = x0 * y1 - x1 * y0;
    area2 += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  cx /= 3 * area2; cy /= 3 * area2;

  let opCount = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (op(x, y)) opCount++;
  const nrm = ([x, y]) => [+((x - W / 2) / W).toFixed(4), +((y - H / 2) / H).toFixed(4)];
  console.log(`\n돈다발 hull (${hull.length}점, hull면적/실루엣면적 ${(Math.abs(area2) / 2 / opCount).toFixed(3)}) — js/game.js에 복사:`);
  console.log('const STACK_HULL = ' + JSON.stringify(hull.map(nrm)) + ';');
  console.log('const STACK_HULL_OFFSET = ' + JSON.stringify(nrm([cx, cy])) + ';');
}

for (const name of ['1000', '5000', '10000', '50000', '100000']) {
  const src = `brand/money/bill-${name}-raw.png`;
  const out = `${OUT}/bill-${name}.png`;
  // 100000(오만원 돈다발)도 투명 여백 트림만 — 어떤 변도 깎지 않는다 ("원본
  // 그대로" 피드백). 스택은 bbox 모서리 빈 공간이 깊어 사각형 물리로는 보이지
  // 않는 충돌 공간이 생기므로, 물리는 사각형이 아니라 아래에서 계산해 출력하는
  // 실루엣 convex hull 다각형을 쓴다 (js/game.js STACK_HULL). 회전은 제외 —
  // levelAngle이 bbox만 보고 3D 원근 아트를 눕혀버린다.
  const isStack = name === '100000';
  const angle = isStack ? 0 : await levelAngle(src, 12);
  const leveled = await sharp(src)
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim(TRIM).png().toBuffer();
  const m = await sharp(leveled).metadata();
  const box = { left: 0, top: 0, width: m.width, height: m.height };
  await sharp(leveled)
    .extract(box)
    .resize({ width: TARGET_W })
    .png({ compressionLevel: 9, palette: true })
    .toFile(out);
  const o = await sharp(out).metadata();
  console.log(`${name}: 회전 ${angle}° → ${m.width}×${m.height}`
    + ` → ${o.width}×${o.height} (ratio ${(o.width / o.height).toFixed(3)})`);
}

await printHull('public/money/bill-100000.png');

// ─── 동전: brand/money/coin-raw.png 시트에서 앞면·뒷면 8종을 추출 ───
// 시트에는 액면마다 그림면(뒷면)·숫자면(앞면)이 한 장에 들어 있다. 게임은
// 조각마다 앞/뒷면을 랜덤으로 보여주므로 둘 다 뽑는다(coin-10.png / coin-10-back.png).
// 축소본의 알파 연결 성분으로 원들을 찾고(가로세로비 ≈1로 텍스트 블록 제외),
// 시트 배치 순서로 액면을 매긴 뒤 원형 마스크로 도려내 게임 지름 3배로 저장.
const COIN_SHEET = 'brand/money/coin-raw.png';
const COIN_OUT = { 10: 120, 50: 150, 100: 180, 500: 210 };   // 게임 지름(40/50/60/70)×3

async function extractCoins() {
  const meta = await sharp(COIN_SHEET).metadata();
  const dw = Math.round(meta.width / 4);                     // 탐지는 1/4 축소본으로
  const { data, info } = await sharp(COIN_SHEET).resize({ width: dw })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const solid = i => data[i * C + 3] > 32;
  const seen = new Uint8Array(W * H);
  const comps = [];
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || !solid(i)) continue;
    let minX = W, maxX = 0, minY = H, maxY = 0;
    const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && !seen[p - 1] && solid(p - 1)) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && !seen[p + 1] && solid(p + 1)) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && !seen[p - W] && solid(p - W)) { seen[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && !seen[p + W] && solid(p + W)) { seen[p + W] = 1; stack.push(p + W); }
    }
    comps.push({ minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  const circles = comps
    .filter(c => c.w > W * 0.1 && Math.abs(c.w / c.h - 1) < 0.15)
    .sort((a, b) => (a.minX + a.maxX) - (b.minX + b.maxX));
  const top = circles.filter(c => (c.minY + c.maxY) / 2 < H / 2);
  const bot = circles.filter(c => (c.minY + c.maxY) / 2 >= H / 2);
  if (top.length !== 4 || bot.length !== 4) {
    throw new Error(`동전 탐지 실패: 윗줄 ${top.length}개 / 아랫줄 ${bot.length}개 (4+4 기대)`);
  }
  // 윗줄: [십원 그림, 10 숫자, 백원 그림, 오백원 그림] / 아랫줄: [오십원 그림, 50, 100, 500]
  const picks = {
    '10': top[1], '10-back': top[0],
    '50': bot[1], '50-back': bot[0],
    '100': bot[2], '100-back': top[2],
    '500': bot[3], '500-back': top[3],
  };
  const sx = meta.width / W, sy = meta.height / H;
  for (const [v, c] of Object.entries(picks)) {
    const pad = 6;
    const left = Math.max(0, Math.round(c.minX * sx) - pad);
    const topPx = Math.max(0, Math.round(c.minY * sy) - pad);
    const w = Math.min(meta.width - left, Math.round(c.w * sx) + pad * 2);
    const h = Math.min(meta.height - topPx, Math.round(c.h * sy) + pad * 2);
    const side = Math.max(w, h);
    // 정사각 캔버스에 중앙 배치 → 내접원 마스크(0.5% 안쪽, 가장자리 배경 헤일로 제거)
    const squared = await sharp(COIN_SHEET)
      .extract({ left, top: topPx, width: w, height: h })
      .resize({ width: side, height: side, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
    const mask = Buffer.from(
      `<svg width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 2 * 0.995}" fill="#fff"/></svg>`);
    const masked = await sharp(squared)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png().toBuffer();
    const size = COIN_OUT[v.replace('-back', '')];
    await sharp(masked)
      .resize({ width: size })
      .png({ compressionLevel: 9, palette: true })
      .toFile(`${OUT}/coin-${v}.png`);
    console.log(`coin-${v}: 시트 (${left},${topPx}) ${w}×${h} → ${size}px`);
  }
}
await extractCoins();
