// 테마 분류 점검(로컬): gas/Theme.gs 의 분류 엔진(시트 의존 없는 부분)을 실데이터 표본(theme_sample.tsv)에 적용해 테마별 목록 출력
// 사용: node theme_classify.js [테마명…]   (인자 없으면 테마별 건수 + '기타 주식' 목록)
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../gas/Theme.gs'), 'utf8').split('// ─────────────────────────── 시트(범례_테마)')[0];
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + ';this.T={THEME,compileThemeRules_,themeDefaultRows_,classifyEtf_,themeEntry_};', ctx);
const T = ctx.T, R = T.compileThemeRules_(T.themeDefaultRows_());
const lines = fs.readFileSync(path.join(__dirname, 'theme_sample.tsv'), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
const rows = lines.map(a => { const bond = a[6] === '채권/금리' || a[4] === '채권형'; const c = T.classifyEtf_(R, T.themeEntry_(a[0], a[1], a[2], a[5], a[4], bond)); return { code: a[0], name: a[1], idx: a[2], nav: +a[3], bond, c }; });
if (R.bad.length) console.log('해석 불가:', R.bad);
const want = process.argv.slice(2);
if (process.env.ALL) { rows.forEach(r => console.log([r.c.theme, r.c.struct, r.c.region, r.name, r.idx].join(' | '))); return; }
if (!want.length) {
  const by = {}; rows.forEach(r => { const b = by[r.c.theme] = by[r.c.theme] || { n: 0, nav: 0 }; b.n++; b.nav += r.nav; });
  R.values.theme.forEach(t => console.log(t.padEnd(14), (by[t] || { n: 0 }).n, Math.round(((by[t] || {}).nav || 0) / 1e4 * 10) / 10 + '조'));
  const cnt = k => { const o = {}; rows.forEach(r => o[r.c[k]] = (o[r.c[k]] || 0) + 1); return JSON.stringify(o); };
  console.log('상품구조', cnt('struct')); console.log('지역', cnt('region'));
  want.push('기타 주식');
}
want.forEach(t => { console.log('== ' + t); rows.filter(r => r.c.theme === t).sort((a, b) => b.nav - a.nav).forEach(r => console.log('  ' + r.name + ' | ' + r.idx + ' | ' + r.c.struct + ' | ' + r.c.region)); });
