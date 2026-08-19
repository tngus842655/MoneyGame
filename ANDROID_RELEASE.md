# 안드로이드 릴리스 빌드

**평소에는 이것만 하면 된다.** `android/app/build.gradle`에서 `versionCode`를 올리고,
cmd 창에서 `C:\Workspace\MoneyGame\android`로 들어가 두 줄을 친다.

```
gradlew.bat clean
gradlew.bat bundleRelease
```

`android\app\build\outputs\bundle\release\app-release.aab`가 나온다. 이걸 Play Console에 올린다.

> `npm run build:android`을 따로 칠 필요가 없다. gradle이 빌드 전에 알아서 `dist/`를 다시 만들고
> 앱 안으로 복사한다(`makeWebDist` → `capSync` → `preBuild`). 이 두 태스크가 빠지면
> **앱 안에 예전 게임이 그대로 들어간 채 스토어에 올라간다** — 그래서 빌드에 묶어 두었다.

| 항목 | 값 |
| --- | --- |
| 패키지 이름 | `com.moneygame.app` |
| SDK | `C:\Android\Sdk` (`android/local.properties`, 커밋 안 됨) |
| 서명 키 | `android/moneygame-upload.keystore` (커밋 안 됨) |
| 산출물 | `android/app/build/outputs/bundle/release/app-release.aab` |

Android Studio는 필요 없다. JDK 21과 위 SDK만 있으면 된다.

---

## 처음 한 번만 — 업로드 키 만들기

키가 없으면 `bundleRelease`가 **시작하자마자 멈추고** 이 안내를 띄운다.
(미서명 .aab가 조용히 만들어지면 Play 업로드 화면에서야 알게 되므로 일부러 막아 두었다.)

**cmd나 PowerShell 창에서 직접** 실행한다. 비밀번호를 입력받아야 해서
에디터의 실행 버튼처럼 입력을 못 받는 곳에서는 실패한다.

```
powershell -ExecutionPolicy Bypass -File C:\Workspace\MoneyGame\scripts\make-upload-key.ps1
```

비밀번호를 한 번 물어보고 두 파일을 같이 만든다.

- `android\moneygame-upload.keystore` — 서명 키
- `android\keystore.properties` — gradle이 읽는 설정 (같은 비밀번호가 자동으로 들어감)

둘 다 `.gitignore`에 있어 커밋되지 않는다.

> ⚠️ **키를 잃어버리면 `com.moneygame.app`은 영영 업데이트할 수 없다.**
> 만든 즉시 클라우드와 외장 드라이브 등 **두 군데 이상**에 백업할 것.

서명이 제대로 붙었는지 확인:

```
gradlew.bat signingReport
```

`Variant: release`의 `Config`가 `null`이 아니면 정상이다.

---

## 버전 올리기

`android/app/build.gradle`의 두 값.

```gradle
versionCode <직전 값 + 1>
versionName "<보이는 버전, 예: 1.1>"
```

`versionCode`는 한 번 올라간 번호를 재사용할 수 없고 콘솔에서도 못 고친다.
`versionName`은 스토어에 보이는 표시용이라 자유롭게 붙여도 된다.

---

## 아이콘을 바꿨을 때

원본은 `brand/web-app-manifest-512x512.png` 하나다. 갈아 끼운 뒤:

```
npm run icons
```

런처 아이콘(밀도 5종 + 적응형), 스플래시, 스토어 512 아이콘, 피처 그래픽이 다시 만들어진다.
아이콘은 gradle이 자동으로 만들지 않는다 — 자주 바뀌지 않고, 바뀌면 눈으로 확인해야 하기 때문이다.

---

## 다른 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run build:aab` | 위 두 줄과 같다 (저장소 루트에서 실행) |
| `npm run build:android` | 웹 자산만 동기화. gradle 없이 확인하고 싶을 때 |
| `npm run make-key` | 업로드 키 생성 |
| `npm run icons` | 아이콘·스토어 자산 재생성 |
| `npx http-server -p 5317 -c-1 .` | 브라우저로 게임 확인 |

---

## 앱인토스 쪽

같은 `dist/`를 쓰지만 배포는 따로다.

```bash
npm run build:toss
```

```bash
npm run deploy:toss
```

광고도 다르게 붙는다 — 토스 안에서는 `js/toss-ads.js`(앱인토스 광고),
구글플레이 앱에서는 `js/admob-ads.js`(AdMob)가 `window.AdsBridge`를 차지한다.
일반 브라우저에서는 둘 다 물러나고 게임이 시뮬레이션 광고로 폴백한다.

---

## 막힐 때

| 증상 | 원인 |
| --- | --- |
| `서명 키가 없습니다` | 위 '처음 한 번만'을 안 했다 |
| `Keystore was tampered with, or password was incorrect` | `keystore.properties`의 비밀번호가 키스토어와 다르다. 스크립트로 다시 만들면 둘이 항상 같아진다 |
| `SDK location not found` | `android/local.properties`에 `sdk.dir=C:/Android/Sdk`가 없다 |
| 앱에 예전 게임이 들어 있다 | `makeWebDist`/`capSync`가 안 돈 것이다. `gradlew.bat clean` 후 다시 |
| 빌드가 꼬여 보인다 | `gradlew.bat clean` 한 번 |
