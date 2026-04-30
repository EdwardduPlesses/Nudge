"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCurrency } from "@/context/currency-context";
import { formatUsdAsDisplayAxisTick } from "@/lib/format-money";

const PIE_W = 328;
const PIE_H = 240;

function useTrackedChartWidth(min: number, max: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(min);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const commit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = Math.floor(el.getBoundingClientRect().width);
        const next = Math.min(max, Math.max(min, w > 0 ? w : min));
        setWidth(next);
      });
    };

    commit();
    const ro = new ResizeObserver(commit);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [min, max]);

  return { ref, width };
}

/** Recharts Tooltip ignores Tailwind; align with `globals.css` (--background / --foreground). */
function useChartTooltipTheme() {
  return useMemo(
    () =>
      ({
        wrapperStyle: {
          outline: "none",
          filter: "none",
          zIndex: 20,
        },
        contentStyle: {
          borderRadius: 12,
          border: "1px solid color-mix(in srgb, var(--foreground) 14%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--background) 94%, var(--foreground))",
          color: "var(--foreground)",
          boxShadow: "0 10px 28px color-mix(in srgb, black 50%, transparent)",
          fontSize: 13,
          padding: "10px 12px",
        },
        labelStyle: {
          color: "color-mix(in srgb, var(--foreground) 75%, transparent)",
          marginBottom: 4,
          fontWeight: 500,
        },
        itemStyle: {
          color: "var(--foreground)",
        },
      }) as const,
    [],
  );
}

export function CategoryPie({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const c = useCurrency();
  const tooltip = useChartTooltipTheme();

  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-gray-600/30 bg-gray-900/2 px-4 text-center text-sm text-gray-500 dark:bg-white/2">
        No spending yet this month
      </div>
    );
  }

  return (
    <div
      className="flex h-[240px] w-full min-h-[240px] min-w-[min(100%,280px)] items-center justify-center overflow-hidden rounded-2xl"
      style={{ minWidth: 280 }}
    >
      <PieChart width={PIE_W} height={PIE_H} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx={PIE_W / 2}
          cy={PIE_H / 2}
          innerRadius={56}
          outerRadius={88}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [c.formatFromUsd(Number(value ?? 0)), "Spent"]}
          {...tooltip}
        />
      </PieChart>
    </div>
  );
}

const BAR_H = 220;

export function WeekBarChart({ data }: { data: { day: string; total: number }[] }) {
  const tooltip = useChartTooltipTheme();
  const c = useCurrency();
  const axisTickUsd = (n: number) =>
    formatUsdAsDisplayAxisTick(Number(n ?? 0), c.currency, c.rateForCurrency());
  const { ref, width } = useTrackedChartWidth(288, 960);

  return (
    <div
      ref={ref}
      className="h-[220px] w-full min-h-[220px] min-w-0 shrink-0 overflow-hidden rounded-2xl"
    >
      <BarChart width={width} height={BAR_H} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => axisTickUsd(Number(v ?? 0))}
          width={c.currency === "USD" ? 48 : 62}
        />
        <Tooltip
          formatter={(value) => [c.formatFromUsd(Number(value ?? 0)), "Spending"]}
          {...tooltip}
        />
        <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="var(--gold-primary)" />
      </BarChart>
    </div>
  );
}
