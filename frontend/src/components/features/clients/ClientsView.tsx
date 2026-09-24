'use client';
import { useEffect, useState, useCallback } from 'react';
import { FiPlus, FiUsers } from 'react-icons/fi';
import { Toaster, toast, Field, StatCard } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Select } from '@/components/ui/Select';
import { formatDate } from '@/lib/types';

type C = { id: number; full_name: string; phone?: string | null; email?: string | null; source?: string; pipeline_status: string; agent_id?: number | null; created_at: string };
const SOURCES = ['facebook', 'tiktok', 'instagram', 'web', 'referidos', 'otro'];
const PIPELINE: any = { nuevo: 'Nuevo', contactado: 'Contactado', visito: 'Visitó', reservado: 'Reservado', compro: 'Compró', perdido: 'Perdido' };
const PCOLOR: any = { nuevo: ['#EEF2FF', '#3730A3'], contactado: ['#F3F4F6', '#374151'], visito: ['#FFF6E4', '#B45309'], reservado: ['#E7F0FE', '#1259C4'], compro: ['#EAF7EE', '#125A3B'], perdido: ['#F1F5F9', '#64748B'] };

export default function ClientsView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [rows, setRows] = useState<C[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [role, setRole] = useState('');
const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentAgentName, setCurrentAgentName] = useState('');
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
      if (lockedProjectId) q.set('projectId', String(lockedProjectId));
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
  }, [fSource, fPipeline, lockedProjectId, page, limit]);

  useEffect(() => { setPage(1); }, [fSource, fPipeline, lockedProjectId]);

  useEffect(() => {
    let currentRole = '';
    let currentId: number | null = null;
    let currentName = '';
    try {
      const u = JSON.parse(localStorage.getItem('crm_user') || '{}');
      currentRole = u.role || '';
      currentId = u.id || null;
      currentName = u.name || '';
    } catch {}
    setRole(currentRole);
    setCurrentUserId(currentId);
    setCurrentAgentName(currentName);
    load();
    if (currentRole === 'admin' || currentRole === 'superadmin') api.get<any[]>('/users/agents').then(setAgents).catch(() => {});
    if (currentRole === 'agent' && currentId) set('agent_id', currentId);
  }, [load]);

  async function crear() {
    if (!form.full_name) return toast('Ingresa el nombre', 'err');
    try {
      await api.post('/clients', {
        fullName: form.full_name, phone: form.phone || undefined, email: form.email || undefined,
        source: form.source || 'web', projectInterestId: lockedProjectId || undefined, agentId: form.agent_id || undefined,
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
    <>
      <Toaster />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Clientes / leads" value={contados} />
          <StatCard label="Reservados" value={rows.filter((r) => r.pipeline_status === 'reservado').length} color="#1259C4" />
          <StatCard label="Compraron" value={rows.filter((r) => r.pipeline_status === 'compro').length} color="#125A3B" />
          <StatCard label="Contactados +" value={rows.filter((r) => ['contactado', 'visito'].includes(r.pipeline_status)).length} color="#3730A3" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-[#F3F8FF] shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white/60 px-4 py-3 backdrop-blur-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EAF3FF] text-[#1259C4]">
                  <FiUsers />
                </span>
                <h3 className="font-semibold text-slate-800">Bandeja de clientes</h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-neutral !h-10 !rounded-xl" onClick={() => setOpen(true)}>
                  <FiPlus className="text-sm" /> Nuevo cliente
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-2">
            <Field label="Canal">
              <Select
                value={fSource}
                onChange={setFSource}
                options={[{ value: '', label: 'Todos' }, ...SOURCES.map((s) => ({ value: s, label: s }))]}
              />
            </Field>

            <Field label="Estado">
              <Select
                value={fPipeline}
                onChange={setFPipeline}
                options={[{ value: '', label: 'Todos' }, ...Object.keys(PIPELINE).map((k) => ({ value: k, label: PIPELINE[k] }))]}
              />
            </Field>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : rows.length === 0 ? <p className="p-6 text-slate-400 text-sm text-center">Sin clientes con ese filtro.</p>
            : (
            <div className="overflow-x-auto">
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
                      <tr key={c.id} className="transition-colors hover:bg-slate-50/80">
                        <td className="td-base">
                          <div className="font-semibold text-slate-800">{(c as any).fullName || c.full_name}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">#{c.id}</div>
                        </td>
                        <td className="td-base">
                          <div className="font-medium text-slate-700">{c.phone || '—'}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{c.email || 'Sin correo'}</div>
                        </td>
                        <td className="td-base">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium capitalize text-slate-600">
                            {(c as any).source || c.source || 'web'}
                          </span>
                        </td>
                        <td className="td-base">
                          <select className="input !h-9 !w-40 !rounded-lg !text-xs border-slate-200 bg-white shadow-sm" value={ps} onChange={(e) => mover(c, e.target.value)}>
                            {Object.keys(PIPELINE).map((k) => <option key={k} value={k}>{PIPELINE[k]}</option>)}
                          </select>
                        </td>
                        <td className="td-base"><span className="badge" style={{ background: pc[0], color: pc[1] }}>{PIPELINE[ps] || ps}</span></td>
                        <td className="td-base text-slate-600">{formatDate(created)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            <div className="bg-white p-4 border-t" style={{ borderColor: '#F0F1F3' }}>
              <PaginationBar label="Clientes" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={setLimit} />
            </div>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_40px_rgba(15,23,42,0.18)]">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-800" style={{ fontSize: 17 }}>Nuevo cliente / lead</h3>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#EAF3FF] text-[#1259C4]">
                <FiUsers />
              </span>
            </div>
            <Field label="Nombre completo *"><input className="input !rounded-xl border-slate-200" value={form.full_name || ''} onChange={(e) => set('full_name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono"><input className="input !rounded-xl border-slate-200" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Correo"><input className="input !rounded-xl border-slate-200" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Canal"><select className="input !rounded-xl border-slate-200" value={form.source || 'web'} onChange={(e) => set('source', e.target.value)}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
              <Field label="Agente">
                  {role === 'agent' ? (
                    <input className="input !rounded-xl border-slate-200" value={currentAgentName} readOnly />
                  ) : (
                    <select className="input !rounded-xl border-slate-200" value={form.agent_id || 0} onChange={(e) => set('agent_id', Number(e.target.value))}><option value={0}>Sin asignar</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                  )}
                </Field>
            </div>
            <Field label="Notas"><textarea className="input !h-auto !rounded-xl border-slate-200 py-2" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral !rounded-xl" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary !rounded-xl" onClick={crear}>Crear cliente</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
