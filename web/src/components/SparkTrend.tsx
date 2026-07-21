import ReactECharts from 'echarts-for-react';
import { pctClass } from '@/lib/utils';

type Point = { time: string; value: number };

export function SparkTrend({
  points,
  height = 48,
  positiveIsUp = true,
}: {
  points: Point[];
  height?: number;
  positiveIsUp?: boolean;
}) {
  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-muted"
        style={{ height }}
      >
        暂无走势
      </div>
    );
  }

  const last = points[points.length - 1]?.value ?? 0;
  const first = points[0]?.value ?? 0;
  const up = positiveIsUp ? last >= first : last < first;
  const color = up ? '#d7263d' : '#0f8a5f';

  const option = {
    animation: false,
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { type: 'category', show: false, data: points.map((p) => p.time) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [
      {
        type: 'line',
        data: points.map((p) => p.value),
        showSymbol: false,
        smooth: 0.25,
        lineStyle: { width: 1.5, color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}33` },
              { offset: 1, color: `${color}00` },
            ],
          },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'canvas' }} />;
}

export function MiniPct({ value }: { value: number | null | undefined }) {
  const cls = pctClass(value);
  if (value == null) return <span className="font-mono text-muted">--</span>;
  const sign = value > 0 ? '+' : '';
  return (
    <span className={`font-mono font-semibold tabular-nums ${cls}`}>
      {sign}
      {value.toFixed(2)}%
    </span>
  );
}
