/* 요약 탭 시안 — React + shadcn/ui(Card·Badge·Select·Tooltip·Table·Chart) + Recharts.
   내용은 현재 '요약' 탭과 같은 자료·산식. 구성: 한투 M/S(핵심 수치 + 유형별 기여) → 지표 4개 → 상위 5개사 → 핵심 요약·유형 구성 → 신규상장 */
import * as React from 'react';
import { Area, AreaChart, Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus, ExternalLink, LayoutDashboard, LayoutGrid, Building2, PieChart, BarChart3, ListOrdered, Sparkles, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Separator } from '@/ui/separator';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table';
import { ChartContainer, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/ui/chart';
import { boot, loadSummary } from '@/api';
import { FOCUS, REF_OPTS, dateOptions, dirOf, dlabel, fmt, summaryModel, tc, wa, ymLabel, type SM } from '@/model';
import { cn } from '@/utils';

/* ───────────── 공통 조각 ───────────── */
function Delta({ v, text, className }: { v: number | null | undefined; text: string; className?: string }) {
  const d = dirOf(v), Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return <Badge variant={d > 0 ? 'up' : d < 0 ? 'down' : 'secondary'} className={cn('tnum', className)}><Icon />{text}</Badge>;
}
const Swatch = ({ color, className }: { color: string; className?: string }) => <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-[3px]', className)} style={{ background: color }} />;
const dirText = (v: number | null | undefined) => dirOf(v) > 0 ? 'text-up' : dirOf(v) < 0 ? 'text-down' : 'text-muted-foreground';
/** 배경색 위 글자색(흰색/검정) — 명도 대비로 선택 */
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#09090b';
}

/* ───────────── 사이드바(다른 탭은 현재 화면으로 이동) ───────────── */
const NAV = [
  { id: 'summary', label: '요약', icon: LayoutDashboard }, { id: 'overview', label: 'ETF 시장 개관', icon: LayoutGrid }, { id: 'mgr', label: '운용사별 NAV', icon: Building2 },
  { id: 'type', label: '유형별 NAV', icon: PieChart }, { id: 'shares', label: '상위 5개사·시장 유형 비중', icon: BarChart3 }, { id: 'top', label: '상위 ETF', icon: ListOrdered },
  { id: 'new', label: '신규상장 ETF', icon: Sparkles }, { id: 'turnover', label: '거래대금', icon: ArrowLeftRight },
];
function Sidebar({ meta }: { meta: any }) {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col p-2 lg:flex">
      <a href="/" className="flex items-center gap-2.5 rounded-md p-2 hover:bg-accent">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><BarChart3 className="size-4" /></span>
        <span className="grid leading-tight"><b className="text-sm font-semibold">ETF Dashboard</b><small className="text-xs text-muted-foreground">KRX ETF Market Data</small></span>
      </a>
      <div className="px-2 pt-4 pb-1.5 text-xs text-muted-foreground">대시보드</div>
      <nav className="grid gap-0.5" aria-label="대시보드 탭">
        {NAV.map(n => {
          const active = n.id === 'summary', I = n.icon;
          return (
            <a key={n.id} href={active ? '#' : `/#${n.id}`} aria-current={active ? 'page' : undefined}
              className={cn('flex h-8 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none', active && 'bg-accent font-medium')}>
              <I className="size-4 text-muted-foreground" /><span className="truncate">{n.label}</span>
              {active && <Badge variant="outline" className="ml-auto h-5 text-[11px] font-normal">시안</Badge>}
            </a>
          );
        })}
      </nav>
      <div className="mt-auto flex items-start gap-2.5 rounded-md p-2 text-xs">
        <span className={cn('mt-1 size-2 shrink-0 rounded-full', meta?.loadStatus?.warn ? 'bg-amber-500' : 'bg-emerald-500')} />
        <span className="grid gap-0.5"><b className="font-medium text-[13px]">최종 적재 {meta?.lastLoaded ? dlabel(meta.lastLoaded) : '-'}</b>
          <span className="text-muted-foreground">매 영업일 08:30, 19:00 갱신</span>
          {meta?.loadStatus?.note && <span className="text-muted-foreground">{meta.loadStatus.note}</span>}</span>
      </div>
    </aside>
  );
}

