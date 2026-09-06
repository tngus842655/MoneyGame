# 실기기 발열·성능 측정 (2026-09-06)

폰을 USB로 연결하고(USB 디버깅, 잠금 해제) 같은 입력 시나리오를 두 빌드에 돌려 비교한다.
온도는 실기기에서만 잴 수 있고, "손으로 만져 보기" 대신 센서 값으로 비교하기 위한 도구.

- `mon.sh <초> <프로세스이름 패턴>` — 10초마다 배터리/AP/피부 온도(dumpsys thermalservice), GPU 사용률(kgsl gpubusy),
  대상 프로세스 CPU%(코어 1개=100%, /proc/pid/stat 합), 시스템 CPU%, 클러스터 클럭을 CSV로 찍는다.
- `play.sh <fillX> <fillY> <holdY>` — ⏩ 자동 진행 한 번 + 고정된 x 순서로 0.7초 꾹(자동 드롭) 40번. 두 빌드에 같은 입력.
- `run.sh <태그> <패키지> <시작X> <시작Y> <fillX> <fillY> <holdY> <실행명령…>` — 앱 실행 → 8초 → 측정 시작 →
  홈 60초 → 게임시작 탭 → play.sh → gfxinfo(프레임 통계) 덤프. 결과는 기기의 `/data/local/tmp/mon-<태그>.csv`, `gfx-<태그>.txt`.
- `summarize.mjs <폴더> <태그…>` — CSV를 홈 대기(t≤60)/플레이(t≥80)로 나눠 평균, gfx에서 총 프레임·끊김·백분위.

사용 예 (S23, 1080×2340, 게임시작 버튼 539,1115 / ⏩ 버튼 222,383 / 드롭 y 1755 — 기종마다 캡처로 다시 잡을 것):

```
adb push mon.sh play.sh run.sh /data/local/tmp/
adb shell "sh /data/local/tmp/run.sh new com.moneygame.app 539 1115 222 383 1755 am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.moneygame.app/.MainActivity"
adb pull /data/local/tmp/mon-new.csv . && adb pull /data/local/tmp/gfx-new.txt .
node summarize.mjs . new
```

비교 대상 빌드는 `bundletool build-apks --mode=universal`로 뽑아 사이드로드한다 (Play 설치본과 서명이 달라 먼저 지워야 하고,
끝나면 Play에서 다시 설치해야 업데이트를 받는다). 이전 코드 빌드는 `git stash push -- js/game.js index.html` 뒤 빌드.

2026-09-06 결과 (S23, 이전 코드 → 발열 대책 코드): 홈 대기 앱 CPU 79%→27%, GPU 47%→4%; 플레이 앱 CPU 89%→69%,
GPU 47%→14%, 115fps→60fps; 210초 동안 배터리 +2.5°C→+1.2°C, AP +5.2°C→+1.6°C. 자세한 건 진행상황.md 9/6 섹션.
