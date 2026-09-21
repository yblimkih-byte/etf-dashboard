/* web/public(Vercel 빌드 결과)을 모의 서버와 묶어 단일 테스트 페이지(test/web.html) 생성 */
const fs = require('fs'), path = require('path');
require('child_process').execSync('node ' + path.join(__dirname, '..', 'web', 'build.js'), { stdio: 'inherit' });
const pub = p => fs.readFileSync(path.join(__dirname, '..', 'web', 'public', p), 'utf8');
const gasDir = path.join(__dirname, '..', 'gas');
const gs = fs.readdirSync(gasDir).filter(f => f.endsWith('.gs')).map(f => `<script>\n${fs.readFileSync(path.join(gasDir, f), 'utf8')}\n</script>`).join('\n');
const store = fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8');
const mock = `<script>${fs.readFileSync(path.join(__dirname, 'shim.js'), 'utf8')}</script>\n${gs}\n<script>(function(){ const s = ${store}; const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(s.store).forEach(n => { const sh = ss.insertSheet(n); sh.rows = s.store[n]; });
  Object.keys(s.props).forEach(k => PropertiesService.getScriptProperties().setProperty(k, s.props[k]));
  window.MOCK = { api: (a, p) => api(a, p) }; })();</script>`;
const fav = 'data:image/svg+xml,' + encodeURIComponent(pub('favicon.svg'));
const nm = p => 'file://' + path.join(__dirname, 'node_modules', p);
let html = pub('index.html')
  .replace(/<!--FONTS-->[\s\S]*<!--\/FONTS-->/, () => ['pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css', '@fontsource/jetbrains-mono/400.css'].filter(f => fs.existsSync(path.join(__dirname, 'node_modules', f))).map(f => `<link rel="stylesheet" href="${nm(f)}">`).join(''))
  .replace(/<link rel="stylesheet" href="\/app\.css[^>]*>/, () => '<style>' + pub('app.css').replace(/\/favicon\.svg/g, fav) + '</style>')
  .replace("<script>window.API_BASE = '/api/data';</script>", '')
  .replace(/<script src="https:\/\/cdnjs[^"]*"><\/script>/, () => '<script>' + fs.readFileSync(path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'), 'utf8') + '</script>')
  .replace(/<script src="\/app\.js[^>]*><\/script>/, () => mock + '\n<script>' + pub('app.js') + '</script>');
fs.writeFileSync(path.join(__dirname, 'web.html'), html);
console.log('web.html', (html.length / 1024).toFixed(0), 'KB');
