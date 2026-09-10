'use client';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { Toaster, toast, Field, StatCard } from '@/components/ui';
import { api } from '@/lib/api';
import { PaginationBar } from '@/components/PaginationBar';
import { formatDate } from '@/lib/types';

type C = { id: number; full_name: string; phone?: string | null; email?: string | null; source?: string; pipeline_status: string; agent_id?: number | null; created_at: string };
const SOURCES = ['facebook', 'tiktok', 'instagram', 'web', 'referidos', 'otro'];
const PIPELINE: any = { nuevo: 'Nuevo', contactado: 'Contactado', visito: 'Visitó', reservado: 'Reservado', compro: 'Compró', perdido: 'Perdido' };
const PCOLOR: any = { nuevo: ['#EEF2FF', '#3730A3'], contactado: ['#F3F4F6', '#374151'], visito: ['#FFF6E4', '#B45309'], reservado: ['#E7F0FE', '#1259C4'], compro: ['#EAF7EE', '#125A3B'], perdido: ['#F1F5F9', '#64748B'] };

export default function ClientsPage() {
  const [rows, setRows] = useState<C[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [fSource, setFSource] = useState('');
  const [fPipeline, setFPipeline] = useState('');
  const [form, setForm] = useState<any>({});

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (fSource) q.set('channel', fSource);
      if (fPipeline) q.set('pipelineStatus', fPipeline);
      q.set('page', String(page)); q.set('limit', String(limit));
      const url = `/clients${q.toString() ? `?${q}` : ''}`;
      const d = (await api.get<any>(url)) || {};
      const arr: C[] = Array.isArray(d) ? d : (d.items || []);
      setRows(arr);
      setMeta({
        total: Number(d.total ?? arr.length),
        totalPages: Number(d.totalPages ?? Math.max(1, Math.ceil(arr.length / limit))),
      });
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [fSource, fPipeline, page, limit]);

  useEffect(() => { setPage(1); }, [fSource, fPipeline]);

  useEffect(() => { load(); api.get<any[]>('/users/agents').then(setAgents).catch(() => {}); }, [load]);

  async function crear() {
    if (!form.full_name) return toast('Ingresa el nombre', 'err');
    try {
      await api.post('/clients', {
        fullName: form.full_name, phone: form.phone || undefined, email: form.email || undefined,
        source: form.source || 'web', projectInterestId: undefined, agentId: form.agent_id || undefined,
        pipelineStatus: form.pipeline_status || 'nuevo', notes: form.notes || undefined,
      });
      toast('Cliente creado'); setOpen(false); setForm({}); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function mover(c: C, s: string) {
    try { await api.post(`/clients/pipeline/${c.id}`, { pipelineStatus: s }); toast('Pipeline actualizado'); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  }

  const contados = meta.total || rows.length;

  return (
    <Layout title="Clientes y leads">
      <Toaster />
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Clientes / leads" value={contados} />
          <StatCard label="Reservados" value={rows.filter((r) => r.pipeline_status === 'reservado').length} color="#1259C4" />
          <StatCard label="Compraron" value={rows.filter((r) => r.pipeline_status === 'compro').length} color="#125A3B" />
          <StatCard label="Contactados +" value={rows.filter((r) => ['contactado', 'visito'].includes(r.pipeline_status)).length} color="#3730A3" />
        </div>
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Bandeja de clientes</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <select className="input !w-auto" value={fSource} onChange={(e) => setFSource(e.target.value)}>
                <option value="">Canal: todos</option>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="input !w-auto" value={fPipeline} onChange={(e) => setFPipeline(e.target.value)}>
                <option value="">Estado: todos</option>{Object.keys(PIPELINE).map((k) => <option key={k} value={k}>{PIPELINE[k]}</option>)}
              </select>
              <button className="btn-primary" onClick={() => setOpen(true)}>Nuevo cliente</button>
            </div>
          </div>
        </div>
        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : rows.length === 0 ? <p className="p-6 text-slate-400 text-sm text-center">Sin clientes con ese filtro.</p>
            : (
            <table className="table-base">
              <thead><tr>
                <th className="th-base">Nombre</th><th className="th-base">Contacto</th><th className="th-base">Canal</th>
                <th className="th-base">Estado</th><th className="th-base">Etapa contrato</th><th className="th-base">Fecha</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => {
                  const ps = (c as any).pipelineStatus || c.pipeline_status || 'nuevo';
                  const pc = PCOLOR[ps] || ['#F3F4F6', '#374151'];
                  const created = (c as any).createdAt || c.created_at;
                  return (
                    <tr key={c.id}>
                      <td className="td-base font-medium">{(c as any).fullName || c.full_name}</td>
                      <td className="td-base">{c.phone || c.email || '—'}</td>
                      <td className="td-base capitalize">{(c as any).source || c.source || 'web'}</td>
                      <td className="td-base">
                        <select className="input !h-7 !w-40 !text-xs" value={ps} onChange={(e) => mover(c, e.target.value)}>
                          {Object.keys(PIPELINE).map((k) => <option key={k} value={k}>{PIPELINE[k]}</option>)}
                        </select>
                      </td>
                      <td className="td-base"><span className="badge" style={{ background: pc[0], color: pc[1] }}>{PIPELINE[ps] || ps}</span></td>
                      <td className="td-base">{formatDate(created)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
            <div className="bg-white p-4 border-t" style={{ borderColor: '#F0F1F3' }}>
              <PaginationBar label="Clientes" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={setLimit} />
            </div>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Nuevo cliente / lead</h3>
            <Field label="Nombre completo *"><input className="input" value={form.full_name || ''} onChange={(e) => set('full_name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono"><input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Correo"><input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Canal"><select className="input" value={form.source || 'web'} onChange={(e) => set('source', e.target.value)}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
              <Field label="Agente"><select className="input" value={form.agent_id || 0} onChange={(e) => set('agent_id', Number(e.target.value))}><option value={0}>Sin asignar</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>
            <Field label="Notas"><textarea className="input" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crear}>Crear cliente</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

