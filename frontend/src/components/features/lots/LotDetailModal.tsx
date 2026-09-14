'use client';
import { useEffect, useState } from 'react';
import { toast, StatusBadge, Field } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { LOT_STATUS_COLOR, LOT_STATUS_LABEL, LotStatus, formatMoney, formatDate } from '@/lib/types';
import { printHtml } from '@/lib/print';
import {
  FiArrowRight,
  FiCheckCircle,
  FiDownload,
  FiFileText,
  FiMapPin,
  FiTag,
  FiX,
} from 'react-icons/fi';

type Row = { id: number; lotId: number; fromStatus: string; toStatus: string; createdAt: string; type?: string; amount?: string|number; paidAt?: string }

const EMPTY = '\u2014';
const BLUE = '#1259C4';
const BLUE_DARK = '#0B2F6E';
const BLUE_LIGHT = '#EAF3FF';
const INK = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SOLD_GREEN = '#16A36A';

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

function adjacentLotCode(code: string, offset: number) {
  const match = String(code || '').match(/^(.*?)(\d+)$/);
  if (!match) return offset < 0 ? 'Anterior' : 'Siguiente';
  const [, prefix, raw] = match;
  const next = Number(raw) + offset;
  if (!Number.isFinite(next) || next < 0) return offset < 0 ? 'Anterior' : 'Siguiente';
  return `${prefix}${String(next).padStart(raw.length, '0')}`;
}

function DetailCard({ label, value }: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[42%_58%] border-b last:border-b-0" style={{ borderColor: BORDER }}>
      <div className="px-3 py-2 text-xs font-semibold" style={{ background: '#F8FAFC', color: MUTED }}>{label}</div>
      <div className="min-w-0 px-3 py-2 text-sm font-semibold" style={{ color: INK }}>
        <span className="block truncate">{value}</span>
      </div>
    </div>
  );
}

function RealLotPlan({ lot, block, plan }: {
  lot: any;
  block: any;
  plan: any;
}) {
  const imageW = Number(plan?.imageWidth || 1000);
  const imageH = Number(plan?.imageHeight || 800);
  const lotPoints = Array.isArray(lot?.points) ? lot.points : [];
  const blockPoints = Array.isArray(block?.points) ? block.points : [];
  const lotPath = lotPoints.map((point: any) => `${Number(point.x) || 0},${Number(point.y) || 0}`).join(' ');
  const blockPath = blockPoints.map((point: any) => `${Number(point.x) || 0},${Number(point.y) || 0}`).join(' ');

  return (
    <aside id="lot-plan-preview" className="rounded-md border bg-white p-3" style={{ borderColor: BORDER }}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: INK }}>Ubicacion real en plano</p>
          <p className="text-xs" style={{ color: MUTED }}>Lote {lot.code || EMPTY} resaltado</p>
        </div>
        <span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ background: BLUE_LIGHT, color: BLUE }}>
          Plano real
        </span>
      </div>

      <div className="relative overflow-hidden rounded-md border bg-[#F8FAFC]" style={{ borderColor: BORDER }}>
        <svg viewBox={`0 0 ${imageW} ${imageH}`} className="h-[260px] w-full" role="img" aria-label={`Plano real del lote ${lot.code}`}>
          {plan?.imageUrl ? (
            <image href={plan.imageUrl} x="0" y="0" width={imageW} height={imageH} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <rect width={imageW} height={imageH} fill="#F8FAFC" />
          )}
          {blockPath && <polygon points={blockPath} fill="rgba(18,89,196,0.08)" stroke="rgba(18,89,196,0.45)" strokeWidth="3" />}
          {lotPath && <polygon points={lotPath} fill="rgba(220,38,38,0.28)" stroke="#DC2626" strokeWidth="5" />}
          {lotPoints[0] && (
            <g>
              <rect x={(Number(lotPoints[0].x) || 0) + 8} y={(Number(lotPoints[0].y) || 0) - 34} width="92" height="26" rx="4" fill="#FFFFFF" stroke="#DC2626" strokeWidth="2" />
              <text x={(Number(lotPoints[0].x) || 0) + 54} y={(Number(lotPoints[0].y) || 0) - 16} textAnchor="middle" fontSize="13" fontWeight="700" fill="#991B1B">{lot.code || EMPTY}</text>
            </g>
          )}
        </svg>
        {!plan?.imageUrl && <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">Sin imagen de plano cargada</div>}
      </div>
    </aside>
  );
}

