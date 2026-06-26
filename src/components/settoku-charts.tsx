'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line } from 'recharts';

const CHART_COLORS = ['#0083FF','#00D393','#B57EFF','#F8AF00','#FF6466','#00A4FF','#10b981','#ec4899','#06b6d4','#f97316'];

const tooltipStyle = {
  background: '#0C0C10',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  color: '#F5F5F7',
};

export function OutcomeDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="h-[220px]">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color} stroke="#0C0C10" strokeWidth={2}/>)}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: any, n: any) => [`${v} (${total ? ((v/total)*100).toFixed(1):0}%)`, n]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CloserBars({ data }: { data: { name: string; calls: number; closed: number }[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,131,255,0.06)' }}/>
          <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
          <Bar dataKey="calls" fill="#0083FF" radius={[6,6,0,0]} name="Calls" />
          <Bar dataKey="closed" fill="#00D393" radius={[6,6,0,0]} name="Closed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashByCloser({ data }: { data: { name: string; cash: number }[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false}/>
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} width={70} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Cash']} cursor={{ fill: 'rgba(181,126,255,0.06)' }}/>
          <Bar dataKey="cash" radius={[0,6,6,0]}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectionLine({ data }: { data: { month: string; expected: number }[] }) {
  return (
    <div className="h-[240px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false}/>
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v/1000)}k`}/>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `$${Number(v).toLocaleString()}`}/>
          <Line type="monotone" dataKey="expected" stroke="#0083FF" strokeWidth={2.5} dot={{ r: 4, fill: '#0083FF' }} name="Expected"/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
