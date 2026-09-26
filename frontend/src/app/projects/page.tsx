'use client';
import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { Toaster, toast, StatusBadge, Field } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { FiAlertTriangle, FiCamera, FiEdit3, FiMap, FiMapPin, FiMoreVertical, FiTrash2, FiUpload, FiX } from 'react-icons/fi';
import { BRAND, Project, formatMoney } from '@/lib/types';
import ProjectsMap from '@/components/features/projects/ProjectsMap';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [openMap, setOpenMap] = useState(false);
  const [mapProjectId, setMapProjectId] = useState<number | null>(null);
  const [actionsProjectId, setActionsProjectId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<any>({});
  const [cover, setCover] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [planImage, setPlanImage] = useState<File | null>(null);
  const setf = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const projectActionBase = 'inline-flex h-10 min-w-0 items-center justify-center gap-2 border px-2 text-xs font-semibold transition-colors';

  function abrirMapaProyecto(p: Project) {
    setMapProjectId(p.id);
    setOpenMap(true);
    if (p.latitude == null || p.longitude == null) toast('Este proyecto aún no tiene coordenadas en el mapa', 'err');
  }

  async function crearProyecto() {
    if (!form.name) return toast('Ingresa el nombre del proyecto', 'err');
    try {
      const created: any = await api.post('/projects', {
        name: form.name, description: form.description || undefined, location: form.location || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        referencePrice: form.referencePrice ? Number(form.referencePrice) : undefined,
      });
      if (cover) { await uploadFile(`/projects/cover/${created?.id || 1}`, cover); }
      if (logo) { await uploadFile(`/projects/logo/${created?.id || 1}`, logo); }
      if (planImage) { await uploadFile(`/plan/image/${created?.id || 1}`, planImage); }
      toast('Proyecto creado');
      setOpenCreate(false); setForm({}); setCover(null); setLogo(null); setPlanImage(null);
      api.get<any>('/projects').then(setProjects).catch(() => {});
    } catch (e: any) { toast(e.message, 'err'); }
  }

  function abrirEdicion(p: Project) {
    setForm({
      name: p.name,
      description: p.description || '',
      location: p.location || '',
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : '',
      referencePrice: p.referencePrice ? String(p.referencePrice) : '',
    });
    setEditId(p.id);
  }

  async function guardarProyecto() {
    if (!form.name) return toast('Ingresa el nombre', 'err');
    try {
      await api.post(`/projects/update/${editId}`, {
        name: form.name,
        description: form.description || undefined,
        location: form.location || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      });
      toast('Proyecto actualizado');
      setEditId(null); setForm({});
      api.get<any>('/projects').then(setProjects).catch(() => {});
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function reemplazarImagen(id: number, f?: File) {
    if (!f) return;
    try {
      const p = await uploadFile(`/projects/cover/${id}`, f);
      setProjects((prev) => prev.map((x) => (x.id === id ? { ...x, coverImageUrl: p?.coverImageUrl ?? x.coverImageUrl } : x)));
      toast('Imagen de portada actualizada');
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function eliminarProyecto(id: number) {
    setDeleting(true);
    try {
      await api.post(`/projects/delete/${id}`);
      toast('Proyecto eliminado');
      setProjects((prev) => prev.filter((x) => x.id !== id));
      setConfirmDelete(null);
    } catch (e: any) { toast(e.message, 'err'); } finally { setDeleting(false); }
  }

  useEffect(() => {
    const role = JSON.parse(localStorage.getItem('crm_user') || '{}').role;
    setCanEdit(role === 'superadmin');
    api.get<any>('/projects').then(setProjects).catch((e) => toast(e.message, 'err')).finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Proyectos">
      <Toaster />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-sm" style={{ color: BRAND.muted }}>Unidades comerciales activas y su avance comercial.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-neutral" onClick={() => { setMapProjectId(null); setOpenMap(true); }}>Ver en el mapa</button>
          {canEdit && <button className="btn-primary" onClick={() => setOpenCreate(true)}>Crear proyecto</button>}
        </div>
      </div>
      {loading ? <p className="text-slate-400">Cargando…</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((p) => (
            <div key={p.id} className="card overflow-hidden p-0">
              <div className="h-36 bg-brand-gradient relative">
                {p.coverImageUrl ? <img src={p.coverImageUrl} className="object-cover w-full h-full" alt="" /> : (
                  <div className="flex items-center justify-center h-full text-white text-4xl"><FiMap /></div>
                )}
                <span className="absolute left-2 top-2 badge text-xs bg-white/90 text-[#171717] flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${p.status==='active'?'bg-emerald-500':'bg-slate-400'}`} /> {p.status === 'active' ? 'Activo' : 'Inactivo'}</span>
                {canEdit && (
                  <div className="absolute right-2 top-2">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-md bg-white/95 text-[#374151] shadow-sm transition-colors hover:bg-white"
                      onClick={() => setActionsProjectId((current) => current === p.id ? null : p.id)}
                      aria-label={`Opciones de ${p.name}`}
                      title="Opciones"
                    >
                      <FiMoreVertical />
                    </button>
                    {actionsProjectId === p.id && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setActionsProjectId(null)} />
                        <div className="absolute right-0 top-10 z-40 w-44 overflow-hidden rounded-md border bg-white p-1 shadow-xl" style={{ borderColor: BRAND.border }}>
                          <label className="flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm text-[#374151] hover:bg-[#F3F4F6]">
                            <FiCamera className="shrink-0" />
                            <span className="truncate">Imagen</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                setActionsProjectId(null);
                                reemplazarImagen(p.id, f);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm text-[#374151] hover:bg-[#F3F4F6]"
                            onClick={() => { setActionsProjectId(null); abrirEdicion(p); }}
                          >
                            <FiEdit3 className="shrink-0" />
                            <span className="truncate">Ubicacion</span>
                          </button>
                          <button
                            type="button"
                            className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm text-[#B42318] hover:bg-red-50"
                            onClick={() => { setActionsProjectId(null); setConfirmDelete(p); }}
                          >
                            <FiTrash2 className="shrink-0" />
                            <span className="truncate">Eliminar</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs opacity-90">{p.location}</div>
                </div>
              </div>
              <div className="p-4">
                {p.stats && (
                  <div className="grid grid-cols-4 gap-2 text-center mb-4">
                    <div><div className="text-lg font-bold text-slate-800">{p.stats.total}</div><div className="text-[10px] text-slate-400">Lotes</div></div>
                    <div><div className="text-lg font-bold text-emerald-600">{p.stats.disponibles}</div><div className="text-[10px] text-slate-400">Disp.</div></div>
                    <div><div className="text-lg font-bold text-yellow-600">{p.stats.reservados + p.stats.adelantos + p.stats.primeras}</div><div className="text-[10px] text-slate-400">En curso</div></div>
                    <div><div className="text-lg font-bold text-[#1877F2]">{p.stats.vendidos}</div><div className="text-[10px] text-slate-400">Vend.</div></div>
                  </div>
                )}
                {p.referencePrice && <div className="text-xs text-slate-400 mb-3">Precio ref: {formatMoney(p.referencePrice)}</div>}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`${projectActionBase} bg-white hover:bg-slate-50`}
                    style={{ borderColor: BRAND.border, borderRadius: 4, color: BRAND.blue }}
                    title="Ver en mapa"
                    aria-label={`Ver ${p.name} en el mapa`}
                    onClick={() => abrirMapaProyecto(p)}
                  >
                    <FiMapPin className="shrink-0" />
                    <span className="truncate">Mapa</span>
                  </button>
                  <button
                    type="button"
                    className={`${projectActionBase} text-white`}
                    style={{ background: BRAND.blue, borderColor: BRAND.blue, borderRadius: 4 }}
                    onClick={() => router.push(`/projects/${p.id}`)}
                  >
                    <FiMap className="shrink-0" />
                    <span className="truncate">Proyecto</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="text-slate-400 col-span-full text-center py-10">No hay proyectos</div>}
        </div>
      )}
      {openCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenCreate(false)} />
          <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Nuevo proyecto</h3>
            <Field label="Nombre *"><input className="input" value={form.name || ''} onChange={(e) => setf('name', e.target.value)} /></Field>
            <Field label="Ubicación / dirección"><input className="input" value={form.location || ''} onChange={(e) => setf('location', e.target.value)} /></Field>
            <Field label="Descripción"><textarea className="input" value={form.description || ''} onChange={(e) => setf('description', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud (mapa)"><input className="input" value={form.latitude || ''} onChange={(e) => setf('latitude', e.target.value)} /></Field>
              <Field label="Longitud (mapa)"><input className="input" value={form.longitude || ''} onChange={(e) => setf('longitude', e.target.value)} /></Field>
            </div>
            <Field label="Precio referencial (S/)"><input type="number" className="input" value={form.referencePrice || ''} onChange={(e) => setf('referencePrice', e.target.value)} /></Field>
            <Field label="Logo"><input type="file" accept="image/*" className="block w-full min-w-0 max-w-full overflow-hidden text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" onChange={(e) => setLogo(e.target.files?.[0] || null)} /></Field>
            <Field label="Portada"><input type="file" accept="image/*" className="block w-full min-w-0 max-w-full overflow-hidden text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium" onChange={(e) => setCover(e.target.files?.[0] || null)} /></Field>
            <Field label="Plano">
              <label className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <span className="flex min-w-0 items-center gap-2">
                  <FiUpload className="shrink-0 text-slate-500" />
                  <span className="truncate">{planImage?.name || 'Agregar plano del proyecto'}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-[#1877F2]">Seleccionar</span>
                <input type="file" accept="image/*,.jpg,.jpeg,.jpe,.png,.webp,.bmp,.gif,.jpng" className="hidden" onChange={(e) => setPlanImage(e.target.files?.[0] || null)} />
              </label>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => { setOpenCreate(false); setPlanImage(null); }}>Cancelar</button>
              <button className="btn-primary" onClick={crearProyecto}>Crear proyecto</button>
            </div>
          </div>
        </div>
      )}
      {editId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setEditId(null); setForm({}); }} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto">
            <h3 className="font-semibold mb-1" style={{ fontSize: 17 }}>Actualizar proyecto</h3>
            <p className="text-xs text-slate-500 mb-5">Cambia dirección o coordenadas para ubicarlo en el mapa.</p>
            <Field label="Nombre *"><input className="input" value={form.name || ''} onChange={(e) => setf('name', e.target.value)} /></Field>
            <Field label="Ubicación / dirección"><input className="input" value={form.location || ''} onChange={(e) => setf('location', e.target.value)} /></Field>
            <Field label="Descripción"><textarea className="input" value={form.description || ''} onChange={(e) => setf('description', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud (mapa)"><input className="input" value={form.latitude || ''} onChange={(e) => setf('latitude', e.target.value)} /></Field>
              <Field label="Longitud (mapa)"><input className="input" value={form.longitude || ''} onChange={(e) => setf('longitude', e.target.value)} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button className="btn-neutral" onClick={() => { setEditId(null); setForm({}); }}>Cancelar</button>
              <button className="btn-primary" onClick={guardarProyecto}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !deleting && setConfirmDelete(null)} />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(15,23,42,0.28)]">
            <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#B42318,#E11D48)' }} />

            <button
              type="button"
              onClick={() => !deleting && setConfirmDelete(null)}
              disabled={deleting}
              className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
              aria-label="Cerrar"
            >
              <FiX />
            </button>

            <div className="px-6 pb-6 pt-7">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#FEF3F2] text-xl text-[#B42318] ring-1 ring-[#FEE4E2]">
                  <FiAlertTriangle />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px] font-semibold leading-snug text-slate-900">Eliminar proyecto</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    Vas a eliminar <span className="font-semibold text-slate-700">{confirmDelete.name}</span>. Los lotes, ventas y pagos quedarán guardados.
                  </p>
                </div>
              </div>

              {confirmDelete.stats && (
                <div className="mt-5 grid grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                  <div>
                    <div className="text-base font-bold tabular-nums text-slate-800">{confirmDelete.stats.total}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Lotes</div>
                  </div>
                  <div>
                    <div className="text-base font-bold tabular-nums text-emerald-600">{confirmDelete.stats.disponibles}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Disp.</div>
                  </div>
                  <div>
                    <div className="text-base font-bold tabular-nums text-amber-600">{confirmDelete.stats.reservados + confirmDelete.stats.adelantos + confirmDelete.stats.primeras}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">En curso</div>
                  </div>
                  <div>
                    <div className="text-base font-bold tabular-nums text-[#1877F2]">{confirmDelete.stats.vendidos}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Vend.</div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#EAF3FF] px-3.5 py-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#1877F2] text-[11px] font-bold text-white">i</span>
                <p className="text-xs leading-relaxed text-[#1355C4]">
                  Puedes recuperarlo cuando quieras desde <span className="font-semibold">Historial de proyectos</span>, en la barra superior.
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-neutral !h-10 !rounded-xl"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => eliminarProyecto(confirmDelete.id)}
                disabled={deleting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#B42318] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(180,35,24,0.24)] transition-all hover:bg-[#9A1E14] disabled:opacity-60"
              >
                {deleting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Eliminando…
                  </>
                ) : (
                  <>
                    <FiTrash2 /> Eliminar proyecto
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}


      {openMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpenMap(false)} />
          <div className="relative flex h-[88vh] max-h-[92vh] w-full max-w-6xl flex-col rounded-md border bg-white p-4 shadow-2xl" style={{ borderColor: BRAND.border }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#171717' }}>Proyectos en el mapa</h3>
                <p className="text-xs text-slate-500">Arrastra el mapa, haz zoom y toca el marcador para ver el proyecto.</p>
              </div>
              <button className="btn-neutral !h-8 text-sm" onClick={() => setOpenMap(false)}>Cerrar</button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-md"><ProjectsMap projects={projects} focusProjectId={mapProjectId} onOpen={(id) => { setOpenMap(false); router.push(`/projects/${id}`); }} /></div>
          </div>
        </div>
      )}
    </Layout>
  );
}
