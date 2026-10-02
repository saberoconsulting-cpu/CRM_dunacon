'use client';
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { Toaster, toast, Field } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/types';
import { FiEdit3, FiSettings, FiTrash2, FiX } from 'react-icons/fi';

type ProjectAccess = { projectId: number; modules: string[] };
type U = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  commissionRate?: string;
  monthlyGoalLots?: number;
  monthlyGoalAmount?: string;
  created_at: string;
  lastLoginAt?: string | null;
  projectIds?: number[];
  projectAccess?: ProjectAccess[];
  activity?: { sales: number; payments: number; lastLoginAt?: string | null };
  canDelete?: boolean;
};

const PROJECT_MODULES = [
  { key: 'dashboard', label: 'Dashboard', roles: ['admin', 'agent'] },
  { key: 'lots', label: 'Lotizacion', roles: ['admin', 'agent'] },
  { key: 'plan', label: 'Plano', roles: ['admin', 'agent'] },
  { key: 'quotes', label: 'Cotizaciones', roles: ['admin', 'agent'] },
  { key: 'sales', label: 'Ventas', roles: ['admin', 'agent'] },
  { key: 'payments', label: 'Pagos', roles: ['admin', 'agent'] },
  { key: 'clients', label: 'Clientes y leads', roles: ['admin', 'agent'] },
  { key: 'finances', label: 'Finanzas', roles: ['admin'] },
  { key: 'campaigns', label: 'Campanas', roles: ['admin', 'agent'] },
  { key: 'construction-budget', label: 'Presupuesto de obra', roles: ['admin'] },
  { key: 'banking', label: 'Cuentas y bancos', roles: ['admin'] },
  { key: 'income-statement', label: 'Estado de resultados', roles: ['admin'] },
];

