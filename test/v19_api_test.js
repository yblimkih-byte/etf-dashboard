/* v19 API 점검: 비교 기준(ref)·M/S 기여도·회전율 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8'), ctx, { filename: f });
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8'));
vm.runInContext(`(function(){ const ss = SpreadsheetApp.getActiveSpreadsheet(); const s = ${JSON.stringify(st)}; Object.keys(s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = s.store[n]; }); Object.keys(s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, s.props[k])); })()`, ctx);
const api = (a, p) => { const r = JSON.parse(vm.runInContext(`api(${JSON.stringify(a)}, ${JSON.stringify(p || {})})`, ctx)); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const m = api('meta'); const date = m.defaultDate; console.log('date', date);
let ok = true; const chk = (c, msg) => { if (!c) { ok = false; console.log('FAIL', msg); } else console.log('ok  ', msg); };
for (const ref of ['py', 'pq', 'pm', 'ly', 'zz']) { const d = api('byMgr', { date, ref }); const f = d.rows.find(r => r.mgr === '한투'); const sum = d.contrib.find(c => c.mgr === '한투').items.reduce((s, i) => s + (i.d || 0), 0);
  console.log(ref, '→', d.ref.mode, d.refLabel, 'base', d.ref.py, '한투 ms', f.ms.toFixed(2), 'msPy', f.msPy && f.msPy.toFixed(2), 'Δ', (f.ms - f.msPy).toFixed(3), 'contribΣ', sum.toFixed(3));
  chk(Math.abs(sum - (f.ms - f.msPy)) < 0.01, ref + ' 기여도 합 = M/S 변동'); }
const pq = api('byMgr', { date, ref: 'pq' }); chk(pq.ref.py < date && /-(03|06|09|12)-/.test(pq.ref.py), 'pq 기준 = 분기말 ' + pq.ref.py);
const ly = api('byMgr', { date, ref: 'ly' }); chk(ly.ref.py.slice(0, 4) === String(+date.slice(0, 4) - 1) && ly.ref.py.slice(5, 7) === date.slice(5, 7), 'ly 기준 = 전년동월 ' + ly.ref.py);
const bt = api('byType', { date, ref: 'pm' }); chk(bt.refLabel === '전월말' && bt.ref.py === bt.ref.pm, 'byType pm');
const tm = api('treemap', { date, ref: 'pm' }); chk(tm.refLabel === '전월말' && tm.items.length > 100, 'treemap pm items ' + tm.items.length);
const tv = api('turnover', {}); const t = tv.top[0]; chk(t.nav > 0 && Math.abs(t.turn - t.sum / t.nav) < 1e-9, 'turnover 회전율 ' + t.name + ' ' + t.turn.toFixed(2) + '배');
const early = api('byMgr', { date: m.months[0].date, ref: 'pq' }); chk(early.refLabel === '전년말' || early.refLabel === '전분기말', '첫 달 pq 폴백 ' + early.refLabel + ' ' + early.ref.py);
console.log(ok ? 'ALL OK' : 'FAILURES'); process.exit(ok ? 0 : 1);
