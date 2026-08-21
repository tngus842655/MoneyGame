// IconScout에서 받은 HUD 버튼 아이콘 원본(brand/icons/*-raw.png)을
// 버튼용 스프라이트로 가공한다: 투명 여백 트림 → 96px 정사각(여백 패딩) → public/icons/.
// 96px = 버튼 내 표시 크기 27 CSS px × 최대 3배율 여유.
//
//   node tools/ui-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

// 동전제거(clean)는 민짜 금화(clean-raw) 위에 빨간 X를 가운데 합성해서 만든다.
// 기성 "Remove Coin" 아이콘은 X 배지가 오른쪽 아래 구석에 있어 버튼의 AD 배지에 가려졌다.
function xOverlay(S) {
  const cx = S * 0.53, cy = S * 0.48;   // 금화 아트의 앞면 중심 (왼쪽에 3D 옆면이 있어 약간 오른쪽)
  const a = S * 0.20;                   // X 팔 길이
  const d = `M ${cx - a} ${cy - a} L ${cx + a} ${cy + a} M ${cx + a} ${cy - a} L ${cx - a} ${cy + a}`;
  return Buffer.from(
    `<svg width="${S}" height="${S}">
       <g fill="none" stroke-linecap="round">
         <path d="${d}" stroke="#ffffff" stroke-width="${S * 0.155}"/>
         <path d="${d}" stroke="#e0483e" stroke-width="${S * 0.095}"/>
       </g>
     </svg>`);
}

for (const name of ['back', 'fill', 'shake', 'clean']) {
  const trimmed = await sharp(`brand/icons/${name}-raw.png`).trim({ threshold: 15 }).png().toBuffer();
  let img = sharp(trimmed)
    .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (name === 'clean') img = sharp(await img.png().toBuffer()).composite([{ input: xOverlay(96), left: 0, top: 0 }]);
  await img.png({ compressionLevel: 9, palette: true }).toFile(`${OUT}/${name}.png`);
  console.log(name, 'ok');
}
