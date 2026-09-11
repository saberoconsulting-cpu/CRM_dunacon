'use client';
import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/ui';
import { FormattedDashboard } from '@/lib/dboard';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/types';
import { DistribucionPie, DistribucionBarras } from '@/components/ui/charts/Charts';

// Tonos derivados del azul de marca para diferenciar proyectos en el gráfico comparativo.
const PROJECT_PALETTE = ['#1877F2', '#1259C4', '#0E46A0', '#4B83C4', '#A9C9FB', '#171717', '#6B7280'];

export default function GeneralView({ d, compact = false }: { d: FormattedDashboard | null; compact?: boolean }) {
  const [projects, setProjects] = useState<any[]>([]);
  useEffect(() => { api.get<any[]>('/projects').then((p) => setProjects(Array.isArray(p) ? p : ((p as any)?.items || []))).catch(() => {}); }, []);

  if (!d) return <p className="text-slate-400">Sin datos</p>;
  const colors: Record<string,string> = { disponible:'#D1D5DB', reservado:'#F2B94B', adelanto:'#4B83C4', primera_cuota:'#8064A2', vendido:'#1877F2' };
  // Azul de marca + negro + grises + azul claro derivados de la identidad
  const channelMap: any = { facebook:'#1877F2', tiktok:'#171717', instagram:'#1259C4', web:'#6B7280', referidos:'#A9C9FB' };
  const lotData = Object.keys(colors).map((k) => ({ name: k, value: d.lots[k] || 0 }));
  const label: Record<string,string> = { disponible:'Disponible',reservado:'Reservado',adelanto:'Con adelanto',primera_cuota:'Primera cuota',vendido:'Vendido' };

  const projectName = (id: number) => projects.find((p) => Number(p.id) === Number(id))?.name || `Proyecto ${id}`;
  const salesByProjectData = (d.salesByProject || []).map((r) => ({ name: projectName(r.projectId), value: r.amount }));
  const projectColorByLabel = (label: string) => {
    const idx = salesByProjectData.findIndex((r) => r.name === label);
    return PROJECT_PALETTE[idx % PROJECT_PALETTE.length] || '#9AA1AB';
  };

  if (compact) {
    return (
      <div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Leads del mes" value={d.cards.leadsMonth} />
          <StatCard label="Ventas del mes" value={d.cards.salesMonth} />
          <StatCard label="Ingresos" value={formatMoney(d.cards.income)} />
          <StatCard label="Egresos" value={formatMoney(d.cards.expense)} />
          <StatCard label="Utilidad" value={formatMoney(d.cards.profit)} />
          <StatCard label="Lotes vendidos del periodo" value={d.lots.vendido || 0} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Leads del mes" value={d.cards.leadsMonth} />
        <StatCard label="Ventas del mes" value={d.cards.salesMonth} />
        <StatCard label="Ingresos" value={formatMoney(d.cards.income)} />
        <StatCard label="Egresos" value={formatMoney(d.cards.expense)} />
        <StatCard label="Utilidad" value={formatMoney(d.cards.profit)} />
        <StatCard label="Lotes vendidos del periodo" value={d.lots.vendido || 0} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card"><h3 className="mb-3">Estados de lotes</h3>
          <DistribucionPie data={lotData.map((x)=>({ name: label[x.name]||x.name, value: x.value }))} colorMap={(n)=> colors[Object.keys(label).find(k=>label[k]===n)||'']||'#9AA1AB'} />
        </div>
        <div className="card"><h3 className="mb-3">Origen de leads</h3>
          <DistribucionPie data={d.leadsByChannel.map((c)=>({name:c.channel,value:c.total}))} colorMap={(n)=>channelMap[n]||'#9AA1AB'} />
        </div>
      </div>
      <div className="card">
        <h3 className="mb-3 font-semibold">Ventas por proyecto</h3>
        {salesByProjectData.length ? (
          <DistribucionBarras data={salesByProjectData} colorMap={projectColorByLabel} valuePrefix="S/ " />
        ) : <p className="py-8 text-center text-sm text-slate-400">Aún no hay ventas registradas en ningún proyecto.</p>}
      </div>
      <div className="card"><h3 className="font-semibold mb-3">Ranking de agentes</h3>
        <div className="overflow-auto"><table className="table-base"><thead><tr>
          <th className="th-base">#</th><th className="th-base">Agente</th><th className="th-base">Ventas</th><th className="th-base">Monto</th><th className="th-base">Comisión</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {d.agentRanking.map((a,i)=>(<tr key={i}><td className="td-base">{i+1}</td><td className="td-base font-medium">{a.agentName||'—'}</td><td className="td-base">{a.salesCount}</td><td className="td-base">{formatMoney(a.salesAmount)}</td><td className="td-base">{formatMoney(a.commission)}</td></tr>))}
            {d.agentRanking.length===0 && <tr><td className="td-base text-slate-400" colSpan={5}>Sin ventas todavía</td></tr>}
          </tbody></table></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card"><h3 className="font-semibold mb-2">Últimas ventas</h3>
          {d.recentSales.length ? (
            <ul className="divide-y text-sm">
              {d.recentSales.map((s: any, i: number) => {
                const kind = s.fromPayment ? (s.type ? `Pago · ${s.type}` : 'Pago confirmado') : 'Venta';
                return (
                  <li key={i} className="py-2 flex justify-between gap-2">
                    <span className="text-slate-600 capitalize truncate">{kind}</span>
                    <b>{formatMoney(s.salePrice)}</b>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-slate-400 text-sm">Sin ventas</p>}
        </div>
        <div className="card"><h3 className="font-semibold mb-2">Últimos pagos</h3>
          {d.recentPayments.length? <ul className="divide-y text-sm">{d.recentPayments.map((p:any,i:number)=>(
            <li key={i} className="py-2 flex justify-between gap-2"><span className="text-slate-600 capitalize">{p.type}</span><b className={p.status==='pagado'?'text-emerald-600':''}>{formatMoney(p.amount)}</b></li>))}</ul> : <p className="text-slate-400 text-sm">Sin pagos</p>}
        </div>
      </div>
    </div>
  );
}