export default function UsersPage() {
  const [rows, setRows] = useState<U[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [role, setRole] = useState('');
  const [openAgent, setOpenAgent] = useState(false);
  const [openAdmin, setOpenAdmin] = useState(false);
  const [formA, setFormA] = useState<any>({});
  const [formAd, setFormAd] = useState<any>({});
  const [resetUser, setResetUser] = useState<U | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [editUser, setEditUser] = useState<U | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const fA = (k: string, v: any) => setFormA((p: any) => ({ ...p, [k]: v }));
  const fD = (k: string, v: any) => setFormAd((p: any) => ({ ...p, [k]: v }));
  const fE = (k: string, v: any) => setEditForm((p: any) => ({ ...p, [k]: v }));

  function numericText(value: unknown) {
    return String(value ?? '').replace(/[^\d.]/g, '');
  }

  function formatThousands(value: unknown) {
    const raw = String(value ?? '').replace(/\D/g, '');
    return raw ? Number(raw).toLocaleString('es-PE') : '';
  }

  function setAgentMoney(key: string, value: string) {
    fA(key, value.replace(/\D/g, ''));
  }

  function defaultModules(userRole: 'admin' | 'agent') {
    return PROJECT_MODULES.filter((item) => item.roles.includes(userRole)).map((item) => item.key);
  }

  function modulesFor(form: any, projectId: number, userRole: 'admin' | 'agent') {
    const row = (form.projectAccess || []).find((item: any) => Number(item.projectId) === Number(projectId));
    return Array.isArray(row?.modules) ? row.modules : defaultModules(userRole);
  }

  function projectAccessPayload(form: any, userRole: 'admin' | 'agent') {
    return (form.projectIds || []).map((projectId: number) => ({
      projectId: Number(projectId),
      modules: modulesFor(form, projectId, userRole),
    }));
  }

  function setProjectChecked(setter: (value: any) => void, projectId: number, checked: boolean, userRole: 'admin' | 'agent') {
    setter((current: any) => {
      const projectIds = checked
        ? Array.from(new Set([...(current.projectIds || []), projectId]))
        : (current.projectIds || []).filter((id: number) => Number(id) !== Number(projectId));
      const projectAccess = checked
        ? [
            ...(current.projectAccess || []).filter((item: any) => Number(item.projectId) !== Number(projectId)),
            { projectId, modules: modulesFor(current, projectId, userRole) },
          ]
        : (current.projectAccess || []).filter((item: any) => Number(item.projectId) !== Number(projectId));
      return { ...current, projectIds, projectAccess };
    });
  }

  function setModuleChecked(setter: (value: any) => void, projectId: number, moduleKey: string, checked: boolean, userRole: 'admin' | 'agent') {
    setter((current: any) => {
      const currentModules = modulesFor(current, projectId, userRole);
      const modules = checked ? Array.from(new Set([...currentModules, moduleKey])) : currentModules.filter((key: string) => key !== moduleKey);
      const projectAccess = [
        ...(current.projectAccess || []).filter((item: any) => Number(item.projectId) !== Number(projectId)),
        { projectId, modules },
      ];
      return { ...current, projectAccess };
    });
  }

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
        monthlyGoalLots: Number(formA.monthlyGoalLots || 0), monthlyGoalAmount: Number(String(formA.monthlyGoalAmount || '').replace(/\D/g, '') || 0),
        projectAccess: projectAccessPayload(formA, 'agent'),
      });
      toast('Agente creado'); setOpenAgent(false); setFormA({}); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }
  async function crearAdmin() {
    try {
      await api.post('/users/admin', { name: formAd.name, email: formAd.email, phone: formAd.phone || undefined, password: formAd.password, projectIds: (formAd.projectIds || []).map(Number), projectAccess: projectAccessPayload(formAd, 'admin') });
      toast('Gerente creado'); setOpenAdmin(false); setFormAd({}); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }
  async function toggle(u: U) {
    try { await api.post(`/users/status/${u.id}/${u.status === 'active' ? 'inactive' : 'active'}`); toast('Estado actualizado'); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  }
  async function reset(u: U) {
    setResetUser(u);
    setResetPassword('');
  }
  async function confirmResetPassword() {
    const pw = resetPassword.trim();
    if (!resetUser || !pw) return toast('Ingresa la nueva contraseña temporal', 'err');
    setResetting(true);
    try {
      const r = await api.post<{ temporaryPassword: string }>(`/users/reset-password/${resetUser.id}`, { newPassword: pw });
      toast('Contraseña restablecida');
      void r;
      setResetUser(null);
      setResetPassword('');
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setResetting(false);
    }
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

  async function openEdit(u: U) {
    try {
      const detail = await api.get<U>(`/users/detail/${u.id}`);
      setEditUser(detail);
      setEditForm({
        name: detail.name,
        email: detail.email,
        phone: detail.phone || '',
        status: detail.status,
        commissionRate: Number(detail.commissionRate || 0),
        monthlyGoalLots: detail.monthlyGoalLots || 0,
        monthlyGoalAmount: String(detail.monthlyGoalAmount || '').replace(/\D/g, ''),
        projectIds: detail.projectIds || [],
        projectAccess: detail.projectAccess || [],
      });
    } catch (e: any) {
      toast(e.message || 'No se pudo cargar el usuario', 'err');
    }
  }

  async function saveEditUser() {
    if (!editUser) return;
    setSavingEdit(true);
    try {
      const isAgent = editUser.role === 'agent';
      await api.post(`/users/update/${editUser.id}`, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone || undefined,
        status: editForm.status,
        ...(isAgent ? {
          commissionRate: Number(editForm.commissionRate || 0),
          monthlyGoalLots: Number(editForm.monthlyGoalLots || 0),
          monthlyGoalAmount: Number(String(editForm.monthlyGoalAmount || '').replace(/\D/g, '') || 0),
        } : {}),
        projectIds: (editForm.projectIds || []).map(Number),
        projectAccess: projectAccessPayload(editForm, isAgent ? 'agent' : 'admin'),
      });
      toast('Usuario actualizado');
      setEditUser(null);
      setEditForm({});
      load();
    } catch (e: any) {
      toast(e.message || 'No se pudo guardar', 'err');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteUser() {
    if (!editUser) return;
    if (!confirm(`Eliminar a ${editUser.name}? Solo se permite si no tiene ventas.`)) return;
    setDeletingUser(true);
    try {
      await api.delete(`/users/${editUser.id}`);
      toast('Usuario eliminado');
      setEditUser(null);
      setEditForm({});
      load();
    } catch (e: any) {
      toast(e.message || 'No se pudo eliminar', 'err');
    } finally {
      setDeletingUser(false);
    }
  }

  const roles: any = { superadmin: 'Super Admin', admin: 'Gerente', agent: 'Agente' };
  const RoleBadge = ({ r }: { r: string }) => <span className="badge" style={{ background: r === 'agent' ? '#EEF2FF' : r === 'admin' ? '#E7F0FE' : '#F3F4F6', color: r === 'agent' ? '#3730A3' : r === 'admin' ? '#1259C4' : '#374151' }}>{roles[r] || r}</span>;

  return (
    <Layout title="Usuarios y permisos">
      <Toaster />
      <div className="space-y-5">
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Gestión de usuarios</h3>
            <p className="mt-1 text-xs text-slate-500">
              Los correos son personales o corporativos reales. No se crean correos @crm.com; si olvidan clave, el Super Admin asigna una contraseña temporal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Todos</option><option value="agent">Agentes</option>
              <option value="admin">Gerentes</option><option value="superadmin">Super Admins</option>
            </select>
            <button className="btn-primary" onClick={() => setOpenAgent(true)}>Crear agente</button>
            <button className="btn-outline" onClick={() => setOpenAdmin(true)}>Nuevo gerente</button>
          </div>
        </div>
        <div className="card p-0 overflow-x-auto overflow-y-hidden">
          <table className="table-base w-full min-w-[1040px] table-fixed">
            <colgroup>
              <col className="w-[180px]" />
              <col className="w-[250px]" />
              <col className="w-[110px]" />
              <col className="w-[140px]" />
              <col className="w-[100px]" />
              <col className="w-[260px]" />
            </colgroup>
            <thead><tr>
              <th className="th-base">Nombre</th><th className="th-base">Correo</th><th className="th-base">Rol</th>
              <th className="th-base">Comisión</th><th className="th-base">Estado</th><th className="th-base">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="td-base truncate font-medium">{u.name}</td>
                  <td className="td-base truncate">{u.email}</td>
                  <td className="td-base whitespace-nowrap"><RoleBadge r={u.role} /></td>
                  <td className="td-base">{u.role === 'agent' ? (
                    <button className="text-[#1877F2] hover:underline text-xs font-medium inline-flex items-center gap-1" onClick={() => editCommission(u)}><FiSettings /> {Number(u.commissionRate || 0)}% editar</button>
                  ) : '-'}</td>
                  <td className="td-base whitespace-nowrap"><span className="badge" style={{ background: u.status === 'active' ? '#EAF7EE' : '#F1F5F9', color: u.status === 'active' ? '#125A3B' : '#64748B' }}>{u.status}</span></td>
                  <td className="td-base">
                    <div className="flex flex-nowrap gap-1">
                      <button className="btn-neutral !h-7 !px-2 text-xs" onClick={() => openEdit(u)}><FiEdit3 /> Editar</button>
                      <button className="btn-neutral !h-7 !px-2 text-xs" onClick={() => toggle(u)}>{u.status === 'active' ? 'Desactivar' : 'Activar'}</button>
                      <button className="btn-outline !h-7 !px-2 text-xs" onClick={() => reset(u)}>Reset pass</button>
                    </div>
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
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6">
            <h3 className="font-semibold mb-1" style={{ fontSize: 17 }}>Crear agente</h3>
            <p className="text-sm mb-5" style={{ color: '#6B7280' }}>Define acceso, comisión, meta y proyectos.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre completo *"><input className="input" value={formA.name || ''} onChange={(e) => fA('name', e.target.value)} /></Field>
              <Field label="Correo *"><input className="input" value={formA.email || ''} onChange={(e) => fA('email', e.target.value)} /></Field>
              <Field label="Teléfono"><input className="input" value={formA.phone || ''} onChange={(e) => fA('phone', e.target.value)} /></Field>
              <Field label="Contraseña temporal *"><input type="password" className="input" value={formA.password || ''} onChange={(e) => fA('password', e.target.value)} /></Field>
            </div>
            <Field label="Proyectos asignados y modulos visibles">
              <div className="space-y-2">{projects.map((p: any) => {
                const selected = (formA.projectIds || []).includes(p.id);
                const modules = modulesFor(formA, p.id, 'agent');
                return (
                  <div key={p.id} className="rounded-md border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={selected} onChange={(e) => setProjectChecked(setFormA, p.id, e.target.checked, 'agent')} /> {p.name}
                    </label>
                    {selected && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {PROJECT_MODULES.filter((module) => module.roles.includes('agent')).map((module) => (
                          <label key={module.key} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                            <input type="checkbox" checked={modules.includes(module.key)} onChange={(e) => setModuleChecked(setFormA, p.id, module.key, e.target.checked, 'agent')} />
                            {module.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Comisión %"><input type="number" className="input" value={formA.commissionRate ?? ''} onChange={(e) => fA('commissionRate', numericText(e.target.value))} placeholder="%" /></Field>
              <Field label="Meta lotes"><input type="number" className="input" value={formA.monthlyGoalLots ?? ''} onChange={(e) => fA('monthlyGoalLots', numericText(e.target.value))} placeholder="Lotes" /></Field>
              <Field label="Meta S/"><input inputMode="numeric" className="input tabular-nums" value={formatThousands(formA.monthlyGoalAmount)} onChange={(e) => setAgentMoney('monthlyGoalAmount', e.target.value)} placeholder="S/" /></Field>
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
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6">
            <h3 className="font-semibold mb-1" style={{ fontSize: 17 }}>Nuevo gerente</h3>
            <p className="text-sm mb-5" style={{ color: '#6B7280' }}>Define proyectos y partes visibles dentro de cada proyecto.</p>
            <Field label="Nombre completo *"><input className="input" value={formAd.name || ''} onChange={(e) => fD('name', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Correo *"><input className="input" value={formAd.email || ''} onChange={(e) => fD('email', e.target.value)} /></Field>
              <Field label="Contraseña *"><input type="password" className="input" value={formAd.password || ''} onChange={(e) => fD('password', e.target.value)} /></Field>
            </div>
            <Field label="Proyectos a cargo y modulos visibles">
              <div className="space-y-2">{projects.map((p: any) => {
                const selected = (formAd.projectIds || []).includes(p.id);
                const modules = modulesFor(formAd, p.id, 'admin');
                return (
                  <div key={p.id} className="rounded-md border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={selected} onChange={(e) => setProjectChecked(setFormAd, p.id, e.target.checked, 'admin')} /> {p.name}
                    </label>
                    {selected && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {PROJECT_MODULES.filter((module) => module.roles.includes('admin')).map((module) => (
                          <label key={module.key} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                            <input type="checkbox" checked={modules.includes(module.key)} onChange={(e) => setModuleChecked(setFormAd, p.id, module.key, e.target.checked, 'admin')} />
                            {module.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpenAdmin(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearAdmin}>Crear gerente</button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !savingEdit && setEditUser(null)} />
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold" style={{ fontSize: 17 }}>Editar usuario</h3>
                <p className="mt-1 text-sm" style={{ color: '#6B7280' }}>
                  {editUser.role === 'admin' ? 'Gerente' : editUser.role === 'agent' ? 'Agente' : 'Super Admin'} · ventas: {editUser.activity?.sales || 0}
                </p>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => !savingEdit && setEditUser(null)}><FiX /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre completo *"><input className="input" value={editForm.name || ''} onChange={(e) => fE('name', e.target.value)} /></Field>
              <Field label="Correo personal/corporativo *"><input className="input" value={editForm.email || ''} onChange={(e) => fE('email', e.target.value)} /></Field>
              <Field label="Teléfono"><input className="input" value={editForm.phone || ''} onChange={(e) => fE('phone', e.target.value)} /></Field>
              <Field label="Estado">
                <select className="input" value={editForm.status || 'active'} onChange={(e) => fE('status', e.target.value)}>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </Field>
            </div>

            {editUser.role === 'agent' && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Comisión %"><input type="number" className="input" value={editForm.commissionRate ?? ''} onChange={(e) => fE('commissionRate', numericText(e.target.value))} /></Field>
                <Field label="Meta lotes"><input type="number" className="input" value={editForm.monthlyGoalLots ?? ''} onChange={(e) => fE('monthlyGoalLots', numericText(e.target.value))} /></Field>
                <Field label="Meta S/"><input inputMode="numeric" className="input tabular-nums" value={formatThousands(editForm.monthlyGoalAmount)} onChange={(e) => fE('monthlyGoalAmount', e.target.value.replace(/\D/g, ''))} /></Field>
              </div>
            )}

            {editUser.role !== 'superadmin' && (
              <Field label={editUser.role === 'admin' ? 'Proyectos a cargo y módulos visibles' : 'Proyectos asignados y módulos visibles'}>
                <div className="space-y-2">{projects.map((p: any) => {
                  const userRole = editUser.role === 'agent' ? 'agent' : 'admin';
                  const selected = (editForm.projectIds || []).includes(p.id);
                  const modules = modulesFor(editForm, p.id, userRole);
                  return (
                    <div key={p.id} className="rounded-md border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={selected} onChange={(e) => setProjectChecked(setEditForm, p.id, e.target.checked, userRole)} /> {p.name}
                      </label>
                      {selected && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {PROJECT_MODULES.filter((module) => module.roles.includes(userRole)).map((module) => (
                            <label key={module.key} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                              <input type="checkbox" checked={modules.includes(module.key)} onChange={(e) => setModuleChecked(setEditForm, p.id, module.key, e.target.checked, userRole)} />
                              {module.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              </Field>
            )}

            <div className="mt-4 rounded-md border bg-slate-50 p-3 text-xs text-slate-600" style={{ borderColor: '#E5E7EB' }}>
              Si el usuario olvida su clave, usa <b>Reset pass</b> para asignarle una contraseña temporal. El usuario luego puede cambiarla desde su perfil.
            </div>

            <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
              <button className="btn-neutral text-red-600" onClick={deleteUser} disabled={deletingUser || editUser.role === 'superadmin' || (editUser.activity?.sales || 0) > 0}>
                <FiTrash2 /> {deletingUser ? 'Eliminando...' : 'Eliminar'}
              </button>
              <div className="flex gap-2">
                <button className="btn-neutral" onClick={() => setEditUser(null)} disabled={savingEdit}>Cancelar</button>
                <button className="btn-primary" onClick={saveEditUser} disabled={savingEdit}>{savingEdit ? 'Guardando...' : 'Guardar cambios'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resetUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => !resetting && setResetUser(null)} />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900">Nueva contraseña temporal</h3>
                <p className="mt-1 truncate text-sm text-slate-500">Para {resetUser.name}</p>
              </div>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                onClick={() => !resetting && setResetUser(null)}
                disabled={resetting}
                aria-label="Cerrar"
              >
                <FiX />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <Field label="Contraseña temporal *">
                <input
                  type="password"
                  className="input"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  autoFocus
                />
              </Field>
              <p className="text-xs leading-relaxed text-slate-500">
                El usuario podrá iniciar sesión con esta contraseña temporal y luego cambiarla desde su perfil.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button className="btn-neutral" onClick={() => setResetUser(null)} disabled={resetting}>Cancelar</button>
              <button className="btn-primary" onClick={confirmResetPassword} disabled={resetting}>
                {resetting ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

