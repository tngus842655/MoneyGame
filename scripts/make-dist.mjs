// 정적 게임 파일을 dist/로 모아 ait build가 번들로 묶을 수 있게 함 (빌드 도구 없는 프로젝트용)
//
// --toss: 앱인토스 번들용 — 구글플레이(AdMob) 전용 파일을 제외한다.
//   토스 안에서는 어차피 실행되지 않는 죽은 코드인데, AdMob의 구글 공식 테스트
//   광고 ID 문자열이 번들에 실려 있으면 앱인토스 자동 검수가 "테스트용 광고 그룹
//   ID를 넣을 수 없어요"로 즉시 반려한다 (2026-08-21 실제 반려 사유).
// 인자 없음: 전체 복사 — 구글플레이(Capacitor) 빌드용 (android gradle이 호출).
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const FILES = ['index.html', 'js', 'lib', 'public'];
const toss = process.argv.includes('--toss');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const p of FILES) cpSync(p, `dist/${p}`, { recursive: true });

if (toss) {
  const ADMOB_ONLY = ['js/ads-config.js', 'js/admob-ads.js'];
  for (const p of ADMOB_ONLY) rmSync(`dist/${p}`, { force: true });
  let html = readFileSync('dist/index.html', 'utf8');
  for (const p of ADMOB_ONLY) {
    html = html.replace(new RegExp(`[ \\t]*<script src="${p}"></script>\\r?\\n`), '');
  }
  writeFileSync('dist/index.html', html);
  console.log('dist/ 준비 완료 (토스용 — AdMob 파일 제외):', FILES.join(', '));
} else {
  console.log('dist/ 준비 완료:', FILES.join(', '));
}
