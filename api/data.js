/* Vercel 서버 함수: Apps Script JSON 엔드포인트 프록시 + CDN 캐시
   환경변수 GAS_URL = Apps Script 웹앱 /exec 주소 (브라우저에는 노출되지 않음) */
const ACTIONS = ['meta', 'overview', 'byMgr', 'byType', 'shares', 'topEtf', 'race', 'newListings', 'turnover'];

module.exports = async (req, res) => {
  const action = String(req.query.action || '');
  if (!ACTIONS.includes(action)) return res.status(400).json({ ok: false, error: '알 수 없는 action' });
  const base = process.env.GAS_URL;
  if (!base) return res.status(500).json({ ok: false, error: '서버 설정 누락 (GAS_URL)' });
  let p = '{}';
  try { p = JSON.stringify(JSON.parse(String(req.query.p || '{}'))); } catch (e) {}
  if (p.length > 2000) return res.status(400).json({ ok: false, error: '요청이 너무 큼' });
  try {
    const r = await fetch(base + '?action=' + encodeURIComponent(action) + '&p=' + encodeURIComponent(p), { redirect: 'follow' });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch (e) { throw new Error('원본 응답 형식 오류 (웹앱 배포 버전·접근 권한 확인)'); }
    // 정상 응답만 CDN 에 캐시: 10분간 그대로, 이후 하루까지는 이전 값을 즉시 주고 뒤에서 갱신
    res.setHeader('Cache-Control', body.ok ? 'public, s-maxage=600, stale-while-revalidate=86400' : 'no-store');
    return res.status(200).json(body);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ ok: false, error: '데이터 서버 연결 실패: ' + e.message });
  }
};
