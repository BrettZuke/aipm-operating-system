'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line } from 'recharts';

const COLORS = ['#4338ca','#7c3aed','#db2777','#ea580c','#d97706','#059669','#0d9488','#0891b2','#2563eb','#1e3a8a'];

const tooltipStyle = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  color: '#0f172a',
};

export function OutcomeDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="h-[220px]">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color} stroke="#ffffff" strokeWidth={2}/>)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [`${v} (${total ? ((v/total)*100).toFixed(1):0}%)`, n]}/>
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
          <CartesianGrid stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(79,70,229,0.05)' }}/>
          <Legend wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
          <Bar dataKey="calls" fill="#4338ca" radius={[6,6,0,0]} name="Calls" />
          <Bar dataKey="closed" fill="#059669" radius={[6,6,0,0]} name="Closed" />
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
          <CartesianGrid stroke="#e5e7eb" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} width={70} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Cash']} cursor={{ fill: 'rgba(124,58,237,0.05)' }}/>
          <Bar dataKey="cash" radius={[0,6,6,0]}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
          <CartesianGrid stroke="#e5e7eb" vertical={false}/>
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v/1000)}k`}/>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `$${Number(v).toLocaleString()}`}/>
          <Line type="monotone" dataKey="expected" stroke="#4338ca" strokeWidth={2.5} dot={{ r: 4, fill: '#4338ca' }} name="Expected"/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
