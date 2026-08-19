// 플레이스토어 등록에 필요한 그래픽 자산을 만든다.
//
//   node tools/store-assets.mjs
//
// 스토어 아이콘(512)은 원본을 그대로 쓰므로 tools/android-assets.mjs가 담당한다.
// 여기서는 피처 그래픽만 만든다. 스크린샷은 실기기나 브라우저에서 직접 찍어
// store/screenshots/에 넣는다 (규격은 PLAY_CONSOLE.md 참고).

import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const ART = 'brand/web-app-manifest-512x512.png'
const OUT = 'store'

// 아이콘 아트워크와 같은 계열의 파랑
const TOP = '#0a6bff'
const BOTTOM = '#12539f'
const GOLD = '#ffd34d'

// 피처 그래픽 규격: 1024x500, 알파 없는 PNG 또는 JPEG.
// 스토어 배치에 따라 가장자리가 잘릴 수 있어 중요한 글자는 가운데로 몰아 둔다.
const W = 1024, H = 500

async function featureGraphic() {
  const ICON = 340
  const iconBuf = await sharp(ART).resize(ICON, ICON).png().toBuffer()
  const iconMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}">` +
      `<rect width="${ICON}" height="${ICON}" rx="${ICON * 0.2}" ry="${ICON * 0.2}" fill="#fff"/></svg>`,
  )
  const icon = await sharp(iconBuf)
    .composite([{ input: iconMask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  // 배경: 위아래 그라디언트 + 은은한 반짝임 몇 개
  const sparkles = [
    [120, 70, 5], [250, 420, 4], [640, 60, 6], [880, 150, 4],
    [960, 400, 5], [560, 450, 4], [430, 40, 3], [760, 470, 3],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity="0.5"/>`)
    .join('')

  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TOP}"/>
      <stop offset="1" stop-color="${BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${sparkles}
</svg>`

  // 글자는 흰 글씨 + 남색 외곽선. paint-order로 외곽선을 글자 뒤에 깐다.
  // 아이콘 오른쪽 남는 폭(402~1024)의 한가운데에 글자 블록을 세운다.
  // 왼쪽 정렬로 두면 가장 긴 줄이 오른쪽 끝에 붙어, 잘리는 배치에서 글자가 먹힌다.
  const cx = Math.round((62 + ICON + W) / 2)
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <g font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" text-anchor="middle"
     paint-order="stroke" stroke="#0a3a72" stroke-linejoin="round">
    <text x="${cx}" y="215" font-size="96" font-weight="bold" fill="#ffffff" stroke-width="14">머니 게임</text>
    <text x="${cx}" y="290" font-size="42" font-weight="bold" fill="${GOLD}" stroke-width="9">동전을 합쳐 더 큰 돈으로!</text>
    <text x="${cx}" y="352" font-size="27" font-weight="bold" fill="#dceaff" stroke-width="7">10원 · 50원 · 100원 · 500원 → 5만원까지</text>
  </g>
</svg>`

  await mkdir(OUT, { recursive: true })
  const composed = await sharp(Buffer.from(bg))
    .composite([{ input: icon, left: 62, top: Math.round((H - ICON) / 2) }, { input: Buffer.from(text) }])
    .png()
    .toBuffer()
  // flatten은 같은 파이프라인에 두면 composite보다 먼저 적용돼 알파가 다시 붙는다.
  // Play는 알파 없는 24비트 PNG를 받으므로 합성이 끝난 뒤 따로 한 번 더 돌린다.
  await sharp(composed)
    .flatten({ background: BOTTOM })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/feature-graphic-1024x500.png`)
}

await featureGraphic()
console.log('피처 그래픽 생성 완료: store/feature-graphic-1024x500.png')
