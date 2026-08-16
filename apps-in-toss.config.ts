import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // ⚠️ 앱인토스 콘솔에 등록한 appName과 정확히 같아야 해요 (intoss://{appName} 딥링크에도 사용)
  appName: 'moneygame',
  brand: {
    primaryColor: '#5fa8e8', // 화면에 노출될 앱의 기본 색상
  },
  permissions: [],
  webBundleDir: 'dist', // scripts/make-dist.mjs가 게임 파일을 여기로 모아줌
});
