/* 브라우저 통합 테스트 페이지 생성: Index.html 의 include 를 실제 파일로 치환 + 모의 서버 주입 */
const fs = require('fs'), path = require('path');
const gas = p => fs.readFileSync(path.join(__dirname, '..', 'gas', p), 'utf8');
let html = gas('Index.html')
  .replace('<?!= boot ?>', 'null')   // v24: doGet 의 첫 화면 묶음 자리 — 아래 모의 서버가 예열 뒤 채움
  .replace("<?!= include('Style'); ?>", gas('Style.html'))
  .replace("<?!= include('App'); ?>", gas('App.html'))
  .replace("<?!= include('Tabs'); ?>", gas('Tabs.html'))
  .replace(/<script src="https:\/\/cdnjs[^"]*chart\.umd\.min\.js"><\/script>/, '<script>' + fs.readFileSync(path.join(__dirname, 'package', 'dist', 'chart.umd.js'), 'utf8') + '</script>');
const gsFiles = fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs')).map(f => `<script>\n${gas(f)}\n</script>`).join('\n');
const store = fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8');
const inject = `
<script>${fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8')}</script>
${gsFiles}
<script>
(function(){ const s = ${store}; const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = s.store[n]; });
  Object.keys(s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, s.props[k]));
  window.MOCK = { calls: [], api: (a, p) => { window.MOCK.calls.push(a); return api(a, p); } };
  // v24: 메모리 캐시 + 예열 → doGet 처럼 첫 화면 묶음(BOOT)을 페이지에 넣음 (NOBOOT=1 이면 생략 → 화면이 직접 조회)
  if (${process.env.NOBOOT ? 'false' : 'true'}) { window.MOCK_CACHE = true; try { warmAll(); } catch (e) { console.error(e); } const j = bootEmbed_(); window.BOOT = j === 'null' ? null : JSON.parse(j); }
})();
</script>`;
html = html.replace('<?!= include(\'App\'); ?>', '').replace('</body>', '').replace(/<script>\n\/\* ── 코어/, inject + '\n<script>\n/* ── 코어');
fs.writeFileSync(path.join(__dirname, 'index.html'), html + '</body>');
console.log('index.html', (html.length / 1024).toFixed(0), 'KB');
