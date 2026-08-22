// 앱인토스 인앱결제 상품 아이콘 생성 (콘솔 규격: 1024×1024 PNG).
// 게임 아이콘(brand/web-app-manifest-512x512.png)과 같은 톤 — 하늘색 배경 + 구름 +
// 만화풍 두꺼운 외곽선 — 으로 맞춰서 콘솔·토스 주문서에서 같은 앱으로 읽히게 한다.
//
//   node tools/iap-icons.mjs
//
// 출력: store/iap/noads-1024.png  (콘솔 '상품 이미지'에 그대로 업로드)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'store/iap';
mkdirSync(OUT, { recursive: true });

const S = 1024;
const CX = 512;
const CY = 396;      // 금지 표지 중심 — 아래에 문구·동전 자리를 남기려고 위로
const R = 262;       // 금지 링 반지름
const A = R * 0.94;  // 빗금 반 길이 — 링 안쪽 면까지 닿게 (짧으면 글자 뒤에서 토막처럼 보임)

// 빗금은 좌하→우상 45°. 가운데를 지나므로 A와 D 사이 틈을 타고 지나간다
// (좌상→우하로 그으면 D를 정통으로 덮어 글자가 안 읽힌다).
const bx = A * Math.SQRT1_2;
const slash = `M ${CX - bx} ${CY + bx} L ${CX + bx} ${CY - bx}`;

const svg = `
<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5fb0ee"/>
      <stop offset="0.55" stop-color="#9ed4fb"/>
      <stop offset="1" stop-color="#d7efff"/>
    </linearGradient>
  </defs>

  <rect width="${S}" height="${S}" fill="url(#sky)"/>

  <!-- 구름: 게임 아이콘과 같은 뭉게구름 실루엣 -->
  <g fill="#ffffff" opacity="0.7">
    <circle cx="130" cy="180" r="66"/><circle cx="212" cy="160" r="86"/><circle cx="294" cy="188" r="58"/>
    <rect x="130" y="180" width="164" height="68" rx="34"/>
    <circle cx="852" cy="212" r="52"/><circle cx="922" cy="232" r="66"/>
    <rect x="852" y="212" width="70" height="44" rx="22"/>
  </g>
  <!-- 반짝이 -->
  <g fill="#ffffff" opacity="0.95">
    <path d="M 830 396 l 17 44 44 17 -44 17 -17 44 -17 -44 -44 -17 44 -17 z"/>
    <path d="M 158 470 l 13 33 33 13 -33 13 -13 33 -13 -33 -33 -13 33 -13 z"/>
  </g>

  <!-- 금지 표지: 흰 테두리를 깔고 그 위에 빨강 (HUD 동전제거 아이콘과 같은 시각 언어) -->
  <g fill="none" stroke-linecap="round">
    <circle cx="${CX}" cy="${CY}" r="${R}" stroke="#ffffff" stroke-width="88"/>
    <path d="${slash}" stroke="#ffffff" stroke-width="88"/>
    <circle cx="${CX}" cy="${CY}" r="${R}" stroke="#e0483e" stroke-width="56"/>
    <path d="${slash}" stroke="#e0483e" stroke-width="56"/>
  </g>

  <!-- AD 글자: 빗금 "위"에 얹는다. 빗금을 글자 위로 그으면 흰 테두리(88px)가
       글자를 파먹어 AD가 두 겹으로 깨져 보였다. 뒤로 보내면 링·빗금이 액자가 되고
       글자는 온전히 읽힌다. -->
  <text x="${CX}" y="${CY + 84}" font-family="Malgun Gothic, Arial, sans-serif" font-size="222"
        font-weight="bold" text-anchor="middle" letter-spacing="10"
        fill="#0d2b45" stroke="#ffffff" stroke-width="30" paint-order="stroke">AD</text>

  <!-- 상품명: 게임 타이틀과 같은 두꺼운 외곽선 글자 -->
  <text x="${CX}" y="866" font-family="Malgun Gothic, Arial, sans-serif" font-size="140"
        font-weight="bold" text-anchor="middle" letter-spacing="2"
        fill="#ffffff" stroke="#0d2b45" stroke-width="24" paint-order="stroke">광고 제거</text>
</svg>`;

// 동전은 게임에서 쓰는 실사 스프라이트를 그대로 얹어 브랜드를 잇는다 (아래 양쪽 모서리).
const coin = async (file, size) =>
  sharp(`public/money/${file}`).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();

const out = `${OUT}/noads-1024.png`;
await sharp(Buffer.from(svg))
  .composite([
    { input: await coin('coin-500.png', 196), left: 28, top: 790 },
    { input: await coin('coin-100.png', 158), left: 838, top: 830 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(out);

const m = await sharp(out).metadata();
console.log(`${out} ${m.width}x${m.height} ${m.format}`);
