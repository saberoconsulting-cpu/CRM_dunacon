'use client';
import { useEffect, useState, useCallback } from 'react';
import { Toaster, toast, Field, StatCard } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { Select } from '@/components/ui/Select';
import { formatMoney } from '@/lib/types';
import { PaginationBar } from '@/components/ui/PaginationBar';

type C = { id: number; name: string; channel: string; projectId?: number | null; budget: string; realExpense: string; status: string; metrics?: { leads: number; attributedIncome: number } };

const CHANNELS: any = { facebook: 'Facebook', tiktok: 'TikTok', instagram: 'Instagram', web: 'Web', referidos: 'Referidos', otro: 'Otro' };
const CH_COLOR: any = { facebook: '#1877F2', tiktok: '#171717', instagram: '#1259C4', web: '#6B7280', referidos: '#166FE0', otro: '#9AA1AB' };

export default function CampaignsView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [rows, setRows] = useState<C[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [fProject, setFProject] = useState(lockedProjectId ? String(lockedProjectId) : '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [form, setForm] = useState<any>({});
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  useEffect(() => { if (lockedProjectId) setFProject(String(lockedProjectId)); }, [lockedProjectId]);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (fProject) q.set('projectId', fProject);
      q.set('page', String(page));
      q.set('limit', String(limit));
      const back = (await api.get<any>(`/campaigns?${q.toString()}`)) || {};
      const items: C[] = Array.isArray(back) ? back : (back.items || []);
      setRows(items);
      setMeta({
        total: Number(Array.isArray(back) ? back.length : (back.total ?? items.length)),
        totalPages: Number(Array.isArray(back) ? 1 : (back.totalPages ?? 1)),
      });
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [fProject, page, limit]);

  useEffect(() => { load(); api.get<any[]>('/projects').then(setProjects).catch(() => {}); }, [load]);
  useEffect(() => { setPage(1); }, [fProject, lockedProjectId]);

  async function crear() {
    if (!form.name) return toast('Ingresa el nombre', 'err');
    try {
      await api.post('/campaigns', { name: form.name, channel: form.channel || 'otro', projectId: lockedProjectId || form.projectId || null, budget: Number(form.budget || 0) });
      toast('Campaña creada'); setOpen(false); setForm({}); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }
  const totalSpend = rows.reduce((s, r) => s + Number(r.realExpense || 0), 0);

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Campañas" value={meta.total} />
          <StatCard label="Gasto total" value={formatMoney(totalSpend)} />
          <StatCard label="Leads captados" value={rows.reduce((s, r) => s + (r.metrics?.leads || 0), 0)} color="#171717" />
          <StatCard label="Ingreso atribuido" value={formatMoney(rows.reduce((s, r) => s + (r.metrics?.attributedIncome || 0), 0))} color="#125A3B" />
        </div>
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Campañas</h3>
            <div className="flex flex-wrap gap-2">
              {!lockedProjectId && (
                <Select
                value={fProject}
                onChange={setFProject}
                className="!w-auto"
                options={[{ value: '', label: 'Proyecto: todos' }, ...projects.map((p: any) => ({ value: p.id, label: p.name }))]}
              />
              )}
              <button className="btn-primary" onClick={() => setOpen(true)}>Nueva campaña</button>
            </div>
          </div>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-auto">
            <table className="table-base">
              <thead><tr>
                <th className="th-base">Campaña</th><th className="th-base">Canal</th><th className="th-base">Presupuesto</th>
                <th className="th-base">Gasto real</th><th className="th-base">Leads</th><th className="th-base">CPL</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => {
                  const leads = c.metrics?.leads || 0;
                  const cpl = leads > 0 ? Number(c.realExpense || 0) / leads : 0;
                  return (
                    <tr key={c.id}>
                      <td className="td-base font-medium">{c.name}</td>
                      <td className="td-base"><span className="badge" style={{ background: CH_COLOR[c.channel] + '22', color: CH_COLOR[c.channel] }}>{CHANNELS[c.channel] || c.channel}</span></td>
                      <td className="td-base">{formatMoney(c.budget)}</td>
                      <td className="td-base">{formatMoney(c.realExpense)}</td>
                      <td className="td-base">{leads}</td>
                      <td className="td-base">{formatMoney(cpl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && rows.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No hay campañas aún.</p>}
          </div>
          <div className="bg-white p-3 border-t" style={{ borderColor: '#F0F1F3' }}>
            <PaginationBar label="Campañas" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={setLimit} />
          </div>
        </div>      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Nueva campaña</h3>
            <Field label="Nombre *"><input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Canal"><Select value={form.channel || 'otro'} onChange={(v) => set('channel', v)} options={Object.keys(CHANNELS).map((k) => ({ value: k, label: CHANNELS[k] }))} /></Field>
              {!lockedProjectId && (
                <Field label="Proyecto"><Select value={form.projectId || ''} onChange={(v) => set('projectId', v ? Number(v) : null)} options={[{ value: '', label: '—' }, ...projects.map((p: any) => ({ value: p.id, label: p.name }))]} /></Field>
              )}
            </div>
            <Field label="Presupuesto (S/)"><input type="number" className="input" value={form.budget || ''} onChange={(e) => set('budget', e.target.value)} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crear}>Crear campaña</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
