'use client';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { Toaster, toast, Field } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/types';

type U = { id: number; name: string; email: string; phone?: string | null; role: string; status: string; commissionRate?: string; created_at: string; lastLoginAt?: string | null };

export default function UsersPage() {
  const [rows, setRows] = useState<U[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [role, setRole] = useState('');
  const [openAgent, setOpenAgent] = useState(false);
  const [openAdmin, setOpenAdmin] = useState(false);
  const [formA, setFormA] = useState<any>({});
  const [formAd, setFormAd] = useState<any>({});
  const fA = (k: string, v: any) => setFormA((p: any) => ({ ...p, [k]: v }));
  const fD = (k: string, v: any) => setFormAd((p: any) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    try {
      const q = role ? `?role=${role}` : '';
      setRows((await api.get<U[]>(`/users${q}`)) || []);
    } catch (e: any) { toast(e.message, 'err'); }
  }, [role]);

  useEffect(() => { load(); api.get<any[]>('/projects').then(setProjects).catch(() => {}); }, [load]);

  async function crearAgente() {
    try {
      await api.post('/users/agent', {
        name: formA.name, email: formA.email, phone: formA.phone || undefined, password: formA.password,
        projectIds: (formA.projectIds || []).map(Number), commissionRate: Number(formA.commissionRate || 0),
        monthlyGoalLots: Number(formA.monthlyGoalLots || 0), monthlyGoalAmount: Number(formA.monthlyGoalAmount || 0),
      });
      toast('Agente creado'); setOpenAgent(false); setFormA({}); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }
  async function crearAdmin() {
    try {
      await api.post('/users/admin', { name: formAd.name, email: formAd.email, phone: formAd.phone || undefined, password: formAd.password, projectIds: (formAd.projectIds || []).map(Number) });
      toast('Administrador creado'); setOpenAdmin(false); setFormAd({}); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }
  async function toggle(u: U) {
    try { await api.post(`/users/status/${u.id}/${u.status === 'active' ? 'inactive' : 'active'}`); toast('Estado actualizado'); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  }
  async function reset(u: U) {
    const pw = prompt(`Nueva contraseña temporal para ${u.name}:`)?.trim();
    if (!pw) return;
    try { const r = await api.post<{ temporaryPassword: string }>(`/users/reset-password/${u.id}`, { newPassword: pw }); toast('Contraseña restablecida'); void r; }
    catch (e: any) { toast(e.message, 'err'); }
  }
  async function editCommission(u: U) {
    const value = prompt(`Comisión % para ${u.name} (la usa el admin en registros de venta):`, String(Number(u.commissionRate || 0)));
    const n = Number(value);
    if (value == null || isNaN(n) || n < 0 || n > 100) { toast('Ingresa un % válido entre 0 y 100', 'err'); return; }
    try {
      await api.post(`/users/update/${u.id}`, { commissionRate: n });
      toast('Comisión actualizada'); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  const roles: any = { superadmin: 'Superadmin', admin: 'Admin', agent: 'Agente' };
  const RoleBadge = ({ r }: { r: string }) => <span className="badge" style={{ background: r === 'agent' ? '#EEF2FF' : r === 'admin' ? '#E7F0FE' : '#F3F4F6', color: r === 'agent' ? '#3730A3' : r === 'admin' ? '#1259C4' : '#374151' }}>{roles[r] || r}</span>;

  return (
    <Layout title="Usuarios y permisos">
      <Toaster />
      <div className="space-y-5">
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Gestión de usuarios</h3>
          <div className="flex flex-wrap gap-2">
            <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Todos</option><option value="agent">Agentes</option>
              <option value="admin">Admins</option><option value="superadmin">Superadmins</option>
            </select>
            <button className="btn-primary" onClick={() => setOpenAgent(true)}>Crear agente</button>
            <button className="btn-outline" onClick={() => setOpenAdmin(true)}>Nuevo admin</button>
          </div>
        </div>
        <div className="card p-0 overflow-auto">
          <table className="table-base">
            <thead><tr>
              <th className="th-base">Nombre</th><th className="th-base">Correo</th><th className="th-base">Rol</th>
              <th className="th-base">Comisión</th><th className="th-base">Estado</th><th className="th-base">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="td-base font-medium">{u.name}</td>
                  <td className="td-base">{u.email}</td>
                  <td className="td-base"><RoleBadge r={u.role} /></td>
                  <td className="td-base">{u.role === 'agent' ? (
                    <button className="text-[#1877F2] hover:underline text-xs font-medium inline-flex items-center gap-1" onClick={() => editCommission(u)}>⚙ {Number(u.commissionRate || 0)}% editar</button>
                  ) : '—'}</td>
                  <td className="td-base"><span className="badge" style={{ background: u.status === 'active' ? '#EAF7EE' : '#F1F5F9', color: u.status === 'active' ? '#125A3B' : '#64748B' }}>{u.status}</span></td>
                  <td className="td-base">
                    <button className="btn-neutral !h-7 text-xs mr-1" onClick={() => toggle(u)}>{u.status === 'active' ? 'Desactivar' : 'Activar'}</button>
                    <button className="btn-outline !h-7 text-xs" onClick={() => reset(u)}>Reset pass</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-4 text-sm text-slate-400 text-center">Sin usuarios.</p>}
        </div>
      </div>

      {openAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenAgent(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg p-6">
            <h3 className="font-semibold mb-1" style={{ fontSize: 17 }}>Crear agente</h3>
            <p className="text-sm mb-5" style={{ color: '#6B7280' }}>Define acceso, comisión, meta y proyectos.</p>
            <Field label="Nombre completo *"><input className="input" value={formA.name || ''} onChange={(e) => fA('name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Correo *"><input className="input" value={formA.email || ''} onChange={(e) => fA('email', e.target.value)} /></Field>
              <Field label="Teléfono"><input className="input" value={formA.phone || ''} onChange={(e) => fA('phone', e.target.value)} /></Field>
            </div>
            <Field label="Contraseña temporal *"><input type="password" className="input" value={formA.password || ''} onChange={(e) => fA('password', e.target.value)} /></Field>
            <Field label="Proyectos asignados">
              <div className="space-y-1">{projects.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={(formA.projectIds || []).includes(p.id)} onChange={(e) => fA('projectIds', e.target.checked ? [...(formA.projectIds || []), p.id] : (formA.projectIds || []).filter((x: number) => x !== p.id))} /> {p.name}
                </label>))}
              </div>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Comisión %"><input type="number" className="input" value={formA.commissionRate || 0} onChange={(e) => fA('commissionRate', e.target.value)} /></Field>
              <Field label="Meta lotes"><input type="number" className="input" value={formA.monthlyGoalLots || 0} onChange={(e) => fA('monthlyGoalLots', e.target.value)} /></Field>
              <Field label="Meta S/"><input type="number" className="input" value={formA.monthlyGoalAmount || 0} onChange={(e) => fA('monthlyGoalAmount', e.target.value)} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpenAgent(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearAgente}>Crear agente</button>
            </div>
          </div>
        </div>
      )}

      {openAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenAdmin(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Nuevo administrador</h3>
            <Field label="Nombre completo *"><input className="input" value={formAd.name || ''} onChange={(e) => fD('name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Correo *"><input className="input" value={formAd.email || ''} onChange={(e) => fD('email', e.target.value)} /></Field>
              <Field label="Contraseña *"><input type="password" className="input" value={formAd.password || ''} onChange={(e) => fD('password', e.target.value)} /></Field>
            </div>
            <Field label="Proyectos administrados">
              <div className="space-y-1">{projects.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(formAd.projectIds || []).includes(p.id)} onChange={(e) => fD('projectIds', e.target.checked ? [...(formAd.projectIds || []), p.id] : (formAd.projectIds || []).filter((x: number) => x !== p.id))} /> {p.name}</label>))}
              </div>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpenAdmin(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearAdmin}>Crear administrador</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

