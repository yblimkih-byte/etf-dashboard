/* Vercel 빌드: gas/App.html · gas/Tabs.html(화면 로직 정본)을 그대로 가져와 web/public 정적 사이트 생성
   → 차트·표 로직은 Apps Script 웹앱과 한 벌만 유지. 외형(골격·CSS)만 web/src 에서 덮어씀 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(__dirname, 'public');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const inner = (s, tag) => s.replace(new RegExp('^\\s*<' + tag + '[^>]*>'), '').replace(new RegExp('</' + tag + '>\\s*$'), '');
fs.mkdirSync(out, { recursive: true });
const css = inner(read('gas/Style.html'), 'style') + '\n/* ===== web overrides ===== */\n' + read('web/src/web.css');
const js = inner(read('gas/App.html'), 'script') + '\n;\n' + inner(read('gas/Tabs.html'), 'script') + '\n;\n' + read('web/src/shell.js');
const ver = Date.now().toString(36);
fs.writeFileSync(path.join(out, 'app.css'), css);
fs.writeFileSync(path.join(out, 'app.js'), js);
fs.writeFileSync(path.join(out, 'index.html'), read('web/src/index.html').replace(/__VER__/g, ver));
fs.writeFileSync(path.join(out, 'favicon.svg'), read('web/src/favicon.svg'));
console.log('built web/public', ver, (css.length / 1024).toFixed(0) + 'KB css', (js.length / 1024).toFixed(0) + 'KB js');
