/* shadcn/ui chart (Recharts) — ChartContainer 가 시리즈별 색을 CSS 변수(--color-키)로 넣고, 툴팁·범례를 같은 모양으로 */
import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/utils';

export type ChartConfig = { [k: string]: { label?: React.ReactNode; color?: string } };
type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);
function useChart() { const c = React.useContext(ChartContext); if (!c) throw new Error('useChart must be used within <ChartContainer />'); return c; }

function ChartContainer({ id, className, children, config, ...props }: React.ComponentProps<'div'> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'] }) {
  const uid = React.useId(); const chartId = `chart-${id || uid.replace(/:/g, '')}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div data-slot="chart" data-chart={chartId}
        className={cn("[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/60 [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex justify-center text-xs [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/60 [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden", className)} {...props}>
        <style dangerouslySetInnerHTML={{ __html: `[data-chart=${chartId}] {${Object.entries(config).filter(([, c]) => c.color).map(([k, c]) => `--color-${k}: ${c.color};`).join('')}}` }} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}
const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({ active, payload, label, labelFormatter, valueFormatter, className, hideZero = true }: any) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  const items = payload.filter((p: any) => !(hideZero && !p.value));
  return (
    <div className={cn('border-border/60 bg-background grid min-w-[10rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl', className)}>
      {label !== undefined && <div className="font-medium">{labelFormatter ? labelFormatter(label, payload) : label}</div>}
      <div className="grid gap-1">
        {items.map((it: any) => {
          const key = String(it.dataKey || it.name), cfg = config[key] || {};
          return (
            <div key={key} className="flex w-full items-center gap-2">
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: cfg.color || it.color }} />
              <span className="text-muted-foreground">{cfg.label || it.name}</span>
              <span className="ml-auto pl-3 font-medium tnum text-foreground">{valueFormatter ? valueFormatter(it.value, key, it.payload) : it.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function ChartLegendContent({ keys, className }: { keys: string[]; className?: string }) {
  const { config } = useChart();
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs', className)}>
      {keys.map(k => (
        <div key={k} className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: config[k]?.color }} />
          <span className="text-muted-foreground">{config[k]?.label || k}</span>
        </div>
      ))}
    </div>
  );
}
export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegendContent, useChart };
