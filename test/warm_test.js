const fs=require('fs'),vm=require('vm');const ctx={console,Date,Math,JSON,Object,Array,String,Number,RegExp,Error,isNaN,setTimeout};ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('shim.js','utf8'),ctx);
for(const f of fs.readdirSync('../gas').filter(f=>f.endsWith('.gs')))vm.runInContext(fs.readFileSync('../gas/'+f,'utf8'),ctx,{filename:f});
const s=JSON.parse(fs.readFileSync('store.json','utf8'));ctx.__s=s;
vm.runInContext(`(function(){const ss=SpreadsheetApp.getActiveSpreadsheet();Object.keys(__s.store).forEach(n=>{const sh=ss.insertSheet(n);sh.rows=__s.store[n];});Object.keys(__s.props).forEach(k=>PropertiesService.getScriptProperties().setProperty(k,__s.props[k]));})()`,ctx);
console.log(vm.runInContext(`(function(){ const calls=[]; const api0=api; api=function(a,p){calls.push(a+JSON.stringify(p)); return api0(a,p);}; warmAll(); return calls.length+' calls; first: '+calls.slice(0,9).join(' | '); })()`,ctx));
