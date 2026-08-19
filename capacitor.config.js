// Capacitor(안드로이드 포장) 설정. 빌드 도구가 없는 프로젝트라 .ts 대신 .js를 쓴다
// (.ts 설정은 typescript 패키지를 따로 요구함). 타입 힌트는 JSDoc으로 받는다.

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  // ⚠️ 패키지명(applicationId) — 플레이스토어에 한 번 올리면 **영구히 바꿀 수 없습니다.**
  // 첫 업로드 전에 원하는 값으로 확정하세요. 바꾸려면 이 값을 고친 뒤
  // `rm -rf android && npm run android:add`로 네이티브 프로젝트를 다시 생성하면 됩니다.
  appId: 'io.github.tngus842655.moneygame',
  appName: '머니 게임',          // 런처 아이콘 아래 표시되는 이름 (res/values/strings.xml)
  webDir: 'dist',                // scripts/make-dist.mjs가 게임 파일을 모아주는 곳 (앱인토스와 공용)
  android: {
    // 웹뷰가 뜨기 전 잠깐 보이는 배경. index.html #splash 색과 맞춰 깜빡임을 줄인다.
    backgroundColor: '#d4edfb',
  },
};

module.exports = config;
