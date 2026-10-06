'use client';

import { useCallback, useEffect, useState } from 'react';
import { FiAlertTriangle, FiEdit3, FiList, FiPlus, FiRefreshCw, FiSave, FiTrash2, FiX } from 'react-icons/fi';
import { toast } from '@/components/ui/ui';
import { api } from '@/lib/api';

type Category = {
  id: number;
  projectId: number;
  code?: string | null;
  movementType: string;
  eerrClassification: string;
  cashflowRowId?: string | null;
  sortOrder: number;
  isActive: boolean;
};

type CategoryResponse = {
  items: Category[];
  unmapped: Array<{ movementType: string; eerrClassification: string }>;
  eerrOptions: string[];
};

const INK = '#0F172A';
const BORDER = '#CBD5E1';
const NAVY = '#002060';
const INPUT_STYLE = { width: '100%', padding: '5px 6px', border: `1px solid ${BORDER}`, borderRadius: 4, fontSize: 12 };

function makeCode(value: string) {
  const words = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

export default function CategoryMasterPanel({ projectId, onClose, onChanged }: {
  projectId: number;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Category[]>([]);
  const [unmapped, setUnmapped] = useState<Array<{ movementType: string; eerrClassification: string }>>([]);
  const [eerrOptions, setEerrOptions] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { code: string; movementType: string; eerrClassification: string; cashflowRowId: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [newRow, setNewRow] = useState<{ code: string; movementType: string; eerrClassification: string; cashflowRowId: string } | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [editDraft, setEditDraft] = useState<{ code: string; movementType: string; eerrClassification: string; cashflowRowId: string }>({ code: '', movementType: '', eerrClassification: '', cashflowRowId: '' });
  const [sortByItem, setSortByItem] = useState(false);
  // Selector de CLASIFICACION FC: permite elegir una existente o crear/renombrar
  // una nueva sin teclearla a ciegas. `target` indica en que draft se aplica.
  const [fcPicker, setFcPicker] = useState<{ target: 'row' | 'new' | 'edit'; rowId?: number } | null>(null);
  const [fcValue, setFcValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<CategoryResponse>(`/bank-accounts/categories?projectId=${projectId}`);
      setItems(data?.items || []);
      setEerrOptions(data?.eerrOptions || []);
      setDrafts({});
    } catch (error: any) {
      toast(error?.message || 'No se pudieron cargar las categorias', 'err');
    } finally {
      setLoading(false);
    }
    // Los conceptos sin homologar se piden aparte para no encarecer el CRUD.
    try {
      const extra = await api.get<CategoryResponse>(`/bank-accounts/categories/unmapped?projectId=${projectId}`);
      setUnmapped(extra?.unmapped || []);
      setEerrOptions((current) => Array.from(new Set([...current, ...(extra?.eerrOptions || [])])).sort());
    } catch {
      setUnmapped([]);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const draftOf = (item: Category) => drafts[item.id] || { code: item.code || makeCode(item.movementType), movementType: item.movementType, eerrClassification: item.eerrClassification, cashflowRowId: item.cashflowRowId || '' };
  const setDraft = (id: number, current: { code: string; movementType: string; eerrClassification: string; cashflowRowId: string }, patch: Partial<{ code: string; movementType: string; eerrClassification: string; cashflowRowId: string }>) => {
    setDrafts((state) => ({ ...state, [id]: { ...current, ...patch } }));
  };

  async function saveRow(item: Category) {
    const current = draftOf(item);
    if (!current.movementType.trim()) return toast('Ingresa el TIPO INGRESO/GASTO', 'err');
    if (!current.eerrClassification.trim()) return toast('Ingresa la CLASIFICACION FC', 'err');
    setSaving(item.id);
    try {
      await api.patch(`/bank-accounts/categories/${item.id}`, {
        code: current.code.trim().toUpperCase() || makeCode(current.movementType),
        movementType: current.movementType.trim(),
        eerrClassification: current.eerrClassification.trim(),
        cashflowRowId: current.cashflowRowId || '',
      });
      toast('Categoria actualizada');
      await load();
      onChanged?.();
    } catch (error: any) {
      toast(error?.message || 'No se pudo guardar la categoria', 'err');
    } finally {
      setSaving(null);
    }
  }

  async function removeRow(item: Category) {
    setSaving(item.id);
    try {
      await api.delete(`/bank-accounts/categories/${item.id}`);
      toast('Categoria retirada');
      await load();
      onChanged?.();
    } catch (error: any) {
      toast(error?.message || 'No se pudo eliminar', 'err');
    } finally {
      setSaving(null);
    }
  }

  // El ítem de cada fila se guarda directo en la base (sort_order) para que el
  // orden quede persistido y no dependa del orden de inserción.
  async function updateItemOrder(item: Category, value: string) {
    const parsed = Math.max(1, Math.trunc(Number(value) || 0));
    if (!parsed || parsed === Number(item.sortOrder || 0)) return;
    setSaving(item.id);
    try {
      await api.patch(`/bank-accounts/categories/${item.id}`, { sortOrder: parsed });
      await load();
      onChanged?.();
    } catch (error: any) {
      toast(error?.message || 'No se pudo guardar el ítem', 'err');
    } finally {
      setSaving(null);
    }
  }

  function openEdit(item: Category) {
    setEditing(item);
    setEditDraft({
      code: item.code || makeCode(item.movementType),
      movementType: item.movementType,
      eerrClassification: item.eerrClassification,
      cashflowRowId: item.cashflowRowId || '',
    });
  }

  // Abre el selector de CLASIFICACION FC precargado con el valor actual del draft.
  function openFcPicker(target: 'row' | 'new' | 'edit', rowId?: number) {
    let current = '';
    if (target === 'edit') {
      current = editDraft.eerrClassification;
    } else if (target === 'new') {
      current = newRow?.eerrClassification || '';
    } else if (rowId != null) {
      const item = items.find((it) => it.id === rowId);
      if (item) current = draftOf(item).eerrClassification;
    }
    setFcValue(current || '');
    setFcPicker({ target, rowId });
  }

  // Aplica la clasificacion elegida/creada al draft correspondiente.
  function applyFc(value: string) {
    const next = (value || '').trim();
    if (!fcPicker) return;
    if (fcPicker.target === 'edit') {
      setEditDraft((prev) => ({ ...prev, eerrClassification: next }));
    } else if (fcPicker.target === 'new') {
      setNewRow((prev) => (prev ? { ...prev, eerrClassification: next } : prev));
    } else if (fcPicker.rowId != null) {
      const item = items.find((it) => it.id === fcPicker.rowId);
      if (item) setDraft(item.id, draftOf(item), { eerrClassification: next });
    }
    setFcPicker(null);
    setFcValue('');
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editDraft.movementType.trim()) return toast('Ingresa el TIPO INGRESO/GASTO', 'err');
    if (!editDraft.eerrClassification.trim()) return toast('Ingresa la CLASIFICACION FC', 'err');
    setSaving(editing.id);
    try {
      await api.patch(`/bank-accounts/categories/${editing.id}`, {
        code: editDraft.code.trim().toUpperCase() || makeCode(editDraft.movementType),
        movementType: editDraft.movementType.trim(),
        eerrClassification: editDraft.eerrClassification.trim(),
        cashflowRowId: editDraft.cashflowRowId || '',
      });
      setEditing(null);
      toast('Categoria actualizada');
      await load();
      onChanged?.();
    } catch (error: any) {
      toast(error?.message || 'No se pudo guardar la categoria', 'err');
    } finally {
      setSaving(null);
    }
  }

  // Ordenar por ítem reaplica el orden guardado (sort_order asc) sobre la lista.
  function toggleSortByItem() {
    setSortByItem((current) => !current);
  }

  async function createRow() {
    if (!newRow) return;
    if (!newRow.movementType.trim()) return toast('Ingresa el TIPO INGRESO/GASTO', 'err');
    if (!newRow.eerrClassification.trim()) return toast('Ingresa la CLASIFICACION FC', 'err');
    setSaving(-1);
    try {
      await api.post('/bank-accounts/categories', {
        projectId,
        code: newRow.code.trim().toUpperCase() || makeCode(newRow.movementType),
        movementType: newRow.movementType.trim(),
        eerrClassification: newRow.eerrClassification.trim(),
        cashflowRowId: newRow.cashflowRowId || '',
      });
      setNewRow(null);
      toast('Categoria agregada');
      await load();
      onChanged?.();
    } catch (error: any) {
      toast(error?.message || 'No se pudo agregar la categoria', 'err');
    } finally {
      setSaving(null);
    }
  }

  // Los conceptos detectados en los movimientos y aun sin homologar se agregan
  // a la tabla maestra con un clic, sin tener que teclearlos de nuevo.
  async function adoptUnmapped(row: { movementType: string; eerrClassification: string }) {
    setSaving(-1);
    try {
      await api.post('/bank-accounts/categories', {
        projectId,
        code: makeCode(row.movementType),
        movementType: row.movementType,
        eerrClassification: row.eerrClassification || 'SIN CLASIFICAR',
        cashflowRowId: '',
      });
      toast('Concepto homologado');
      await load();
      onChanged?.();
    } catch (error: any) {
      toast(error?.message || 'No se pudo homologar el concepto', 'err');
    } finally {
      setSaving(null);
    }
  }

  const btnIcon = { border: 'none', background: 'transparent', cursor: 'pointer' };

  // El ítem mostrado siempre refleja la posicion 1..N; el boton "Ordenar por item"
  // reacomoda la lista segun el sort_order guardado en la base.
  const visibleItems = sortByItem
    ? [...items].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.id) - Number(b.id))
    : items;

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[600px] max-w-[calc(100vw_-_72px)] flex-col border-l bg-white shadow-2xl" style={{ borderColor: BORDER }}>
      <div className="border-b px-4 py-3" style={{ borderColor: BORDER }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="m-0 truncate text-sm font-semibold" style={{ color: NAVY }}>
              Categorias
            </h4>
            <p className="mt-0.5 text-[11px] text-slate-500">Codigos y mapeo FC</p>
          </div>
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={onClose} title="Cerrar">
            <FiX />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button className="btn-neutral !h-8 justify-center !px-2 text-[11px]" onClick={load} disabled={loading}>
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button
            className="btn-neutral !h-8 justify-center !px-2 text-[11px]"
            onClick={toggleSortByItem}
            title="Ordenar las filas por su item guardado"
            style={sortByItem ? { backgroundColor: '#E0E7FF', color: NAVY } : undefined}
          >
            <FiList /> Ordenar por ítem
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-bold text-white"
            style={{ backgroundColor: '#10B981', border: 'none', borderRadius: 6 }}
            onClick={() => setNewRow({ code: '', movementType: '', eerrClassification: '', cashflowRowId: '' })}
          >
            <FiPlus /> Nueva
          </button>
        </div>
      </div>

      <datalist id="bank-eerr-options">
        {eerrOptions.map((option) => <option key={option} value={option} />)}
      </datalist>

      <div className="min-h-0 flex-1 overflow-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ backgroundColor: NAVY, color: '#FFFFFF' }}>
              <th style={{ padding: 8, width: 44, textAlign: 'center', fontSize: 11 }}>Ítem</th>
              <th style={{ padding: 8, width: 48, textAlign: 'left', fontSize: 11 }}>Cod.</th>
              <th style={{ padding: 8, width: 150, textAlign: 'left', fontSize: 11 }}>Categoria</th>
              <th style={{ padding: 8, width: 120, textAlign: 'left', fontSize: 11 }}>Clasif. FC</th>
              <th style={{ padding: 8, width: 60, textAlign: 'center', fontSize: 11 }}>Acc.</th>
            </tr>
          </thead>
          <tbody>
            {newRow && (
              <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F0FDF4' }}>
                <td style={{ padding: 6, textAlign: 'center', color: '#94A3B8', fontSize: 11 }}>—</td>
                <td style={{ padding: 6 }}><input type="text" value={newRow.code} placeholder="CO" style={INPUT_STYLE} maxLength={12} onChange={(event) => setNewRow({ ...newRow, code: event.target.value.toUpperCase() })} /></td>
                <td style={{ padding: 6 }}><input autoFocus type="text" value={newRow.movementType} placeholder="Ej. Costos" style={INPUT_STYLE} onChange={(event) => setNewRow({ ...newRow, movementType: event.target.value, code: newRow.code || makeCode(event.target.value) })} /></td>
                <td style={{ padding: 6 }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="text" list="bank-eerr-options" value={newRow.eerrClassification} placeholder="FC" style={INPUT_STYLE} onChange={(event) => setNewRow({ ...newRow, eerrClassification: event.target.value })} />
                    <button type="button" title="Editar/crear Clasificacion FC" onClick={() => openFcPicker('new')} style={{ ...btnIcon, color: NAVY, flexShrink: 0 }}><FiEdit3 /></button>
                  </div>
                </td>
                <td align="center">
                  <button style={{ ...btnIcon, color: '#10B981' }} title="Guardar" onClick={createRow} disabled={saving === -1}><FiSave /></button>
                  <button style={{ ...btnIcon, color: '#64748B' }} title="Cancelar" onClick={() => setNewRow(null)}><FiX /></button>
                </td>
              </tr>
            )}

            {loading && !items.length ? (
              <tr><td colSpan={5} align="center" style={{ padding: 24, color: '#94A3B8' }}>Cargando categorias...</td></tr>
            ) : visibleItems.map((item, index) => {
              const current = draftOf(item);
              const dirty = current.code !== (item.code || makeCode(item.movementType)) || current.movementType !== item.movementType || current.eerrClassification !== item.eerrClassification || current.cashflowRowId !== (item.cashflowRowId || '');
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: dirty ? '#FFFBEB' : '#fff' }}>
                  <td style={{ padding: 4, textAlign: 'center' }}>
                    <input
                      key={`item-${item.id}-${item.sortOrder}`}
                      type="number"
                      min={1}
                      defaultValue={Number(item.sortOrder || 0) || index + 1}
                      style={{ ...INPUT_STYLE, textAlign: 'center', padding: '4px 2px' }}
                      title="Item (se guarda en la base)"
                      onBlur={(event) => updateItemOrder(item, event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                    />
                  </td>
                  <td style={{ padding: 6 }}><input type="text" value={current.code} style={INPUT_STYLE} maxLength={12} onChange={(event) => setDraft(item.id, current, { code: event.target.value.toUpperCase() })} /></td>
                  <td style={{ padding: 6 }}><input type="text" value={current.movementType} style={INPUT_STYLE} onChange={(event) => setDraft(item.id, current, { movementType: event.target.value })} /></td>
                  <td style={{ padding: 6 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="text" list="bank-eerr-options" value={current.eerrClassification} style={INPUT_STYLE} onChange={(event) => setDraft(item.id, current, { eerrClassification: event.target.value })} />
                      <button type="button" title="Editar/crear Clasificacion FC" onClick={() => openFcPicker('row', item.id)} style={{ ...btnIcon, color: NAVY, flexShrink: 0 }}><FiEdit3 /></button>
                    </div>
                  </td>
                  <td align="center" style={{ whiteSpace: 'nowrap' }}>
                    <button title="Guardar cambios" onClick={() => saveRow(item)} disabled={saving === item.id || !dirty} style={{ ...btnIcon, cursor: dirty ? 'pointer' : 'not-allowed', color: dirty ? '#1877F2' : '#CBD5E1' }}><FiSave /></button>
                    <button title="Eliminar" onClick={() => removeRow(item)} disabled={saving === item.id} style={{ ...btnIcon, color: '#DC2626' }}><FiTrash2 /></button>
                    <button title="Editar fila" onClick={() => openEdit(item)} disabled={saving === item.id} style={{ ...btnIcon, color: NAVY }}><FiEdit3 /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {unmapped.length > 0 && (
        <div className="m-3 rounded-md border p-3" style={{ borderColor: '#FCD34D', backgroundColor: '#FFFBEB' }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#92400E' }}>
            <FiAlertTriangle /> {unmapped.length} conceptos aparecen en tus movimientos pero aun no estan homologados
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unmapped.map((row) => (
              <button
                key={row.movementType}
                className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs"
                style={{ borderColor: BORDER, color: INK }}
                onClick={() => adoptUnmapped(row)}
                disabled={saving === -1}
                title="Agregar a la tabla maestra"
              >
                <FiPlus style={{ fontSize: 11 }} /> {row.movementType}{row.eerrClassification ? ` (${row.eerrClassification})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="border-t px-4 py-3 text-[11px]" style={{ color: '#64748B', borderColor: BORDER }}>
        Los conceptos de esta tabla llenan la lista de TIPO INGRESO/GASTO en el formulario de movimientos, autocompletan su CLASIFICACION FC y definen la SUBPARTIDA del Flujo de Caja dinamico que recibe el movimiento.
      </p>

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && setEditing(null)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="m-0 truncate text-sm font-semibold" style={{ color: NAVY }}>Editar categoria</h4>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{editing.movementType}</p>
              </div>
              <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setEditing(null)} title="Cerrar"><FiX /></button>
            </div>

            <datalist id="bank-eerr-options-modal">
              {eerrOptions.map((option) => <option key={option} value={option} />)}
            </datalist>

            <div className="grid grid-cols-1 gap-3">
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold" style={{ color: INK }}>Codigo</span>
                <input type="text" value={editDraft.code} maxLength={12} style={INPUT_STYLE} onChange={(event) => setEditDraft((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold" style={{ color: INK }}>Categoria (TIPO INGRESO/GASTO)</span>
                <input autoFocus type="text" value={editDraft.movementType} style={INPUT_STYLE} onChange={(event) => setEditDraft((prev) => ({ ...prev, movementType: event.target.value }))} />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold" style={{ color: INK }}>Clasificacion FC</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="text" list="bank-eerr-options-modal" value={editDraft.eerrClassification} style={INPUT_STYLE} onChange={(event) => setEditDraft((prev) => ({ ...prev, eerrClassification: event.target.value }))} />
                  <button type="button" title="Editar/crear Clasificacion FC" onClick={() => openFcPicker('edit')} style={{ ...btnIcon, color: NAVY, flexShrink: 0 }}><FiEdit3 /></button>
                </div>
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-neutral !h-8 !px-3 text-xs" onClick={() => setEditing(null)} disabled={saving === editing.id}>Cancelar</button>
              <button
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-3 text-xs font-bold text-white"
                style={{ backgroundColor: '#1877F2', border: 'none', borderRadius: 6 }}
                onClick={saveEdit}
                disabled={saving === editing.id}
              >
                <FiSave /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {fcPicker && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setFcPicker(null); setFcValue(''); }} />
          <div className="relative w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="m-0 text-sm font-semibold" style={{ color: NAVY }}>Clasificacion FC</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">Elige una existente o escribe una nueva</p>
              </div>
              <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => { setFcPicker(null); setFcValue(''); }} title="Cerrar"><FiX /></button>
            </div>

            {eerrOptions.length > 0 && (
              <div className="mb-3 max-h-52 overflow-auto rounded-md border" style={{ borderColor: BORDER }}>
                {eerrOptions.map((option) => {
                  const active = option.toUpperCase() === (fcValue || '').trim().toUpperCase();
                  return (
                    <button
                      key={option}
                      type="button"
                      className="block w-full truncate px-3 py-2 text-left text-xs"
                      style={{ backgroundColor: active ? '#EFF6FF' : 'transparent', color: active ? NAVY : INK, fontWeight: active ? 700 : 400 }}
                      onMouseEnter={(event) => { event.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                      onMouseLeave={(event) => { event.currentTarget.style.backgroundColor = active ? '#EFF6FF' : 'transparent'; }}
                      onClick={() => applyFc(option)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}

            <label className="grid gap-1">
              <span className="text-[11px] font-semibold" style={{ color: INK }}>Nueva / renombrar Clasificacion FC</span>
              <input
                autoFocus
                type="text"
                value={fcValue}
                maxLength={150}
                placeholder="Ej. GASTOS ADMINISTRATIVOS"
                style={INPUT_STYLE}
                onChange={(event) => setFcValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') applyFc(fcValue); }}
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-neutral !h-8 !px-3 text-xs" onClick={() => { setFcPicker(null); setFcValue(''); }}>Cancelar</button>
              <button
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-3 text-xs font-bold text-white"
                style={{ backgroundColor: '#1877F2', border: 'none', borderRadius: 6 }}
                onClick={() => applyFc(fcValue)}
                disabled={!fcValue.trim()}
              >
                <FiSave /> Usar
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
