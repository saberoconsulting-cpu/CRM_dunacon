'use client';
import { useState, useEffect, FormEvent, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import { Toaster, toast } from '@/components/ui/ui';
import AgentView from '@/components/features/dashboard/AgentView';
import GeneralView from '@/components/features/dashboard/GeneralView';
import { api, getSessionUser, saveSession, uploadFile } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { FiEdit2, FiPhone } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';

const EMPTY = { name: '', phone: '', whatsapp: '', bio: '' };

export default function ProfilePage() {
  const [me, setMe] = useState<any>(null);
  const [role, setRole] = useState('agent');
  const [tab, setTab] = useState<'info' | 'stats'>('info');
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [upDirty, setUpDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [agi, setAgi] = useState<any>(null);
  const [gen, setGen] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Contraseña
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const applyProfile = (p: any) => {
    setMe(p);
    setRole(p?.role || 'agent');
    setForm({
      name: p?.name || '',
      phone: p?.phone || '',
      whatsapp: p?.whatsapp || '',
      bio: p?.bio || '',
    });
    const sess = getSessionUser();
    const tok = typeof window !== 'undefined' ? localStorage.getItem('crm_token') : '';
    if (sess && p) saveSession({ token: tok || '', user: { ...sess, ...p } });
  };

  useEffect(() => {
    api.get<any>('/auth/profile').then((p) => {
      applyProfile(p);
      const reload = () => {
        if (p?.role === 'agent') api.get<any>('/dashboards/agent').then(setAgi).catch(() => setAgi(null));
        else api.get<any>('/dashboards/general').then(setGen).catch(() => setGen(null));
      };
      reload();
      const tok = typeof window !== 'undefined' ? localStorage.getItem('crm_token') : '';
      if (tok) {
        const s = getSocket(tok);
        ['lot.updated', 'payment.created', 'sale.created', 'expense.created'].forEach((ev) => s.on(ev, reload));
        return () => { s.removeAllListeners(); disconnectSocket(); };
      }
    }).catch((e) => toast(e.message, 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof typeof EMPTY, v: string) => { setForm((f) => ({ ...f, [k]: v })); setUpDirty(true); };

  async function saveInfo(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const p = await api.post<any>('/auth/profile', { name: form.name, phone: form.phone, whatsapp: form.whatsapp, bio: form.bio || undefined });
      applyProfile(p);
      setUpDirty(false);
      toast('Datos personales actualizados');
    } catch (err: any) { toast(err.message, 'err'); } finally { setSaving(false); }
  }

  async function pickAvatar(file?: File) {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const p = await uploadFile('/auth/avatar', file);
      applyProfile(p);
      toast('Foto de perfil actualizada');
    } catch (e: any) { toast(e.message, 'err'); } finally { setAvatarBusy(false); }
  }

  async function onChangePass(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast('Contraseña actualizada');
      setCurrentPassword(''); setNewPassword('');
    } catch (err: any) { toast(err.message, 'err'); } finally { setPwBusy(false); }
  }
  if (!me) {
    return <Layout title="Mi perfil"><Toaster /><p className="text-slate-400">Cargando perfil…</p></Layout>;
  }

  return (
    <Layout title="Mi perfil">
      <Toaster />
      <div className="w-full space-y-5">
        {/* Encabezado de identidad */}
        <div className="card p-6 flex flex-wrap items-center gap-5">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Actualizar foto de perfil"
              className="overflow-hidden rounded-full border-2 border-brand-200 block"
              style={{ width: 96, height: 96 }}
            >
              {me.photoUrl
                ? <img src={me.photoUrl} alt="" className="w-full h-full object-cover" />
                : <span className="w-full h-full flex items-center justify-center bg-brand-600 text-white text-3xl font-bold uppercase">{me.name?.charAt(0) || '?'}</span>}
            </button>
            {avatarBusy && <span className="absolute inset-0 rounded-full bg-black/40 text-white text-[10px] flex items-center justify-center">Subiendo…</span>}
            <span className="absolute bottom-0 right-0 bg-brand-600 text-white rounded-full w-8 h-8 grid place-items-center text-base" title="Cambiar foto"><FiEdit2 style={{ fontSize: 14 }} /></span>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickAvatar(f); }} />
          </div>
          <div className="flex-1 min-w-60">
            <div className="text-xl font-bold">{me.name}</div>
            <div className="text-sm text-slate-500">{me.email}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="badge capitalize bg-brand-50 text-brand-700">{me.role === 'superadmin' ? 'Administración' : me.role}</span>
              <span className={`badge ${me.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{me.status === 'active' ? 'Activo' : 'Inactivo'}</span>
            </div>
            {me.bio && <p className="text-sm text-slate-500 mt-2 max-w-2xl">{me.bio}</p>}
          </div>
          {(me.phone?.trim() || me.whatsapp?.trim()) && (
            <div className="text-sm bg-canvas rounded-xl p-3 space-y-1 min-w-52">
              {me.phone?.trim() && <div className="flex items-center gap-2"><FiPhone /> <a className="hover:underline" href={`tel:${me.phone}`}>{me.phone}</a></div>}
              {me.whatsapp?.trim() && <div className="flex items-center gap-2"><FaWhatsapp /> <a className="hover:underline" href={`https://wa.me/${me.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">{me.whatsapp}</a></div>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <div className="min-w-0 space-y-5">
        {/* Selector: Datos / Rendimiento */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {([['info', 'Datos y contacto']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === k ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Información personal */}
            <form className="card" onSubmit={saveInfo}>
              <h3 className="font-semibold mb-4">Información personal</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div><label className="label">Nombre completo</label>
                  <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required /></div>
                <div><label className="label">Correo corporativo</label>
                  <input className="input" value={me.email} readOnly title="El correo lo gestiona la administración" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div><label className="label">Teléfono</label>
                  <input className="input" placeholder="+51 999 999 999" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
                <div><label className="label">WhatsApp</label>
                  <input className="input" placeholder="+51 999 999 999" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></div>
              </div>
              <div className="mb-4"><label className="label">Biografía / presentación comercial</label>
                <textarea className="input" rows={4} value={form.bio}
                  placeholder="Cuéntanos tu experiencia, proyectos favoritos y cómo atiendes a los clientes…"
                  onChange={(e) => set('bio', e.target.value)} />
                <p className="text-[11px] text-slate-400 mt-1">{form.bio.length}/1000</p>
              </div>
              <div className="flex justify-end">
                <button className="btn-primary" disabled={saving || !upDirty}>
                  {saving ? 'Guardando…' : upDirty ? 'Guardar cambios' : 'Guardado'}
                </button>
              </div>
            </form>


            {/* Seguridad */}
            <form className="card" onSubmit={onChangePass}>
              <h3 className="font-semibold mb-4">Cambiar contraseña</h3>
              <div className="mb-3"><label className="label">Contraseña actual</label>
                <input type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" /></div>
              <div className="mb-4"><label className="label">Nueva contraseña</label>
                <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
              <button className="btn-neutral" disabled={pwBusy}>{pwBusy ? 'Actualizando…' : 'Actualizar contraseña'}</button>
            </form>
          </div>
        )}

        {tab === 'stats' && (
          role === 'agent'
            ? <AgentView d={agi} />
            : <GeneralView d={gen} compact />
        )}
        </div>

        {/* Panel derecho: evita el vacío y es uso rápido */}
        <aside className="space-y-4 xl:mt-[72px] xl:sticky xl:top-8">
          <div className="card">
            <h3 className="font-semibold mb-3">Accesos rápidos</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <a className="btn-neutral justify-center" href="/projects">Proyectos</a>
              <a className="btn-neutral justify-center" href="/sales">Ventas</a>
              <a className="btn-neutral justify-center" href="/payments">Pagos</a>
              <a className="btn-neutral justify-center" href="/lots">Lotes</a>
              {(role === 'admin' || role === 'superadmin') && <a className="btn-neutral justify-center" href="/settings">Configuración</a>}
            </div>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-3">DashBoard</h3>
            <div className="rounded-lg bg-canvas p-3"><span className="label">Puesto</span><b className="capitalize">{role === 'superadmin' ? 'Administración' : role}</b></div>
            {role === 'agent' && (
              <div className="mt-2 space-y-2 text-sm">
                <div className="rounded-lg bg-canvas p-3"><span className="label">Comisión</span><b>{Number(me?.commissionRate || 0)}%</b></div>
                <div className="rounded-lg bg-canvas p-3 flex justify-between"><span className="label">Meta lotes/mes</span><b>{me?.monthlyGoalLots || 0}</b></div>
                <div className="rounded-lg bg-canvas p-3 flex justify-between"><span className="label">Meta S/ /mes</span><b>{Number(me?.monthlyGoalAmount || 0).toLocaleString()}</b></div>
              </div>
            )}
          </div>
                </aside>
        </div>
      </div>
    </Layout>
  );
}

