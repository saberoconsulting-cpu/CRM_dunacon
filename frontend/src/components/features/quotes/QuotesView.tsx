'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FiDownload, FiEye, FiFileText, FiCreditCard, FiDollarSign, FiTrendingUp, FiCheckCircle } from 'react-icons/fi';
import { Toaster, toast, Field, EmptyState, Modal } from '@/components/ui/ui';
import { PaginationBar } from '@/components/ui/PaginationBar';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/types';
import { buildQuery, normalizePaginated } from '@/lib/pagination';
import { printHtml } from '@/lib/print';
import { useDisplayCurrency } from '@/lib/currency';

type Q = {
  id: number; projectId: number; lotId: number; lotCode?: string | null; clientName: string;
  finalPriceUsd: number; cuotaInicialUsd: number; totalCuotas: number;
  paymentMethod: string; exchangeRate: number; createdAt: string;
  status: string; areaM2: number;
};

type ScheduleRow = {
  month: number; saldoInicial: number; interes: number; amortizacionCapital: number;
  amortizacionExtraordinaria: number; cuota: number; saldoFinal: number;
};

const fmtUsd = (n: number) => 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPen = (n: number) => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAY_LABEL: Record<string, string> = { contado: 'Contado', credito: 'Credito' };

function LotInfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2" style={{ borderColor: '#E5E7EB' }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: '#111827' }} title={value}>{value}</p>
    </div>
  );
}


function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pointsToAttr(points: any[]) {
  return (Array.isArray(points) ? points : [])
    .map((point) => `${Number(point.x || 0)},${Number(point.y || 0)}`)
    .join(' ');
}

function centroid(points: any[]) {
  const pts = Array.isArray(points) ? points : [];
  if (!pts.length) return { x: 0, y: 0 };
  return pts.reduce((acc, point) => ({ x: acc.x + Number(point.x || 0) / pts.length, y: acc.y + Number(point.y || 0) / pts.length }), { x: 0, y: 0 });
}

function absoluteAssetUrl(url?: string | null) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window !== 'undefined') return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
  return url;
}

function planZoomBox(points: any[], imageW: number, imageH: number) {
  const xs = points.map((p: any) => Number(p.x) || 0);
  const ys = points.map((p: any) => Number(p.y) || 0);
  if (!xs.length) return { x: 0, y: 0, w: imageW, h: imageH };

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);

  const pad = Math.max(w, h) * 0.55;
  let vw = w + pad * 2;
  let vh = h + pad * 2;

  const target = 4 / 3;
  if (vw / vh > target) vh = vw / target;
  else vw = vh * target;

  vw = Math.min(vw, imageW);
  vh = Math.min(vh, imageH);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: Math.max(0, Math.min(cx - vw / 2, imageW - vw)),
    y: Math.max(0, Math.min(cy - vh / 2, imageH - vh)),
    w: vw,
    h: vh,
  };
}

function buildPlanHtml(data: any) {
  const { quote, lot } = data;
  const planData = data?.planData || {};
  const plan = planData?.plan;
  const lots = Array.isArray(planData?.lots) ? planData.lots : [];
  const selected = lots.find((item: any) => Number(item.id) === Number(quote?.lotId)) || lot;
  const selectedPoints = Array.isArray(selected?.points) ? selected.points : [];
  const imageUrl = absoluteAssetUrl(plan?.imageUrl);
  if (!imageUrl || !selectedPoints.length) return '';

  const SVG_W = 1000;
  const SVG_H = 800;
  const imageW = Number(plan?.imageWidth || 1000);
  const imageH = Number(plan?.imageHeight || 800);
  const scale = Math.min(SVG_W / imageW, SVG_H / imageH);
  const imgW = imageW * scale;
  const imgH = imageH * scale;
  const imgX = (SVG_W - imgW) / 2;
  const imgY = (SVG_H - imgH) / 2;
  const selectedCenter = centroid(selectedPoints);
  const otherLots = lots
    .filter((item: any) => Number(item.id) !== Number(quote?.lotId) && Array.isArray(item.points) && item.points.length)
    .map((item: any) => `<polygon points="${escapeHtml(pointsToAttr(item.points))}" class="lot-muted" />`)
    .join('');

  const zoom = planZoomBox(selectedPoints, imageW, imageH);
  const zoomStretch = zoom.w * 0.003;
  const lotStroke = zoom.w * 0.005;
  const labelW = zoom.w * 0.11;
  const labelH = zoom.w * 0.031;
  const labelX = (Number(selectedPoints[0]?.x) || 0) + zoom.w * 0.012;
  const labelY = (Number(selectedPoints[0]?.y) || 0) - labelH - zoom.w * 0.012;
  const lotLabel = escapeHtml(selected?.code || lot?.code || String(quote?.lotId || ''));

  return `
    <h2>Ubicacion en plano</h2>
    <div class="plan-card">
      <div class="plan-head">
        <div><strong>Plano del proyecto</strong><span>Lote cotizado resaltado y ampliado</span></div>
        <b>Lote ${lotLabel}</b>
      </div>
      <div class="plan-split">
        <div class="plan-full">
          <svg class="plan-svg" viewBox="0 0 ${SVG_W} ${SVG_H}" role="img" aria-label="Plano completo del proyecto">
            <rect x="0" y="0" width="${SVG_W}" height="${SVG_H}" fill="#F8FAFC" />
            <image href="${escapeHtml(imageUrl)}" x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid meet" />
            ${otherLots}
            <polygon points="${escapeHtml(pointsToAttr(selectedPoints))}" class="lot-selected" />
          </svg>
          <p class="plan-note">Proyecto completo</p>
        </div>
        <div class="plan-zoom">
          <svg viewBox="${zoom.x} ${zoom.y} ${zoom.w} ${zoom.h}" role="img" aria-label="Zoom al lote cotizado">
            <rect x="0" y="0" width="${imageW}" height="${imageH}" fill="#F8FAFC" />
            <image href="${escapeHtml(imageUrl)}" x="0" y="0" width="${imageW}" height="${imageH}" preserveAspectRatio="xMidYMid meet" />
            <polygon points="${escapeHtml(pointsToAttr(selectedPoints))}" fill="rgba(220,38,38,0.28)" stroke="#DC2626" stroke-width="${lotStroke}" />
            <g>
              <rect x="${labelX}" y="${labelY}" width="${labelW}" height="${labelH}" rx="${labelH * 0.18}" fill="#FFFFFF" stroke="#DC2626" stroke-width="${zoomStretch}" />
              <text x="${labelX + labelW / 2}" y="${labelY + labelH * 0.68}" text-anchor="middle" font-size="${zoom.w * 0.021}" font-weight="700" fill="#991B1B">${lotLabel}</text>
            </g>
          </svg>
          <p class="plan-note">Zoom al lote ${lotLabel}</p>
        </div>
      </div>
    </div>
  `;
}