export default function LotDetailModal({ lotId, onClose, onChanged, compact = false }: {
  lotId: number | null; onClose: () => void; onChanged?: () => void; compact?: boolean;
}) {
  const [lot, setLot] = useState<any>(null);
  const [block, setBlock] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
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
      setLot(d.lot); setBlock(d.block || null); setPlan(d.plan || null); setHistory(d.history || []); setPayments(d.payments || []);
      setLotizacion({ type: d.lot?.type || '', salePrice: Number(d.lot?.salePrice || 0), finalPrice: Number(d.lot?.finalPrice || 0) });
      const fin = await api.get<any>(`/sales/by-lot/${lotId}`).catch(() => ({ sale: null, installments: [] }));
      setFin(fin);
    }
    catch (e:any){ toast(e.message,'err'); }
  }
  useEffect(() => { setLot(null); setBlock(null); setPlan(null); setHistory([]); setPayments([]); setFin({ sale: null, installments: [] } as any); setView('detalle'); if (lotId) load(); }, [lotId]);

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
    if (lot.status === 'vendido') {
      toast('No se puede cotizar un lote vendido.', 'err');
      return;
    }
    // El módulo "Cotizaciones Lotes" reemplaza a la vista simple vieja: abre el
    // formulario de la calculadora ya con este lote precargado.
    window.location.href = `/projects/${lot.projectId}/quotes?lotId=${lot.id}`;
  }

  function vender() {
    if (!lot) return;
    if (lot.status === 'vendido') {
      toast('No se puede vender un lote vendido.', 'err');
      return;
    }
    if (lot.status === 'reservado') {
      toast('No se puede vender un lote reservado. Puedes cotizarlo.', 'err');
      return;
    }
    if (lot.status === 'adelanto' || lot.status === 'primera_cuota') {
      toast('Este lote ya tiene pagos registrados; no se puede vender nuevamente.', 'err');
      return;
    }
    // Solo redirigir al apartado de Ventas con el lote precargado.
    // SalesView lee ?lotId= y abre el modal "Registrar venta" ya con este lote.
    window.location.href = `/projects/${lot.projectId}/sales?lotId=${lot.id}`;
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
  if (!lot) return null;

  const address = block?.address || lot.blockAddress || (block?.name ? `Manzana ${block.name}` : EMPTY);
  const lotType = lot.type || EMPTY;
  const statusLabel = LOT_STATUS_LABEL[lot.status as LotStatus] || lot.status || EMPTY;
  const statusBadgeColor = lot.status === 'vendido' ? SOLD_GREEN : tableStatusColor;
  const quoteBlocked = lot.status === 'vendido';
  const sellBlocked = ['vendido', 'reservado', 'adelanto', 'primera_cuota'].includes(lot.status);
  const detailCards = [
    { label: 'Num. de lote', value: lot.code || EMPTY },
    { label: 'Direccion', value: address },
    { label: 'Tipo', value: lotType },
    { label: 'Estado', value: statusLabel },
    { label: 'Area', value: formatArea(lot.areaM2) },
    { label: 'Dimensiones', value: inferDimensions(lot) },
    { label: 'Precio por m2', value: pricePerM2 ? formatMoney(pricePerM2) : EMPTY },
    { label: 'Precio de venta', value: lot.salePrice ? formatMoney(lot.salePrice) : EMPTY },
    { label: 'Precio final', value: lot.finalPrice ? formatMoney(lot.finalPrice) : EMPTY },
  ];

  function focusPlan() {
    document.getElementById('lot-plan-preview')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <section className={`absolute left-1/2 top-1/2 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] ${compact ? 'max-w-3xl' : 'max-w-4xl'} -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)]`}>
        {view === 'detalle' && (
          <>
            <header className="border-b bg-white px-5 py-4 sm:px-6" style={{ borderColor: BORDER }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase" style={{ color: MUTED }}>Detalle del lote</p>
                  <h2 className="mt-1 text-2xl font-bold leading-tight" style={{ color: INK }}>Lote {lot.code || EMPTY}</h2>
                  <p className="mt-1 truncate text-sm" style={{ color: MUTED }}>{address}</p>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <span className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold sm:inline-flex" style={{ background: `${statusBadgeColor}14`, color: statusBadgeColor }}>
                    <FiCheckCircle /> {statusLabel}
                  </span>
                  <button type="button" onClick={exportLotPdf} className="grid h-9 w-9 place-items-center rounded-md border bg-white text-slate-500 transition-colors hover:bg-slate-50" style={{ borderColor: BORDER }} aria-label="Exportar ficha PDF" title="Exportar ficha PDF">
                    <FiDownload />
                  </button>
                  <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border bg-white text-slate-500 transition-colors hover:bg-slate-50" style={{ borderColor: BORDER }} aria-label="Cerrar" title="Cerrar">
                    <FiX />
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-white">
              <div className="border-b px-5 py-4 sm:px-6" style={{ borderColor: BORDER }}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: MUTED }}>
                      <span className="inline-flex items-center gap-1.5"><FiMapPin style={{ color: BLUE }} /> {address}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span className="uppercase">{lotType}</span>
                    </div>
                  </div>
                  <button type="button" onClick={focusPlan} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors hover:bg-[#DBEAFE]" style={{ background: BLUE_LIGHT, color: BLUE }}>
                    <FiMapPin /> Ver en plano <FiArrowRight />
                  </button>
                </div>
              </div>

              <div className="grid gap-4 bg-[#F8FAFC] p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_330px]">
                <main className="min-w-0 space-y-4">
                  <div className="overflow-hidden rounded-md border bg-white" style={{ borderColor: BORDER }}>
                    {detailCards.map((card) => <DetailCard key={card.label} {...card} />)}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={cotizar}
                      className={`group flex min-h-[52px] items-center justify-between gap-4 rounded-md border bg-white px-4 py-3 text-left transition-colors ${quoteBlocked ? 'opacity-60' : 'hover:bg-slate-50'}`}
                      style={{ borderColor: BORDER }}
                      title={quoteBlocked ? 'No se puede cotizar un lote vendido' : 'Cotizar lote'}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-bold" style={{ color: BLUE }}>Cotizar</span>
                          <span className="mt-0.5 block text-xs" style={{ color: MUTED }}>Generar cotizacion</span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={vender}
                      className={`group flex min-h-[52px] items-center justify-between gap-4 rounded-md px-4 py-3 text-left text-white transition-colors ${sellBlocked ? 'opacity-60' : ''}`}
                      style={{ background: sellBlocked ? '#64748B' : BLUE_DARK }}
                      title={sellBlocked ? 'No se puede vender este lote en su estado actual' : 'Vender lote'}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">Vender</span>
                          <span className="mt-0.5 block text-xs text-blue-100">Registrar venta</span>
                        </span>
                      </span>
                      <FiArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>

                  {canEdit && !compact && (
                    <div className="rounded-[16px] border bg-white p-4" style={{ borderColor: BORDER }}>
                      <h4 className="mb-3 text-sm font-bold" style={{ color: INK }}>Editar Lotizacion</h4>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-32 flex-1"><Field label="Tipo"><input className="input" value={lotizacion.type} onChange={(e) => setLotizacion({ ...lotizacion, type: e.target.value })} placeholder="Ej: Esquina" /></Field></div>
                        <div className="min-w-32 flex-1"><Field label="Precio venta (S/)"><input type="number" className="input" value={lotizacion.salePrice || ''} onChange={(e) => setLotizacion({ ...lotizacion, salePrice: Number(e.target.value) })} /></Field></div>
                        <div className="min-w-32 flex-1"><Field label="Precio final (S/)"><input type="number" className="input" value={lotizacion.finalPrice || ''} onChange={(e) => setLotizacion({ ...lotizacion, finalPrice: Number(e.target.value) })} /></Field></div>
                        <button onClick={saveLotizacion} disabled={working} className="btn-secondary shrink-0">Guardar</button>
                      </div>
                    </div>
                  )}

                  {!compact && (amountPaid > 0 || schedule.length > 0 || saleFn) && (
                    <div className="rounded-[16px] border bg-white p-4" style={{ borderColor: BORDER }}>
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-sm font-bold" style={{ color: INK }}>Financiamiento del lote</h4>
                        <span className="badge" style={{ background: donePct >= 100 ? '#D1FAE5' : '#FEF3C7', color: donePct >= 100 ? '#065F46' : '#92400E' }}>{donePct >= 100 ? 'Saldado' : donePct + '%'}</span>
                      </div>
                      <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full" style={{ width: donePct + '%', background: statusColor }} /></div>
                      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                        <div className="rounded-xl bg-[#F8FAFC] p-3"><div className="label">Valor del lote</div><b>{formatMoney(unitPrice)}</b></div>
                        <div className="rounded-xl bg-[#F8FAFC] p-3"><div className="label">Total abonado</div><b className="text-emerald-600">{formatMoney(amountPaid)}</b></div>
                        <div className="rounded-xl bg-[#F8FAFC] p-3"><div className="label">Saldo por pagar</div><b style={{ color: BLUE_DARK }}>{formatMoney(remaining)}</b></div>
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
                        <div className="mt-3 max-h-48 space-y-1 overflow-auto pr-1">
                          {schedule.map((q) => (
                            <div key={q.id ?? q.installmentNo} className="flex items-center justify-between border-b border-slate-50 py-1 text-xs">
                              <span className="text-slate-500">Cuota {q.installmentNo} vence {formatDate(q.dueDate)}</span>
                              <b className={q.status === 'pagado' ? 'text-emerald-600' : 'text-slate-700'}>{formatMoney(q.amount)}</b>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!compact && <div className="rounded-[16px] border bg-white p-4" style={{ borderColor: BORDER }}><h4 className="mb-3 text-sm font-bold" style={{ color: INK }}>Pagos</h4><PagosTable rows={payments} /></div>}
                  {!compact && (
                    <div className="rounded-[16px] border bg-white p-4" style={{ borderColor: BORDER }}>
                      <h4 className="mb-3 text-sm font-bold" style={{ color: INK }}>Historial de estados</h4>
                      <ul className="space-y-1 text-sm">
                        {history.map((h) => <li key={h.id as any} className="flex items-center gap-2"><StatusBadge status={h.fromStatus || ''} /> <FiArrowRight className="text-slate-300" /> <StatusBadge status={h.toStatus} /><span className="text-xs text-slate-400">{formatDate(h.createdAt)}</span></li>)}
                        {history.length === 0 && <li className="text-slate-400">Sin cambios</li>}
                      </ul>
                    </div>
                  )}
                </main>

                <RealLotPlan lot={lot} block={block} plan={plan} />
              </div>
            </div>
          </>
        )}

        {view === 'vender' && (
          <div className="flex-1 overflow-y-auto bg-white p-6">
            <div className="mb-5 flex items-center justify-between gap-3 border-b pb-4" style={{ borderColor: BORDER }}>
              <div>
                <button onClick={() => setView('detalle')} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-[#1877F2]"><FiArrowRight className="rotate-180" /> Volver al detalle</button>
                <h4 className="text-xl font-bold" style={{ color: INK }}>Registrar pago - Lote {lot.code}</h4>
              </div>
              <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-slate-500 hover:bg-slate-50" style={{ borderColor: BORDER }} aria-label="Cerrar"><FiX /></button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-32 flex-1">
                <Field label="Tipo"><select value={payType} onChange={(e) => setPayType(e.target.value)} className="input">
                  <option value="reserva">Reserva</option><option value="adelanto">Cuota inicial</option>
                  <option value="primera_cuota">Cuota normal</option><option value="cuota">Cuota</option>
                </select></Field>
              </div>
              <div className="min-w-32 flex-1"><Field label="Monto (S/)"><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input" /></Field></div>
              <button onClick={registerPayment} disabled={working} className="btn-primary shrink-0">{working ? '...' : 'Registrar pago'}</button>
            </div>
          </div>
        )}
      </section>
    </div>
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
