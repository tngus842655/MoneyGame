# 브랜드 자산

앱 아이콘 원본. **여기 있는 파일은 앱에 실리지 않는다** — `scripts/make-dist.mjs`가
`dist/`로 복사하는 건 `index.html`, `js`, `lib`, `public`뿐이다. 원본을 `public/`에
두면 650KB가 토스 번들과 APK에 그대로 따라 들어간다.

| 파일 | 용도 |
| --- | --- |
| `web-app-manifest-512x512.png` | 모든 아이콘의 원본. 플레이스토어 512×512 아이콘으로도 그대로 쓴다 |
| `web-app-manifest-192x192.png` | 예비본. 현재 빌드에는 안 쓴다 (512에서 다 뽑는다) |

아이콘을 새로 그리면 512 파일을 갈아 끼우고 아래를 돌린다.

```bash
node tools/android-assets.mjs
npm run build:android
```
