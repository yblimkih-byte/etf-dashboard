/* 요약 계산 — 현재 화면(gas/Tabs.html summaryModel·growthRows·msDrivers·msOffset)과 같은 산식 */
export const FOCUS = '한투';
export const TYPE_COLORS: Record<string, string> = { '국내주식형': '#17171c', '해외주식형': '#1863dc', '채권형': '#75758a', '파생형': '#9b60aa', '혼합채권형': '#2a9d8f', '기타': '#c4c4cc', '미분류': '#e5e7eb' };
export const tc = (t: string) => TYPE_COLORS[t] || '#c4c4cc';
export const REF_OPTS = [{ value: 'py', label: '전년말' }, { value: 'pq', label: '전분기말' }, { value: 'pm', label: '전월말' }, { value: 'ly', label: '전년동월' }];

const MINUS = '−';
const sgn = (s: string) => s.replace(/^-/, MINUS);
export const fmt = {
  eok(v: number | null | undefined, d = 1) { if (v === null || v === undefined || isNaN(v)) return '-'; let x = v / 1e12; if (Math.abs(x) < Math.pow(10, -d) / 2) x = 0; return sgn(x.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d })); },
  signedEok(v: number | null | undefined, d = 1) { if (v === null || v === undefined) return '-'; const t = fmt.eok(v, d); return (v > 0 && !/^0\.?0*$/.test(t) ? '+' : '') + t; },
  pct(v: number | null | undefined, d = 1) { if (v === null || v === undefined || isNaN(v)) return '-'; if (Math.abs(v) < Math.pow(10, -d) / 2) v = 0; return sgn((v > 0 ? '+' : '') + v.toFixed(d)) + '%'; },
  pp(v: number | null | undefined, d = 1) { const t = fmt.pct(v, d); return t === '-' ? t : t.replace('%', '%p'); },
  share(v: number | null | undefined, d = 1) { return v === null || v === undefined || isNaN(v) ? '-' : v.toFixed(d) + '%'; },
  num(v: number | null | undefined) { return v === null || v === undefined ? '-' : (+v).toLocaleString('ko-KR'); },
};
export const dirOf = (v: number | null | undefined, eps = 0.005) => v === null || v === undefined || Math.abs(v) < eps ? 0 : v > 0 ? 1 : -1;

export function growthRows(d: any, g: string) {
  const mix = d.mix || { mkt: {}, mgr: {} }, mg = mix.mgr[g] || {}, types: string[] = (d.types || Object.keys(mix.mkt)).filter((t: string) => mix.mkt[t]);
  const pc = (a: number, b: number) => b ? (a / b - 1) * 100 : null, tot = [0, 0], mt = [0, 0];
  types.forEach(t => { const x = mg[t] || [0, 0], k = mix.mkt[t]; tot[0] += x[0]; tot[1] += x[1]; mt[0] += k[0]; mt[1] += k[1]; });
  const s0 = mt[1] ? tot[1] / mt[1] : null, s1 = mt[0] ? tot[0] / mt[0] : null;
  const rows = types.map(t => {
    const x = mg[t] || [0, 0], k = mix.mkt[t], dM = k[0] - k[1], dF = x[0] - x[1];
    return { type: t, cur: x[0], py: x[1], gf: pc(x[0], x[1]), gm: pc(k[0], k[1]), w: tot[0] ? x[0] / tot[0] * 100 : 0, dM, dF, cap: dM > 0 ? dF / dM * 100 : null, c: s0 === null || !mt[0] ? null : (dF - s0 * dM) / mt[0] * 100 };
  });
  const dM = mt[0] - mt[1], dF = tot[0] - tot[1];
  return { rows, cur: tot[0], py: tot[1], gf: pc(tot[0], tot[1]), gm: pc(d.total, d.totalPy), dM, dF, cap: dM > 0 ? dF / dM * 100 : null,
    s0: s0 === null ? null : s0 * 100, s1: s1 === null ? null : s1 * 100, dms: s0 === null || s1 === null ? null : (s1 - s0) * 100 };
}
export type GR = ReturnType<typeof growthRows>;
export function msDrivers(gr: GR) {
  const xs = gr.rows.filter(r => r.c !== null), sg = dirOf(gr.dms);
  let out = sg ? xs.filter(r => Math.sign(r.c!) === sg && Math.abs(r.c!) >= 0.05).sort((a, b) => Math.abs(b.c!) - Math.abs(a.c!)).slice(0, 2) : [];
  if (!out.length) out = xs.slice().sort((a, b) => Math.abs(b.c!) - Math.abs(a.c!)).slice(0, 1);
  return out;
}
export function msOffset(gr: GR) {
  const sg = dirOf(gr.dms); if (!sg) return null;
  return gr.rows.filter(r => r.c !== null && Math.sign(r.c) === -sg && Math.abs(r.c) >= 0.1).sort((a, b) => Math.abs(b.c!) - Math.abs(a.c!))[0] || null;
}

export function summaryModel(d: any, F = FOCUS) {
  const M = d.ov.monthly, m = M[M.length - 1], py = d.ov.prevYE, mkt = d.mgr;
  const rows = mkt.rows.filter((r: any) => r.mgr !== '기타').slice().sort((a: any, b: any) => b.nav - a.nav), f = rows.find((r: any) => r.mgr === F) || rows[0];
  const rank = rows.indexOf(f) + 1, ahead = rows[rank - 2], behind = rows[rank];
  const gr = growthRows(mkt, f.mgr), dms = f.msPy === null || f.msPy === undefined ? null : f.ms - f.msPy;
  const tp = d.type.rows.slice().sort((a: any, b: any) => (b.share - b.sharePy) - (a.share - a.sharePy)), tUp = tp[0], tDn = tp[tp.length - 1];
  const top50 = d.top.byMgr.find((x: any) => x.top === F) || { n: 0, nav: 0, share: 0 };
  const nlF = d.nl.items.filter((i: any) => i.top === F), nlTot = d.nl.items.length;
  const mk = d.sh.groups['시장 전체'], g = d.sh.groups[F];
  const gap = g && mk ? g.types.map((t: any) => ({ type: t.type, nav: t.nav, s: t.share, m: (mk.types.find((x: any) => x.type === t.type) || { share: 0 }).share, d: t.share - (mk.types.find((x: any) => x.type === t.type) || { share: 0 }).share })) : [];
  const gapSorted = gap.slice().sort((a: any, b: any) => b.d - a.d);
  return { F, RL: mkt.refLabel || '전년말', m, py, rows, f, rank, ahead, behind, gr, dms, drv: msDrivers(gr), off: msOffset(gr), tUp, tDn, top50, nlF, nlTot, mk, g, gap, gapSorted, mgr: mkt };
}
export type SM = ReturnType<typeof summaryModel>;

/** 기준일 선택 목록: 지난 달까지는 월말, 이번 달은 영업일 전체(현재 화면과 같음) */
export function dateOptions(meta: any) {
  const cur = meta.curMonth, out: { value: string; label: string }[] = [];
  meta.months.filter((x: any) => x.ym < cur).forEach((x: any) => out.push({ value: x.date, label: x.ym }));
  meta.dates.filter((d: string) => d.slice(0, 7) === cur).forEach((d: string) => out.push({ value: d, label: d }));
  return out.reverse();
}
export const dlabel = (d: string) => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3') : '-';
