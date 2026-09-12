'use client';
import { useEffect, useState } from 'react';
import { Modal, toast, StatusBadge, Field } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { LOT_STATUS_COLOR, LOT_STATUS_LABEL, LotStatus, formatMoney, formatDate } from '@/lib/types';
import { printHtml } from '@/lib/print';
import { FiDownload } from 'react-icons/fi';

type Row = { id: number; lotId: number; fromStatus: string; toStatus: string; createdAt: string; type?: string; amount?: string|number; paidAt?: string }

function formatArea(value: unknown) {
  const n = Number(value || 0);
  if (!n) return '—';
  return `${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m²`;
}

function formatMeters(value: number) {
  return value.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function inferDimensions(lot: any) {
  if (lot?.dimensions) return lot.dimensions;
  const points = Array.isArray(lot?.points) ? lot.points : [];
  const area = Number(lot?.areaM2 || 0);
  if (points.length < 2 || area <= 0) return '—';

  const xs = points.map((point: any) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point: any) => Number(point.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return '—';

  const widthUnits = Math.max(...xs) - Math.min(...xs);
  const heightUnits = Math.max(...ys) - Math.min(...ys);
  if (widthUnits <= 0 || heightUnits <= 0) return '—';

  const ratio = widthUnits / heightUnits;
  const width = Math.sqrt(area * ratio);
  const height = area / width;
  return `${formatMeters(width)}m x ${formatMeters(height)}m`;
}

function detailStatusColor(status: string) {
  if (status === 'disponible') return '#16955B';
  if (status === 'reservado') return '#D99A18';
  if (status === 'adelanto') return '#2F6FB7';
  if (status === 'primera_cuota') return '#7151A6';
  if (status === 'vendido') return '#1877F2';
  return (LOT_STATUS_COLOR as any)[status] || '#64748b';
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function LotDetailModal({ lotId, onClose, onChanged, compact = false }: {
  lotId: number | null; onClose: () => void; onChanged?: () => void; compact?: boolean;
}) {
  const [lot, setLot] = useState<any>(null);
  const [block, setBlock] = useState<any>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [amount, setAmount] = useState(0);
  const [payType, setPayType] = useState('reserva');
  const [working, setWorking] = useState(false);
  const [fin, setFin] = useState<any>({ sale: null, installments: [] });
  const [lotizacion, setLotizacion] = useState({ type: '', salePrice: 0, finalPrice: 0 });
  const [view, setView] = useState<'detalle' | 'vender'>('detalle');
  const canEdit = (() => { try { const m = JSON.parse(localStorage.getItem('crm_user') || '{}'); return m.role === 'admin' || m.role === 'superadmin'; } catch { return false; } })();

  async function load() {
    if (!lotId) return;
    try {
      const d = await api.get<any>(`/lots/${lotId}`);
      setLot(d.lot); setBlock(d.block || null); setHistory(d.history || []); setPayments(d.payments || []);
      setLotizacion({ type: d.lot?.type || '', salePrice: Number(d.lot?.salePrice || 0), finalPrice: Number(d.lot?.finalPrice || 0) });
      const fin = await api.get<any>(`/sales/by-lot/${lotId}`).catch(() => ({ sale: null, installments: [] }));
      setFin(fin);
    }
    catch (e:any){ toast(e.message,'err'); }
  }
  useEffect(() => { setLot(null); setBlock(null); setHistory([]); setPayments([]); setFin({ sale: null, installments: [] } as any); setView('detalle'); if (lotId) load(); }, [lotId]);

  async function saveLotizacion() {
    if (!lot) return;
    setWorking(true);
    try {
      await api.post(`/plan/lot/update/${lot.id}`, {
        type: lotizacion.type || undefined,
        salePrice: lotizacion.salePrice || undefined,
        finalPrice: lotizacion.finalPrice || undefined,
      });
      toast('Lotización actualizada'); await load(); onChanged?.();
    } catch (e: any) { toast(e.message, 'err'); } finally { setWorking(false); }
  }

  async function registerPayment() {
    if (!lot || !amount) return toast('Ingresa monto', 'err');
    setWorking(true);
    try {
      await api.post('/payments', { projectId: lot.projectId, lotId: lot.id, type: payType, amount });
      toast('Pago registrado'); setAmount(0); await load(); onChanged?.(); setView('detalle');
    } catch (e:any){ toast(e.message,'err'); } finally { setWorking(false); }
  }

  function cotizar() {
    if (!lot) return;
    // El módulo "Cotizaciones Lotes" reemplaza a la vista simple vieja: abre el
    // formulario de la calculadora ya con este lote precargado.
    window.location.href = `/projects/${lot.projectId}/quotes?lotId=${lot.id}`;
  }

  function exportLotPdf() {
    if (!lot) return;
    const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
    const rows = [
      ['Num. Lote', lot.code || '—'],
      ['Direccion', block?.address || lot.blockAddress || (block?.name ? `Manzana ${block.name}` : '—')],
      ['Tipo', lot.type || '—'],
      ['Estado', LOT_STATUS_LABEL[lot.status as LotStatus] || lot.status],
      ['Area', formatArea(lot.areaM2)],
      ['Dimensiones', inferDimensions(lot)],
      ['Precio por m2', pricePerM2 ? formatMoney(pricePerM2) : '—'],
      ['Precio de Venta', lot.salePrice ? formatMoney(lot.salePrice) : '—'],
      ['Precio Final', lot.finalPrice ? formatMoney(lot.finalPrice) : '—'],
      ['Cliente', lot.clientName || '—'],
    ];
    const paymentRows = payments.map((p: any) => `
      <tr>
        <td>${escapeHtml(p.type || '—')}</td>
        <td>${escapeHtml(p.paymentMethod || '—')}</td>
        <td class="num">${escapeHtml(formatMoney(p.amount))}</td>
        <td>${escapeHtml(p.status || '—')}</td>
        <td>${escapeHtml(formatDate(p.paidAt || p.createdAt || ''))}</td>
      </tr>
    `).join('');
    const historyRows = history.map((h) => `
      <tr>
        <td>${escapeHtml(LOT_STATUS_LABEL[h.fromStatus as LotStatus] || h.fromStatus || '—')}</td>
        <td>${escapeHtml(LOT_STATUS_LABEL[h.toStatus as LotStatus] || h.toStatus || '—')}</td>
        <td>${escapeHtml(formatDate(h.createdAt))}</td>
      </tr>
    `).join('');
    const scheduleRows = schedule.map((q: any) => `
      <tr>
        <td>Cuota ${escapeHtml(q.installmentNo || '—')}</td>
        <td>${escapeHtml(formatDate(q.dueDate))}</td>
        <td class="num">${escapeHtml(formatMoney(q.amount))}</td>
        <td>${escapeHtml(q.status || '—')}</td>
      </tr>
    `).join('');
    const html = `
      <html>
        <head>
          <title>Ficha lote ${escapeHtml(lot.code)}</title>
          <style>
            body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#171717;background:white}
            .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid #1877F2;padding-bottom:14px;margin-bottom:16px}
            .brand img{height:42px;max-width:180px;object-fit:contain}
            .eyebrow{margin:0 0 5px;color:#1877F2;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
            h1{margin:0;font-size:24px;line-height:1.15;color:#111827}
            h2{font-size:13px;margin:18px 0 8px;color:#1259C4;text-transform:uppercase;letter-spacing:.04em}
            p{margin:4px 0 0;color:#6B7280;font-size:12px}
            .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0 18px}
            .summary div{border:1px solid #E5E7EB;background:#F8FAFC;padding:10px;border-radius:6px}
            .summary span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
            .summary strong{display:block;margin-top:4px;color:#111827;font-size:13px}
            table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px;background:white}
            th{background:#1877F2;color:white;border:1px solid #1877F2;padding:8px 7px;font-size:10px;text-align:left;text-transform:uppercase}
            td{border:1px solid #E5E7EB;padding:8px 7px;font-size:11px;vertical-align:top}
            tbody tr:nth-child(even){background:#F8FAFC}
            .label{background:#D8E8FF;font-weight:700;color:#111827;width:38%}
            .num{text-align:right;white-space:nowrap;font-weight:700;color:#1259C4}
            .status{display:inline-block;border-radius:999px;padding:4px 9px;background:${detailStatusColor(lot.status)}22;color:${detailStatusColor(lot.status)};font-weight:700}
            .watermark{position:fixed;left:50%;top:54%;transform:translate(-50%,-50%) rotate(-28deg);opacity:.06;z-index:-1}
            .watermark img{width:560px;max-width:72vw}
            .footer{margin-top:18px;border-top:1px solid #E5E7EB;padding-top:8px;color:#6B7280;font-size:10px;text-align:right}
            @media print{body{margin:18px}thead{display:table-header-group}.brand,.summary{break-inside:avoid}.watermark{position:fixed}}
          </style>
        </head>
        <body>
          <div class="watermark"><img src="${escapeHtml(logoUrl)}" alt="" /></div>
          <div class="brand">
            <div>
              <p class="eyebrow">Ficha de lote</p>
              <h1>Lote ${escapeHtml(lot.code)}</h1>
              <p>Generado ${new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            <img src="${escapeHtml(logoUrl)}" alt="Dunacon" />
          </div>
          <div class="summary">
            <div><span>Estado</span><strong>${escapeHtml(LOT_STATUS_LABEL[lot.status as LotStatus] || lot.status)}</strong></div>
            <div><span>Area</span><strong>${escapeHtml(formatArea(lot.areaM2))}</strong></div>
            <div><span>Precio final</span><strong>${escapeHtml(lot.finalPrice ? formatMoney(lot.finalPrice) : lot.salePrice ? formatMoney(lot.salePrice) : formatMoney(lot.price))}</strong></div>
          </div>
          <h2>Informacion del lote</h2>
          <table><tbody>
            ${rows.map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td>${label === 'Estado' ? `<span class="status">${escapeHtml(value)}</span>` : escapeHtml(value)}</td></tr>`).join('')}
          </tbody></table>
          <h2>Pagos</h2>
          <table>
            <thead><tr><th>Tipo</th><th>Medio</th><th>Monto</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>${paymentRows || '<tr><td colspan="5">Sin pagos registrados.</td></tr>'}</tbody>
          </table>
          <h2>Financiamiento del lote</h2>
          <div class="summary">
            <div><span>Valor del lote</span><strong>${escapeHtml(formatMoney(unitPrice))}</strong></div>
            <div><span>Total abonado</span><strong>${escapeHtml(formatMoney(amountPaid))}</strong></div>
            <div><span>Saldo por pagar</span><strong>${escapeHtml(formatMoney(remaining))}</strong></div>
            <div><span>Avance</span><strong>${donePct}%</strong></div>
            <div><span>Valor cuota</span><strong>${escapeHtml(formatMoney(aheadPayment))}</strong></div>
            <div><span>Cuotas</span><strong>${schedule.length}</strong></div>
            <div><span>Pagadas</span><strong>${closed}</strong></div>
            <div><span>Pendientes</span><strong>${Math.max(0, schedule.length - closed)}</strong></div>
          </div>
          <table>
            <thead><tr><th>Cuota</th><th>Vencimiento</th><th>Monto</th><th>Estado</th></tr></thead>
            <tbody>${scheduleRows || '<tr><td colspan="4">Sin cronograma registrado.</td></tr>'}</tbody>
          </table>
          <h2>Historial de estados</h2>
          <table>
            <thead><tr><th>Desde</th><th>Hacia</th><th>Fecha</th></tr></thead>
            <tbody>${historyRows || '<tr><td colspan="3">Sin cambios registrados.</td></tr>'}</tbody>
          </table>
          <div class="footer">Dunacon - CRM Inmobiliario</div>
        </body>
      </html>
    `;
    printHtml(html);
  }

  const statusColor = lot ? ((LOT_STATUS_COLOR as any)[lot.status] || '#64748b') : '#64748b';
  const tableStatusColor = lot ? detailStatusColor(lot.status) : '#64748b';
  const pricePerM2 = lot && Number(lot.areaM2) > 0 ? Number(lot.price) / Number(lot.areaM2) : 0;

  const paids = (payments as any[]) || [];
  const amountPaid = paids.filter((p) => p.status === 'pagado').reduce((s: number, p) => s + Number(p.amount || 0), 0);
  const saleFn = fin?.sale;
  const schedule = (fin?.installments || []) as any[];
  const unitPrice = saleFn?.salePrice != null ? Number(saleFn.financingBase ?? saleFn.salePrice) : Number(lot?.price || saleFn?.salePrice || 0);
  const aheadPayment = Number(saleFn?.valorCuota || (schedule[0]?.amount || 0));
  const closed = schedule.filter((x) => x.status === 'pagado').length;
  const firstDue = schedule[0]?.dueDate || null;
  const remaining = Math.max(0, unitPrice - amountPaid);
  const donePct = unitPrice > 0 ? Math.min(100, Math.round((amountPaid / unitPrice) * 100)) : 0;

  if (!lotId) return null;
  return (
    <Modal open={!!lot} onClose={onClose} title={lot ? (compact ? 'Detalle del Lote' : `Detalle del lote ${lot.code}`) : ''} width={compact ? 'max-w-md' : 'max-w-xl'}>
      {lot && (
        <div className="space-y-4">
          {/* Cabecera de estado — se repinta cuando el lote cambia de estado */}
          <div className="hidden rounded-2xl px-4 py-4 text-white shadow-sm" style={{ background: statusColor }}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider opacity-80">Estado actual del lote {lot.code}</div>
                <div className="text-2xl font-bold capitalize -mt-0.5">{LOT_STATUS_LABEL[lot.status as LotStatus] || lot.status}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider opacity-80">{lot.areaM2} m²</div>
                <div className="text-xl font-extrabold">{formatMoney(lot.price)}</div>
              </div>
            </div>
          </div>

          {view === 'detalle' && (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={exportLotPdf}
                  className="grid h-9 w-9 place-items-center rounded-md border bg-white text-[#1877F2] transition-colors hover:bg-[#F3F4F6]"
                  style={{ borderColor: '#E5E7EB' }}
                  aria-label="Exportar ficha PDF"
                  title="Exportar ficha PDF"
                >
                  <FiDownload />
                </button>
              </div>
              <div className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: '#CBD5E1' }}>
                {[
                  { label: 'Núm. Lote', value: lot.code || '—' },
                  { label: 'Dirección', value: block?.address || lot.blockAddress || (block?.name ? `Manzana ${block.name}` : '—') },
                  { label: 'Tipo', value: lot.type || '—' },
                  { label: 'Estado', value: LOT_STATUS_LABEL[lot.status as LotStatus] || lot.status, status: true },
                  { label: 'Area (M²)', value: formatArea(lot.areaM2) },
                  { label: 'Dimensiones', value: inferDimensions(lot) },
                  { label: 'Precio por M²', value: pricePerM2 ? formatMoney(pricePerM2) : '—' },
                  { label: 'Precio de Venta', value: lot.salePrice ? formatMoney(lot.salePrice) : '—' },
                  { label: 'Precio Final', value: lot.finalPrice ? formatMoney(lot.finalPrice) : '—' },
                ].map((row) => (
                  <div key={row.label} className="grid min-h-[38px] grid-cols-[42%_58%] border-b last:border-b-0" style={{ borderColor: '#E5E7EB' }}>
                    <div className="flex items-center border-r px-3 text-[13px] font-bold text-[#111827]" style={{ background: '#D8E8FF', borderColor: '#B8CBE8' }}>
                      {row.label}
                    </div>
                    <div
                      className={`flex items-center px-3 text-[13px] font-semibold ${row.status ? 'text-white' : 'text-[#111827]'}`}
                      style={{ background: row.status ? tableStatusColor : '#FFFFFF' }}
                    >
                      <span className="truncate">{row.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t pt-3">
                <button
                  onClick={cotizar}
                  className="inline-flex h-10 items-center justify-center rounded-sm bg-[#12AEEB] text-sm font-semibold text-white transition-colors hover:bg-[#079BD5]"
                >
                  Cotizar
                </button>
                <button
                  onClick={() => setView('vender')}
                  className="inline-flex h-10 items-center justify-center rounded-sm bg-[#12AEEB] text-sm font-semibold text-white transition-colors hover:bg-[#079BD5]"
                >
                  Vender
                </button>
              </div>
              {/* Ficha: mismos campos que la tabla de Lotización */}
              <div className="hidden rounded-xl border overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
                {[
                  ['Dirección', block?.address || '—'],
                  ['Tipo', lot.type || '—'],
                  ['Área (m²)', `${lot.areaM2} m²`],
                  ['Precio por m²', pricePerM2 ? formatMoney(pricePerM2) : '—'],
                  ['Precio de venta', lot.salePrice ? formatMoney(lot.salePrice) : '—'],
                  ['Precio final', lot.finalPrice ? formatMoney(lot.finalPrice) : '—'],
                  ['Cliente', lot.clientName || '—'],
                ].map(([label, value], i) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2 text-sm" style={{ background: i % 2 ? '#FAFAFB' : '#fff' }}>
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-right">{value}</span>
                  </div>
                ))}
              </div>

              {canEdit && !compact && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold text-sm text-slate-700 mb-2">Editar Lotización</h4>
                  <div className="flex gap-2 items-end flex-wrap">
                    <div className="flex-1 min-w-32">
                      <Field label="Tipo"><input className="input" value={lotizacion.type} onChange={(e) => setLotizacion({ ...lotizacion, type: e.target.value })} placeholder="Ej: Esquina" /></Field>
                    </div>
                    <div className="flex-1 min-w-32">
                      <Field label="Precio venta (S/)"><input type="number" className="input" value={lotizacion.salePrice || ''} onChange={(e) => setLotizacion({ ...lotizacion, salePrice: Number(e.target.value) })} /></Field>
                    </div>
                    <div className="flex-1 min-w-32">
                      <Field label="Precio final (S/)"><input type="number" className="input" value={lotizacion.finalPrice || ''} onChange={(e) => setLotizacion({ ...lotizacion, finalPrice: Number(e.target.value) })} /></Field>
                    </div>
                    <button onClick={saveLotizacion} disabled={working} className="btn-secondary shrink-0">Guardar</button>
                  </div>
                </div>
              )}

              {!compact && (amountPaid > 0 || schedule.length > 0 || saleFn) && (
                <div className="border rounded-2xl p-4" style={{ borderColor: '#e5e7eb' }}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-sm text-slate-800">Financiamiento del lote</h4>
                    <span className="badge" style={{ background: donePct >= 100 ? '#D1FAE5' : '#FEF3C7', color: donePct >= 100 ? '#065F46' : '#92400E' }}>{donePct >= 100 ? 'Saldado ✓' : donePct + '%'}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div className="h-full" style={{ width: donePct + '%', background: statusColor }} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div className="bg-canvas rounded-xl p-3">
                      <div className="label">Valor del lote</div><b>{formatMoney(unitPrice)}</b>
                    </div>
                    <div className="bg-canvas rounded-xl p-3">
                      <div className="label">Total abonado</div><b className="text-emerald-600">{formatMoney(amountPaid)}</b>
                    </div>
                    <div className="bg-canvas rounded-xl p-3">
                      <div className="label">Saldo por pagar</div><b className="text-brand-700">{formatMoney(remaining)}</b>
                    </div>
                  </div>
                  {(schedule.length > 0 || aheadPayment > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="badge bg-slate-100 text-slate-600">Cuota: {formatMoney(aheadPayment)}</span>
                      <span className="badge bg-slate-100 text-slate-600">Cuotas: {schedule.length}</span>
                      <span className="badge bg-emerald-50 text-emerald-700">Pagadas: {closed}</span>
                      <span className="badge bg-amber-50 text-amber-700">Pendientes: {Math.max(0, schedule.length - closed)}</span>
                      {firstDue && <span className="badge bg-slate-100 text-slate-600">Primera cuota: {formatDate(firstDue)}</span>}
                    </div>
                  )}
                  {schedule.length > 0 && (
                    <div className="mt-3 space-y-1 max-h-48 overflow-auto pr-1">
                      {schedule.map((q) => (
                        <div key={q.id ?? q.installmentNo} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                          <span className="text-slate-500">Cuota {q.installmentNo} · vence {formatDate(q.dueDate)}</span>
                          <b className={q.status === 'pagado' ? 'text-emerald-600' : 'text-slate-700'}>{formatMoney(q.amount)}</b>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="hidden border-t pt-4 flex gap-2">
                <button onClick={cotizar} className="btn-outline flex-1">Cotizar</button>
                <button onClick={() => setView('vender')} className="btn-primary flex-1">Vender</button>
              </div>

              {!compact && <div className="border-t pt-4">
                <h4 className="font-semibold text-sm text-slate-700 mb-2">Pagos</h4>
                <PagosTable rows={payments} />
              </div>}
              {!compact && <div className="border-t pt-4">
                <h4 className="font-semibold text-sm text-slate-700 mb-2">Historial de estados</h4>
                <ul className="space-y-1 text-sm">
                  {history.map((h) => (
                    <li key={h.id as any} className="flex items-center gap-2"><StatusBadge status={h.fromStatus||''}/> → <StatusBadge status={h.toStatus}/><span className="text-slate-400 text-xs">{formatDate(h.createdAt)}</span></li>
                  ))}
                  {history.length===0 && <li className="text-slate-400">Sin cambios</li>}
                </ul>
              </div>}
            </>
          )}

          {view === 'vender' && (
            <div>
              <button onClick={() => setView('detalle')} className="text-sm text-slate-500 hover:text-[#1877F2] mb-3 inline-flex items-center gap-1">‹ Volver al detalle</button>
              <h4 className="font-semibold text-sm text-slate-700 mb-2">Registrar pago — Lote {lot.code}</h4>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-32">
                  <Field label="Tipo"><select value={payType} onChange={(e) => setPayType(e.target.value)} className="input">
                    <option value="reserva">Reserva</option><option value="adelanto">Cuota inicial</option>
                    <option value="primera_cuota">Cuota normal</option><option value="cuota">Cuota</option>
                  </select></Field>
                </div>
                <div className="flex-1 min-w-32">
                  <Field label="Monto (S/)"><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" /></Field>
                </div>
                <button onClick={registerPayment} disabled={working} className="btn-primary shrink-0">{working ? '…' : 'Registrar pago'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function PagosTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-auto">
      <table className="table-base">
        <thead><tr>
          <th className="th-base">Tipo</th>
          <th className="th-base">Medio</th>
          <th className="th-base">Comprobante</th>
          <th className="th-base">Monto</th>
          <th className="th-base">Estado</th>
          <th className="th-base">Fecha</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="td-base capitalize">{p.type||''}</td>
              <td className="td-base capitalize">{(p as any).paymentMethod || '—'}</td>
              <td className="td-base">{(p as any).voucherUrl ? <a href={(p as any).voucherUrl} target="_blank" rel="noreferrer" className="text-[#1877F2] hover:underline">Ver comprobante</a> : '—'}</td>
              <td className="td-base">{formatMoney(p.amount)}</td>
              <td className="td-base"><StatusBadge status={(p as any).status||''}/></td>
              <td className="td-base">{formatDate((p as any).paidAt||(p as any).createdAt||'')}</td>
            </tr>
          ))}
          {rows.length===0 && <tr><td className="td-base text-slate-400" colSpan={6}>Sin pagos</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
