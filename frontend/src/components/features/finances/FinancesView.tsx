'use client';
import { useEffect, useState, useCallback } from 'react';
import { Toaster, toast, Field, StatCard } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/types';

type T = { id: number; type: string; category: string; concept: string; amount: string; txn_date: string; projectId?: number | null };

const CATS = ['marketing', 'mantenimiento', 'obra', 'administracion', 'comisiones', 'otros'];

export default function FinancesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [summary, setSummary] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [txns, setTxns] = useState<T[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('');
  const [openExp, setOpenExp] = useState(false);
  const [openIn, setOpenIn] = useState(false);
  const [eForm, setEForm] = useState<any>({});
  const [iForm, setIForm] = useState<any>({});
  const ef = (k: string, v: any) => setEForm((p: any) => ({ ...p, [k]: v }));
  const inf = (k: string, v: any) => setIForm((p: any) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    try {
      const pq = lockedProjectId ? `projectId=${lockedProjectId}` : '';
      const txnQ = [cat ? `category=${cat}` : '', pq].filter(Boolean).join('&');
      const [s, t, st] = await Promise.all([
        api.get<any>(`/finances/summary?period=monthly${pq ? `&${pq}` : ''}`),
        api.get<any[]>(`/finances/transactions${txnQ ? `?${txnQ}` : ''}`),
        api.get<any>(`/finances/income-statement${pq ? `?${pq}` : ''}`),
      ]);
      setSummary(s); setTxns(t || []); setStatement(st);
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [cat, lockedProjectId]);

  useEffect(() => { load(); api.get<any[]>('/projects').then(setProjects).catch(() => {}); }, [load]);

  async function addEgreso() {
    if (!eForm.concept || !eForm.amount) return toast('Completa concepto y monto', 'err');
    try {
      await api.post('/finances/expense', { projectId: lockedProjectId || eForm.projectId || null, expenseClass: eForm.expenseClass || 'operacion', category: eForm.category || 'otros', concept: eForm.concept, amount: Number(eForm.amount) });
      toast('Egreso registrado'); setOpenExp(false); setEForm({}); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }
  async function addIngreso() {
    if (!iForm.concept || !iForm.amount) return toast('Completa concepto y monto', 'err');
    try {
      await api.post('/finances/income', { projectId: lockedProjectId || iForm.projectId || null, concept: iForm.concept, amount: Number(iForm.amount) });
      toast('Ingreso adicional registrado'); setOpenIn(false); setIForm({}); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }
  const income = Number(summary?.income || 0);
  const expense = Number(summary?.expense || 0);

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Ingresos" value={formatMoney(income)} color="#125A3B" />
          <StatCard label="Egresos" value={formatMoney(expense)} color="#1259C4" />
          <StatCard label="Utilidad estimada" value={formatMoney(income - expense)} color={income - expense >= 0 ? '#125A3B' : '#1259C4'} />
          <StatCard label="Movimientos" value={txns.length} />
        </div>
        {statement && (
          <div className="card">
            <h3 className="font-semibold mb-3">Estado de resultados (por familia de gasto)</h3>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-xl p-3" style={{ background:'#F0FDF4' }}>
                <div className="text-xs" style={{ color:'#16A34A' }}>Ingresos</div>
                <div className="text-lg font-bold" style={{ color:'#125A3B' }}>{formatMoney(statement.ingresos)}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background:'#FFF7ED' }}>
                <div className="text-xs" style={{ color:'#EA580C' }}>Compra de terreno</div>
                <div className="text-lg font-bold" style={{ color:'#9A3412' }}>{formatMoney((statement.egresos_clasificados || {}).compra_terreno)}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background:'#F1F5F9' }}>
                <div className="text-xs" style={{ color:'#0F766E' }}>Inversión (construcción)</div>
                <div className="text-lg font-bold" style={{ color:'#0F766E' }}>{formatMoney((statement.egresos_clasificados || {}).inversion)}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background:'#EEE7FF' }}>
                <div className="text-xs" style={{ color:'#6D28D9' }}>Financiamiento</div>
                <div className="text-lg font-bold" style={{ color:'#5B21B6' }}>{formatMoney((statement.egresos_clasificados || {}).financiamiento)}</div>
              </div>
              <div className="rounded-xl p-3" style={{ background:'#E7F0FE' }}>
                <div className="text-xs" style={{ color:'#1877F2' }}>Operación</div>
                <div className="text-lg font-bold" style={{ color:'#1259C4' }}>{formatMoney((statement.egresos_clasificados || {}).operacion)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 mt-4 pt-3 border-t" style={{ borderColor:'#E2E8F0' }}>
              <div><span className="text-sm" style={{ color:'#6B7280' }}>Total egresos:</span> <b>{formatMoney(statement.egresos_total)}</b></div>
              <div><span className="text-sm" style={{ color:'#6B7280' }}>Utilidad:</span> <b style={{ color: Number(statement.utilidad) >= 0 ? '#125A3B' : '#1259C4' }}>{formatMoney(statement.utilidad)}</b></div>
            </div>
          </div>
        )}
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Flujo financiero</h3>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => setOpenExp(true)}>Registrar egreso</button>
              <button className="btn-outline" onClick={() => setOpenIn(true)}>Registrar ingreso</button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="badge" style={{ background: '#EAF7EE', color: '#125A3B' }}>Ingreso</span>
            <span className="badge" style={{ background: '#E7F0FE', color: '#1259C4' }}>Egreso</span>
            <button className="btn-neutral ml-auto !h-8 text-xs" onClick={() => setCat('')}>Limpiar filtro</button>
          </div>
        </div>
        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : txns.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">Aún no hay movimientos.</p>
            : (
            <table className="table-base">
              <thead><tr>
                <th className="th-base">Tipo</th><th className="th-base">Categoría</th><th className="th-base">Concepto</th>
                <th className="th-base">Monto</th><th className="th-base">Fecha</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {txns.map((t) => (
                  <tr key={t.id}>
                    <td className="td-base"><span className="badge" style={{ background: t.type === 'ingreso' ? '#EAF7EE' : '#E7F0FE', color: t.type === 'ingreso' ? '#125A3B' : '#1259C4' }}>{t.type}</span></td>
                    <td className="td-base capitalize">{t.category}</td>
                    <td className="td-base">{t.concept}</td>
                    <td className="td-base font-medium">{formatMoney(t.amount)}</td>
                    <td className="td-base">{formatDate(t.txn_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
        </div>
      </div>
      {openExp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenExp(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Registrar egreso</h3>
            <Field label="Concepto *"><input className="input" value={eForm.concept || ''} onChange={(e) => ef('concept', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría"><select className="input" value={eForm.category || 'otros'} onChange={(e) => ef('category', e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              <Field label="Monto (S/) *"><input type="number" className="input" value={eForm.amount || ''} onChange={(e) => ef('amount', e.target.value)} /></Field>
            </div>
            <Field label="Clasificación de la inversión/gasto">
              <select className="input" value={eForm.expenseClass || 'operacion'} onChange={(e) => ef('expenseClass', e.target.value)}>
                <option value="operacion">Operación (G&A, comisiones, admin)</option>
                <option value="inversion">Inversión / Construcción</option>
                <option value="financiamiento">Financiamiento</option>
                <option value="compra_terreno">Compra de terreno</option>
              </select>
            </Field>
            {!lockedProjectId && (
              <Field label="Proyecto"><select className="input" value={eForm.projectId || ''} onChange={(e) => ef('projectId', e.target.value ? Number(e.target.value) : null)}><option value="">—</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpenExp(false)}>Cancelar</button>
              <button className="btn-primary" onClick={addEgreso}>Guardar egreso</button>
            </div>
          </div>
        </div>
      )}
      {openIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenIn(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Registrar ingreso adicional</h3>
            <Field label="Concepto *"><input className="input" value={iForm.concept || ''} onChange={(e) => inf('concept', e.target.value)} /></Field>
            <Field label="Monto (S/) *"><input type="number" className="input" value={iForm.amount || ''} onChange={(e) => inf('amount', e.target.value)} /></Field>
            {!lockedProjectId && (
              <Field label="Proyecto"><select className="input" value={iForm.projectId || ''} onChange={(e) => inf('projectId', e.target.value ? Number(e.target.value) : null)}><option value="">—</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpenIn(false)}>Cancelar</button>
              <button className="btn-primary" onClick={addIngreso}>Guardar ingreso</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