/* ───────────── 상단: 기준일 · 비교 기준 ───────────── */
function Toolbar({ meta, date, setDate, refv, setRef, busy }: any) {
  const opts = React.useMemo(() => meta ? dateOptions(meta) : [], [meta]);
  const cur = meta?.curMonth, daily = opts.filter(o => o.value.slice(0, 7) === cur), monthly = opts.filter(o => o.value.slice(0, 7) !== cur);
  return (
    <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background/90 px-4 py-2.5 backdrop-blur md:px-6">
      <h1 className="text-[15px] font-semibold whitespace-nowrap">요약</h1>
      <Badge variant="secondary" className="font-normal whitespace-nowrap">shadcn/ui 시안</Badge>
      {busy && <RefreshCw className="size-3.5 animate-spin text-muted-foreground" aria-label="불러오는 중" />}
      <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <Select value={date} onValueChange={setDate} disabled={!meta}>
          <SelectTrigger aria-label="기준일" className="min-w-[9.5rem]"><span className="text-muted-foreground">기준일</span><SelectValue placeholder="선택" /></SelectTrigger>
          <SelectContent align="end" className="max-h-80">
            {daily.length > 0 && <SelectGroup><SelectLabel>이번 달 영업일</SelectLabel>{daily.map(o => <SelectItem key={o.value} value={o.value}>{dlabel(o.label)}</SelectItem>)}</SelectGroup>}
            <SelectGroup><SelectLabel>월말</SelectLabel>{monthly.map(o => <SelectItem key={o.value} value={o.value}>{ymLabel(o.label)}</SelectItem>)}</SelectGroup>
          </SelectContent>
        </Select>
        <div role="radiogroup" aria-label="비교 기준" className="inline-flex h-8 items-center rounded-md bg-muted p-0.5">
          {REF_OPTS.map(o => (
            <button key={o.value} role="radio" aria-checked={refv === o.value} onClick={() => setRef(o.value)}
              className={cn('h-7 rounded-[5px] px-2.5 text-[13px] whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', refv === o.value && 'bg-background text-foreground font-medium shadow-xs')}>{o.label}</button>
          ))}
        </div>
        <a href="/#summary" className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[13px] shadow-xs hover:bg-accent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          현재 화면<ExternalLink className="size-3.5 text-muted-foreground" /></a>
      </div>
    </header>
  );
}

