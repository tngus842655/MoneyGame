import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // ⚠️ 앱인토스 콘솔에 등록한 appName과 정확히 같아야 해요 (intoss://{appName} 딥링크에도 사용)
  appName: 'moneygame',
  brand: {
    primaryColor: '#5fa8e8', // 화면에 노출될 앱의 기본 색상
  },
  // 상단 내비게이션 바를 게임처럼 투명하게: 흰 배경/뒤로가기/로고·이름 없이
  // 더보기(⋯)·닫기(X) 버튼만 게임 화면 위에 떠 있게 됨 (콘텐츠가 화면 전체로 확장)
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: true,
    theme: 'light', // 밝은 배경 위 → 어두운 버튼/텍스트
  },
  permissions: [],
  webBundleDir: 'dist', // scripts/make-dist.mjs가 게임 파일을 여기로 모아줌
});
