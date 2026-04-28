"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const fmt = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);

export function CategoryPie({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-gray-600/40 text-sm opacity-70">
        No spending yet this month
      </div>
    );
  }
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={56}
            outerRadius={88}
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [
              fmt(Number(value ?? 0)),
              "Spent",
            ]}
            contentStyle={{ borderRadius: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeekBarChart({ data }: { data: { day: string; total: number }[] }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={40} />
          <Tooltip
            formatter={(value) => [fmt(Number(value ?? 0)), "Spending"]}
            contentStyle={{ borderRadius: 8 }}
          />
          <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#12a594" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