/* ───────────── ① 한투 M/S: 핵심 수치 + 유형별 기여 ───────────── */
function FocusShare({ S, color }: { S: SM; color: string }) {
  const { f, gr, dms, RL, rank, ahead, behind } = S;
  const rows = gr.rows.filter(r => r.c !== null && (r.cur || r.py)).sort((a, b) => (a.c! - b.c!) * (dirOf(dms) >= 0 ? -1 : 1));
  const max = Math.max(0.05, ...rows.map(r => Math.abs(r.c!)));
  return (
    <Card className="gap-0 md:col-span-2 xl:row-span-2">
      <CardHeader>
        <CardDescription className="flex items-center gap-2"><Swatch color={color} />{FOCUS} M/S</CardDescription>
        <CardAction><Badge variant="outline" className="font-normal">상위 5개사 중 {rank}위</Badge></CardAction>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="text-5xl font-semibold tracking-tight">{f.ms.toFixed(2)}<span className="ml-0.5 text-3xl font-medium text-muted-foreground">%</span></span>
          {dms !== null && <Delta v={dms} text={fmt.pp(dms, 2)} className="mb-2 text-[13px]" />}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground tnum">
          {RL} {f.msPy.toFixed(2)}% → {f.ms.toFixed(2)}%
          {ahead && <><br />{rank - 1}위 {ahead.mgr}({ahead.ms.toFixed(2)}%){wa(ahead.mgr)} {(ahead.ms - f.ms).toFixed(2)}%p 차이</>}
          {behind && <>, {rank + 1}위 {behind.mgr}({behind.ms.toFixed(2)}%){wa(behind.mgr)} {(f.ms - behind.ms).toFixed(2)}%p 차이</>}
        </p>
      </CardContent>
      <Separator className="my-5" />
      <CardContent>
        <div className="mb-1 text-[13px] font-medium">유형별 M/S 기여</div>
        <p className="mb-3 text-xs text-muted-foreground">시장 증가분 중 {FOCUS} 몫이 {RL} M/S({gr.s0?.toFixed(2)}%)보다 작은 유형은 끌어내리고, 큰 유형은 끌어올림</p>
        <ul className="grid gap-1" aria-label="유형별 M/S 기여">
          {rows.map(r => {
            const w = Math.abs(r.c!) / max * 50, neg = r.c! < 0;
            return (
              <li key={r.type}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="grid w-full grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-muted/60 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                      <span className="flex items-center gap-1.5 truncate text-[13px]"><Swatch color={tc(r.type)} />{r.type}</span>
                      <span className="relative h-4" aria-hidden>
                        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                        <span className={cn('absolute inset-y-0.5', neg ? 'rounded-l-[4px] bg-down' : 'rounded-r-[4px] bg-up')}
                          style={neg ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} />
                      </span>
                      <span className={cn('text-right text-[13px] font-medium tnum', dirText(r.c))}>{fmt.pp(r.c, 2)}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="tnum">
                    <div className="mb-1 font-medium">{r.type} {fmt.pp(r.c, 2)}</div>
                    <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-muted-foreground">
                      <span>시장 증감액</span><span className="text-right text-foreground">{fmt.signedEok(r.dM)}조원</span>
                      <span>{FOCUS} 증감액</span><span className="text-right text-foreground">{fmt.signedEok(r.dF)}조원</span>
                      <span>시장 증가분 중 {FOCUS} 몫</span><span className="text-right text-foreground">{r.cap === null ? '시장 감소' : fmt.share(r.cap)}</span>
                      <span>{FOCUS} 내 비중</span><span className="text-right text-foreground">{fmt.share(r.w)}</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="mt-3 justify-between border-t pt-4 text-xs text-muted-foreground tnum">
        <span>유형별 합계 = M/S 변동</span><span className={cn('font-medium', dirText(gr.dms))}>{fmt.pp(gr.dms, 2)}</span>
      </CardFooter>
    </Card>
  );
}

/* ───────────── ② 지표 ───────────── */
function Stat({ label, color, value, unit, delta, lines, extra }: { label: string; color?: string; value: string; unit: string; delta?: React.ReactNode; lines: React.ReactNode[]; extra?: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">{color && <Swatch color={color} />}{label}</CardDescription>
        {delta && <CardAction>{delta}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="text-[28px] leading-none font-semibold tracking-tight">{value}<span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span></div>
        <div className="mt-3 grid gap-0.5 text-[13px] text-muted-foreground tnum">{lines.map((l, i) => <span key={i} className={i === 0 ? 'text-foreground' : ''}>{l}</span>)}</div>
        {extra && <div className="mt-auto pt-4">{extra}</div>}
      </CardContent>
    </Card>
  );
}
/** 월별 추이(비교 기준 시점 이후) — 선 2px, 면 10%, 마지막 값 점 */
function Spark({ points, color, label }: { points: { ym: string; v: number }[]; color: string; label: string }) {
  if (points.length < 2) return null;
  const cfg: ChartConfig = { v: { label, color } }, last = points.length - 1;
  return (
    <div>
      <ChartContainer config={cfg} className="aspect-auto h-14 w-full">
        <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 2, left: 6 }}>
          <XAxis dataKey="ym" hide /><YAxis hide domain={['dataMin', 'dataMax']} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={<ChartTooltipContent labelFormatter={(l: string) => l.replace('-', '.')} valueFormatter={(v: number) => `${fmt.eok(v)}조원`} />} />
          <Area dataKey="v" type="monotone" stroke="var(--color-v)" strokeWidth={2} fill="var(--color-v)" fillOpacity={0.1} isAnimationActive={false}
            dot={(p: any) => p.index === last ? <circle key="end" cx={p.cx} cy={p.cy} r={4} fill="var(--color-v)" stroke="var(--background)" strokeWidth={2} /> : <g key={p.index} />} />
        </AreaChart>
      </ChartContainer>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tnum"><span>{points[0].ym.replace('-', '.')}</span><span>{points[last].ym.replace('-', '.')}</span></div>
    </div>
  );
}
/** 비중 막대(채움 = 해당 값, 바탕 = 같은 색의 옅은 단계) */
function Meter({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${color} 14%, white)` }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={+pct.toFixed(1)} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(pct, 0.5))}%`, background: color }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tnum"><span>{label}</span><span>{pct.toFixed(1)}%</span></div>
    </div>
  );
}

/* ───────────── ③ 상위 5개사 NAV·M/S ───────────── */
function TopManagers({ S, meta, date }: { S: SM; meta: any; date: string }) {
  const d = S.mgr, groups: string[] = [...meta.top5, '기타'], byK: Record<string, any> = {};
  d.rows.forEach((r: any) => byK[r.mgr] = r);
  const keys = groups.map((_, i) => 'g' + i);
  const config: ChartConfig = Object.fromEntries(groups.map((g, i) => [keys[i], { label: g, color: meta.colors[g] || meta.colors['기타'] }]));
  const tot = [d.totalPy, d.total];
  const data = [
    Object.assign({ row: S.RL, sub: d.ref?.py ? dlabel(d.ref.py) : '' }, ...groups.map((g, i) => ({ [keys[i]]: byK[g]?.navPy || 0 }))),
    Object.assign({ row: '기준일', sub: dlabel(date) }, ...groups.map((g, i) => ({ [keys[i]]: byK[g]?.nav || 0 }))),
  ];
  const max = Math.max(...groups.map(g => byK[g]?.nav || 0));
  const SegLabel = (k: string, color: string) => (p: any) => {
    const { x, y, width, height, value, index } = p; if (!value || width < 40) return null;
    const ms = value / tot[index] * 100, ink = inkOn(color), two = width >= 66;
    return (
      <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fill={ink} fontSize={12} className="tnum" style={{ pointerEvents: 'none' }}>
        {two ? <><tspan x={x + width / 2} dy="-0.6em" fontWeight={600}>{fmt.eok(value)}조</tspan><tspan x={x + width / 2} dy="1.2em" opacity={0.85}>{ms.toFixed(1)}%</tspan></> : <tspan fontWeight={600}>{ms.toFixed(1)}%</tspan>}
      </text>
    );
  };
  const YTick = ({ x, y, payload }: any) => {
    const r = data.find(v => v.row === payload.value);
    return <g transform={`translate(${x},${y})`}><text textAnchor="end" fontSize={12} fill="var(--foreground)" dy="-0.25em">{payload.value}</text><text textAnchor="end" fontSize={11} fill="var(--muted-foreground)" dy="1.05em" className="tnum">{r?.sub}</text></g>;
  };
  return (
    <Card className="md:col-span-2 xl:col-span-4">
      <CardHeader>
        <CardTitle>상위 5개사 NAV와 M/S</CardTitle>
        <CardDescription>{S.RL} 대비 · 막대 길이 = NAV, 칸 안 = NAV와 M/S</CardDescription>
        <CardAction className="hidden sm:block"><ChartLegendContentWrap config={config} keys={keys} /></CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[132px] w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 64, top: 0, bottom: 0 }} barCategoryGap={10}>
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="row" width={84} tickLine={false} axisLine={false} tick={<YTick />} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v: number, k: string, pl: any) => `${fmt.eok(v)}조원 (${(v / (pl.row === '기준일' ? tot[1] : tot[0]) * 100).toFixed(1)}%)`} />} />
            {keys.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="a" fill={`var(--color-${k})`} stroke="var(--background)" strokeWidth={2} isAnimationActive={false} barSize={44}
                radius={i === keys.length - 1 ? [0, 4, 4, 0] : 0}>
                <LabelList dataKey={k} content={SegLabel(k, config[k].color!)} />
                {i === keys.length - 1 && <LabelList dataKey={k} content={(p: any) => (   // 막대 끝 = 행 합계(시장 전체 NAV)
                  <text x={p.x + p.width + 8} y={p.y + p.height / 2} dominantBaseline="central" fontSize={12} fill="var(--foreground)" className="tnum">{fmt.eok(tot[p.index])}조</text>)} />}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
        <div className="mt-3 sm:hidden"><ChartLegendContentWrap config={config} keys={keys} /></div>
        <Table className="mt-4">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>운용사</TableHead><TableHead className="w-[38%]">NAV(조원)</TableHead>
              <TableHead className="text-right">증감액</TableHead><TableHead className="text-right">증감률</TableHead>
              <TableHead className="text-right">M/S {S.RL}</TableHead><TableHead className="text-right">M/S 기준일</TableHead><TableHead className="text-right">변동</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(g => {
              const r = byK[g]; if (!r) return null; const dm = r.msPy === null ? null : r.ms - r.msPy, focus = g === FOCUS;
              return (
                <TableRow key={g} className={cn(focus && 'bg-muted/50 font-medium')}>
                  <TableCell><span className="flex items-center gap-2"><Swatch color={meta.colors[g] || meta.colors['기타']} />{g}</span></TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2"><span className="h-1.5 flex-1 rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${r.nav / max * 100}%`, background: meta.colors[g] || meta.colors['기타'] }} /></span>
                      <span className="w-14 text-right">{fmt.eok(r.nav)}</span></span>
                  </TableCell>
                  <TableCell className={cn('text-right', dirText(r.nav - r.navPy))}>{fmt.signedEok(r.nav - r.navPy)}</TableCell>
                  <TableCell className={cn('text-right', dirText(r.ytd?.pct))}>{fmt.pct(r.ytd?.pct)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt.share(r.msPy, 2)}</TableCell>
                  <TableCell className="text-right">{fmt.share(r.ms, 2)}</TableCell>
                  <TableCell className={cn('text-right', dirText(dm))}>{fmt.pp(dm, 2)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="hover:bg-transparent font-medium">
              <TableCell>시장 전체</TableCell><TableCell><span className="flex justify-end">{fmt.eok(d.total)}</span></TableCell>
              <TableCell className={cn('text-right', dirText(d.total - d.totalPy))}>{fmt.signedEok(d.total - d.totalPy)}</TableCell>
              <TableCell className={cn('text-right', dirText(d.total - d.totalPy))}>{fmt.pct(d.totalPy ? (d.total / d.totalPy - 1) * 100 : null)}</TableCell>
              <TableCell className="text-right text-muted-foreground">100.00%</TableCell><TableCell className="text-right">100.00%</TableCell><TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
const ChartLegendContentWrap = ({ config, keys }: { config: ChartConfig; keys: string[] }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
    {keys.map(k => <span key={k} className="flex items-center gap-1.5"><Swatch color={config[k].color!} /><span className="text-muted-foreground">{config[k].label}</span></span>)}
  </div>
);

/* ───────────── ④ 핵심 요약 ───────────── */
function KeyPoints({ S, nl }: { S: SM; nl: any }) {
  const { f, gr, RL, rank, ahead, behind, drv, off, tUp, tDn, gapSorted, nlF, nlTot } = S;
  const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold text-foreground">{children}</b>;
  const cmp = gr.gf === null || gr.gm === null ? '·' : gr.gf < gr.gm - 0.05 ? '<' : gr.gf > gr.gm + 0.05 ? '>' : '≈';
  const items: [string, React.ReactNode][] = [
    ['순위와 격차', <>상위 5개사 중 <B>{rank}위</B>{ahead && <>. {rank - 1}위 {ahead.mgr} {fmt.share(ahead.ms)}(격차 {(ahead.ms - f.ms).toFixed(1)}%p)</>}{behind && <>, {rank + 1}위 {behind.mgr} {fmt.share(behind.ms)}(격차 {(f.ms - behind.ms).toFixed(1)}%p)</>}</>],
    ['M/S 변동 요인', <>{FOCUS} NAV <B>{fmt.pct(gr.gf)}</B> {cmp} 시장 <B>{fmt.pct(gr.gm)}</B>({RL} 대비), M/S <B>{fmt.pp(S.dms, 2)}</B>
      {drv.length > 0 && gr.dms !== null && <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">{dirOf(gr.dms) < 0 ? '하락 요인' : dirOf(gr.dms) > 0 ? '상승 요인' : '기여 최대'}</span>
        {drv.map(r => <Badge key={r.type} variant="outline" className="font-normal tnum"><Swatch color={tc(r.type)} className="size-2" />{r.type} <span className={dirText(r.c)}>{fmt.pp(r.c, 2)}</span><span className="text-muted-foreground">몫 {r.cap === null ? '시장 감소' : fmt.share(r.cap)}</span></Badge>)}
        {off && <><span className="ml-1 text-muted-foreground">상쇄 요인</span><Badge variant="outline" className="font-normal tnum"><Swatch color={tc(off.type)} className="size-2" />{off.type} <span className={dirText(off.c)}>{fmt.pp(off.c, 2)}</span></Badge></>}
      </span>}</>],
    ['시장 유형 이동', <>비중 확대 {tUp.type} <span className={dirText(tUp.share - tUp.sharePy)}>{fmt.pp(tUp.share - tUp.sharePy)}</span>, 축소 {tDn.type} <span className={dirText(tDn.share - tDn.sharePy)}>{fmt.pp(tDn.share - tDn.sharePy)}</span> ({RL} 대비)</>],
    [`${FOCUS} 유형 구성`, gapSorted.length ? <>시장 대비 과대 {gapSorted[0].type} {fmt.pp(gapSorted[0].d)}, 과소 {gapSorted[gapSorted.length - 1].type} {fmt.pp(gapSorted[gapSorted.length - 1].d)}</> : '-'],
    [`${nl.year}년 신규상장`, <>전체 {fmt.num(nlTot)}종목 중 {FOCUS} <B>{nlF.length}종목</B>, NAV {fmt.eok(nlF.reduce((s: number, i: any) => s + i.nav, 0), 2)}조원{nlF.length ? <>, 최대 {nlF[0].name} {fmt.eok(nlF[0].nav, 2)}조원</> : null}{nl.filter === 'exBond' ? ' (채권/금리형 제외)' : ''}</>],
  ];
  return (
    <Card className="md:col-span-2">
      <CardHeader><CardTitle>핵심 요약</CardTitle><CardDescription>보고용 문장. 근거는 각 탭에서 확인</CardDescription></CardHeader>
      <CardContent>
        <dl className="grid text-[13px]">
          {items.map(([k, v], i) => (
            <div key={k} className={cn('grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4', i > 0 && 'border-t')}>
              <dt className="text-muted-foreground">{k}</dt><dd className="leading-relaxed tnum">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/* ───────────── ⑤ 한투 유형 구성 vs 시장 ───────────── */
function TypeMix({ S, color }: { S: SM; color: string }) {
  const rows = S.gap.filter((r: any) => r.s > 0 || r.m > 0), max = Math.max(...rows.map((r: any) => Math.max(r.s, r.m)), 1);
  return (
    <Card className="md:col-span-2">
      <CardHeader><CardTitle>{FOCUS} 유형 구성과 시장 비교</CardTitle><CardDescription>막대 = {FOCUS} 유형 비중, 세로 눈금 = 시장 유형 비중</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead>유형</TableHead><TableHead className="w-[40%]" /><TableHead className="text-right">{FOCUS}</TableHead><TableHead className="text-right">시장</TableHead><TableHead className="text-right">차이</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.type}>
                <TableCell><span className="flex items-center gap-2"><Swatch color={tc(r.type)} />{r.type}</span></TableCell>
                <TableCell>
                  <span className="relative block h-3" aria-hidden>
                    <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${r.s / max * 100}%`, background: color, opacity: 0.85 }} />
                    <span className="absolute -inset-y-0.5 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${r.m / max * 100}% - 1px)` }} />
                  </span>
                </TableCell>
                <TableCell className="text-right">{fmt.share(r.s)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{fmt.share(r.m)}</TableCell>
                <TableCell className={cn('text-right', dirText(r.d))}>{fmt.pp(r.d)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ───────────── ⑥ 신규상장 ───────────── */
function NewListings({ S, nl }: { S: SM; nl: any }) {
  const items = S.nlF;
  return (
    <Card className="md:col-span-2 xl:col-span-4">
      <CardHeader>
        <CardTitle>{nl.year}년 신규상장 {FOCUS} {items.length}종목</CardTitle>
        <CardDescription>전체 {fmt.num(S.nlTot)}종목 중{nl.filter === 'exBond' ? ', 채권/금리형 제외' : ''}, NAV 순</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="py-6 text-center text-[13px] text-muted-foreground">해당 연도에 상장한 {FOCUS} 종목 없음</p> :
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead>상장일</TableHead><TableHead>종목명</TableHead><TableHead>유형</TableHead><TableHead className="text-right">NAV(조원)</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((r: any) => (
                <TableRow key={r.code}>
                  <TableCell className="text-muted-foreground">{dlabel(r.listDd)}</TableCell>
                  <TableCell><span className="font-medium">{r.name}</span><span className="ml-2 text-xs text-muted-foreground tnum">{r.code}</span></TableCell>
                  <TableCell><Badge variant="outline" className="font-normal"><Swatch color={tc(r.type)} className="size-2" />{r.type}</Badge></TableCell>
                  <TableCell className="text-right">{r.listed ? fmt.eok(r.nav, 2) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
      </CardContent>
    </Card>
  );
}

/* ───────────── 화면 ───────────── */
export default function App() {
  const [meta, setMeta] = React.useState<any>(null);
  const [date, setDate] = React.useState('');
  const [refv, setRef] = React.useState('py');
  const [data, setData] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(true);
  const [err, setErr] = React.useState('');
  const seq = React.useRef(0);

  React.useEffect(() => { boot().then(m => { setMeta(m); setDate(m.defaultDate); }).catch(e => { setErr(e.message); setBusy(false); }); }, []);
  React.useEffect(() => {
    if (!date) return; const n = ++seq.current; setBusy(true);
    loadSummary(date, refv).then(d => { if (n === seq.current) { setData(d); setErr(''); } })
      .catch(e => { if (n === seq.current) setErr(e.message); }).finally(() => { if (n === seq.current) setBusy(false); });
  }, [date, refv]);

  const S = React.useMemo(() => { try { return data ? summaryModel(data) : null; } catch (e) { return null; } }, [data]);
  const color = meta?.colors?.[FOCUS] || '#7a4a1d';

  return (
    <TooltipProvider>
      <div className="flex min-h-svh">
        <Sidebar meta={meta} />
        <div className="min-w-0 flex-1 lg:py-2 lg:pr-2">
          <main className="min-h-full overflow-hidden bg-background lg:rounded-xl lg:border lg:shadow-xs">
            <Toolbar meta={meta} date={date} setDate={setDate} refv={refv} setRef={setRef} busy={busy && !!data} />
            <div className="mx-auto max-w-[1180px] p-4 md:p-6">
              {err && (
                <Card className="mb-4 border-down/30"><CardContent className="flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="font-medium text-down">자료를 불러오지 못함</span><span className="text-muted-foreground">{err}</span>
                  <button onClick={() => { setErr(''); const d = date; setDate(''); setTimeout(() => setDate(d || meta?.defaultDate), 0); }} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 hover:bg-accent"><RefreshCw className="size-3.5" />다시 불러오기</button>
                </CardContent></Card>
              )}
              {!S && !err && <div className="grid min-h-[60vh] place-items-center text-[13px] text-muted-foreground">요약 자료를 불러오는 중</div>}
              {S && (
                <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-4 transition-opacity', busy && 'opacity-60')} aria-busy={busy}>
                  <FocusShare S={S} color={color} />
                  <Stat label="ETF 시장 NAV" value={fmt.eok(S.m.nav)} unit="조원" delta={<Delta v={S.m.ytd?.pct} text={fmt.pct(S.m.ytd?.pct)} />}
                    lines={[`연초 대비 ${fmt.signedEok(S.m.nav - (S.py ? S.py.nav : 0))}조원`, `${fmt.num(S.m.n)}종목`]}
                    extra={<Spark label="ETF 시장 NAV" color="#52525b" points={data.ov.monthly.map((x: any) => ({ ym: x.ym, v: x.nav }))} />} />
                  <Stat label={`${FOCUS} NAV`} color={color} value={fmt.eok(S.f.nav)} unit="조원" delta={<Delta v={S.gr.gf} text={fmt.pct(S.gr.gf)} />}
                    lines={[`${S.RL} 대비 ${fmt.signedEok(S.f.nav - S.f.navPy)}조원`, `시장 ${fmt.pct(S.gr.gm)}`]}
                    extra={<Spark label={`${FOCUS} NAV`} color={color} points={(data.mgr.trend || []).filter((t: any) => t.ym >= data.ov.monthly[0].ym).map((t: any) => ({ ym: t.ym, v: t[FOCUS] || 0 }))} />} />
                  <Stat label={`상위 50 내 ${FOCUS}`} color={color} value={String(S.top50.n)} unit="종목"
                    lines={[`NAV ${fmt.eok(S.top50.nav)}조원`, `NAV 상위 50 ETF 중`]}
                    extra={<Meter pct={S.top50.share} color={color} label="상위 50 NAV 합계 중 비중" />} />
                  <Stat label={`${data.nl.year}년 신규상장 ${FOCUS}`} color={color} value={String(S.nlF.length)} unit="종목"
                    lines={[`NAV ${fmt.eok(S.nlF.reduce((s: number, i: any) => s + i.nav, 0), 2)}조원`, `전체 ${fmt.num(S.nlTot)}종목 중`]}
                    extra={<Meter pct={S.nlTot ? S.nlF.length / S.nlTot * 100 : 0} color={color} label="신규상장 종목 수 중 비중" />} />
                  <TopManagers S={S} meta={meta} date={data.date} />
                  <KeyPoints S={S} nl={data.nl} />
                  <TypeMix S={S} color={color} />
                  <NewListings S={S} nl={data.nl} />
                </div>
              )}
              <p className="mt-6 text-xs text-muted-foreground">자료: KRX 정보데이터시스템, 순자산총액 기준. 기준일 {dlabel(data?.date || date)}, 비교 기준 {S?.RL || '-'}</p>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
