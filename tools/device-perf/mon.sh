#!/system/bin/sh
# 기기 측정 루프: sh mon.sh <초> <프로세스이름 패턴> > 로그
# 10초마다 배터리/AP/피부 온도, GPU 사용률·클럭, 대상 앱 CPU%(코어 1개=100%), 시스템 CPU%, 클러스터 클럭
DUR=$1; PAT=$2; T=0; STEP=10
prev_app=0; prev_tot=0; prev_idle=0
cat /sys/class/kgsl/kgsl-3d0/gpubusy > /dev/null 2>&1   # 누적 카운터 리셋 (읽으면 초기화)
echo "t,bat_c,ap_c,skin_c,gpu_pct,gpu_mhz,app_cpu_pct,sys_cpu_pct,f0_mhz,f4_mhz,f7_mhz,pids"
while [ $T -le $DUR ]; do
  th=$(dumpsys thermalservice 2>/dev/null)
  bat=$(echo "$th" | grep -m1 "mName=BAT," | sed 's/.*mValue=\([0-9.]*\).*/\1/')
  ap=$(echo "$th" | grep -m1 "mName=AP," | sed 's/.*mValue=\([0-9.]*\).*/\1/')
  skin=$(echo "$th" | grep -m1 "mName=SKIN," | sed 's/.*mValue=\([0-9.]*\).*/\1/')
  gb=$(cat /sys/class/kgsl/kgsl-3d0/gpubusy 2>/dev/null)
  gbusy=$(echo $gb | awk '{print $1}'); gtot=$(echo $gb | awk '{print $2}')
  if [ "${gtot:-0}" -gt 0 ]; then gpu=$((gbusy * 100 / gtot)); else gpu=""; fi
  gclk=$(cat /sys/class/kgsl/kgsl-3d0/gpuclk 2>/dev/null)
  pids=$(ps -A -o PID,NAME | grep "$PAT" | awk '{print $1}')
  app=0
  for p in $pids; do
    s=$(awk '{print $14+$15}' /proc/$p/stat 2>/dev/null)
    app=$((app + ${s:-0}))
  done
  read -r cpu u n s i w q sq st g gn rest < /proc/stat
  tot=$((u+n+s+i+w+q+sq+st)); idle=$i
  if [ $T -gt 0 ]; then
    dt=$((tot - prev_tot)); di=$((idle - prev_idle)); da=$((app - prev_app))
    [ $da -lt 0 ] && da=0
    sys=$(( (dt - di) * 100 / dt ))
    appp=$(( da * 800 / dt ))
  else
    sys=""; appp=""
  fi
  f0=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null)
  f4=$(cat /sys/devices/system/cpu/cpu4/cpufreq/scaling_cur_freq 2>/dev/null)
  f7=$(cat /sys/devices/system/cpu/cpu7/cpufreq/scaling_cur_freq 2>/dev/null)
  echo "$T,$bat,$ap,$skin,$gpu,$((${gclk:-0}/1000000)),$appp,$sys,$((${f0:-0}/1000)),$((${f4:-0}/1000)),$((${f7:-0}/1000)),$(echo $pids | tr ' ' '+')"
  prev_app=$app; prev_tot=$tot; prev_idle=$idle
  T=$((T+STEP))
  sleep $STEP
done
