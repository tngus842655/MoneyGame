// 스프라이트 실루엣 vs 물리 사각형의 빈 공간 깊이(게임px)를 그리기 배율 S ×
// chamfer 조합별로 스캔한다. drawBill의 bleed 배율과 makePiece의 chamfer는
// 이 실측으로 정했다 — 스프라이트를 바꾸면 다시 돌려서 값을 재검토할 것.
//   node tools/_analyze-stack.mjs <스프라이트> <물리폭>
import sharp from 'sharp';

const file = process.argv[2] || 'public/money/bill-100000.png';
const PHYS_W = +(process.argv[3] || 195);

const { data, info } = await sharp(file)
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const op = (x, y) => data[(y * W + x) * C + 3] > 32;

const topY = [], botY = [], leftX = [], rightX = [];
for (let x = 0; x < W; x++) {
  let t = -1, b = -1;
  for (let y = 0; y < H; y++) if (op(x, y)) { if (t < 0) t = y; b = y; }
  topY[x] = t; botY[x] = b;
}
for (let y = 0; y < H; y++) {
  let l = -1, r = -1;
  for (let x = 0; x < W; x++) if (op(x, y)) { if (l < 0) l = x; r = x; }
  leftX[y] = l; rightX[y] = r;
}

console.log(`${file} ${W}×${H} (ratio ${(W / H).toFixed(3)}), 물리폭 ${PHYS_W} 기준`);
for (const S of [1.0, 1.04, 1.06, 1.08, 1.1]) {
  const bw = W / S, bh = H / S;
  const x0 = (W - bw) / 2, x1 = x0 + bw;
  const y0 = (H - bh) / 2, y1 = y0 + bh;
  const px = PHYS_W / bw;
  for (const chamGame of [12, 16, 20]) {
    const cham = chamGame / px;
    const g = { top: 0, bottom: 0, left: 0, right: 0 };
    for (let x = Math.ceil(x0 + cham); x < x1 - cham; x++) {
      if (topY[x] < 0) continue;
      g.top = Math.max(g.top, topY[x] - y0);
      g.bottom = Math.max(g.bottom, y1 - botY[x]);
    }
    for (let y = Math.ceil(y0 + cham); y < y1 - cham; y++) {
      if (leftX[y] < 0) continue;
      g.left = Math.max(g.left, leftX[y] - x0);
      g.right = Math.max(g.right, x1 - rightX[y]);
    }
    const o = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, +(v * px).toFixed(1)]));
    console.log(`  S=${S.toFixed(2)} cham=${chamGame}  갭: 상 ${o.top} / 하 ${o.bottom} / 좌 ${o.left} / 우 ${o.right}`);
  }
}
