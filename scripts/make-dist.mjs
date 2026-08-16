// 정적 게임 파일을 dist/로 모아 ait build가 번들로 묶을 수 있게 함 (빌드 도구 없는 프로젝트용)
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const FILES = ['index.html', 'js', 'lib', 'public'];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const p of FILES) cpSync(p, `dist/${p}`, { recursive: true });
console.log('dist/ 준비 완료:', FILES.join(', '));
