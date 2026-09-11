'use client';
import { StatCard } from '@/components/ui/ui';
import { AgentDashboard } from '@/lib/dboard';
import { formatMoney, formatDate } from '@/lib/types';

export default function AgentView({ d }: { d: AgentDashboard | null }) {
  if (!d) return <p className="text-slate-400">Sin datos</p>;
  const prog = Math.min(d.cards.progressLots, 100);
  return (
    <div className="space-y-5">
      {(() => {
        const s = (n: number | string | null | undefined) => Number(n || 0);
        const monthly = [
          { t: 'Ventas', v: s(d.cards.salesMonth), c: '#14324b' },
          { t: 'Ingresos', v: s(d.cards.salesAmount), c: '#1c7c54' },
          { t: 'Comisiones', v: s(d.cards.commissionMonth), c: '#b6253c' },
          { t: 'Lotes', v: s(d.cards.lotsSold), c: '#6a4c93' },
        ];
        const moneySeries = [...(d.salesByPeriod || [])].map((p) => {
          const raw = (p as any).amount ?? (p as any).total ?? 0;
          return Number(raw || 0);
        }).filter((v) => isFinite(v)).slice(-10);
        while (moneySeries.length < 6) moneySeries.unshift(0);
        const peak = Math.max(1, ...moneySeries);
        const bw = 26;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {monthly.map((m) => (
                <div key={m.t} className="overflow-hidden rounded-2xl border bg-white p-3" style={{ borderColor: '#ECEFF1' }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.c }} />
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>{m.t}</p>
                  </div>
                  <p className="mt-1.5 truncate text-[22px] font-extrabold" style={{ color: '#171717' }}>
                    {m.t === 'Ingresos' || m.t === 'Comisiones' ? formatMoney(m.v) : m.v}
                  </p>
                  <p className="text-[11px]" style={{ color: '#9AA1AB' }}>{m.t === 'Ventas' ? 'del mes' : m.t === 'Lotes' ? 'vendidos' : 'acumulado'}</p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white p-3" style={{ borderColor: '#ECEFF1' }}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>Mi actividad (salesByPeriod)</p>
              <svg width="100%" height="86" viewBox={`0 0 ${Math.max(240, moneySeries.length * (bw + 8))} 86`} preserveAspectRatio="xMidYMax meet">
                {moneySeries.map((v, i) => {
                  const h = Math.max(3, (v / peak) * 64);
                  const x = i * (bw + 8);
                  const top = 80 - h;
                  return (
                    <g key={i}>
                      <rect x={x} y={top} width={bw} height={h} rx={4} fill="#55728B" opacity={0.35} />
                    </g>
                  );
                })}
                {moneySeries.length > 1 && (
                  <polyline
                    fill="none" stroke="#14324b" strokeWidth={2}
                    points={moneySeries.map((v, i) => `${i * (bw + 8) + bw / 2},${80 - Math.max(3, (v / peak) * 64)}`).join(' ')}
                  />
                )}
              </svg>
              <p className="text-[11px]" style={{ color: '#9AA1AB' }}>Barras por periodo (últimos ciclos); línea = tendencia.</p>
            </div>
          </>
        );
      })()}
      <div className="card">
        <h3 className="font-semibold mb-2">Mi meta mensual de lotes</h3>
        <div className="text-3xl font-bold mb-2">{d.cards.goalLots>0 ? `${Math.min(d.cards.salesMonth,d.cards.goalLots)} / ${d.cards.goalLots} (${d.cards.progressLots}%)` : `${d.cards.salesMonth} vendidos`}</div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-brand-600" style={{ width: prog + '%' }} /></div>
        <p className="text-xs text-slate-400 mt-1">Meta en monto: {formatMoney(d.cards.goalAmount)} · Comisiones acumuladas {formatMoney(d.cards.commissionMonth)}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card"><h3 className="font-semibold mb-2">Mis leads ({d.leads.length})</h3>
          <ul className="divide-y text-sm">{d.leads.map((c:any)=>(
            <li key={c.id} className="py-2 flex justify-between"><span className="text-slate-700">{(c as any).fullName || c.full_name || '—'}</span><span className="badge bg-slate-100 text-slate-600 capitalize">{c.pipeline_status}</span></li>))}
          {!d.leads.length && <li className="text-slate-400 py-2">Sin leads asignados</li>}</ul></div>
        <div className="card"><h3 className="font-semibold mb-2">Próximas cuotas ({d.upcoming.length})</h3>
          <ul className="divide-y text-sm">{d.upcoming.map((p:any)=>(
            <li key={p.id} className="py-2 flex justify-between"><span className="capitalize text-slate-700">{p.type}</span><b>{formatMoney(p.amount)} · {formatDate(p.due_date)}</b></li>))}
          {!d.upcoming.length && <li className="text-slate-400 py-2">Sin cuotas pendientes</li>}</ul></div>
      </div>
    </div>
  );
}
