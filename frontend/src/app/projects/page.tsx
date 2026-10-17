'use client';
import { moneyGlobal, moneyGlobalDecimals, useDisplayCurrency } from '@/lib/currency';
import { useEffect, useRef, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { Toaster, toast, StatusBadge, Field } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { FiAlertTriangle, FiCamera, FiEdit3, FiMap, FiMapPin, FiMoreVertical, FiTrash2, FiUpload, FiX } from 'react-icons/fi';
import { BRAND, Project, formatMoney } from '@/lib/types';
import ProjectsMap from '@/components/features/projects/ProjectsMap';

export default function ProjectsPage() {
  useDisplayCurrency();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dragged = useRef<number | null>(null);
  const savingOrderRef = useRef(false);

  async function moveProject(id: number, targetId: number) {
    if (savingOrderRef.current || id === targetId) return;
    const from = projects.findIndex(p => p.id === id);
    const to = projects.findIndex(p => p.id === targetId);
    if (from < 0 || to < 0) return;
    const previous = projects;
    const next = [...projects];
    const [project] = next.splice(from, 1);
    next.splice(to, 0, project);
    savingOrderRef.current = true;
    setSavingOrder(true);
    setProjects(next);
    try {
      await api.post('/projects/reorder', { projectIds: next.map(p => p.id) });
      toast('Orden de proyectos guardado');
    } catch (e: any) {
      setProjects(previous);
      toast(e.message, 'err');
    } finally {
      savingOrderRef.current = false;
      setSavingOrder(false);
    }
  }

  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const savingProjectRef = useRef(false);
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

  function cerrarFormulario() {
    if (savingProjectRef.current) return;
    setOpenCreate(false); setEditId(null); setForm({});
    setCover(null); setLogo(null); setPlanImage(null);
  }

  function abrirCreacion() {
    setEditId(null); setForm({}); setCover(null); setLogo(null); setPlanImage(null);
    setOpenCreate(true);
  }

  function abrirEdicion(p: Project) {
    setForm({
      name: p.name,
      description: p.description || '',
      location: p.location || '',
      lotDeliveryDate: p.lotDeliveryDate || '',
      condominiumDeliveryDate: p.condominiumDeliveryDate || '',
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : '',
      referencePrice: p.referencePrice != null ? String(p.referencePrice) : '',
    });
    setCover(null); setLogo(null); setPlanImage(null);
    setEditId(p.id); setOpenCreate(true);
  }

  async function guardarProyecto() {
    if (savingProjectRef.current) return;
    const name = String(form.name || '').trim();
    if (!name) return toast('Ingresa el nombre del proyecto', 'err');
    const numberOrUndefined = (value: unknown) => value == null || value === '' ? undefined : Number(value);
    const payload = {
      name,
      description: form.description || '',
      location: form.location || '',
      lotDeliveryDate: form.lotDeliveryDate || null,
      condominiumDeliveryDate: form.condominiumDeliveryDate || null,
      latitude: numberOrUndefined(form.latitude),
      longitude: numberOrUndefined(form.longitude),
      referencePrice: numberOrUndefined(form.referencePrice),
    };
    if ([payload.latitude, payload.longitude, payload.referencePrice].some(value => value !== undefined && !Number.isFinite(value))) {
      return toast('Revisa las coordenadas y el precio referencial', 'err');
    }
    const editing = editId != null;
    savingProjectRef.current = true; setSavingProject(true);
    try {
      const saved = await api.post<Project>(editing ? `/projects/update/${editId}` : '/projects', payload);
      if (!saved?.id) throw new Error('No se recibio el proyecto guardado');
      // Si falla una imagen, reintentar actualiza este mismo proyecto.
      setEditId(saved.id);
      setProjects(current => editing
        ? current.map(project => project.id === saved.id ? { ...project, ...saved } : project)
        : [...current, saved]);
      if (cover) {
        const updated = await uploadFile(`/projects/cover/${saved.id}`, cover);
        setProjects(current => current.map(project => project.id === saved.id ? { ...project, coverImageUrl: updated.coverImageUrl } : project));
        setCover(null);
      }
      if (logo) {
        const updated = await uploadFile(`/projects/logo/${saved.id}`, logo);
        setProjects(current => current.map(project => project.id === saved.id ? { ...project, logoImageUrl: updated.logoImageUrl } : project));
        setLogo(null);
      }
      if (planImage) { await uploadFile(`/plan/image/${saved.id}`, planImage); setPlanImage(null); }
      toast(editing ? 'Proyecto actualizado' : 'Proyecto creado');
      setOpenCreate(false); setEditId(null); setForm({});
      api.get<Project[]>('/projects').then(setProjects).catch(() => {});
    } catch (e: any) { toast(e.message, 'err'); }
    finally { savingProjectRef.current = false; setSavingProject(false); }
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
          {canEdit && <button className="btn-primary" onClick={abrirCreacion}>Crear proyecto</button>}
        </div>
      </div>
      {loading ? <p className="text-slate-400">Cargando…</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((p, index) => (
            <div key={p.id}
              draggable={canEdit && !savingOrder && actionsProjectId === null}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? `${p.name}. Arrastra para cambiar el orden, o usa Alt y las flechas.` : undefined}
              aria-busy={savingOrder}
              className={`card overflow-hidden p-0 ${canEdit && !savingOrder ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingId === p.id ? 'opacity-50 ring-2 ring-blue-500' : ''}`}
              onDragStart={e => {
                if (!canEdit || savingOrderRef.current || (e.target as HTMLElement).closest('button, a, input, label')) { e.preventDefault(); return; }
                dragged.current = p.id;
                setDraggingId(p.id);
                setActionsProjectId(null);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(p.id));
              }}
              onDragOver={e => {
                if (canEdit && dragged.current !== null && !savingOrderRef.current) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
              }}
              onDrop={e => {
                e.preventDefault();
                const id = dragged.current;
                dragged.current = null; setDraggingId(null);
                if (canEdit && id !== null) void moveProject(id, p.id);
              }}
              onDragEnd={() => { dragged.current = null; setDraggingId(null); }}
              onKeyDown={e => {
                if (e.target !== e.currentTarget || !canEdit || !e.altKey || savingOrderRef.current) return;
                const offset = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0;
                if (offset && projects[index + offset]) { e.preventDefault(); void moveProject(p.id, projects[index + offset].id); }
              }}>
              <div className="h-36 bg-brand-gradient relative">
                {p.coverImageUrl ? <img draggable={false} src={p.coverImageUrl} className="object-cover w-full h-full" alt="" /> : (
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
                            <span className="truncate">Editar</span>
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
                <div className="grid grid-cols-3 gap-2">
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
                  <button type="button" className={`${projectActionBase} bg-white hover:bg-slate-50`} style={{ borderColor: BRAND.border, borderRadius: 4, color: BRAND.blue }} onClick={() => router.push(`/projects/${p.id}/photos`)}>
                    <FiCamera className="shrink-0" /><span className="truncate">Fotos</span>
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
          <div className="absolute inset-0 bg-black/50" onClick={cerrarFormulario} />
          <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>{editId != null ? 'Editar proyecto' : 'Nuevo proyecto'}</h3>
            <fieldset disabled={savingProject}>
            <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *"><input className="input" value={form.name || ''} onChange={(e) => setf('name', e.target.value)} /></Field>
            <Field label="Ubicación / dirección"><input className="input" value={form.location || ''} onChange={(e) => setf('location', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entrega del Lote"><input type="date" className="input min-w-0" value={form.lotDeliveryDate || ''} onChange={(e) => setf('lotDeliveryDate', e.target.value)} /></Field>
              <Field label="Entrega del Condominio"><input type="date" className="input min-w-0" value={form.condominiumDeliveryDate || ''} onChange={(e) => setf('condominiumDeliveryDate', e.target.value)} /></Field>
            </div>
            <Field label="Descripción"><textarea className="input" value={form.description || ''} onChange={(e) => setf('description', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud (mapa)"><input className="input" value={form.latitude || ''} onChange={(e) => setf('latitude', e.target.value)} /></Field>
              <Field label="Longitud (mapa)"><input className="input" value={form.longitude || ''} onChange={(e) => setf('longitude', e.target.value)} /></Field>
            </div>
            <Field label="Precio referencial (US$)"><input type="number" className="input" value={form.referencePrice || ''} onChange={(e) => setf('referencePrice', e.target.value)} /></Field>
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
            </fieldset>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" disabled={savingProject} onClick={cerrarFormulario}>Cancelar</button>
              <button className="btn-primary" disabled={savingProject} onClick={guardarProyecto}>{savingProject ? 'Guardando...' : editId != null ? 'Guardar cambios' : 'Crear proyecto'}</button>
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
