// mon-<tag>.csv를 구간별(홈 대기 t≤60 / 플레이 t≥80)로 평균 내고, gfx-<tag>.txt에서 프레임 통계를 뽑는다
import fs from 'node:fs';

const dir = process.argv[2];
const tags = process.argv.slice(3);

function avg(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }
function parse(tag) {
  const lines = fs.readFileSync(`${dir}/mon-${tag}.csv`, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const rows = lines.slice(1).map(l => { const o = {}; l.split(',').forEach((v, i) => { o[head[i]] = v; }); return o; });
  const num = (r, k) => r[k] === '' || r[k] === undefined ? NaN : parseFloat(r[k]);
  const menu = rows.filter(r => num(r, 't') >= 10 && num(r, 't') <= 60);
  const play = rows.filter(r => num(r, 't') >= 80 && num(r, 't') <= 200);
  const stat = (set, k) => avg(set.map(r => num(r, k)).filter(v => !isNaN(v)));
  const first = rows[0], last = rows[rows.length - 1];
  const out = {
    tag,
    samples: rows.length,
    bat_start: num(first, 'bat_c'), bat_end: num(last, 'bat_c'),
    ap_start: num(first, 'ap_c'), ap_end: num(last, 'ap_c'),
    skin_start: num(first, 'skin_c'), skin_end: num(last, 'skin_c'),
    menu: { app_cpu: stat(menu, 'app_cpu_pct'), sys_cpu: stat(menu, 'sys_cpu_pct'), gpu: stat(menu, 'gpu_pct'), gpu_mhz: stat(menu, 'gpu_mhz'), f7: stat(menu, 'f7_mhz') },
    play: { app_cpu: stat(play, 'app_cpu_pct'), sys_cpu: stat(play, 'sys_cpu_pct'), gpu: stat(play, 'gpu_pct'), gpu_mhz: stat(play, 'gpu_mhz'), f7: stat(play, 'f7_mhz') },
  };
  try {
    const g = fs.readFileSync(`${dir}/gfx-${tag}.txt`, 'utf8');
    const m = k => { const r = g.match(new RegExp(k + '\\s*:?\\s*([0-9.]+)')); return r ? parseFloat(r[1]) : NaN; };
    out.gfx = { total: m('Total frames rendered'), janky: m('Janky frames'), p50: m('50th percentile'), p90: m('90th percentile'), p99: m('99th percentile') };
  } catch (e) { out.gfx = null; }
  return out;
}
const res = tags.map(parse);
for (const r of res) {
  const f = v => isNaN(v) ? '-' : (Math.round(v * 10) / 10).toString();
  console.log(`\n[${r.tag}] 샘플 ${r.samples}개  배터리 ${f(r.bat_start)}→${f(r.bat_end)}°C  AP ${f(r.ap_start)}→${f(r.ap_end)}°C  피부 ${f(r.skin_start)}→${f(r.skin_end)}°C`);
  console.log(`  홈 대기 : 앱 CPU ${f(r.menu.app_cpu)}%  시스템 CPU ${f(r.menu.sys_cpu)}%  GPU ${f(r.menu.gpu)}% @${f(r.menu.gpu_mhz)}MHz  빅코어 ${f(r.menu.f7)}MHz`);
  console.log(`  플레이  : 앱 CPU ${f(r.play.app_cpu)}%  시스템 CPU ${f(r.play.sys_cpu)}%  GPU ${f(r.play.gpu)}% @${f(r.play.gpu_mhz)}MHz  빅코어 ${f(r.play.f7)}MHz`);
  if (r.gfx) console.log(`  프레임  : 총 ${r.gfx.total} (플레이 ${140}초 → ${f(r.gfx.total / 140)}fps)  끊김 ${r.gfx.janky}  p50 ${r.gfx.p50}ms p90 ${r.gfx.p90}ms p99 ${r.gfx.p99}ms`);
}
