const fs = require('fs'), path = require('path'), vm = require('vm');
const gasDir = path.join(__dirname, '..', 'gas');
const ctx = { console, Date, Math, JSON, Object, Array, String, Number, RegExp, Error, isNaN, setTimeout, globalThis: null }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8'), ctx);
for (const f of fs.readdirSync(gasDir).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(path.join(gasDir, f), 'utf8'), ctx, { filename: f });
vm.runInContext(`seedLegends([]); setupSheets(); PropertiesService.getScriptProperties().setProperty('KRX_AUTH_KEY','T'); CFG.MONTHLY_FROM='2025-11'; backfillMonthly();
CFG.BUDGET_MS = 300; CFG.HARD_MS = 0; let n=0, left = null;
while (n++ < 60 && (PropertiesService.getScriptProperties().getProperty('LAST_DAILY_DATE') || '') < '2026-09-09') { loadDaily(); }
console.log('runs', n, 'last', PropertiesService.getScriptProperties().getProperty('LAST_DAILY_DATE'), 'pendingAgg', PropertiesService.getScriptProperties().getProperty('PENDING_AGG'), 'monthly months so far', new Set(MOCK_STORE['raw_월말'].rows.slice(1).map(r => String(r[0]).slice(0, 7))).size);
CFG.BUDGET_MS = 1e9; CFG.HARD_MS = 1e9; loadDaily();
console.log('pendingAgg after', PropertiesService.getScriptProperties().getProperty('PENDING_AGG'));`, ctx);
const st = ctx.MOCK_STORE;
console.log('daily rows', st['raw_일별'].rows.length - 1, 'index', st['_index'].rows.length - 1, 'monthly months', new Set(st['raw_월말'].rows.slice(1).map(r => String(r[0]).slice(0, 7))).size, 'agg', st['agg_시장월별'].rows.length - 1);
console.log(st['_log'].rows.slice(-4).map(r => r[2]).join(' | '));
