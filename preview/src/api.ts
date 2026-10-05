/* 데이터 조회 — 현재 화면과 같은 /api/data(Vercel 프록시 → Apps Script) · 같은 파라미터 순서(CDN 캐시 공유) */
const BASE = '/api/data';
const memo = new Map<string, Promise<any>>();
const stable = (p: Record<string, any>) => '{' + Object.keys(p || {}).sort().filter(k => p[k] !== undefined).map(k => JSON.stringify(k) + ':' + JSON.stringify(p[k])).join(',') + '}';
const keyOf = (a: string, p: Record<string, any>) => a + ':' + stable(p);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function call<T = any>(action: string, params: Record<string, any> = {}, opt: { retry?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const k = keyOf(action, params);
  const hit = memo.get(k); if (hit) return hit;
  const url = `${BASE}?action=${encodeURIComponent(action)}&p=${encodeURIComponent(JSON.stringify(params))}`;
  const go = async (n: number): Promise<T> => {
    const ac = new AbortController(), tm = opt.timeoutMs ? setTimeout(() => ac.abort(), opt.timeoutMs) : 0;
    const r = await fetch(url, { signal: ac.signal }).catch(e => { throw new Error(e.name === 'AbortError' ? '응답 지연(시간 초과)' : '네트워크 오류: ' + e.message); }).finally(() => tm && clearTimeout(tm));
    if (r.status >= 500 && opt.retry !== false && n < 2) { await sleep([1500, 4000][n]); return go(n + 1); }
    const b = await r.json().catch(() => ({ ok: false, error: '응답 형식 오류 (HTTP ' + r.status + ')' }));
    if (!b.ok) throw new Error(b.error || '서버 오류');
    return b.data as T;
  };
  const pr = go(0); memo.set(k, pr); pr.catch(() => memo.delete(k));
  return pr;
}
/** 첫 화면 묶음: meta + 기본 기준일 자료(서버 캐시에 있는 것) → 같은 조회는 다시 요청하지 않음.
 *  묶음 응답이 늦으면(8초) 기다리지 않고 meta 와 개별 조회로 진행(데이터 서버 응답 지연 대비) */
export async function boot(): Promise<any> {
  try {
    const b: any = await call('boot', {}, { retry: false, timeoutMs: 8000 });
    (b.pre || []).forEach(([a, p, d]: [string, any, any]) => { const k = keyOf(a, p); if (!memo.has(k)) memo.set(k, Promise.resolve(d)); });
    return b.meta;
  } catch { return call('meta', {}); }
}
/** 요약 탭 조회 6건 — 현재 화면(Tabs.html summary.load)과 같은 파라미터·키 순서 */
export function loadSummary(date: string, ref: string) {
  return Promise.all([
    call('byMgr', { date, ref }), call('overview', { date }), call('byType', { date, ref }), call('topEtf', { date }),
    call('newListings', { date, year: date.slice(0, 4), filter: 'exBond' }), call('shares', { date, mgr: '' })
  ]).then(([mgr, ov, type, top, nl, sh]) => ({ date, mgr, ov, type, top, nl, sh }));
}
