'use client';
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Toaster, toast, Field, EmptyState } from '@/components/ui/ui';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { api } from '@/lib/api';
import { normalizePaginated, buildQuery } from '@/lib/pagination';
import { formatMoney, formatDate } from '@/lib/types';
import { useDisplayCurrency } from '@/lib/currency';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { printHtml } from '@/lib/print';
import { FiDownload, FiHome, FiCheckCircle, FiDollarSign, FiTrendingUp, FiPercent, FiBookmark, FiArrowDownCircle } from 'react-icons/fi';

// Tarjeta de estadística al estilo del dashboard (MetricTile): icono, acento
// superior de color y tipografía compacta del proyecto.
// El numero se auto-escala segun su largo para que SIEMPRE se vea completo
// (sin truncar con "…"), porque en pantallas angostas una cifra como
// "S/ 1,234,567" no cabe con el tamaño original.
function SalesMetric({ label, value, icon, tone = '#1877F2' }: { label: string; value: ReactNode; icon: ReactNode; tone?: string }) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  // Longitud total del texto (incluye simbolo y separadores), que es lo que
  // realmente determina si cabe en el ancho de la tarjeta.
  const len = text.length;
  const sizeClass = len > 13
    ? 'text-[10px] sm:text-[11px] lg:text-[12px] xl:text-sm'
    : len > 10
      ? 'text-[11px] sm:text-[13px] lg:text-sm xl:text-base'
      : 'text-[13px] sm:text-base lg:text-[15px] xl:text-lg';

  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border bg-white px-2.5 py-2.5 sm:px-3 sm:py-3" style={{ borderColor: '#E5E7EB', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: tone }} />
      <div className="flex min-w-0 items-start justify-between gap-1.5 sm:gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium leading-tight sm:text-[11px]" style={{ color: '#6B7280' }} title={label}>{label}</p>
          <p className={`mt-1 whitespace-nowrap font-semibold leading-tight tabular-nums ${sizeClass}`} style={{ color: '#111827' }} title={text || undefined}>{value}</p>
        </div>
        <span className="hidden h-7 w-7 shrink-0 place-items-center rounded-md text-sm md:grid" style={{ background: `${tone}12`, color: tone }}>{icon}</span>
      </div>
    </div>
  );
}

type S = {
  id: number; projectId: number; lotId: number; clientId?: number | null; agentId?: number | null;
  salePrice: string; saleDate: string; commission: string; agentName?: string | null; clientName?: string | null;
  lotCode?: string | null; conditions?: string | null; approvalStatus?: string; totalCuotas?: number;
  interestType?: string; tea?: number; financingBase?: number; valorCuota?: number; planStatus?: string; lotAreaM2?: number;
};

const PAYMENT_METHODS = ['Contado', 'Al crédito'];

function todayInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function initialPaymentOf(sale: S) {
  const match = String(sale.conditions || '').match(/Cuota inicial:\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1] || 0) : 0;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function SalesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<S[]>([]);
  const [pending, setPending] = useState<S[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showQuoteHint, setShowQuoteHint] = useState(true);
  const [showCotizaciones, setShowCotizaciones] = useState(false);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState(0);
  const [selectedQuoteSnapshot, setSelectedQuoteSnapshot] = useState<any>(null);
  const [quoteSearch, setQuoteSearch] = useState('');
  const [quoteFrom, setQuoteFrom] = useState('');
  const [quoteTo, setQuoteTo] = useState('');
  const [exchangeRate, setExchangeRate] = useState(3.75);
  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  // Paginación server-side + filtros (buenas prácticas: page/limit en el API,
  // reset a página 1 cuando cambia un filtro, debounce en búsqueda).
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [summary, setSummary] = useState({ totalSales: 0, totalAmount: 0, totalCommission: 0 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Filtros del historial (el backend ya los soporta en ListSalesDto):
  // estado de aprobación, asesor y rango de fechas de venta.
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const hasFilters = Boolean(statusFilter || agentFilter || fromDate || toDate || search);
  const [sort, setSort] = useState('saleDate');
  const [order, setOrder] = useState<'ASC' | 'DESC'>('DESC');
  function toggleSort(field: string) {
    if (sort === field) {
      setOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSort(field);
      setOrder('DESC');
    }
  }
  const sortArrow = (field: string) => (sort === field ? (order === 'ASC' ? ' \u25B2' : ' \u25BC') : '');
  // form
  const [projectId, setProjectId] = useState(lockedProjectId || 0);
  const [lotId, setLotId] = useState(0);
  const [clientId, setClientId] = useState(0);
  const [clientName, setClientName] = useState('');
  const [agentId, setAgentId] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Contado');
  const [totalCuotas, setTotalCuotas] = useState(0);
  const [cuotaInicial, setCuotaInicial] = useState(0);
  const [interestType, setInterestType] = useState<'sin_intereses' | 'tea'>('sin_intereses');
  const [tea, setTea] = useState(0);
  const [saleDate, setSaleDate] = useState(todayInput());
  const [conditions, setConditions] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const queryLotId = Number(searchParams?.get('lotId') || 0);
  const shouldOpenSale = searchParams?.get('openSale') === '1';
  // Moneda unica de la pantalla: `show()` convierte los montos a la moneda activa.
  // (No se aplica al formulario de registro, que trabaja siempre en soles con su
  // propio tipo de cambio `exchangeRate`.)
  const {
    currency,
    setCurrency,
    exchangeRate: displayRate,
    setExchangeRate: setDisplayRate,
    format: show,
  } = useDisplayCurrency();

  useEffect(() => { if (lockedProjectId) setProjectId(lockedProjectId); }, [lockedProjectId]);

  const role = (() => { if (typeof window !== 'undefined') try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role; } catch { return ''; } return ''; })();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQuery({
        projectId: lockedProjectId,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        agentId: agentFilter || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        sort, order, page, limit,
      });
      const data = await api.get<unknown>(`/sales${qs ? `?${qs}` : ''}`);
      const norm = normalizePaginated<S>(data, page, limit);
      setRows(norm.items);
      setMeta({ total: norm.total, totalPages: norm.totalPages });
      const s = (data as any)?.summary;
      if (s) setSummary({
        totalSales: Number(s.totalSales || 0),
        totalAmount: Number(s.totalAmount || 0),
        totalCommission: Number(s.totalCommission || 0),
      });
      // Si la página quedó fuera de rango, volver a la última válida.
      if (page > norm.totalPages && norm.totalPages >= 1) setPage(norm.totalPages);
      if (role === 'admin' || role === 'superadmin') {
        const pendingQuery = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
        try { setPending((await api.get<S[]>(`/sales/pending${pendingQuery}`)) || []); } catch { setPending([]); }
      }
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [role, lockedProjectId, debouncedSearch, statusFilter, agentFilter, fromDate, toDate, sort, order, page, limit]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    setShowQuoteHint(true);
    const timer = window.setTimeout(() => setShowQuoteHint(false), 5000);
    return () => window.clearTimeout(timer);
  }, [open]);
  // Debounce de 400ms para no disparar un request por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); }, 400);
    return () => clearTimeout(t);
  }, [search]);
  // Reset a pagina 1 cuando cambia proyecto, busqueda, filtros u ordenamiento.
  useEffect(() => { setPage(1); }, [lockedProjectId, debouncedSearch, statusFilter, agentFilter, fromDate, toDate, sort, order]);
  function limpiarFiltros() {
    setSearch(''); setDebouncedSearch('');
    setStatusFilter(''); setAgentFilter(0); setFromDate(''); setToDate('');
  }
  useEffect(() => {
    setIsAdmin(role === 'admin' || role === 'superadmin');
    api.get<any[]>('/projects').then(setProjects).catch(() => {});
    api.get<any[]>('/clients').then((d) => setClients(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
    api.get<any[]>('/users/agents').then(setAgents).catch(() => {});
    api.get<any[]>('/lots').then((d) => setLots(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
    const q = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
    api.get<any[]>(`/quotes${q}`).then((d) => setQuotes(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
  }, [load, role, lockedProjectId]);

  useEffect(() => {
    if (!shouldOpenSale && !queryLotId) return;
    if (queryLotId > 0) {
      if (lots.length === 0) return;
      const lot = lots.find((l: any) => Number(l.id) === queryLotId);
      if (!lot) return;
      if (lockedProjectId && Number(lot.projectId) !== Number(lockedProjectId)) return;
      selectLot(queryLotId);
    }
    setOpen(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('lotId');
      url.searchParams.delete('openSale');
      window.history.replaceState(null, '', url.pathname + (url.search ? `?${url.searchParams}` : ''));
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpenSale, queryLotId, lots, lockedProjectId]);

  const availableQuotes = quotes.filter((q: any) => {
    if (projectId && Number(q.projectId) !== Number(projectId)) return false;
    if (quoteSearch.trim()) {
      const term = quoteSearch.trim().toLowerCase();
      const haystack = `${q.id} ${q.clientName || ''} ${q.lotCode || ''} ${q.clientEmail || ''} ${q.clientPhone || ''}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    const created = q.createdAt ? String(q.createdAt).slice(0, 10) : '';
    if (quoteFrom && (!created || created < quoteFrom)) return false;
    if (quoteTo && (!created || created > quoteTo)) return false;
    return true;
  });

  const selectedLot = lots.find((l: any) => Number(l.id) === Number(lotId));
  const selectedQuote = selectedQuoteId
    ? (quotes.find((q: any) => Number(q.id) === Number(selectedQuoteId)) || selectedQuoteSnapshot)
    : null;
  const salePriceUsd = exchangeRate > 0 ? salePrice / exchangeRate : 0;
  const quoteProjectId = lockedProjectId || projectId || Number(selectedLot?.projectId || 0);

  // Al elegir un lote, autocompletar el precio con su "Precio Venta" de
  // Lotización (si no viene de una cotización real seleccionada abajo).
  function selectLot(id: number) {
    setLotId(id);
    setSelectedQuoteId(0);
    setSelectedQuoteSnapshot(null);
    const lot = lots.find((l: any) => l.id === id);
    if (lot) {
      setSalePrice(Number(lot.salePrice || lot.price || 0));
      if (lot.clientId) {
        setClientId(Number(lot.clientId));
        const client = clients.find((c: any) => Number(c.id) === Number(lot.clientId));
        setClientName(client?.fullName || client?.full_name || lot.clientName || '');
      }
    }
  }

  // Cotización real del módulo Cotizaciones Lotes: precarga el lote y el
  // precio (convertido a soles con el tipo de cambio de esa cotización).
  function selectQuote(q: any) {
    const rate = Number(q.exchangeRate || 0) > 0 ? Number(q.exchangeRate) : 3.75;
    const isCredit = q.paymentMethod === 'credito';
    setExchangeRate(rate);
    setSelectedQuoteId(Number(q.id));
    setSelectedQuoteSnapshot(q);
    setProjectId(Number(q.projectId || lockedProjectId || projectId || 0));
    setLotId(Number(q.lotId));
    setClientName(q.clientName || '');
    setSalePrice(Math.round(Number(q.finalPriceUsd || 0) * rate));
    setPaymentMethod(isCredit ? 'Al crédito' : 'Contado');
    setCuotaInicial(isCredit ? Math.round(Number(q.cuotaInicialUsd || 0) * rate) : 0);
    setTotalCuotas(isCredit ? Number(q.totalCuotas || 0) : 0);
    setInterestType(q.interestType === 'tea' ? 'tea' : 'sin_intereses');
    setTea(q.interestType === 'tea' ? Number(q.tea || 0) : 0);
    setSaleDate(q.createdAt ? String(q.createdAt).slice(0, 10) : todayInput());
    setConditions((current) => current || `Cotizacion Q${q.id}`);
    setShowCotizaciones(false);
    setPreview(null);
    // El cliente de la cotizacion se reutiliza si ya existe en la cartera.
    const match = clients.find((c: any) => {
      const fullName = String(c.fullName || c.full_name || '').trim().toLowerCase();
      return fullName && fullName === String(q.clientName || '').trim().toLowerCase();
    });
    setClientId(match ? Number(match.id) : 0);
    toast('Datos de la cotizacion cargados');
  }

  async function assignClientByName(showToast = true) {
    const name = clientName.trim();
    if (!name) {
      toast('Ingresa el nombre del cliente real.', 'err');
      return 0;
    }

    const existing = clients.find((c: any) => {
      const fullName = String(c.fullName || c.full_name || '').trim().toLowerCase();
      return fullName === name.toLowerCase();
    });
    if (existing) {
      setClientId(Number(existing.id));
      if (showToast) toast('Cliente asignado');
      return Number(existing.id);
    }

    const created = await api.post<any>('/clients', {
      fullName: name,
      projectInterestId: lockedProjectId || projectId || undefined,
      agentId: agentId || undefined,
      pipelineStatus: 'ganado',
      source: 'venta_directa',
    });
    setClients((current) => [created, ...current]);
    setClientId(Number(created.id));
    if (showToast) toast('Cliente creado y asignado');
    return Number(created.id);
  }

  // Calculadora en vivo: comisión, saldo a financiar, tramos de cuotas.
  useEffect(() => {
    if (!open || !salePrice) { setPreview(null); return; }
    const t = setTimeout(() => {
      api.post('/sales/preview', {
        projectId: projectId || 1, lotId: lotId || 1, agentId: agentId || 1,
        salePrice, appliesCommission: false,
        totalCuotas, cuotaInicial, interestType, tea: interestType === 'tea' ? tea : undefined,
        paymentMethod,
      }).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [open, salePrice, totalCuotas, cuotaInicial, interestType, tea, paymentMethod, projectId, lotId, agentId]);

  async function registrar() {
    if (!selectedQuoteId) return toast('Selecciona una cotizacion antes de registrar la venta. Si no existe, genera una primero.', 'err');
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!clientName.trim() && !clientId) return toast('Ingresa el nombre del cliente real.', 'err');
    if (!agentId) return toast('Selecciona el agente', 'err');
    if (!salePrice) return toast('Ingresa el precio de venta', 'err');
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const resolvedClientId = clientId || await assignClientByName(false);
      if (!resolvedClientId) return;
      await api.post('/sales', {
        projectId: lockedProjectId || projectId || lot?.projectId || 1, lotId: Number(lotId),
        clientId: resolvedClientId, agentId: Number(agentId), salePrice,
        paymentMethod,
        totalCuotas: paymentMethod === 'Contado' ? undefined : (totalCuotas || undefined),
        cuotaInicial: paymentMethod === 'Contado' ? undefined : (cuotaInicial || undefined),
        interestType: paymentMethod === 'Contado' ? undefined : interestType,
        tea: paymentMethod !== 'Contado' && interestType === 'tea' ? tea : undefined,
        saleDate: saleDate || undefined, conditions: conditions || undefined,
      });
      toast('Separación registrada. Queda pendiente de validación.');
      setOpen(false); setLotId(0); setSelectedQuoteId(0); setSelectedQuoteSnapshot(null); setClientId(0); setClientName(''); setConditions(''); setSalePrice(0);
      setPaymentMethod('Contado'); setTotalCuotas(0); setCuotaInicial(0); setInterestType('sin_intereses'); setTea(0);
      setSaleDate(todayInput()); setAgentId(0); setPreview(null);
      setQuoteSearch(''); setQuoteFrom(''); setQuoteTo(''); setShowCotizaciones(false);
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function aprobar(s: any) {
    const suffix = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
    try { await api.post(`/sales/approve/${s.id}${suffix}`); toast('Separación aprobada. Lote vendido.'); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  }
  async function rechazar(s: any) {
    const suffix = lockedProjectId ? `?projectId=${lockedProjectId}` : '';
    try { await api.post(`/sales/reject/${s.id}${suffix}`); toast('Separación rechazada. Lote liberado.'); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  }

  async function exportSalePdf(s: S) {
    const schedule: any[] = await api.get<any[]>(`/sales/${s.id}/schedule`).catch(() => []);
    const project = projects.find((p: any) => Number(p.id) === Number(s.projectId));
    const adminLogoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo/dunacon.png` : '/logo/dunacon.png';
    const projectLogoUrl = project?.logoImageUrl || '';
    const formaPago = Number(s.totalCuotas || 0) > 0 ? 'Al credito' : 'Contado';
    const salePriceValue = Number(s.salePrice || 0);
    const commission = Number(s.commission || 0);
    const financingBase = Number(s.financingBase || salePriceValue);
    const valorCuota = Number(s.valorCuota || schedule[0]?.amount || 0);
    const paidInstallments = schedule.filter((row) => row.status === 'pagado').length;
    const detailRows = [
      ['Proyecto', project?.name || `Proyecto ${s.projectId}`],
      ['Lote', s.lotCode || `Lote ${s.lotId}`],
      ['Cliente', s.clientName || '-'],
      ['Agente', s.agentName || '-'],
      ['Precio Venta', formatMoney(s.salePrice)],
      ['Fecha', formatDate(s.saleDate)],
      ['Forma de Pago', formaPago],
      ['Nro de Cuotas', s.totalCuotas || 0],
      ['Comision', formatMoney(commission)],
      ['Saldo a Financiar', formatMoney(financingBase)],
      ['Interes', s.interestType === 'tea' ? `Con TEA = ${Number(s.tea || 0)}%` : 'Sin intereses'],
      ['Estado', s.approvalStatus === 'pendiente' ? 'Pendiente' : 'Aprobada'],
    ];
    const scheduleRows = schedule.map((row) => `
      <tr><td>Cuota ${escapeHtml(row.installmentNo || '-')}</td><td>${escapeHtml(formatDate(row.dueDate))}</td><td class="num">${escapeHtml(formatMoney(row.amount))}</td><td>${escapeHtml(row.status || '-')}</td></tr>
    `).join('');
    printHtml(`
      <html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Ficha de venta V${s.id}</title><style>
        body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#171717;background:white}.brand{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;border-bottom:3px solid #1877F2;padding-bottom:14px;margin-bottom:16px}.logos{display:flex;align-items:center;gap:12px}.logos img{height:42px;max-width:150px;object-fit:contain}.eyebrow{margin:0 0 5px;color:#1877F2;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:24px;line-height:1.15;color:#111827}h2{font-size:13px;margin:18px 0 8px;color:#1259C4;text-transform:uppercase;letter-spacing:.04em}p{margin:4px 0 0;color:#6B7280;font-size:12px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0 18px}.summary div{border:1px solid #E5E7EB;background:#F8FAFC;padding:9px 10px;border-radius:6px}.summary span{display:block;color:#6B7280;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.summary strong{display:block;margin-top:4px;color:#111827;font-size:12px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px;background:white}th{background:#1877F2;color:white;border:1px solid #1877F2;padding:8px 7px;font-size:10px;text-align:left;text-transform:uppercase}td{border:1px solid #E5E7EB;padding:8px 7px;font-size:11px;vertical-align:top}tbody tr:nth-child(even){background:#F8FAFC}.label{background:#D8E8FF;font-weight:700;color:#111827;width:34%}.num{text-align:right;white-space:nowrap;font-weight:700;color:#1259C4}.watermark{position:fixed;left:50%;top:54%;transform:translate(-50%,-50%) rotate(-28deg);opacity:.06;z-index:-1}.watermark img{width:560px;max-width:72vw}.footer{margin-top:18px;border-top:1px solid #E5E7EB;padding-top:8px;color:#6B7280;font-size:10px;text-align:right}
        @media (max-width:640px){body{margin:12px}.brand{flex-direction:column;gap:10px}.logos img{height:32px;max-width:120px}h1{font-size:17px}h2{font-size:11px;margin:14px 0 6px}p{font-size:11px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}table{table-layout:auto}th,td{padding:5px 4px;font-size:9px}.watermark img{width:300px}}
        @media print{body{margin:18px}thead{display:table-header-group}.brand,.summary{break-inside:avoid}.watermark{position:fixed}}
      </style></head><body>
        <div class="watermark"><img src="${escapeHtml(adminLogoUrl)}" alt="" /></div>
        <div class="brand"><div><p class="eyebrow">Ficha de venta</p><h1>Venta V${s.id} - ${escapeHtml(s.lotCode || `Lote ${s.lotId}`)}</h1><p>${escapeHtml(project?.name || `Proyecto ${s.projectId}`)} - generado ${new Date().toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</p></div><div class="logos">${projectLogoUrl ? `<img src="${escapeHtml(projectLogoUrl)}" alt="Proyecto" />` : ''}<img src="${escapeHtml(adminLogoUrl)}" alt="Dunacon" /></div></div>
        <div class="summary"><div><span>Precio venta</span><strong>${escapeHtml(formatMoney(s.salePrice))}</strong></div><div><span>Comision</span><strong>${escapeHtml(formatMoney(commission))}</strong></div><div><span>Forma de pago</span><strong>${escapeHtml(formaPago)}</strong></div><div><span>Cuota</span><strong>${escapeHtml(valorCuota ? formatMoney(valorCuota) : '-')}</strong></div></div>
        <h2>Datos de la venta</h2><table><tbody>${detailRows.map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>
        <h2>Financiamiento</h2><table><thead><tr><th>Cuota</th><th>Vencimiento</th><th>Monto</th><th>Estado</th></tr></thead><tbody>${scheduleRows || '<tr><td colspan="4">Sin cronograma registrado.</td></tr>'}</tbody></table>
        <div class="summary"><div><span>Cuotas</span><strong>${Number(s.totalCuotas || 0)}</strong></div><div><span>Pagadas</span><strong>${paidInstallments}</strong></div><div><span>Pendientes</span><strong>${Math.max(0, schedule.length - paidInstallments)}</strong></div><div><span>Plan</span><strong>${escapeHtml(s.planStatus || 'pendiente')}</strong></div></div><div class="footer">Dunacon - CRM Inmobiliario</div>
      </body></html>
    `);
  }

  const total = summary.totalAmount || rows.reduce((s, r) => s + Number(r.salePrice || 0), 0);
  const comm = summary.totalCommission || rows.reduce((s, r) => s + Number(r.commission || 0), 0);
  const totalSales = summary.totalSales || rows.length;
  const soldArea = rows.reduce((sum, row) => sum + Number(row.lotAreaM2 || 0), 0);
  const financingTotal = [...rows, ...pending].reduce((sum, row) => sum + Number(row.financingBase || 0), 0);
  const initialPaymentTotal = [...rows, ...pending].reduce((sum, row) => sum + initialPaymentOf(row), 0);

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Resumen de ventas</h3>
          <CurrencyToggle
            currency={currency}
            setCurrency={setCurrency}
            exchangeRate={displayRate}
            setExchangeRate={setDisplayRate}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 xl:gap-4">
          <SalesMetric label="Area Vendida m2" value={soldArea.toLocaleString('es-PE', { maximumFractionDigits: 2 })} icon={<FiHome />} tone="#1259C4" />
          <SalesMetric label="Lotes vendidos" value={String(totalSales)} icon={<FiCheckCircle />} tone="#0F8B5F" />
          <SalesMetric label="Monto total vendido" value={show(total)} icon={<FiDollarSign />} tone="#171717" />
          <SalesMetric label="Financiamiento D." value={show(financingTotal)} icon={<FiTrendingUp />} tone="#1259C4" />
          <SalesMetric label="Comisiones devengadas" value={show(comm)} icon={<FiPercent />} tone="#B45309" />
          <SalesMetric label="Separaciones" value={pending.length} icon={<FiBookmark />} tone="#0E7490" />
          <SalesMetric label="Pago Inicial" value={show(initialPaymentTotal)} icon={<FiArrowDownCircle />} tone="#1259C4" />
        </div>
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className="input !w-64" placeholder="Buscar lote, cliente o agente..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && (<button className="btn-neutral !h-9 text-xs" onClick={() => { setSearch(''); setDebouncedSearch(''); }}>Limpiar</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input !w-auto !h-9 !text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} title="Estado de aprobación">
                <option value="">Estado: Todas</option>
                <option value="aprobada">Aprobadas</option>
                <option value="pendiente">Pendientes</option>
              </select>
              <select className="input !w-auto !h-9 !text-xs" value={agentFilter} onChange={(e) => setAgentFilter(Number(e.target.value))} title="Asesor">
                <option value={0}>Asesor: Todos</option>
                {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                Desde <input className="input !w-36 !h-9 !text-xs" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                Hasta <input className="input !w-36 !h-9 !text-xs" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </label>
              {hasFilters && (<button className="btn-neutral !h-9 text-xs" onClick={limpiarFiltros}>Limpiar filtros</button>)}
            </div>
            <button className="btn-primary" onClick={() => setOpen(true)}>Registrar venta</button>
          </div>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Un lote Vendido no puede volver a venderse. El sistema lo valida.</p>
        </div>

        {isAdmin && pending.length > 0 && (
          <div className="card p-0 overflow-auto">
            <h3 className="font-semibold px-4 pt-4">Separaciones por aprobar ({pending.length})</h3>
            <table className="table-base mt-2" style={{ width: '100%', minWidth: 960 }}>
              <thead><tr>
                <th className="th-base">Id</th><th className="th-base">Lote</th><th className="th-base">Cliente</th>
                <th className="th-base">Precio</th><th className="th-base">Forma de pago</th><th className="th-base">Cuotas</th>
                <th className="th-base">Cuotas sin intereses</th><th className="th-base">Fecha</th>
                <th className="th-base">Agente</th><th className="th-base">Comisión</th><th className="th-base" style={{ textAlign: 'center' }}>Acción</th>
                <th className="th-base" style={{ textAlign: 'center' }}>Ficha</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((s) => (
                  <tr key={s.id}>
                    <td className="td-base text-slate-400">V{s.id}</td>
                    <td className="td-base font-medium">{s.lotCode || `Lote ${s.lotId}`}</td>
                    <td className="td-base">{s.clientName || '—'}</td>
                    <td className="td-base font-medium">{show(s.salePrice)}</td>
                    <td className="td-base">{s.totalCuotas ? 'Al crédito' : 'Contado'}</td>
                    <td className="td-base">{s.totalCuotas || 0}</td>
                    <td className="td-base">{s.interestType !== 'tea' ? (s.totalCuotas || 0) : '—'}</td>
                    <td className="td-base">{formatDate(s.saleDate)}</td>
                    <td className="td-base">{s.agentName || '—'}</td>
                    <td className="td-base">{show(s.commission)}</td>
                    <td className="td-base" style={{ textAlign: 'center' }}>
                      <button type="button" className="inline-grid h-8 w-8 place-items-center rounded-md border text-[#1877F2] hover:bg-slate-50" style={{ borderColor: '#E5E7EB' }} onClick={() => exportSalePdf(s)} title="Descargar ficha">
                        <FiDownload />
                      </button>
                    </td>
                    <td className="td-base whitespace-nowrap">
                      <div className="flex justify-center gap-1.5">
                        <button className="btn-primary !h-7 text-xs" onClick={() => aprobar(s)}>Aprobar</button>
                        <button className="btn-danger !h-7 text-xs" onClick={() => rechazar(s)}>Rechazar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card p-0 overflow-auto">
          {loading ? <p className="p-4 text-slate-400">Cargando…</p>
            : rows.length === 0 ? <EmptyState text="Aún no hay ventas registradas." /> : (
            <>
            <table className="table-base" style={{ width: '100%', minWidth: 960 }}>
              <thead><tr>
                <th className="th-base cursor-pointer select-none" onClick={() => toggleSort('createdAt')} title="Ordenar por fecha de registro">Id{sortArrow('createdAt')}</th><th className="th-base">Lote</th><th className="th-base">Cliente</th>
                <th className="th-base cursor-pointer select-none" onClick={() => toggleSort('salePrice')}>Precio{sortArrow('salePrice')}</th><th className="th-base">Forma de pago</th><th className="th-base">Cuotas</th>
                <th className="th-base">Cuotas sin intereses</th><th className="th-base">Estado</th>
                <th className="th-base cursor-pointer select-none" onClick={() => toggleSort('saleDate')}>Fecha{sortArrow('saleDate')}</th><th className="th-base">Agente</th><th className="th-base">Comisión</th>
                <th className="th-base" style={{ textAlign: 'center' }}>Ficha</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="td-base text-slate-400">V{s.id}</td>
                    <td className="td-base font-medium">{s.lotCode || `Lote ${s.lotId}`}</td>
                    <td className="td-base">{s.clientName || '—'}</td>
                    <td className="td-base font-medium">{show(s.salePrice)}</td>
                    <td className="td-base">{s.totalCuotas ? 'Al crédito' : 'Contado'}</td>
                    <td className="td-base">{s.totalCuotas || 'Contado'}</td>
                    <td className="td-base">{s.interestType !== 'tea' ? (s.totalCuotas || 0) : '—'}</td>
                    <td className="td-base">{s.approvalStatus === 'pendiente' ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:'#FEF3C7', color:'#92400E' }}>Pendiente</span> : <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:'#D1FAE5', color:'#065F46' }}>Aprobada</span>}</td>
                    <td className="td-base">{formatDate(s.saleDate)}</td>
                    <td className="td-base">{s.agentName || '—'}</td>
                    <td className="td-base">{show(s.commission)}</td>
                    <td className="td-base" style={{ textAlign: 'center' }}>
                      <button type="button" className="inline-grid h-8 w-8 place-items-center rounded-md border text-[#1877F2] hover:bg-slate-50" style={{ borderColor: '#E5E7EB' }} onClick={() => exportSalePdf(s)} title="Descargar ficha">
                        <FiDownload />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0B2F6E' }}>
                  <td className="td-base font-bold text-white" colSpan={3}>Totales ({totalSales})</td>
                  <td className="td-base font-bold text-white">{show(total)}</td>
                  <td className="td-base" colSpan={6}></td>
                  <td className="td-base font-bold text-white">{show(comm)}</td>
                  <td className="td-base"></td>
                </tr>
              </tfoot>
            </table>
            <div className="px-4 pb-4"><PaginationBar page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={(n) => { setLimit(n); setPage(1); }} label="Ventas" /></div>
            </>
            )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 sm:p-6">
            <div className="mb-4">
              <h3 className="font-semibold" style={{ fontSize: 17 }}>Registrar venta</h3>
              <p className="mt-0.5 text-xs text-slate-500">Filtra la cotizacion por cliente o fecha y asignala para autocompletar la ficha.</p>
            </div>

            <div className="rounded-xl border p-3 mb-4" style={{ borderColor: '#A9C9FB', background: '#F8FBFF' }}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <label className="block">
                  <span className="label">Cliente o lote</span>
                  <input
                    className="input !h-9 text-sm"
                    placeholder="Nombre, telefono o codigo"
                    value={quoteSearch}
                    onChange={(e) => { setQuoteSearch(e.target.value); setShowCotizaciones(true); }}
                  />
                </label>
                <label className="block">
                  <span className="label">Desde</span>
                  <input type="date" className="input !h-9 text-sm" value={quoteFrom} onChange={(e) => setQuoteFrom(e.target.value)} />
                </label>
                <label className="block">
                  <span className="label">Hasta</span>
                  <input type="date" className="input !h-9 text-sm" value={quoteTo} onChange={(e) => setQuoteTo(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="btn-primary h-9 whitespace-nowrap"
                  onClick={() => setShowCotizaciones((v) => !v)}
                >
                  {showCotizaciones ? 'Ocultar lista' : 'Asignar cotizacion'}
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>{availableQuotes.length} cotizacion{availableQuotes.length === 1 ? '' : 'es'} disponible{availableQuotes.length === 1 ? '' : 's'}</span>
                {(quoteSearch || quoteFrom || quoteTo) && (
                  <button type="button" className="font-semibold" style={{ color: '#1259C4' }} onClick={() => { setQuoteSearch(''); setQuoteFrom(''); setQuoteTo(''); }}>
                    Limpiar filtros
                  </button>
                )}
              </div>

              {showCotizaciones && (
                <div className="mt-2 rounded-lg border bg-white overflow-hidden" style={{ borderColor: '#D6E4FB' }}>
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: '#F0F1F3' }}>
                    <span className="text-xs font-semibold" style={{ color: '#1259C4' }}>Elige una cotizacion</span>
                    <button type="button" className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setShowCotizaciones(false)}>Cerrar</button>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y" style={{ borderColor: '#F0F1F3' }}>
                    {availableQuotes.map((q: any) => (
                      <button key={q.id} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 text-left"
                        onClick={() => selectQuote(q)}>
                        <span>
                          <span className="font-semibold">Q{q.id}</span> · Lote {q.lotCode || q.lotId} · {q.clientName || 'Sin cliente'}
                          <span className="block text-xs text-slate-500">
                            {q.paymentMethod === 'credito' ? `Al crédito · ${Number(q.totalCuotas || 0)} cuotas` : 'Contado'}
                            {q.createdAt ? ` · ${new Date(q.createdAt).toLocaleDateString('es-PE')}` : ''}
                          </span>
                        </span>
                        <b>{formatMoney(Math.round(Number(q.finalPriceUsd || 0) * Number(q.exchangeRate || 1)))}</b>
                      </button>
                    ))}
                    {availableQuotes.length === 0 && (
                      <p className="px-3 py-4 text-xs text-slate-400 text-center">No hay cotizaciones que coincidan con el filtro.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 mb-4 text-sm" style={{ borderColor: selectedQuote ? '#BBF7D0' : '#BFDBFE', background: selectedQuote ? '#F0FDF4' : '#EFF6FF' }}>
              {selectedQuote ? (
                <p className="font-semibold" style={{ color: '#166534' }}>
                  Cotización Q{selectedQuote.id} cargada: precio final, cliente y forma de pago vienen de la cotización.
                </p>
              ) : showQuoteHint ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p style={{ color: '#1259C4' }}>Para registrar una venta primero selecciona una cotización. Si no existe, genera una y vuelve a cargarla aquí.</p>
                  <a
                    className="btn-primary"
                    href={quoteProjectId ? `/projects/${quoteProjectId}/quotes${lotId ? `?lotId=${lotId}` : ''}` : '/projects'}
                  >
                    Generar cotización
                  </a>
                </div>
              ) : null}
            </div>

            {/* Lote y responsable */}
            <div className="grid grid-cols-2 gap-3">
              {!lockedProjectId && (
                <Field label="Proyecto" className="col-span-2">
                  <select className="input" value={projectId} onChange={(e) => { setProjectId(Number(e.target.value)); setLotId(0); setSelectedQuoteId(0); setSelectedQuoteSnapshot(null); setSalePrice(0); }}>
                    <option value={0}>Auto / Todos</option>
                    {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Lote *">
                <select className="input" value={lotId} onChange={(e) => selectLot(Number(e.target.value))}>
                  <option value={0}>Selecciona…</option>
                  {lots.filter((l: any) => l.status !== 'vendido' && l.sellingStage !== 'vendido' && l.sellingStage !== 'separado' && (!projectId || Number(l.projectId) === Number(projectId))).map((l: any) => (
                    <option key={l.id} value={l.id}>Lote {l.code} — {formatMoney(l.salePrice || l.price)}</option>
                  ))}
                </select>
              </Field>
              <div className="hidden"><Field label="Cliente"><select className="input" value={clientId} onChange={(e) => setClientId(Number(e.target.value))}><option value={0}>— Sin asignar —</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{(c.fullName || c.full_name || '— Sin nombre —')}</option>)}</select></Field></div>
              <Field label="Agente *"><select className="input" value={agentId} onChange={(e) => setAgentId(Number(e.target.value))}><option value={0}>Selecciona…</option>{agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>
            {lotId > 0 && salePrice > 0 && (
              <p className="text-xs mt-1" style={{ color: '#1259C4' }}>
                {selectedQuote ? 'Precio final cargado desde la cotizacion seleccionada.' : 'Precio referencial autocompletado desde el Precio Venta de Lotizacion de este lote.'}
              </p>
            )}

            <div className="mt-3 rounded-md border bg-white p-3" style={{ borderColor: '#E5E7EB' }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Nombre del cliente *">
                  <input
                    className="input"
                    value={clientName}
                    onChange={(e) => { setClientName(e.target.value); setClientId(0); }}
                    placeholder="Escribe el cliente real"
                  />
                </Field>
                <button type="button" className="btn-neutral" onClick={() => assignClientByName(true)}>Asignar</button>
              </div>
              {clientId > 0 && <p className="mt-2 text-xs text-emerald-600">Cliente asignado a la venta.</p>}
              <div className="mt-3">
                <Field label="Buscar cliente existente (opcional)">
                  <select
                    className="input"
                    value={clientId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setClientId(id);
                      const client = clients.find((c: any) => Number(c.id) === id);
                      setClientName(client ? (client.fullName || client.full_name || '') : '');
                    }}
                  >
                    <option value={0}>Nuevo cliente o sin seleccionar</option>
                    {clients.map((c: any) => <option key={c.id} value={c.id}>{(c.fullName || c.full_name || 'Sin nombre')}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            {/* Monto y fecha */}
            <div className="border-t mt-4 pt-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Precio de venta (S/)*">
                  <input
                    type="number"
                    className="input"
                    value={salePrice || ''}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                  />
                </Field>
                <Field label="Precio de venta (US$)">
                  <input
                    type="number"
                    className="input"
                    value={salePriceUsd || ''}
                    onChange={(e) => setSalePrice(Math.round(Number(e.target.value || 0) * exchangeRate))}
                  />
                </Field>
                <Field label="T. cambio (S/ por US$)">
                  <input
                    type="number"
                    step="0.0001"
                    className="input"
                    value={exchangeRate || ''}
                    onChange={(e) => setExchangeRate(Number(e.target.value))}
                  />
                </Field>
                <Field label="Fecha"><input type="date" className="input" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></Field>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Ambos precios se calculan con el tipo de cambio: {formatMoney(salePrice)} = US$ {salePriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Forma de pago */}
            <div className="border-t mt-4 pt-3">
              <Field label="Forma de pago">
                <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>

            {paymentMethod !== 'Contado' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Cuota inicial (S/)"><input type="number" className="input" value={cuotaInicial || ''} onChange={(e) => setCuotaInicial(Number(e.target.value))} /></Field>
                  <Field label="Nº de cuotas"><input type="number" min={0} max={120} className="input" value={totalCuotas} onChange={(e) => setTotalCuotas(Number(e.target.value))} /></Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Interés">
                    <select className="input" value={interestType} onChange={(e) => setInterestType(e.target.value as any)}>
                      <option value="sin_intereses">Sin intereses</option>
                      <option value="tea">Con TEA</option>
                    </select>
                  </Field>
                  {interestType === 'tea' && (
                    <Field label="TEA (%)"><input type="number" className="input" value={tea || ''} onChange={(e) => setTea(Number(e.target.value))} /></Field>
                  )}
                </div>

                {preview && preview.totalCuotas > 0 && (
                  <div className="rounded-xl bg-canvas p-4 mt-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">Saldo a financiar:</span><b>{formatMoney(preview.saldoFinanciar)}</b></div>
                    {preview.installments?.filter((t: any) => t.count > 0).map((t: any, i: number) => (
                      <div key={i} className="flex justify-between"><span className="text-slate-600">{t.count} cuotas de:</span><b>{formatMoney(t.amount)}</b></div>
                    ))}
                  </div>
                )}
              </>
            )}

            <Field label="Condiciones"><textarea className="input mt-3" value={conditions} onChange={(e) => setConditions(e.target.value)} /></Field>

            <div className="flex justify-end gap-2 pt-4 mt-1 border-t">
              <button className="btn-neutral" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={async () => { await registrar(); setPage(1); load(); }}>Registrar venta</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
