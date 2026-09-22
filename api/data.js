/* Vercel 서버 함수: Apps Script JSON 엔드포인트 프록시 + CDN 캐시
   환경변수 GAS_URL = Apps Script 웹앱 /exec 주소 (브라우저에는 노출되지 않음) */
const ACTIONS = ['meta', 'overview', 'byMgr', 'byType', 'shares', 'topEtf', 'race', 'newListings', 'turnover', 'treemap'];

module.exports = async (req, res) => {
  const action = String(req.query.action || '');
  if (!ACTIONS.includes(action)) return res.status(400).json({ ok: false, error: '알 수 없는 action' });
  const base = process.env.GAS_URL;
  if (!base) return res.status(500).json({ ok: false, error: '서버 설정 누락 (GAS_URL)' });
  let p = '{}';
  try { p = JSON.stringify(JSON.parse(String(req.query.p || '{}'))); } catch (e) {}
  if (p.length > 2000) return res.status(400).json({ ok: false, error: '요청이 너무 큼' });
  // v109: Apps Script 가 동시 실행 한도·일시 오류로 HTML 페이지를 돌려주는 경우가 있어 1회 재시도
  const url = base + '?action=' + encodeURIComponent(action) + '&p=' + encodeURIComponent(p);
  const once = async () => {
    const r = await fetch(url, { redirect: 'follow' });
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) {
      const snip = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      throw new Error('원본 응답 형식 오류 (HTTP ' + r.status + ': ' + snip + ')');
    }
  };
  try {
    let body;
    try { body = await once(); } catch (e1) { console.warn('[retry]', action, e1.message); await new Promise(r => setTimeout(r, 1200)); body = await once(); }
    // 정상 응답만 CDN 에 캐시: 10분간 그대로, 이후 하루까지는 이전 값을 즉시 주고 뒤에서 갱신
    // meta(선택 가능한 기준일 목록)는 새 적재가 곧바로 보이도록 1분만 캐시
    res.setHeader('Cache-Control', body.ok ? 'public, s-maxage=' + (action === 'meta' ? 60 : 600) + ', stale-while-revalidate=86400' : 'no-store');
    return res.status(200).json(body);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ ok: false, error: '데이터 서버 연결 실패: ' + e.message });
  }
};
