'use client';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { Toaster, toast, StatCard } from '@/components/ui';
import { api } from '@/lib/api';

type A = { id: number; name: string; email: string; status: string; commissionRate?: string; monthlyGoalLots?: number; monthlyGoalAmount?: string };

export default function AgentsPage() {
  const [rows, setRows] = useState<A[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const [ag, sv] = await Promise.all([api.get<any>('/users/agents'), api.get<any>('/sales')]);
      setRows(Array.isArray(ag) ? ag : (ag?.items || []));
      setSales(Array.isArray(sv) ? sv : (sv?.items || []));
    } catch (e: any) { toast((e as any).message as string, 'err'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const amountOf = (a: number) => sales.filter((s) => Number(s.agent_id) === a).reduce((sum, s) => sum + Number(s.sale_price || 0), 0);
  const countOf = (a: number) => sales.filter((s) => Number(s.agent_id) === a).length;

  async function toggle(u: A) {
    try { await api.post(`/users/status/${u.id}/${u.status === 'active' ? 'inactive' : 'active'}`); toast('Estado actualizado'); load(); }
    catch (e: any) { toast(e.message as string, 'err'); }
  }
  async function changeCommission(u: A) {
    const val = prompt(`Comisión % para ${u.name}:`, String(Number(u.commissionRate || 0)));
    const n = Number(val);
    if (val == null || isNaN(n) || n < 0 || n > 100) return toast('Ingresa un % entre 0 y 100', 'err');
    try { await api.post(`/users/update/${u.id}`, { commissionRate: n }); toast('Comisión actualizada'); load(); }
    catch (e: any) { toast(e.message as string, 'err'); }
  }

  return (
    <Layout title="Agentes y rendimiento">
      <Toaster />
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Agentes activos" value={rows.filter((r) => r.status === 'active').length} />
          <StatCard label="Ventas totales" value={sales.length} color="#171717" />
          <StatCard label="Monto vendido (agentes)" value={sales.reduce((s, v) => s + Number(v.sale_price || 0), 0).toLocaleString('es-PE')} color="#125A3B" />
        </div>
        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : rows.length === 0 ? <p className="p-6 text-center text-slate-400 text-sm">No hay agentes.</p>
            : (
            <table className="table-base">
              <thead><tr>
                <th className="th-base">Agente</th><th className="th-base">Comisión</th><th className="th-base">Lotes vendidos</th>
                <th className="th-base">Monto vendido</th><th className="th-base">Meta (lotes/mes)</th><th className="th-base">Estado</th><th className="th-base"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="td-base font-medium">{a.name}</td>
                    <td className="td-base"><button onClick={() => changeCommission(a)} className="text-[#1877F2] text-xs font-medium inline-flex items-center gap-1 hover:underline">⚙ {Number(a.commissionRate || 0)}% editar</button></td>
                    <td className="td-base">{countOf(a.id)}</td>
                    <td className="td-base">{amountOf(a.id).toLocaleString('es-PE')}</td>
                    <td className="td-base">{a.monthlyGoalLots || 0}</td>
                    <td className="td-base"><span className="badge" style={{ background: a.status === 'active' ? '#EAF7EE' : '#F1F5F9', color: a.status === 'active' ? '#125A3B' : '#64748B' }}>{a.status}</span></td>
                    <td className="td-base"><button className="btn-neutral !h-7 text-xs" onClick={() => toggle(a)}>{a.status === 'active' ? 'Desactivar' : 'Activar'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
        </div>
      </div>
    </Layout>
  );
}
