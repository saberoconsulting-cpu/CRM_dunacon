'use client';
import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { Toaster, toast, StatusBadge, Field } from '@/components/ui/ui';
import { api, uploadFile } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { FiMap } from 'react-icons/fi';
import { Project, formatMoney } from '@/lib/types';
import ProjectsMap from '@/components/features/projects/ProjectsMap';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [openMap, setOpenMap] = useState(false);
  const [form, setForm] = useState<any>({});
  const [cover, setCover] = useState<File | null>(null);
  const setf = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

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
      toast('Proyecto creado');
      setOpenCreate(false); setForm({}); setCover(null);
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
    const proyecto = projects.find((p) => p.id === id);
    if (!confirm(`¿Eliminar el proyecto "${proyecto?.name || 'Proyecto'}"?\nSe quitarán también planos, manzanas, lotes, ventas y pagos de ese proyecto. Esta acción no se puede deshacer.`)) return;
    try {
      await api.post(`/projects/delete/${id}`);
      toast('Proyecto eliminado');
      setProjects((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) { toast(e.message, 'err'); }
  }

  useEffect(() => {
    const role = JSON.parse(localStorage.getItem('crm_user') || '{}').role;
    setCanEdit(role === 'superadmin' || role === 'admin');
    api.get<any>('/projects').then(setProjects).catch((e) => toast(e.message, 'err')).finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Proyectos">
      <Toaster />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-sm" style={{ color: '#6B7280' }}>Unidades comerciales activas y su avance comercial.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-neutral" onClick={() => setOpenMap(true)}>Ver en el mapa</button>
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
                <span className="absolute top-2 right-2 badge text-xs bg-white/90 text-[#171717] flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${p.status==='active'?'bg-emerald-500':'bg-slate-400'}`} /> {p.status === 'active' ? 'Activo' : 'Inactivo'}</span>
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
                    <div><div className="text-lg font-bold text-red-600">{p.stats.vendidos}</div><div className="text-[10px] text-slate-400">Vend.</div></div>
                  </div>
                )}
                {p.referencePrice && <div className="text-xs text-slate-400 mb-3">Precio ref: {formatMoney(p.referencePrice)}</div>}
                {canEdit && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <label className="btn-neutral !h-8 text-xs cursor-pointer inline-flex items-center gap-1">
                      📷 <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; reemplazarImagen(p.id, f); }} />Actualizar imagen
                    </label>
                    <button className="btn-neutral !h-8 text-xs" onClick={() => abrirEdicion(p)}>Actualizar ubicación</button>
                    <button className="btn-danger !h-8 text-xs" onClick={() => eliminarProyecto(p.id)}>Eliminar proyecto</button>
                  </div>
                )}
                <button className="btn-primary w-full justify-center" onClick={() => router.push(`/projects/${p.id}`)}>Ver proyecto y plano</button>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="text-slate-400 col-span-full text-center py-10">No hay proyectos</div>}
        </div>
      )}
      {openCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenCreate(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg p-6">
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Nuevo proyecto</h3>
            <Field label="Nombre *"><input className="input" value={form.name || ''} onChange={(e) => setf('name', e.target.value)} /></Field>
            <Field label="Ubicación / dirección"><input className="input" value={form.location || ''} onChange={(e) => setf('location', e.target.value)} /></Field>
            <Field label="Descripción"><textarea className="input" value={form.description || ''} onChange={(e) => setf('description', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud (mapa)"><input className="input" value={form.latitude || ''} onChange={(e) => setf('latitude', e.target.value)} /></Field>
              <Field label="Longitud (mapa)"><input className="input" value={form.longitude || ''} onChange={(e) => setf('longitude', e.target.value)} /></Field>
            </div>
            <Field label="Precio referencial (S/)"><input type="number" className="input" value={form.referencePrice || ''} onChange={(e) => setf('referencePrice', e.target.value)} /></Field>
            <Field label="Portada"><input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpenCreate(false)}>Cancelar</button>
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
      {openMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpenMap(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-6xl h-[88vh] max-h-[92vh] flex flex-col p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#171717' }}>Proyectos en el mapa</h3>
                <p className="text-xs text-slate-500">Arrastra el mapa, haz zoom y toca el marcador para ver el proyecto.</p>
              </div>
              <button className="btn-neutral !h-8 text-sm" onClick={() => setOpenMap(false)}>Cerrar</button>
            </div>
            <div className="flex-1 min-h-0 rounded-xl overflow-hidden"><ProjectsMap projects={projects} onOpen={(id) => { setOpenMap(false); router.push(`/projects/${id}`); }} /></div>
          </div>
        </div>
      )}
    </Layout>
  );
}
