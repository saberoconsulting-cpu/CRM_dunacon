'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FiDownload, FiEye, FiFileText, FiCreditCard, FiDollarSign, FiTrendingUp, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import { Toaster, toast, Field, EmptyState, Modal } from '@/components/ui/ui';
import { KpiCard, KPI_GRID_6 } from '@/components/ui/Metrics';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Select } from '@/components/ui/Select';
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

function calcFixedPayment(principal: number, months: number, teaPct: number) {
  const p = Math.max(0, Number(principal || 0));
  const n = Math.max(0, Math.floor(Number(months || 0)));
  if (p <= 0 || n <= 0) return 0;
  const monthlyRate = Math.pow(1 + Number(teaPct || 0) / 100, 1 / 12) - 1;
  if (monthlyRate <= 0) return p / n;
  const factor = Math.pow(1 + monthlyRate, n);
  return (p * monthlyRate * factor) / (factor - 1);
}

function LotInfoBox({ label, value, placeholder = '-' }: { label: string; value: string; placeholder?: string }) {
  const empty = !value || value === '-';
  const shown = empty ? placeholder : value;
  return (
    <div className="rounded-md border bg-white px-3 py-2" style={{ borderColor: '#E5E7EB' }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: empty ? '#9AA1AB' : '#111827' }} title={shown}>{shown}</p>
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

function buildPlanHtml(data: any, planPrintZoom = 1) {
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
  const safePlanZoom = Math.min(1.8, Math.max(1, Number(planPrintZoom || 1)));
  const fullViewW = SVG_W / safePlanZoom;
  const fullViewH = SVG_H / safePlanZoom;
  const fullCenterX = imgX + imgW / 2;
  const fullCenterY = imgY + imgH / 2;
  const fullViewX = Math.max(0, Math.min(fullCenterX - fullViewW / 2, SVG_W - fullViewW));
  const fullViewY = Math.max(0, Math.min(fullCenterY - fullViewH / 2, SVG_H - fullViewH));
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
        <div class="plan-actions">
          <label for="quote-plan-zoom-range">Zoom plano <strong id="quote-plan-zoom-label">${Math.round(safePlanZoom * 100)}%</strong></label>
          <input id="quote-plan-zoom-range" type="range" min="1" max="1.8" step="0.05" value="${safePlanZoom}" />
          <b>Lote ${lotLabel}</b>
        </div>
      </div>
      <div class="plan-split">
        <div class="plan-full">
          <svg id="quote-plan-full-svg" class="plan-svg" viewBox="${fullViewX} ${fullViewY} ${fullViewW} ${fullViewH}" data-center-x="${fullCenterX}" data-center-y="${fullCenterY}" role="img" aria-label="Plano completo del proyecto">
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

function buildQuoteHtml(data: any, plan: any, docType: 'cotizacion' | 'financiamiento', options?: { planPrintZoom?: number }) {
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
  const totalInstallments = Number(quote.totalCuotas || 0);
  const firstInstallmentUsd = Number(quote.cuotaInicialUsd || 0);
  const financingInstallments = Math.max(0, totalInstallments - (firstInstallmentUsd > 0 ? 1 : 0));
  const savedGraceMonths = Number(quote.graceMonths || 0);
  const scheduleGraceMonths = Number(plan?.graceMonths || 0);
  const graceMonths = Math.min(financingInstallments, Math.max(0, savedGraceMonths || scheduleGraceMonths));
  const interestInstallments = quote.interestType === 'tea'
    ? Math.max(0, financingInstallments - graceMonths)
    : 0;
  const noInterestInstallments = quote.interestType === 'tea' ? graceMonths : financingInstallments;
  const noInterestCuotaUsd = Number(plan?.graceCuota || 0) || (financingInstallments ? saldo / financingInstallments : 0);
  const saldoAfterNoInterest = Math.max(0, saldo - noInterestCuotaUsd * noInterestInstallments);
  const recalculatedInterestCuotaUsd = quote.interestType === 'tea'
    ? calcFixedPayment(saldoAfterNoInterest, interestInstallments, Number(quote.tea || 0))
    : (interestInstallments ? saldoAfterNoInterest / interestInstallments : 0);
  const interestCuotaUsd = recalculatedInterestCuotaUsd || Number(plan?.interestCuota || 0) || Number(quote.valorCuotaUsd || 0);
  const scheduleTotals = rows.reduce((totals, row) => ({
    amortizacionCapital: totals.amortizacionCapital + Number(row.amortizacionCapital || 0),
    amortizacionExtraordinaria: totals.amortizacionExtraordinaria + Number(row.amortizacionExtraordinaria || 0),
    interes: totals.interes + Number(row.interes || 0),
    cuota: totals.cuota + Number(row.cuota || 0),
  }), { amortizacionCapital: 0, amortizacionExtraordinaria: 0, interes: 0, cuota: 0 });
  const scheduleRows = rows.map((r) => `
    <tr><td>${r.month}</td><td>${escapeHtml(dueDate(r.month))}</td><td class="num">${escapeHtml(fmtUsd(r.saldoInicial))}</td><td class="num">${escapeHtml(fmtUsd(r.amortizacionCapital))}</td><td class="num">${escapeHtml(fmtUsd(r.amortizacionExtraordinaria))}</td><td class="num">${escapeHtml(fmtUsd(r.interes))}</td><td class="num strong">${escapeHtml(fmtUsd(r.cuota))}</td><td class="num">${escapeHtml(fmtUsd(r.saldoFinal))}</td></tr>
  `).join('');
  const scheduleTotalRow = rows.length ? `
    <tr class="total-row"><td colspan="2">Total</td><td class="num">-</td><td class="num">${escapeHtml(fmtUsd(scheduleTotals.amortizacionCapital))}</td><td class="num">${escapeHtml(fmtUsd(scheduleTotals.amortizacionExtraordinaria))}</td><td class="num">${escapeHtml(fmtUsd(scheduleTotals.interes))}</td><td class="num strong">${escapeHtml(fmtUsd(scheduleTotals.cuota))}</td><td class="num">-</td></tr>
  ` : '';
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
  const planHtml = buildPlanHtml(data, options?.planPrintZoom);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)} Q${quote.id}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#171717;background:white;font-size:13px}
          .watermark{position:fixed;left:50%;top:54%;transform:translate(-50%,-50%) rotate(-28deg);opacity:.055;z-index:-1}
          .watermark img{width:560px;max-width:72vw}
          .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid #1877F2;padding-bottom:14px;margin-bottom:16px}
          .logos{display:flex;align-items:center;gap:12px}.logos img{height:42px;max-width:150px;object-fit:contain}
          .eyebrow{margin:0 0 5px;color:#1877F2;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
          h1{margin:0;font-size:27px;line-height:1.15;color:#111827} h2{font-size:15px;margin:18px 0 8px;color:#1259C4;text-transform:uppercase;letter-spacing:.04em}
          p{margin:4px 0 0;color:#6B7280;font-size:13px}
          .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin:14px 0 18px}
          .summary div{border:1px solid #E5E7EB;background:#F8FAFC;padding:9px 10px;border-radius:6px}
          .summary span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.15}
          .summary strong{display:block;margin-top:4px;color:#111827;font-size:13px;white-space:nowrap}
          .summary .head-card{border-color:#B9D2F4;background:#F5F9FF;border-left:4px solid #1877F2}
          .summary .head-card span{color:#1259C4}
          .summary .head-card strong{color:#0B2F6E}
          .summary-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:6px;margin:14px 0 18px}
          .summary-row div{border:1px solid #E5E7EB;background:#F8FAFC;padding:8px 7px;border-radius:6px;min-width:0}
          .summary-row span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;line-height:1.2}
          .summary-row strong{display:block;margin-top:3px;color:#111827;font-size:13px;white-space:nowrap}
          .summary-row .finance-highlight{border-color:#1877F2;background:#F5F9FF;border-left:4px solid #1877F2}
          .summary-row .finance-highlight strong{color:#1259C4}
          .summary-row .tiny{display:inline;margin-left:3px;color:#64748B;font-size:9px;font-weight:700;text-transform:none;letter-spacing:0}
          .section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:nowrap}
          .section-head h2{margin-bottom:0}
          .summary-aside{display:flex;gap:8px;margin-bottom:10px}
          .summary-aside div{border:1px solid #E5E7EB;background:#F8FAFC;padding:5px 10px;border-radius:6px;text-align:right}
          .summary-aside span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
          .summary-aside strong{display:block;margin-top:2px;color:#1259C4;font-size:12px;font-weight:700;white-space:nowrap}
          table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px;background:white}
          th{background:#1877F2;color:white;border:1px solid #1877F2;padding:8px 7px;font-size:11px;text-align:left;text-transform:uppercase}
          td{border:1px solid #E5E7EB;padding:8px 7px;font-size:12px;vertical-align:top}
          tbody tr:nth-child(even){background:#F8FAFC}.label{background:#D8E8FF;font-weight:700;color:#111827;width:34%}
          .total-row td{background:#EAF3FF !important;border-color:#B9D2F4;font-weight:800;color:#0B2F6E}
          .num{text-align:right;white-space:nowrap}.strong{font-weight:700;color:#1259C4}.footer{margin-top:18px;border-top:1px solid #E5E7EB;padding-top:8px;color:#6B7280;font-size:11px;text-align:right}
          .schedule-table{table-layout:fixed}
          .schedule-table th,.schedule-table td{padding:6px 4px;font-size:10px;line-height:1.15}
          .schedule-table .num{font-size:9.5px;letter-spacing:-.01em}
          .schedule-table th:nth-child(1),.schedule-table td:nth-child(1){width:5%;text-align:center}
          .schedule-table th:nth-child(2),.schedule-table td:nth-child(2){width:10%}
          .schedule-table th:nth-child(3),.schedule-table td:nth-child(3){width:14%}
          .schedule-table th:nth-child(4),.schedule-table td:nth-child(4){width:14%}
          .schedule-table th:nth-child(5),.schedule-table td:nth-child(5){width:13%}
          .schedule-table th:nth-child(6),.schedule-table td:nth-child(6){width:11%}
          .schedule-table th:nth-child(7),.schedule-table td:nth-child(7){width:14%}
          .schedule-table th:nth-child(8),.schedule-table td:nth-child(8){width:14%}
          .plan-card{border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;margin:8px 0 16px;background:#F8FAFC;break-inside:avoid;box-shadow:0 8px 24px rgba(15,23,42,.06)}
          .plan-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #E5E7EB;background:white}
          .plan-head strong{display:block;font-size:12px;color:#111827}.plan-head span{display:block;margin-top:2px;font-size:10px;color:#6B7280}.plan-head b{border-radius:999px;background:#EAF3FF;color:#1259C4;padding:5px 10px;font-size:11px}
          .plan-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
          .plan-actions label{font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.04em}
          .plan-actions label strong{display:inline;color:#1259C4;font-size:10px}
          .plan-actions input{width:118px;accent-color:#1877F2}
          .plan-svg{display:block;width:100%;height:auto;background:#EEF2F7;border-radius:10px}
          .plan-split{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:12px;padding:12px}
          .plan-full,.plan-zoom{min-width:0;display:flex;flex-direction:column;gap:6px}
          .plan-full .plan-svg,.plan-zoom svg{height:330px;border-radius:10px;overflow:hidden;background:#EEF2F7}
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
            .plan-full .plan-svg,.plan-zoom svg{height:190px}
            .watermark img{width:300px}
          }
          @media print{body{margin:18px}.brand,.summary,.summary-row,.summary-aside,.plan-card{break-inside:avoid}thead{display:table-header-group}.watermark{position:fixed}.plan-actions input,.plan-actions label{display:none !important}
            .plan-split{display:grid !important;grid-template-columns:minmax(0,3fr) minmax(0,2fr) !important;gap:12px !important}
            .plan-full .plan-svg,.plan-zoom svg{height:285px !important}
            .summary-row{display:grid !important;grid-template-columns:repeat(4,minmax(0,1fr)) !important}
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
          <div class="head-card"><span>Precio final</span><strong>${escapeHtml(fmtUsd(Number(quote.finalPriceUsd || 0)))}</strong></div>
          <div class="head-card"><span>Saldo</span><strong>${escapeHtml(fmtUsd(saldo))}</strong></div>
          ${quote.paymentMethod === 'credito' ? `
              <div class="head-card"><span>Cuota inicial</span><strong>${escapeHtml(fmtUsd(Number(quote.cuotaInicialUsd || 0)))}</strong></div>
              <div class="head-card"><span>Cuotas s/int.</span><strong>${noInterestInstallments}</strong></div>
              <div class="head-card"><span>Cuotas c/int.</span><strong>${interestInstallments}</strong></div>
              <div class="head-card"><span>Total cuotas</span><strong>${totalInstallments}</strong></div>
            ` : '<div class="head-card"><span>Forma de pago</span><strong>Contado</strong></div>'}
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
            <div class="finance-highlight"><span>Saldo fin.</span><strong>${escapeHtml(fmtUsd(saldo))}</strong></div>
            <div class="finance-highlight"><span>TEA</span><strong>${quote.interestType === 'tea' ? `${Number(quote.tea || 0)}%` : 'Sin intereses'}</strong></div>
            <div class="finance-highlight"><span>C. s/int. <em class="tiny">(${noInterestInstallments})</em></span><strong>${escapeHtml(fmtUsd(noInterestCuotaUsd))}</strong></div>
            <div class="finance-highlight"><span>C. c/int. <em class="tiny">(${interestInstallments})</em></span><strong>${escapeHtml(fmtUsd(interestCuotaUsd))}</strong></div>
            <div class="finance-highlight"><span>Total cuotas</span><strong>${totalInstallments}</strong></div>
            <div class="finance-highlight"><span>TC</span><strong>S/ ${Number(quote.exchangeRate || 0).toFixed(4)}</strong></div>
          </div>
          ${initialPlan ? `
            <h2>Cuota inicial (sin intereses)</h2>
            <table><tbody>
              <tr><td class="label">Monto de la cuota inicial</td><td class="num">${escapeHtml(fmtUsd(initialPlan.cuotaInicialTotal))}</td></tr>
              <tr><td class="label">Forma de pago</td><td class="num">${initialPlan.modo === 'partes' ? `${initialPlan.partes} partes de ${escapeHtml(fmtUsd(initialPlan.montoPorParte))}` : 'Pago unico de contado'}</td></tr>
            </tbody></table>
          ` : ''}
          ${isFinancing ? `<table class="schedule-table"><thead><tr><th>Mes</th><th>Fecha</th><th>Saldo inicial</th><th>Amort. capital</th><th>Amort. extra</th><th>Interes</th><th>Cuota</th><th>Saldo final</th></tr></thead><tbody>${scheduleRows ? `${scheduleRows}${scheduleTotalRow}` : '<tr><td colspan="8">Sin cronograma registrado.</td></tr>'}</tbody></table>` : ''}
        ` : ''}
        <div class="footer">Dunacon - CRM Inmobiliario</div>
        <script>
          (function () {
            var input = document.getElementById('quote-plan-zoom-range');
            var svg = document.getElementById('quote-plan-full-svg');
            var label = document.getElementById('quote-plan-zoom-label');
            if (!input) return;
            function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
            function applyZoom() {
              var zoom = Number(input.value || 1);
              if (svg) {
                var cx = Number(svg.getAttribute('data-center-x') || 500);
                var cy = Number(svg.getAttribute('data-center-y') || 400);
                var w = 1000 / zoom;
                var h = 800 / zoom;
                var x = clamp(cx - w / 2, 0, 1000 - w);
                var y = clamp(cy - h / 2, 0, 800 - h);
                svg.setAttribute('viewBox', x + ' ' + y + ' ' + w + ' ' + h);
              }
              if (label) label.textContent = Math.round(zoom * 100) + '%';
              window.parent && window.parent.postMessage({ type: 'quote-plan-print-zoom', value: zoom }, '*');
            }
            input.addEventListener('input', applyZoom);
          })();
        </script>
      </body>
    </html>
  `;
}

function QuoteDocumentModal({ doc, onClose }: { doc: { id: number; type: 'cotizacion' | 'financiamiento' }; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const [error, setError] = useState('');
  const planPrintZoomRef = useRef(1);

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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'quote-plan-print-zoom') return;
      planPrintZoomRef.current = Math.min(1.8, Math.max(1, Number(event.data.value || 1)));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const html = data ? buildQuoteHtml(data, schedule, doc.type, { planPrintZoom: 1 }) : '';

  return (
    <Modal open={true} onClose={onClose} title={doc.type === 'financiamiento' ? 'Financiamiento' : 'Cotizacion'} width="max-w-5xl">
      <div className="space-y-3">
        <div className="flex justify-end">
          <button className="btn-primary !h-8 text-xs" disabled={!data} onClick={() => data && printHtml(buildQuoteHtml(data, schedule, doc.type, { planPrintZoom: planPrintZoomRef.current }))}>
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

function QuoteKpi({ label, value, helper, icon, accent }: { label: string; value: string; helper: string; icon: React.ReactNode; accent: string }) {
  return <KpiCard label={label} value={value} helper={helper} icon={icon} tone={accent} truncateLabel valueAlign="center" />;
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
  const { currency, setCurrency, exchangeRate: displayExchangeRate, setExchangeRate: setDisplayExchangeRate } = useDisplayCurrency();

  const formatQuoteAmount = (amountUsd: number | null | undefined) => {
    const usd = Number(amountUsd || 0);
    const value = currency === 'PEN' ? usd * displayExchangeRate : usd;
    return `${currency === 'PEN' ? 'S/' : 'US$'} ${value.toLocaleString(currency === 'PEN' ? 'es-PE' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

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
      const area = Number(lot.areaM2 || 0);
      const perM2 = Number(lot.price || 0);
      const total = Number(lot.finalPrice || lot.salePrice || (perM2 * area) || 0);
      setPricePerM2Usd(Number(perM2.toFixed(2)));
      setLotPriceUsd(Number(total.toFixed(2)));
      setBonoDescuento(0);
      setBonoEspecial(0);
      setCuotaInicialUsd(0);
      setInitialPaymentMode('contado');
      setInitialParts(3);
    }
  }

  // Limpia el lote elegido para poder escoger otro sin cerrar el modal.
  // Deja las cajas de datos del lote visibles (solo se vacian sus valores) y
  // restablece la lista de lotes (sin filtro de calle) para poder re-elegir.
  function resetLot() {
    setLotId(0);
    setStreetId(0);
    setPricePerM2Usd(0);
    setLotPriceUsd(0);
  }

  function onPricePerM2Change(v: number) {
    setPricePerM2Usd(v);
    if (selectedLot) setLotPriceUsd(Number((v * Number(selectedLot.areaM2)).toFixed(2)));
  }

  const finalPrice = Math.max(0, lotPriceUsd - bonoDescuento - bonoEspecial);
  const safeTotalCuotas = Math.max(1, Number(totalCuotas || 0));
  const primeraCuotaUsd = paymentMethod === 'credito' ? finalPrice / safeTotalCuotas : 0;
  const saldoAFinanciar = paymentMethod === 'credito' ? Math.max(0, finalPrice - primeraCuotaUsd) : 0;
  const safeInitialParts = Math.max(2, Number(initialParts || 0));
  const cuotasFinanciadas = Math.max(0, safeTotalCuotas - 1);

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
        cuotaInicialUsd: paymentMethod === 'credito' ? primeraCuotaUsd || undefined : undefined,
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
        <div className={`mb-4 ${KPI_GRID_6}`}>
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
            <Select
              value={fPayment}
              onChange={setFPayment}
              className="w-full sm:!w-auto"
              options={[{ value: '', label: 'Todos' }, { value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]}
            />
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 sm:max-h-[92vh] sm:p-6">
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

            <h4 className="font-semibold text-sm text-slate-700 mb-2 mt-4">Calle y lote</h4>
            <div className="grid grid-cols-2 gap-3">
              {streetOptions.length > 0 && (
                <Field label="Calle">
                  <Select
                    value={String(streetId)}
                    onChange={(value) => { setStreetId(Number(value)); setLotId(0); }}
                    options={[
                      { value: '0', label: 'Todas las calles' },
                      ...streetOptions.map((street) => ({ value: String(street.id), label: street.name })),
                    ]}
                  />
                </Field>
              )}
              <Field label="Lote elegido *">
                <Select
                  value={String(lotId)}
                  onChange={(value) => selectLot(Number(value))}
                  options={[
                    { value: '0', label: 'Selecciona...' },
                    ...lotsOfStreet.map((l: any) => ({ value: String(l.id), label: l.code })),
                  ]}
                />
              </Field>
            </div>
            {streetId > 0 && lotsOfStreet.length === 0 && (
              <p className="text-xs text-slate-500 mb-2">Esta calle no tiene lotes disponibles.</p>
            )}
            {/* Datos del lote: cajas fijas siempre visibles; solo cambian sus valores al elegir un lote. */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Datos del lote</p>
              <button
                type="button"
                className="btn-neutral !h-7 !px-2 text-xs"
                onClick={resetLot}
                disabled={!selectedLot}
                title="Limpiar el lote elegido para escoger otro sin salir del cuadro"
              >
                <FiRefreshCw /> Cambiar lote
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <LotInfoBox label="Calle" value={(selectedLot as any)?.streetName || (selectedLot as any)?.blockName || '-'} placeholder="Sin lote" />
              <LotInfoBox label="Direccion" value={selectedLot?.blockAddress || '-'} placeholder="Sin lote" />
              <LotInfoBox label="Area (m2)" value={selectedLot ? String(Number(selectedLot.areaM2 || 0).toLocaleString('es-PE')) : '-'} placeholder="Sin lote" />
            </div>
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
              <Select
                value={paymentMethod}
                onChange={(value) => {
                  setPaymentMethod(value as any);
                  if (value === 'contado') {
                    setCuotaInicialUsd(0);
                    setInitialPaymentMode('contado');
                  }
                }}
                options={[
                  { value: 'contado', label: 'Contado' },
                  { value: 'credito', label: 'Credito' },
                ]}
              />
            </Field>
            {paymentMethod === 'credito' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plazo total (meses, incluye las cuotas sin interes)"><input type="number" className="input" value={totalCuotas || ''} onChange={(e) => setTotalCuotas(Number(e.target.value || 0))} /></Field>
                  <div className="rounded-lg bg-canvas p-3 text-sm">
                    <span className="block text-xs text-slate-500">Primera cuota calculada</span>
                    <b>{fmtUsd(primeraCuotaUsd)}</b>
                  </div>
                </div>
                <p className="-mt-2 mb-3 text-[11px] text-slate-500">
                  La primera cuota se calcula automaticamente: precio final dividido entre el total de cuotas. Si la pagas en partes, se divide esa primera cuota.
                </p>

                <div className="rounded-lg border p-3 mb-3" style={{ borderColor: '#E5E7EB' }}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">1. Primera cuota (siempre sin interes)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Forma de pago de la primera cuota">
                      <Select
                        value={initialPaymentMode}
                        onChange={(value) => setInitialPaymentMode(value as any)}
                        options={[
                          { value: 'contado', label: 'Pago de contado (1 sola vez)' },
                          { value: 'partes', label: 'En partes iguales' },
                        ]}
                      />
                    </Field>
                    {initialPaymentMode === 'partes' && (
                      <Field label="Numero de partes">
                        <input type="number" min={2} max={24} className="input" value={initialParts || ''} onChange={(e) => setInitialParts(Number(e.target.value || 0))} />
                      </Field>
                    )}
                  </div>
                  {initialPaymentMode === 'partes' && primeraCuotaUsd > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      La primera cuota de <b>{fmtUsd(primeraCuotaUsd)}</b> se paga en <b>{safeInitialParts} partes</b> de <b>{fmtUsd(primeraCuotaUsd / safeInitialParts)}</b> cada una, sin interes.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border p-3 mb-3" style={{ borderColor: '#E5E7EB' }}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">2. Financiamiento del saldo</p>
                  <Field label="Las primeras cuotas, sin interes?">
                    <Select
                      value={applyInterest ? 'con' : 'sin'}
                      onChange={(value) => setApplyInterest(value === 'con')}
                      options={[
                        { value: 'sin', label: 'Todas las cuotas sin interes' },
                        { value: 'con', label: 'Si, las primeras N sin interes y el resto con interes' },
                      ]}
                    />
                  </Field>
                  {applyInterest && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Cuantas cuotas sin interes">
                          <input type="number" min={0} max={totalCuotas} className="input" value={graceMonths || ''} onChange={(e) => setGraceMonths(Number(e.target.value || 0))} />
                        </Field>
                        <Field label="Interes de las siguientes cuotas (TEA %)">
                          <input type="number" step="0.01" className="input" value={tea || ''} onChange={(e) => setTea(Number(e.target.value || 0))} />
                        </Field>
                      </div>
                      <p className="text-[11px] text-slate-500">Las {totalCuotas} cuotas incluyen esas {graceMonths} sin interes.</p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-canvas p-3 text-sm mb-2">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-600">Saldo a financiar:</span><b>{fmtUsd(saldoAFinanciar)}</b>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {fmtUsd(finalPrice)} precio final - {fmtUsd(primeraCuotaUsd)} primera cuota = {fmtUsd(saldoAFinanciar)}.
                  </p>
                </div>

                {applyInterest && tea > 0 && graceMonths > 0 && (
                  <div className="rounded-lg border p-3 text-xs text-slate-600 mb-3" style={{ borderColor: '#E5E7EB', background: '#F8FAFC' }}>
                    <p className="font-semibold text-slate-700 mb-1">Como queda el cronograma</p>
                    <p>Primera cuota: <b>{fmtUsd(primeraCuotaUsd)}</b>{initialPaymentMode === 'partes' ? ` en ${safeInitialParts} partes` : ''}, sin interes.</p>
                    <p>Siguientes cuotas sin interes: <b>{fmtUsd(cuotasFinanciadas ? saldoAFinanciar / cuotasFinanciadas : 0)}</b> cada una.</p>
                    <p>Luego se aplica {tea}% TEA sobre el saldo que quede pendiente.</p>
                  </div>
                )}
                {applyInterest && tea > 0 && graceMonths === 0 && (
                  <div className="rounded-lg border p-3 text-xs text-slate-600 mb-3" style={{ borderColor: '#E5E7EB', background: '#F8FAFC' }}>
                    <p className="font-semibold text-slate-700 mb-1">Como queda el cronograma</p>
                    <p>Primera cuota: <b>{fmtUsd(primeraCuotaUsd)}</b>{initialPaymentMode === 'partes' ? ` en ${safeInitialParts} partes` : ''}, sin interes.</p>
                    <p>El saldo de <b>{fmtUsd(saldoAFinanciar)}</b> se financia con {tea}% TEA.</p>
                  </div>
                )}
                {!applyInterest && (
                  <div className="rounded-lg border p-3 text-xs text-slate-600 mb-3" style={{ borderColor: '#E5E7EB', background: '#F8FAFC' }}>
                    <p className="font-semibold text-slate-700 mb-1">Como queda el cronograma</p>
                    <p>Primera cuota: <b>{fmtUsd(primeraCuotaUsd)}</b>{initialPaymentMode === 'partes' ? ` en ${safeInitialParts} partes` : ''}, sin interes.</p>
                    <p>Las {cuotasFinanciadas} cuotas restantes son de <b>{fmtUsd(cuotasFinanciadas ? saldoAFinanciar / cuotasFinanciadas : 0)}</b>, sin interes.</p>
                  </div>
                )}
              </>
            )}

            <Field label="Tipo de cambio (S/ por US$)"><input type="number" step="0.01" className="input" value={exchangeRate || ''} onChange={(e) => setExchangeRate(Number(e.target.value || 0))} /></Field>

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
