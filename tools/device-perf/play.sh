#!/system/bin/sh
# 두 버전에 똑같은 입력을 재현: sh play.sh <fillX> <fillY> <holdY>
# ⏩ 자동 진행으로 통을 4/5까지 채운 뒤, 고정된 x 순서로 0.7초 꾹 눌러(자동 드롭) 40번 떨어뜨린다 (약 2분)
FX=$1; FY=$2; HY=$3
XS="200 540 880 350 720 450 640 300 800 540 250 700 500 900 400"
sleep 3
input tap $FX $FY
sleep 20
i=0
while [ $i -lt 40 ]; do
  for x in $XS; do
    input swipe $x $HY $x $HY 700
    sleep 2
    i=$((i+1))
    [ $i -ge 40 ] && break
  done
done