function buildQuoteHtml(data: any, plan: any, docType: 'cotizacion' | 'financiamiento') {
  const { quote, lot, block, project } = data;
  const adminLogoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
  const projectLogoUrl = project?.logoImageUrl || '';
  const rate = Number(quote.exchangeRate || 0);
  const toPen = (usd: number) => usd * rate;
  const generatedAt = new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
  const saldo = Math.max(0, Number(quote.finalPriceUsd || 0) - Number(quote.cuotaInicialUsd || 0));
  const start = new Date(quote.createdAt || Date.now());
  const dueDate = (m: number) => new Date(start.getFullYear(), start.getMonth() + m, start.getDate()).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rows: ScheduleRow[] = Array.isArray(plan?.rows) ? plan.rows : [];
  const initialPlan = plan?.initialPlan || null;
  const scheduleRows = rows.map((r) => `
    <tr><td>${r.month}</td><td>${escapeHtml(dueDate(r.month))}</td><td class="num">${escapeHtml(fmtUsd(r.saldoInicial))}</td><td class="num">${escapeHtml(fmtUsd(r.amortizacionCapital))}</td><td class="num">${escapeHtml(fmtUsd(r.amortizacionExtraordinaria))}</td><td class="num">${escapeHtml(fmtUsd(r.interes))}</td><td class="num strong">${escapeHtml(fmtUsd(r.cuota))}</td><td class="num">${escapeHtml(fmtUsd(r.saldoFinal))}</td></tr>
  `).join('');
  const summaryRows: [string, number][] = [
    ['Precio del lote', Number(quote.lotPriceUsd || 0)],
    ['Bono descuento', -Number(quote.bonoDescuentoUsd || 0)],
    ['Bono especial', -Number(quote.bonoEspecialUsd || 0)],
    ['Precio final', Number(quote.finalPriceUsd || 0)],
  ];
  if (quote.paymentMethod === 'credito') {
    summaryRows.push(['Cuota inicial', -Number(quote.cuotaInicialUsd || 0)]);
    summaryRows.push(['Saldo a financiar', saldo]);
  }
  const summaryHtml = summaryRows.map(([label, usd]) => `
    <tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(fmtUsd(usd))}</td><td class="num">${escapeHtml(fmtPen(toPen(usd)))}</td></tr>
  `).join('');
  const quoteDate = start.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const summaryAside = `
    <div class="summary-aside">
      <div><span>Fecha</span><strong>${escapeHtml(quoteDate)}</strong></div>
      <div><span>Tipo de cambio</span><strong>S/ ${rate.toFixed(4)}</strong></div>
    </div>
  `;
  const detailRows = [
    ['Cliente', quote.clientName],
    ['Correo', quote.clientEmail || '-'],
    ['Telefono', quote.clientPhone || '-'],
    ['Proyecto', project?.name || '-'],
    ['Lote', lot?.code || '-'],
    ['Direccion', block?.address || lot?.blockAddress || '-'],
    ['Area', `${Number(lot?.areaM2 || 0).toLocaleString('es-PE')} m2`],
    ['Precio US$/m2', fmtUsd(Number(quote.pricePerM2Usd || 0))],
    ['Forma de pago', PAY_LABEL[quote.paymentMethod] || quote.paymentMethod],
    ['Tipo de cambio', `S/ ${Number(quote.exchangeRate || 0).toFixed(4)}`],
  ].map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('');
  const isFinancing = docType === 'financiamiento';
  const title = isFinancing ? 'Cronograma de financiamiento' : 'Cotizacion de lote';
  const subtitle = `${project?.name || 'Proyecto'} - Lote ${lot?.code || quote.lotId}`;
  const planHtml = buildPlanHtml(data);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)} Q${quote.id}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#171717;background:white}
          .watermark{position:fixed;left:50%;top:54%;transform:translate(-50%,-50%) rotate(-28deg);opacity:.055;z-index:-1}
          .watermark img{width:560px;max-width:72vw}
          .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid #1877F2;padding-bottom:14px;margin-bottom:16px}
          .logos{display:flex;align-items:center;gap:12px}.logos img{height:42px;max-width:150px;object-fit:contain}
          .eyebrow{margin:0 0 5px;color:#1877F2;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
          h1{margin:0;font-size:24px;line-height:1.15;color:#111827} h2{font-size:13px;margin:18px 0 8px;color:#1259C4;text-transform:uppercase;letter-spacing:.04em}
          p{margin:4px 0 0;color:#6B7280;font-size:12px}
          .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin:14px 0 18px}
          .summary div{border:1px solid #E5E7EB;background:#F8FAFC;padding:9px 10px;border-radius:6px}
          .summary span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
          .summary strong{display:block;margin-top:4px;color:#111827;font-size:12px}
          .summary-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin:14px 0 18px}
          .summary-row div{border:1px solid #E5E7EB;background:#F8FAFC;padding:8px 7px;border-radius:6px;min-width:0}
          .summary-row span{display:block;color:#6B7280;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.2}
          .summary-row strong{display:block;margin-top:3px;color:#111827;font-size:11px;white-space:nowrap}
          .section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:nowrap}
          .section-head h2{margin-bottom:0}
          .summary-aside{display:flex;gap:8px;margin-bottom:10px}
          .summary-aside div{border:1px solid #E5E7EB;background:#F8FAFC;padding:5px 10px;border-radius:6px;text-align:right}
          .summary-aside span{display:block;color:#6B7280;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
          .summary-aside strong{display:block;margin-top:2px;color:#1259C4;font-size:11px;font-weight:700;white-space:nowrap}
          table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px;background:white}
          th{background:#1877F2;color:white;border:1px solid #1877F2;padding:8px 7px;font-size:10px;text-align:left;text-transform:uppercase}
          td{border:1px solid #E5E7EB;padding:8px 7px;font-size:11px;vertical-align:top}
          tbody tr:nth-child(even){background:#F8FAFC}.label{background:#D8E8FF;font-weight:700;color:#111827;width:34%}
          .num{text-align:right;white-space:nowrap}.strong{font-weight:700;color:#1259C4}.footer{margin-top:18px;border-top:1px solid #E5E7EB;padding-top:8px;color:#6B7280;font-size:10px;text-align:right}
          .plan-card{border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;margin:8px 0 16px;background:#F8FAFC;break-inside:avoid;box-shadow:0 8px 24px rgba(15,23,42,.06)}
          .plan-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #E5E7EB;background:white}
          .plan-head strong{display:block;font-size:12px;color:#111827}.plan-head span{display:block;margin-top:2px;font-size:10px;color:#6B7280}.plan-head b{border-radius:999px;background:#EAF3FF;color:#1259C4;padding:5px 10px;font-size:11px}
          .plan-svg{display:block;width:100%;height:auto;background:#EEF2F7;border-radius:10px}
          .plan-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px}
          .plan-full,.plan-zoom{min-width:0;display:flex;flex-direction:column;gap:6px}
          .plan-full .plan-svg,.plan-zoom svg{height:230px;border-radius:10px;overflow:hidden;background:#EEF2F7}
          .plan-zoom svg{display:block;width:100%}
          .plan-note{margin:0;font-size:9px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.06em;color:#6B7280}
          @media (max-width:640px){.plan-split{grid-template-columns:minmax(0,1fr)}.plan-full .plan-svg,.plan-zoom svg{height:190px}}
          .lot-muted{fill:rgba(148,163,184,.20);stroke:#94A3B8;stroke-width:1.2}
          .lot-selected{fill:rgba(24,119,242,.74);stroke:#063B87;stroke-width:4}
          .lot-pulse{fill:rgba(255,255,255,.92);stroke:#1877F2;stroke-width:3}
          .lot-code{font-size:18px;font-weight:800;text-anchor:middle;fill:#063B87}
          .lot-area{font-size:12px;font-weight:700;text-anchor:middle;fill:#1259C4}
          @media (max-width:640px){
            body{margin:12px}
            .brand{flex-direction:column;align-items:flex-start;gap:10px}
            .logos img{height:32px;max-width:120px}
            h1{font-size:17px}
            h2{font-size:11px;margin:14px 0 6px}
            p{font-size:11px}
            .summary{grid-template-columns:repeat(2,minmax(0,1fr))}
            .summary-row{grid-template-columns:repeat(2,minmax(0,1fr))}
            .section-head{flex-direction:column;align-items:flex-start;gap:6px}
            .summary-aside{width:100%}
            .summary-aside div{flex:1;text-align:left}
            table{table-layout:auto}
            th,td{padding:5px 4px;font-size:9px}
            .plan-split{grid-template-columns:minmax(0,1fr)}
            .plan-full .plan-svg,.plan-zoom svg{height:170px}
            .watermark img{width:300px}
          }
          @media print{body{margin:18px}.brand,.summary,.summary-row,.summary-aside,.plan-card{break-inside:avoid}thead{display:table-header-group}.watermark{position:fixed}
            .plan-split{display:grid !important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;gap:12px !important}
            .plan-full .plan-svg,.plan-zoom svg{height:200px !important}
            .summary-row{display:grid !important;grid-template-columns:repeat(6,minmax(0,1fr)) !important}
            .section-head{display:flex !important;flex-wrap:nowrap !important}
          }
        </style>
      </head>
      <body>
        <div class="watermark"><img src="${escapeHtml(adminLogoUrl)}" alt="" /></div>
        <div class="brand">
          <div><p class="eyebrow">${escapeHtml(title)}</p><h1>Q${quote.id} - ${escapeHtml(subtitle)}</h1><p>Generado ${escapeHtml(generatedAt)}</p></div>
          <div class="logos">${projectLogoUrl ? `<img src="${escapeHtml(projectLogoUrl)}" alt="Proyecto" />` : ''}<img src="${escapeHtml(adminLogoUrl)}" alt="Dunacon" /></div>
        </div>
        <div class="summary">
          <div><span>Precio final</span><strong>${escapeHtml(fmtUsd(Number(quote.finalPriceUsd || 0)))}</strong></div>
          <div><span>Cuota inicial</span><strong>${quote.paymentMethod === 'credito' ? escapeHtml(fmtUsd(Number(quote.cuotaInicialUsd || 0))) : 'Contado'}</strong></div>
          <div><span>Saldo</span><strong>${escapeHtml(fmtUsd(saldo))}</strong></div>
          <div><span>Cuotas</span><strong>${Number(quote.totalCuotas || 0)}</strong></div>
        </div>
        <h2>Datos de la cotizacion</h2>
        <table><tbody>${detailRows}</tbody></table>
        <div class="section-head">
          <h2>Resumen comercial</h2>
          ${summaryAside}
        </div>
        <table><thead><tr><th>Concepto</th><th>US$</th><th>S/</th></tr></thead><tbody>${summaryHtml}</tbody></table>
        ${planHtml}
        ${quote.paymentMethod === 'credito' ? `
          <h2>Financiamiento</h2>
          <div class="summary-row">
            <div><span>Saldo a financiar</span><strong>${escapeHtml(fmtUsd(saldo))}</strong></div>
            <div><span>TEA</span><strong>${quote.interestType === 'tea' ? `${Number(quote.tea || 0)}%` : 'Sin intereses'}</strong></div>
            <div><span>Plazo</span><strong>${Number(quote.totalCuotas || 0)} meses</strong></div>
            <div><span>Valor de la cuota</span><strong>${escapeHtml(fmtUsd(Number(plan?.graceCuota || 0)))}</strong></div>
            <div><span>Valor cuota con intereses</span><strong>${escapeHtml(fmtUsd(Number(quote.valorCuotaUsd || 0)))}</strong></div>
            <div><span>Tipo cambio</span><strong>S/ ${Number(quote.exchangeRate || 0).toFixed(4)}</strong></div>
          </div>
          ${plan?.graceMonths > 0 ? `
            <h2>Periodo sin intereses</h2>
            <table><tbody>
              <tr><td class="label">Meses sin interes</td><td class="num">${plan.graceMonths}</td></tr>
              <tr><td class="label">Cuota durante la gracia</td><td class="num">${escapeHtml(fmtUsd(plan.graceCuota || 0))}</td></tr>
              <tr><td class="label">Meses con interes</td><td class="num">${plan.interestMonths}</td></tr>
              <tr><td class="label">Cuota con interes</td><td class="num">${escapeHtml(fmtUsd(plan.interestCuota || 0))}</td></tr>
              <tr><td class="label">Saldo al terminar la gracia</td><td class="num">${escapeHtml(fmtUsd(plan.saldoAlFinGracia || 0))}</td></tr>
              <tr><td class="label">Total de intereses</td><td class="num">${escapeHtml(fmtUsd(plan.totalInteres || 0))}</td></tr>
            </tbody></table>
          ` : ''}
          ${initialPlan ? `
            <h2>Cuota inicial (sin intereses)</h2>
            <table><tbody>
              <tr><td class="label">Monto de la cuota inicial</td><td class="num">${escapeHtml(fmtUsd(initialPlan.cuotaInicialTotal))}</td></tr>
              <tr><td class="label">Forma de pago</td><td class="num">${initialPlan.modo === 'partes' ? `${initialPlan.partes} partes de ${escapeHtml(fmtUsd(initialPlan.montoPorParte))}` : 'Pago unico de contado'}</td></tr>
            </tbody></table>
          ` : ''}
          ${isFinancing ? `<table><thead><tr><th>Mes</th><th>Fecha</th><th>Saldo inicial</th><th>Amort. capital</th><th>Amort. extra</th><th>Interes</th><th>Cuota</th><th>Saldo final</th></tr></thead><tbody>${scheduleRows || '<tr><td colspan="8">Sin cronograma registrado.</td></tr>'}</tbody></table>` : ''}
        ` : ''}
        <div class="footer">Dunacon - CRM Inmobiliario</div>
      </body>
    </html>
  `;
}

function QuoteDocumentModal({ doc, onClose }: { doc: { id: number; type: 'cotizacion' | 'financiamiento' }; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!doc) return;
    setData(null); setSchedule(null); setError('');
    Promise.all([
      api.get<any>(`/quotes/${doc.id}`),
      doc.type === 'financiamiento' ? api.get<any>(`/quotes/${doc.id}/schedule`) : Promise.resolve(null),
    ]).then(async ([quoteData, rows]) => {
      try {
        const planData = quoteData?.quote?.projectId
          ? await api.get<any>(`/plan/project/${quoteData.quote.projectId}`).catch(() => null)
          : null;
        setData({ ...quoteData, planData });
        setSchedule(rows);
      } catch (e: any) {
        setError(e.message || 'Error al cargar los datos');
      }
    }).catch((e: any) => setError(e.message || 'No se pudo cargar el documento'));
  }, [doc]);

  const html = data ? buildQuoteHtml(data, schedule, doc.type) : '';

  return (
    <Modal open={true} onClose={onClose} title={doc.type === 'financiamiento' ? 'Financiamiento' : 'Cotizacion'} width="max-w-5xl">
      <div className="space-y-3">
        <div className="flex justify-end">
          <button className="btn-primary !h-8 text-xs" disabled={!data} onClick={() => html && printHtml(html)}>
            <FiDownload /> Descargar PDF
          </button>
        </div>
        {error ? (
          <div className="rounded-lg border p-6 text-center text-sm text-slate-400" style={{ borderColor: '#E5E7EB' }}>{error}</div>
        ) : !data ? (
          <div className="rounded-lg border p-6 text-center text-sm text-slate-400" style={{ borderColor: '#E5E7EB' }}>Cargando documento...</div>
        ) : (
          <div className="overflow-auto rounded-lg border bg-white p-2 sm:p-3" style={{ borderColor: '#E5E7EB', maxHeight: '70vh' }}>
            <iframe title="Vista previa del documento" srcDoc={html} className="h-[70vh] min-h-[420px] w-full min-w-[320px] rounded-md bg-white" />
          </div>
        )}
      </div>
    </Modal>
  );
}

// Tarjeta KPI compacta, con el mismo lenguaje visual del proyecto
// (etiqueta pequena + icono de acento + valor + helper).
function QuoteKpi({ label, value, helper, icon, accent }: { label: string; value: string; helper: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2.5 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase" style={{ color: '#6B7280' }}>{label}</p>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs" style={{ background: `${accent}12`, color: accent }}>{icon}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-bold tabular-nums leading-tight sm:text-base" style={{ color: '#111827' }}>{value}</p>
      <p className="mt-0.5 truncate text-[11px]" style={{ color: '#6B7280' }}>{helper}</p>
    </div>
  );
}

export default function QuotesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<{ id: number; type: 'cotizacion' | 'financiamiento' } | null>(null);
  // Paginación server-side + filtros (buenas prácticas: page/limit en URL del API,
  // reset a página 1 cuando cambia un filtro, debounce en búsqueda).
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stats, setStats] = useState<{
    total: number; credito: number; contado: number;
    montoTotal: number; cuotaInicialTotal: number; cuotaContadoTotal: number;
  } | null>(null);
  const [fPayment, setFPayment] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<'ASC' | 'DESC'>('DESC');

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [lotId, setLotId] = useState(0);
  const [pricePerM2Usd, setPricePerM2Usd] = useState(0);
  const [lotPriceUsd, setLotPriceUsd] = useState(0);
  const [bonoDescuento, setBonoDescuento] = useState(0);
  const [bonoEspecial, setBonoEspecial] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(3.75);
  const [paymentMethod, setPaymentMethod] = useState<'contado' | 'credito'>('credito');
  const [cuotaInicialUsd, setCuotaInicialUsd] = useState(0);
  const [totalCuotas, setTotalCuotas] = useState(60);
  const [initialPaymentMode, setInitialPaymentMode] = useState<'contado' | 'partes'>('contado');
  const [initialParts, setInitialParts] = useState(3);
  const [graceMonths, setGraceMonths] = useState(0);
  const [applyInterest, setApplyInterest] = useState(false);
  const [streetId, setStreetId] = useState(0);
  const [interestType, setInterestType] = useState<'sin_intereses' | 'tea'>('sin_intereses');
  const [tea, setTea] = useState(10);
  const { currency, setCurrency, exchangeRate: displayExchangeRate, setExchangeRate: setDisplayExchangeRate, format: formatDisplay } = useDisplayCurrency();

  const formatQuoteAmount = (amountUsd: number | null | undefined) => formatDisplay(Number(amountUsd || 0) * (currency === 'PEN' ? displayExchangeRate : 1));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQuery({
        projectId: lockedProjectId,
        search: debouncedSearch || undefined,
        paymentMethod: fPayment || undefined,
        sort, order, page, limit,
      });
      const data = await api.get<unknown>(`/quotes${qs ? `?${qs}` : ''}`);
      const norm = normalizePaginated<Q>(data, page, limit);
      setRows(norm.items);
      setMeta({ total: norm.total, totalPages: norm.totalPages });
      // Si la página actual quedó fuera de rango (ej. se eliminaron registros), volver a la última válida.
      if (page > norm.totalPages && norm.totalPages >= 1) setPage(norm.totalPages);
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [lockedProjectId, debouncedSearch, fPayment, sort, order, page, limit]);

  useEffect(() => { load(); }, [load]);
  // Cargar resumen de estadísticas (totales, monto, cuotas).
  useEffect(() => {
    api.get<any>('/quotes/summary' + (lockedProjectId ? `?projectId=${lockedProjectId}` : ''))
      .then(setStats)
      .catch(() => { });
  }, [lockedProjectId, fPayment]);
  // Debounce de 400ms para no disparar un request por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); }, 400);
    return () => clearTimeout(t);
  }, [search]);
  // Reset a página 1 cuando cambia proyecto, búsqueda o filtros.
  useEffect(() => { setPage(1); }, [lockedProjectId, debouncedSearch, fPayment, sort, order]);
  useEffect(() => {
    api.get<any[]>('/lots?limit=500').then((d) => setLots(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => { });
  }, []);
  useEffect(() => {
    const pre = searchParams?.get('lotId');
    if (pre) { selectLot(Number(pre)); setOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, lots.length]);

  const availableLots = lockedProjectId ? lots.filter((l: any) => Number(l.projectId) === Number(lockedProjectId)) : lots;
  const streetOptions = (() => {
    const map = new Map<number, { id: number; name: string; address: string }>();
    for (const lot of availableLots as any[]) {
      const id = Number(lot.streetId ?? lot.blockId ?? 0);
      if (!id) continue;
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: lot.streetName || lot.blockName || `Calle ${id}`,
          address: lot.streetAddress || lot.blockAddress || '',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  })();
  const lotsOfStreet = streetId ? availableLots.filter((l: any) => Number(l.streetId ?? l.blockId ?? 0) === streetId) : availableLots;
  const selectedLot = lots.find((l: any) => l.id === lotId);

  function selectLot(id: number) {
    setLotId(id);
    const lot = lots.find((l: any) => l.id === id);
    if (lot) {
      const lotStreetId = Number((lot as any).streetId ?? (lot as any).blockId ?? 0);
      if (lotStreetId) setStreetId(lotStreetId);
      const perM2 = Number(lot.areaM2) > 0 ? Number(lot.salePrice || lot.price || 0) / Number(lot.areaM2) / exchangeRate : 0;
      setPricePerM2Usd(Number(perM2.toFixed(2)));
      setLotPriceUsd(Number((perM2 * Number(lot.areaM2)).toFixed(2)));
    }
  }

  function onPricePerM2Change(v: number) {
    setPricePerM2Usd(v);
    if (selectedLot) setLotPriceUsd(Number((v * Number(selectedLot.areaM2)).toFixed(2)));
  }

  const finalPrice = Math.max(0, lotPriceUsd - bonoDescuento - bonoEspecial);
  const saldoAFinanciar = paymentMethod === 'credito' ? Math.max(0, finalPrice - cuotaInicialUsd) : 0;

  function resetForm() {
    setClientName(''); setClientEmail(''); setClientPhone('');
    setLotId(0); setStreetId(0); setPricePerM2Usd(0); setLotPriceUsd(0); setBonoDescuento(0); setBonoEspecial(0);
    setPaymentMethod('credito'); setCuotaInicialUsd(0); setInitialPaymentMode('contado'); setInitialParts(3); setTotalCuotas(60); setGraceMonths(0); setApplyInterest(false); setTea(10);
  }

  async function guardar() {
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!clientName.trim()) return toast('Ingresa el nombre del cliente', 'err');
    if (!clientEmail.trim()) return toast('Ingresa el correo electronico del cliente', 'err');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) return toast('Ingresa un correo valido (debe incluir @ y dominio)', 'err');
    if (clientPhone.length !== 9) return toast('El telefono debe tener exactamente 9 digitos', 'err');
    if (!lotPriceUsd) return toast('Ingresa el precio del lote', 'err');
    try {
      await api.post('/quotes', {
        projectId: lockedProjectId || selectedLot?.projectId || 1,
        lotId, clientName, clientEmail, clientPhone,
        pricePerM2Usd, lotPriceUsd, bonoDescuentoUsd: bonoDescuento || undefined, bonoEspecialUsd: bonoEspecial || undefined,
        paymentMethod,
        cuotaInicialUsd: paymentMethod === 'credito' ? cuotaInicialUsd || undefined : undefined,
        totalCuotas: paymentMethod === 'credito' ? totalCuotas || undefined : undefined,
        graceMonths: paymentMethod === 'credito' && applyInterest ? graceMonths || undefined : undefined,
        interestType: paymentMethod === 'credito' ? (applyInterest ? 'tea' : 'sin_intereses') : undefined,
        tea: paymentMethod === 'credito' && applyInterest ? tea : undefined,
        initialPaymentMode: paymentMethod === 'credito' ? initialPaymentMode : undefined,
        initialParts: paymentMethod === 'credito' && initialPaymentMode === 'partes' ? initialParts || undefined : undefined,
        exchangeRate,
      });
      toast('Cotizacion generada'); setOpen(false); resetForm(); setPage(1); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  function toggleSort(field: string) {
    if (sort === field) {
      setOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSort(field);
      setOrder(field === 'clientName' ? 'ASC' : 'DESC');
    }
  }

  const sortArrow = (field: string) => (sort === field ? (order === 'ASC' ? ' ▲' : ' ▼') : '');

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <div className="flex justify-end">
          <CurrencyToggle
            currency={currency}
            setCurrency={setCurrency}
            exchangeRate={displayExchangeRate}
            setExchangeRate={setDisplayExchangeRate}
          />
        </div>
        {/* Panel de resumen de estadisticas (tarjetas compactas) */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <QuoteKpi
            label="Nro. Cotizaciones"
            value={String(stats?.total ?? 0)}
            helper="Total registradas"
            icon={<FiFileText />}
            accent="#0B2F6E"
          />
          <QuoteKpi
            label="Cotizado al Crédito"
            value={String(stats?.credito ?? 0)}
            helper="Financiamiento"
            icon={<FiCreditCard />}
            accent="#1877F2"
          />
          <QuoteKpi
            label="Cotizado al Contado"
            value={String(stats?.contado ?? 0)}
            helper="Pago directo"
            icon={<FiCheckCircle />}
            accent="#16A36A"
          />
          <QuoteKpi
            label={`Monto Cotizado ${currency === 'PEN' ? 'S/' : 'US$'}`}
            value={formatQuoteAmount(stats?.montoTotal)}
            helper="Suma de cotizaciones"
            icon={<FiDollarSign />}
            accent="#0B2F6E"
          />
          <QuoteKpi
            label={`Cuota Inicial ${currency === 'PEN' ? 'S/' : 'US$'}`}
            value={formatQuoteAmount(stats?.cuotaInicialTotal)}
            helper="Iniciales cotizadas"
            icon={<FiTrendingUp />}
            accent="#1259C4"
          />
          <QuoteKpi
            label={`Cuota Contado ${currency === 'PEN' ? 'S/' : 'US$'}`}
            value={formatQuoteAmount(stats?.cuotaContadoTotal)}
            helper="Cuotas al contado"
            icon={<FiDollarSign />}
            accent="#0B2F6E"
          />
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Cotizaciones de lotes</h3>
              <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>Calcula el financiamiento y genera la cotizacion y el cronograma de pagos para el cliente.</p>
            </div>
            <button className="btn-primary" onClick={() => setOpen(true)}>Nueva cotizacion</button>
          </div>
          <div className="flex flex-col gap-2 mt-4 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              className="input w-full sm:!w-64"
              placeholder="Buscar cliente o lote..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="input w-full sm:!w-auto" value={fPayment} onChange={(e) => setFPayment(e.target.value)}>
              <option value="">Todos</option>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
            {(search || fPayment) && (
              <button
                className="btn-neutral !h-9 text-xs"
                onClick={() => { setSearch(''); setDebouncedSearch(''); setFPayment(''); }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-auto">
            {loading ? <p className="p-4 text-slate-400">Cargando...</p>
              : rows.length === 0 ? <EmptyState text="Aun no hay cotizaciones generadas." />
                : (
                  <table className="table-base" style={{ width: '100%', minWidth: 900 }}>
                    <thead><tr>
                      <th className="th-base">Id</th>
                      <th className="th-base">Lote</th>
                      <th className="th-base cursor-pointer select-none" onClick={() => toggleSort('clientName')}>Cliente{sortArrow('clientName')}</th>
                      <th className="th-base">Area M2</th>
                      <th className="th-base">Estado</th>
                      <th className="th-base cursor-pointer select-none" onClick={() => toggleSort('finalPriceUsd')}>Precio Final ({currency === 'PEN' ? 'S/' : 'US$'}){sortArrow('finalPriceUsd')}</th>
                      <th className="th-base">Cuota Inicial ({currency === 'PEN' ? 'S/' : 'US$'})</th>
                      <th className="th-base">Cuotas</th>
                      <th className="th-base cursor-pointer select-none" onClick={() => toggleSort('createdAt')}>Fecha{sortArrow('createdAt')}</th>
                      <th className="th-base"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((q) => (
                        <tr key={q.id}>
                          <td className="td-base text-slate-400">Q{q.id}</td>
                          <td className="td-base font-medium">{q.lotCode || `Lote ${q.lotId}`}</td>
                          <td className="td-base">{q.clientName}</td>
                          <td className="td-base">{Number(q.areaM2 || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '-'}</td>
                          <td className="td-base">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              q.status === 'enviada' ? 'bg-blue-100 text-[#1259C4]' :
                              q.status === 'desestimada' ? 'bg-red-100 text-[#C41212]' :
                              q.status === 'actualizada' ? 'bg-amber-100 text-[#92400E]' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {q.status === 'enviada' ? 'Enviada' : q.status === 'desestimada' ? 'Desestimada' : q.status === 'actualizada' ? 'Actualizada' : q.status}
                            </span>
                          </td>
                          <td className="td-base text-xs font-medium sm:text-sm">{formatQuoteAmount(q.finalPriceUsd)}</td>
                          <td className="td-base text-xs sm:text-sm">{q.paymentMethod === 'credito' ? formatQuoteAmount(q.cuotaInicialUsd) : 'Contado'}</td>
                          <td className="td-base">{q.totalCuotas || '-'}</td>
                          <td className="td-base">{formatDate(q.createdAt)}</td>
                          <td className="td-base whitespace-nowrap">
                            <button className="btn-secondary !h-7 !px-2 text-xs mr-1" onClick={() => setDoc({ id: q.id, type: 'cotizacion' })}><FiEye /> Ver Cotizacion</button>
                            {q.paymentMethod === 'credito' && <button className="btn-secondary !h-7 !px-2 text-xs" onClick={() => setDoc({ id: q.id, type: 'financiamiento' })}><FiEye /> Ver Financiamiento</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
          </div>
          <div className="bg-white p-3 border-t" style={{ borderColor: '#F0F1F3' }}>
            <PaginationBar compact label="Cotizaciones" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={setLimit} />
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <h3 className="font-semibold mb-1" style={{ fontSize: 17 }}>Calcula tu financiamiento</h3>
            <p className="text-xs text-slate-500 mb-4">Esta calculadora trabaja en US$, con un tipo de cambio manual para mostrar el equivalente en soles.</p>

            <h4 className="font-semibold text-sm text-slate-700 mb-2">Cliente</h4>
            <Field label="Nombres *"><input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Correo electronico *">
                <input
                  type="email"
                  className="input"
                  placeholder="cliente@correo.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </Field>
              <Field label="Telefono *">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={9}
                  className="input"
                  placeholder="999999999"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                />
              </Field>
            </div>

            <h4 className="font-semibold text-sm text-slate-700 mb-2 mt-4">Lote</h4>
            <div className="grid grid-cols-2 gap-3">
              {streetOptions.length > 0 && (
                <Field label="Calle">
                  <select
                    className="input"
                    value={streetId}
                    onChange={(e) => { setStreetId(Number(e.target.value)); setLotId(0); }}
                  >
                    <option value={0}>Todas las calles</option>
                    {streetOptions.map((street) => (
                      <option key={street.id} value={street.id}>
                        {street.name}{street.address ? ` - ${street.address}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Lote elegido *">
                <select className="input" value={lotId} onChange={(e) => selectLot(Number(e.target.value))}>
                  <option value={0}>Selecciona...</option>
                  {lotsOfStreet.map((l: any) => <option key={l.id} value={l.id}>Lote {l.code}{l.blockAddress ? ` - ${l.blockAddress}` : ''}</option>)}
                </select>
              </Field>
            </div>
            {streetId > 0 && lotsOfStreet.length === 0 && (
              <p className="text-xs text-slate-500 mb-2">Esta calle no tiene lotes disponibles.</p>
            )}
            {selectedLot && (
              <div className="grid grid-cols-3 gap-3 mb-3">
                <LotInfoBox label="Calle" value={(selectedLot as any).streetName || (selectedLot as any).blockName || '-'} />
                <LotInfoBox label="Direccion" value={selectedLot.blockAddress || '-'} />
                <LotInfoBox label="Area (m2)" value={String(Number(selectedLot.areaM2 || 0).toLocaleString('es-PE'))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio US$/m2"><input type="number" className="input" value={pricePerM2Usd || ''} onChange={(e) => onPricePerM2Change(Number(e.target.value))} /></Field>
              <Field label="Precio del lote US$"><input type="number" className="input" value={lotPriceUsd || ''} onChange={(e) => setLotPriceUsd(Number(e.target.value))} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bono de descuento US$"><input type="number" className="input" value={bonoDescuento || ''} onChange={(e) => setBonoDescuento(Number(e.target.value))} /></Field>
              <Field label="Bono especial US$"><input type="number" className="input" value={bonoEspecial || ''} onChange={(e) => setBonoEspecial(Number(e.target.value))} /></Field>
            </div>
            <div className="rounded-lg bg-canvas p-3 text-sm flex justify-between mb-3">
              <span className="text-slate-600">Precio final:</span><b>{fmtUsd(finalPrice)}</b>
            </div>

            <h4 className="font-semibold text-sm text-slate-700 mb-2">Forma de pago</h4>
            <Field label="Forma de pago">
              <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
                <option value="contado">Contado</option>
                <option value="credito">Credito</option>
              </select>
            </Field>
            {paymentMethod === 'credito' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cuota inicial US$ (sin interes)"><input type="number" className="input" value={cuotaInicialUsd || ''} onChange={(e) => setCuotaInicialUsd(Number(e.target.value))} /></Field>
                  <Field label="Plazo total (meses, incluye las cuotas sin interes)"><input type="number" className="input" value={totalCuotas || ''} onChange={(e) => setTotalCuotas(Number(e.target.value))} /></Field>
                </div>

                <div className="rounded-lg border p-3 mb-3" style={{ borderColor: '#E5E7EB' }}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">1. Cuota inicial (siempre sin interes)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Forma de pago de la inicial">
                      <select className="input" value={initialPaymentMode} onChange={(e) => setInitialPaymentMode(e.target.value as any)}>
                        <option value="contado">Pago de contado (1 sola vez)</option>
                        <option value="partes">En partes iguales</option>
                      </select>
                    </Field>
                    {initialPaymentMode === 'partes' && (
                      <Field label="Numero de partes">
                        <input type="number" min={2} max={24} className="input" value={initialParts} onChange={(e) => setInitialParts(Number(e.target.value))} />
                      </Field>
                    )}
                  </div>
                  {initialPaymentMode === 'partes' && cuotaInicialUsd > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      La inicial se paga en <b>{initialParts} partes</b> de <b>{fmtUsd(cuotaInicialUsd / initialParts)}</b> cada una, sin interes.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border p-3 mb-3" style={{ borderColor: '#E5E7EB' }}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">2. Financiamiento del saldo</p>
                  <Field label="Las primeras cuotas, sin interes?">
                    <select className="input" value={applyInterest ? 'con' : 'sin'} onChange={(e) => setApplyInterest(e.target.value === 'con')}>
                      <option value="sin">Todas las cuotas sin interes</option>
                      <option value="con">Si, las primeras N sin interes y el resto con interes</option>
                    </select>
                  </Field>
                  {applyInterest && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Cuantas cuotas sin interes">
                          <input type="number" min={0} max={totalCuotas} className="input" value={graceMonths} onChange={(e) => setGraceMonths(Number(e.target.value))} />
                        </Field>
                        <Field label="Interes de las siguientes cuotas (TEA %)">
                          <input type="number" step="0.01" className="input" value={tea || ''} onChange={(e) => setTea(Number(e.target.value))} />
                        </Field>
                      </div>
                      <p className="text-[11px] text-slate-500">Las {totalCuotas} cuotas incluyen esas {graceMonths} sin interes.</p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-canvas p-3 text-sm flex justify-between mb-2">
                  <span className="text-slate-600">Saldo a financiar:</span><b>{fmtUsd(saldoAFinanciar)}</b>
                </div>

                {applyInterest && tea > 0 && graceMonths > 0 && (
                  <div className="rounded-lg border p-3 text-xs text-slate-600 mb-3" style={{ borderColor: '#E5E7EB', background: '#F8FAFC' }}>
                    <p className="font-semibold text-slate-700 mb-1">Como queda el cronograma</p>
                    <p>Cuotas 1 a {graceMonths}: <b>{fmtUsd(saldoAFinanciar / totalCuotas)}</b> cada una, sin interes.</p>
                    <p>Cuotas {graceMonths + 1} a {totalCuotas}: cuota con {tea}% TEA aplicada sobre el saldo que quede pendiente.</p>
                  </div>
                )}
                {applyInterest && tea > 0 && graceMonths === 0 && (
                  <div className="rounded-lg border p-3 text-xs text-slate-600 mb-3" style={{ borderColor: '#E5E7EB', background: '#F8FAFC' }}>
                    <p className="font-semibold text-slate-700 mb-1">Como queda el cronograma</p>
                    <p>Las {totalCuotas} cuotas llevan {tea}% TEA desde el inicio.</p>
                  </div>
                )}
                {!applyInterest && (
                  <div className="rounded-lg border p-3 text-xs text-slate-600 mb-3" style={{ borderColor: '#E5E7EB', background: '#F8FAFC' }}>
                    <p className="font-semibold text-slate-700 mb-1">Como queda el cronograma</p>
                    <p>Las {totalCuotas} cuotas son de <b>{fmtUsd(saldoAFinanciar / totalCuotas)}</b>, sin interes.</p>
                  </div>
                )}
              </>
            )}

            <Field label="Tipo de cambio (S/ por US$)"><input type="number" step="0.01" className="input" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} /></Field>

            <div className="flex justify-end gap-2 pt-4 mt-1 border-t">
              <button className="btn-neutral" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardar}>Generar cotizacion</button>
            </div>
          </div>
        </div>
      )}
      {doc && <QuoteDocumentModal doc={doc} onClose={() => setDoc(null)} />}
    </>
  );
}
