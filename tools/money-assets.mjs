// IconScout에서 받은 지폐 원본(brand/money/bill-*-raw.png, 2000×2000 여백 포함)을
// 게임 스프라이트로 가공한다. 원본 아트는 ~6° 기울어져 있어 그대로 물리 사각형에
// 넣으면 모서리가 비어 조각 사이에 틈이 보인다. 그래서:
//   1) 회전각을 자동 탐색해 수평으로 세우고 (트림 후 bbox 높이가 최소가 되는 각)
//   2) 남는 굴곡 여백을 살짝 center-crop 으로 깎아 아트가 bbox를 꽉 채우게 한 뒤
//   3) 게임 해상도로 축소해 public/money/ 에 저장한다 (make-dist가 public/만 복사).
//
//   node tools/money-assets.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'public/money';
mkdirSync(OUT, { recursive: true });

const TARGET_W = 640;        // 게임 내 최대 표시 폭(오만원 180px) × 3배율이면 충분
const CROP = 0.035;          // 수평화 후에도 남는 굴곡 오버행을 양쪽에서 3.5%씩 깎음
const TRIM = { threshold: 40 };   // 흐린 그림자 가장자리까지 제거

async function levelAngle(src) {
  // 수평이 될수록 트림 bbox 높이가 작아진다 — 0~12°를 1° 단위로 탐색
  let best = { angle: 0, h: Infinity };
  for (let a = 0; a <= 12; a++) {
    const buf = await sharp(src)
      .rotate(a, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .trim(TRIM).png().toBuffer();
    const m = await sharp(buf).metadata();
    if (m.height < best.h) best = { angle: a, h: m.height };
  }
  return best.angle;
}

for (const name of ['1000', '5000', '10000', '50000']) {
  const src = `brand/money/bill-${name}-raw.png`;
  const out = `${OUT}/bill-${name}.png`;
  const angle = await levelAngle(src);
  const leveled = await sharp(src)
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim(TRIM).png().toBuffer();
  const m = await sharp(leveled).metadata();
  const cx = Math.round(m.width * CROP), cy = Math.round(m.height * CROP);
  await sharp(leveled)
    .extract({ left: cx, top: cy, width: m.width - cx * 2, height: m.height - cy * 2 })
    .resize({ width: TARGET_W })
    .png({ compressionLevel: 9, palette: true })
    .toFile(out);
  const o = await sharp(out).metadata();
  console.log(`${name}: 회전 ${angle}° → ${m.width}×${m.height} → crop → ${o.width}×${o.height}`
    + ` (ratio ${(o.width / o.height).toFixed(2)})`);
}
