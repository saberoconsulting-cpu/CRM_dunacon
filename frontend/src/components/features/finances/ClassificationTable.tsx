'use client';

import { FiEdit3, FiTrash2 } from 'react-icons/fi';
import { Select } from '@/components/ui/Select';

export type ClassificationRow = { key: string; code: string; movementType: string; category?: string; eerrClassification: string };

export default function ClassificationTable({ rows, disabled = false, onChange, onDelete }: { rows: ClassificationRow[]; disabled?: boolean; onChange: (key: string, patch: Partial<ClassificationRow>) => void; onDelete: (key: string) => void }) {
  return <fieldset disabled={disabled} data-project-lock-managed="true"><table className="table-base table-head-plomo" style={{ width: 800, minWidth: 800, tableLayout: 'auto' }}>
    <thead><tr>{['Codigo', 'Tipo', 'Categorias', 'Clasificación', 'Accion'].map(label => <th key={label} className="th-base">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.key}>
      <td className="td-base w-[90px]"><input aria-label="Código" className={`input input-ghost !h-7 text-center font-bold uppercase ${row.code && row.code.length < 2 ? '!border-red-300 !text-red-600' : ''}`} value={row.code} maxLength={3} onChange={e => onChange(row.key, { code: e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase() })} /></td>
      <td className="td-base" style={{ background: row.movementType === 'Ingreso' ? '#EAF7EE' : row.movementType === 'Egreso' ? '#FFF7ED' : 'transparent' }}><Select disabled={disabled} value={row.movementType} onChange={value => onChange(row.key, { movementType: value })} options={[{ value: 'Ingreso', label: 'Ingreso' }, { value: 'Egreso', label: 'Egreso' }]} className="input-ghost !h-7" /></td>
      <td className="td-base"><input aria-label="Categoría" className="input input-ghost !h-7" value={row.category || ''} onChange={e => onChange(row.key, { category: e.target.value })} /></td>
      <td className="td-base" style={{ background: row.eerrClassification === 'Financiamiento' ? '#E0F2FE' : row.eerrClassification === 'Inversión/Construcción' ? '#ECFDF5' : row.eerrClassification === 'Operación (G&A, com, admin)' ? '#FEF3C7' : row.eerrClassification === 'Venta de Lote' ? '#FEE2E2' : 'transparent' }}><input aria-label="Clasificación" className="input input-ghost !h-7" value={row.eerrClassification} onChange={e => onChange(row.key, { eerrClassification: e.target.value })} /></td>
      <td className="td-base text-center"><div className="flex justify-center gap-1"><button type="button" disabled={disabled} className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-700" title="Editar" aria-label={`Editar ${row.category || 'categoría'}`} onClick={e => e.currentTarget.closest('tr')?.querySelector('input')?.focus()}><FiEdit3 size={13} /></button><button type="button" disabled={disabled} className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="Eliminar" aria-label={`Eliminar ${row.category || 'categoría'}`} onClick={() => onDelete(row.key)}><FiTrash2 size={13} /></button></div></td>
    </tr>)}</tbody>
  </table></fieldset>;
}
