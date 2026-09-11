'use client';
// src/components/charts/Charts.tsx
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

export function IngresosVsEgresos({ data }: { data: { mes: string; ingreso: number; egreso: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="mes" fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip formatter={(v: any) => 'S/ ' + Number(v).toLocaleString('es-PE')} />
        <Legend />
        <Bar dataKey="ingreso" name="Ingresos" fill="#E30620" radius={[4, 4, 0, 0]} />
        <Bar dataKey="egreso" name="Egresos" fill="#6B7280" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistribucionPie({ data, colorMap }: { data: { name: string; value: number }[]; colorMap: (name: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} label>
          {data.map((d) => <Cell key={d.name} fill={colorMap(d.name)} />)}
        </Pie>
        <Tooltip formatter={(v: any) => Number(v).toLocaleString('es-PE')} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LineaTiempo({ data, xKey, yKey, color = '#2563eb' }: { data: any[]; xKey: string; yKey: string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} fontSize={11} />
        <YAxis fontSize={11} />
        <Tooltip formatter={(v: any) => 'S/ ' + Number(v).toLocaleString('es-PE')} />
        <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
