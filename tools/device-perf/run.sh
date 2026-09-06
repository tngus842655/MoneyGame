#!/system/bin/sh
# 한 버전 측정 시나리오: sh run.sh <태그> <프로세스패턴> <시작X> <시작Y> <fillX> <fillY> <holdY> <실행명령...>
# 앱 실행 → 8초 대기 → 측정 시작 → 홈 60초(대기) → 게임 시작 탭 → play.sh(약 2분) → 측정 종료
TAG=$1; PAT=$2; SX=$3; SY=$4; FX=$5; FY=$6; HY=$7; shift 7
D=/data/local/tmp
"$@" > /dev/null 2>&1
sleep 8
dumpsys gfxinfo $PAT reset > /dev/null 2>&1
sh $D/mon.sh 210 "$PAT" > $D/mon-$TAG.csv 2>&1 &
MON=$!
sleep 60
dumpsys gfxinfo $PAT reset > /dev/null 2>&1
echo "menu-phase-done $(date +%s)"
input tap $SX $SY
sh $D/play.sh $FX $FY $HY
echo "play-phase-done $(date +%s)"
dumpsys gfxinfo $PAT > $D/gfx-$TAG.txt 2>&1
wait $MON
echo "done"
