'use client';

import { useCallback, useEffect, useState } from 'react';
import { FiAlertTriangle, FiPlus, FiRefreshCw, FiSave, FiTrash2, FiX } from 'react-icons/fi';
import { toast } from '@/components/ui/ui';
import { api } from '@/lib/api';

type Category = {
  id: number;
  projectId: number;
  code?: string | null;
  movementType: string;
  eerrClassification: string;
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
  const [drafts, setDrafts] = useState<Record<number, { code: string; movementType: string; eerrClassification: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [newRow, setNewRow] = useState<{ code: string; movementType: string; eerrClassification: string } | null>(null);

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

  const draftOf = (item: Category) => drafts[item.id] || { code: item.code || makeCode(item.movementType), movementType: item.movementType, eerrClassification: item.eerrClassification };
  const setDraft = (id: number, current: { code: string; movementType: string; eerrClassification: string }, patch: Partial<{ code: string; movementType: string; eerrClassification: string }>) => {
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

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[460px] max-w-[calc(100vw_-_72px)] flex-col border-l bg-white shadow-2xl" style={{ borderColor: BORDER }}>
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-neutral !h-8 justify-center !px-2 text-[11px]" onClick={load} disabled={loading}>
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-bold text-white"
            style={{ backgroundColor: '#10B981', border: 'none', borderRadius: 6 }}
            onClick={() => setNewRow({ code: '', movementType: '', eerrClassification: '' })}
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
              <th style={{ padding: 8, width: 58, textAlign: 'left', fontSize: 11 }}>Codigo</th>
              <th style={{ padding: 8, textAlign: 'left', fontSize: 11 }}>Categoria</th>
              <th style={{ padding: 8, width: 96, textAlign: 'left', fontSize: 11 }}>FC</th>
              <th style={{ padding: 8, width: 54, textAlign: 'center', fontSize: 11 }}>Acc.</th>
            </tr>
          </thead>
          <tbody>
            {newRow && (
              <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F0FDF4' }}>
                <td style={{ padding: 6 }}><input type="text" value={newRow.code} placeholder="CO" style={INPUT_STYLE} maxLength={12} onChange={(event) => setNewRow({ ...newRow, code: event.target.value.toUpperCase() })} /></td>
                <td style={{ padding: 6 }}><input autoFocus type="text" value={newRow.movementType} placeholder="Ej. Costos" style={INPUT_STYLE} onChange={(event) => setNewRow({ ...newRow, movementType: event.target.value, code: newRow.code || makeCode(event.target.value) })} /></td>
                <td style={{ padding: 6 }}><input type="text" list="bank-eerr-options" value={newRow.eerrClassification} placeholder="FC" style={INPUT_STYLE} onChange={(event) => setNewRow({ ...newRow, eerrClassification: event.target.value })} /></td>
                <td align="center">
                  <button style={{ ...btnIcon, color: '#10B981' }} title="Guardar" onClick={createRow} disabled={saving === -1}><FiSave /></button>
                  <button style={{ ...btnIcon, color: '#64748B' }} title="Cancelar" onClick={() => setNewRow(null)}><FiX /></button>
                </td>
              </tr>
            )}

            {loading && !items.length ? (
              <tr><td colSpan={4} align="center" style={{ padding: 24, color: '#94A3B8' }}>Cargando categorias...</td></tr>
            ) : items.map((item) => {
              const current = draftOf(item);
              const dirty = current.code !== (item.code || makeCode(item.movementType)) || current.movementType !== item.movementType || current.eerrClassification !== item.eerrClassification;
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: dirty ? '#FFFBEB' : '#fff' }}>
                  <td style={{ padding: 6 }}><input type="text" value={current.code} style={INPUT_STYLE} maxLength={12} onChange={(event) => setDraft(item.id, current, { code: event.target.value.toUpperCase() })} /></td>
                  <td style={{ padding: 6 }}><input type="text" value={current.movementType} style={INPUT_STYLE} onChange={(event) => setDraft(item.id, current, { movementType: event.target.value })} /></td>
                  <td style={{ padding: 6 }}><input type="text" list="bank-eerr-options" value={current.eerrClassification} style={INPUT_STYLE} onChange={(event) => setDraft(item.id, current, { eerrClassification: event.target.value })} /></td>
                  <td align="center">
                    <button title="Guardar cambios" onClick={() => saveRow(item)} disabled={saving === item.id || !dirty} style={{ ...btnIcon, cursor: dirty ? 'pointer' : 'not-allowed', color: dirty ? '#1877F2' : '#CBD5E1' }}><FiSave /></button>
                    <button title="Eliminar" onClick={() => removeRow(item)} disabled={saving === item.id} style={{ ...btnIcon, color: '#DC2626' }}><FiTrash2 /></button>
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
        Los conceptos de esta tabla llenan la lista de TIPO INGRESO/GASTO en el formulario de movimientos y autocompletan su CLASIFICACION FC.
      </p>
    </aside>
  );
}
