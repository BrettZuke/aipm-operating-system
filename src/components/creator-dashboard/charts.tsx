"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { fmtInt, fmtMoney } from "@/lib/creator/format";

interface SparklinePoint {
  date: string;
  sessions: number;
}

export function SessionsSparkline({ points }: { points: ReadonlyArray<SparklinePoint> }) {
  if (points.length === 0) {
    return <div className="text-xs text-[#6B7280]">No data yet.</div>;
  }
  return (
    <div>
      <div style={{ width: "100%", height: 80 }}>
        <ResponsiveContainer>
          <AreaChart data={[...points]} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0083FF" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0083FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{
                background: "#0C0C10",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#9CA3AF" }}
              formatter={(v) => [fmtInt(Number(v) || 0), "sessions"]}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="#0083FF"
              strokeWidth={1.5}
              fill="url(#sparkFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-[#6B7280]">
        <span>{points[0].date}</span>
        <span>{fmtInt(points.reduce((s, p) => s + p.sessions, 0))} sessions total</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

interface RevenuePoint {
  date: string;
  revenue: number;
  count: number;
}

export function RevenueChart({ points, currency }: { points: ReadonlyArray<RevenuePoint>; currency: string }) {
  if (points.length === 0) {
    return <div className="text-xs text-[#6B7280]">No sales in this range yet.</div>;
  }
  const total = points.reduce((s, p) => s + p.revenue, 0);
  const orders = points.reduce((s, p) => s + p.count, 0);
  return (
    <div>
      <div style={{ width: "100%", height: 170 }}>
        <ResponsiveContainer>
          <BarChart data={[...points]} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="date" hide />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{ background: "#0C0C10", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#9CA3AF" }}
              formatter={(v) => [fmtMoney(Number(v) || 0, currency), "revenue"]}
            />
            <Bar dataKey="revenue" fill="#00D393" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-[#6B7280]">
        <span>{points[0].date}</span>
        <span>{fmtMoney(total, currency)} · {fmtInt(orders)} orders</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

interface DonutSlice {
  label: string;
  value: number;
}

const PALETTE = ["#0083FF", "#00D393", "#F8AF00", "#FF6466", "#B57EFF", "#00A4FF", "#84cc16", "#ec4899"];

export function UtmDonut({ data }: { data: ReadonlyArray<DonutSlice> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div className="text-xs text-[#6B7280]">No data yet.</div>;
  }
  return (
    <div className="flex items-center gap-6">
      <div style={{ width: 160, height: 160 }} className="shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={[...data]}
              dataKey="value"
              nameKey="label"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={1}
              startAngle={90}
              endAngle={-270}
              stroke="#0C0C10"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#0C0C10",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#9CA3AF" }}
              formatter={(v) => [fmtInt(Number(v) || 0), "sessions"]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => {
          const pct = ((d.value / total) * 100).toFixed(1);
          return (
            <li key={d.label} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="truncate text-[#F5F5F7]" title={d.label}>{d.label}</span>
              </div>
              <div className="font-mono text-xs tabular-nums text-[#9CA3AF]">
                {fmtInt(d.value)} <span className="text-[#6B7280]">· {pct}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface BarRow {
  label: string;
  sessions: number;
}

export function BarList({ rows, labelMaxChars = 32 }: { rows: ReadonlyArray<BarRow>; labelMaxChars?: number }) {
  if (rows.length === 0) {
    return <div className="text-xs text-[#6B7280]">No data yet.</div>;
  }
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const pct = (row.sessions / max) * 100;
        const label = row.label.length > labelMaxChars ? `${row.label.slice(0, labelMaxChars - 1)}…` : row.label;
        return (
          <div key={row.label} className="relative">
            <div className="absolute inset-y-0 left-0 rounded bg-[#0083FF]/15" style={{ width: `${pct}%` }} aria-hidden />
            <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
              <span className="truncate text-[#F5F5F7]" title={row.label}>{label}</span>
              <span className="ml-2 font-mono text-xs tabular-nums text-[#9CA3AF]">{fmtInt(row.sessions)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
