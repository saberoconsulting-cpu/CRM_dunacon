'use client';
import { useEffect, useState, useCallback } from 'react';
import { Toaster, toast, Field, StatCard } from '@/components/ui/ui';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/types';
import { useDisplayCurrency } from '@/lib/currency';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { FiSearch } from 'react-icons/fi';

type T = {
  id: number; type: string; category: string; concept: string; amount: string; txnDate: string; projectId?: number | null;
  lotId?: number | null; clientId?: number | null; lotCode?: string | null; clientName?: string | null; paymentMethod?: string | null;
};

const CATS = ['marketing', 'mantenimiento', 'obra', 'administracion', 'comisiones', 'otros'];
const PAYMENT_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia',
  deposito: 'Depósito', cheque_gerencia: 'Cheque gerencia', tarjeta: 'Tarjeta', otro: 'Otro',
};
const paymentLabel = (v?: string | null) => (v ? (PAYMENT_LABEL[v] || v) : '—');

export default function FinancesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [summary, setSummary] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [txns, setTxns] = useState<T[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'ingreso' | 'egreso'>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [openExp, setOpenExp] = useState(false);
  const [openIn, setOpenIn] = useState(false);
  const [eForm, setEForm] = useState<any>({});
  const [iForm, setIForm] = useState<any>({});
  const ef = (k: string, v: any) => setEForm((p: any) => ({ ...p, [k]: v }));
  const inf = (k: string, v: any) => setIForm((p: any) => ({ ...p, [k]: v }));
  // Moneda unica de la pantalla: `show()` convierte los montos (que vienen en
  // soles de la base de datos) a la moneda activa antes de pintarlos.
  const { currency, setCurrency, exchangeRate, setExchangeRate, format: show } = useDisplayCurrency();

  const load = useCallback(async () => {
    try {
      const pq = lockedProjectId ? `projectId=${lockedProjectId}` : '';
      const txnQ = [typeFilter ? `type=${typeFilter}` : '', cat ? `category=${cat}` : '', debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : '', pq, `page=${page}`, `limit=${limit}`].filter(Boolean).join('&');
      const [s, t, st] = await Promise.all([
        api.get<any>(`/finances/summary?period=monthly${pq ? `&${pq}` : ''}`),
        api.get<any>(`/finances/transactions${txnQ ? `?${txnQ}` : ''}`),
        api.get<any>(`/finances/income-statement${pq ? `?${pq}` : ''}`),
      ]);
      const items = Array.isArray(t) ? t : (t?.items || []);
      setSummary(s);
      setTxns(items || []);
      setMeta({
        total: Number(Array.isArray(t) ? t.length : (t?.total ?? items.length)),
        totalPages: Number(Array.isArray(t) ? 1 : (t?.totalPages ?? 1)),
      });
      setTotalAmount(Number(Array.isArray(t) ? (t as T[]).reduce((sum, r) => sum + Number(r.amount || 0), 0) : (t?.totalAmount ?? 0)));
      setStatement(st);
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [cat, typeFilter, debouncedSearch, lockedProjectId, page, limit]);

  useEffect(() => { load(); api.get<any[]>('/projects').then(setProjects).catch(() => {}); }, [load]);
  useEffect(() => { setPage(1); }, [cat, typeFilter, debouncedSearch, lockedProjectId]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

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
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Resumen financiero</h3>
          <CurrencyToggle
            currency={currency}
            setCurrency={setCurrency}
            exchangeRate={exchangeRate}
            setExchangeRate={setExchangeRate}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard label="Ingresos" value={show(income)} color="#125A3B" />
          <StatCard label="Egresos" value={show(expense)} color="#1259C4" />
          <StatCard label="Utilidad estimada" value={show(income - expense)} color={income - expense >= 0 ? '#125A3B' : '#1259C4'} />
          <StatCard label="Movimientos" value={meta.total} />
        </div>
        {statement && (
          <div className="card">
            <h3 className="font-semibold mb-3">Estado de resultados (por familia de gasto)</h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                { label: 'Ingresos', value: statement.ingresos, labelColor: '#16A34A', bg: '#F0FDF4', valueColor: '#125A3B' },
                { label: 'Compra de terreno', value: (statement.egresos_clasificados || {}).compra_terreno, labelColor: '#EA580C', bg: '#FFF7ED', valueColor: '#9A3412' },
                { label: 'Inversión (construcción)', value: (statement.egresos_clasificados || {}).inversion, labelColor: '#0F766E', bg: '#F1F5F9', valueColor: '#0F766E' },
                { label: 'Financiamiento', value: (statement.egresos_clasificados || {}).financiamiento, labelColor: '#6D28D9', bg: '#EEE7FF', valueColor: '#5B21B6' },
                { label: 'Operación', value: (statement.egresos_clasificados || {}).operacion, labelColor: '#1877F2', bg: '#E7F0FE', valueColor: '#1259C4' },
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-xl px-3 py-2.5" style={{ background: item.bg }}>
                  <div className="truncate text-[11px] font-medium leading-tight sm:text-xs" style={{ color: item.labelColor }} title={item.label}>{item.label}</div>
                  <div className="truncate text-sm font-bold tabular-nums sm:text-lg" style={{ color: item.valueColor }}>{show(item.value)}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-6 mt-4 pt-3 border-t" style={{ borderColor:'#E2E8F0' }}>
              <div><span className="text-sm" style={{ color:'#6B7280' }}>Total egresos:</span> <b>{show(statement.egresos_total)}</b></div>
              <div><span className="text-sm" style={{ color:'#6B7280' }}>Utilidad:</span> <b style={{ color: Number(statement.utilidad) >= 0 ? '#125A3B' : '#1259C4' }}>{show(statement.utilidad)}</b></div>
            </div>
          </div>
        )}
        <div className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold">Flujo financiero</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button className="btn-primary whitespace-nowrap" onClick={() => setOpenExp(true)}>Registrar egreso</button>
              <button className="btn-outline whitespace-nowrap" onClick={() => setOpenIn(true)}>Registrar ingreso</button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#E5E7EB' }}>
            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: '' as const, label: 'Todos', bg: '#F3F4F6', color: '#374151', activeBg: '#171717', activeColor: '#FFFFFF' },
                { key: 'ingreso' as const, label: 'Ingreso', bg: '#EAF7EE', color: '#125A3B', activeBg: '#16A36A', activeColor: '#FFFFFF' },
                { key: 'egreso' as const, label: 'Egreso', bg: '#E7F0FE', color: '#1259C4', activeBg: '#1259C4', activeColor: '#FFFFFF' },
              ]).map((option) => {
                const active = typeFilter === option.key;
                return (
                  <button
                    key={option.key || 'todos'}
                    type="button"
                    onClick={() => setTypeFilter(option.key)}
                    aria-pressed={active}
                    className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
                    style={{
                      background: active ? option.activeBg : option.bg,
                      color: active ? option.activeColor : option.color,
                      boxShadow: active ? '0 4px 10px rgba(15,23,42,.16)' : 'none',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
              <div className="relative ml-1 w-full sm:w-72">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input !h-9 !pl-9"
                  placeholder="Buscar lote, cliente, medio pago o concepto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select className="input !h-9 !w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">Todas las categorías</option>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(cat || search || typeFilter) && (
              <button className="btn-neutral !h-8 w-full text-xs sm:w-auto" onClick={() => { setCat(''); setSearch(''); setDebouncedSearch(''); setTypeFilter(''); }}>Limpiar filtros</button>
            )}
          </div>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-auto">
            {loading ? <p className="p-4 text-slate-400">Cargando…</p>
              : txns.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">Aún no hay movimientos.</p>
              : (
              <table className="table-base">
                <thead><tr>
                  <th className="th-base">Tipo</th><th className="th-base">Categoría</th><th className="th-base">Concepto</th>
                  <th className="th-base">Lote</th><th className="th-base">Cliente</th><th className="th-base">Medio de pago</th>
                  <th className="th-base">Monto</th><th className="th-base">Fecha</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="td-base"><span className="badge" style={{ background: t.type === 'ingreso' ? '#EAF7EE' : '#E7F0FE', color: t.type === 'ingreso' ? '#125A3B' : '#1259C4' }}>{t.type}</span></td>
                      <td className="td-base capitalize">{t.category}</td>
                      <td className="td-base">{t.concept}</td>
                      <td className="td-base">{t.lotCode || (t.lotId ? `#${t.lotId}` : '—')}</td>
                      <td className="td-base">{t.clientName || (t.clientId ? `#${t.clientId}` : '—')}</td>
                      <td className="td-base">{paymentLabel(t.paymentMethod)}</td>
                      <td className="td-base font-medium tabular-nums">{show(t.amount)}</td>
                      <td className="td-base">{formatDate(t.txnDate)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0B2F6E' }}>
                    <td className="td-base font-bold text-white" colSpan={6}>Totales ({meta.total})</td>
                    <td className="td-base font-bold text-white tabular-nums">{show(totalAmount)}</td>
                    <td className="td-base" />
                  </tr>
                </tfoot>
              </table>
              )}
          </div>
          <div className="bg-white p-3 border-t" style={{ borderColor: '#F0F1F3' }}>
            <PaginationBar label="Movimientos" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={setLimit} />
          </div>
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
