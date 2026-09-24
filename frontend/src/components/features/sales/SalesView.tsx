'use client';
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Toaster, toast, Field, EmptyState } from '@/components/ui/ui';
import { MetricTile } from '@/components/ui/Metrics';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { api } from '@/lib/api';
import { normalizePaginated, buildQuery } from '@/lib/pagination';
import { buildQuoteAssignedValues, findLotById, formatAmountIn, loadAllSalesQuotes, lotReferencePrice, type SaleCurrency } from './salesQuotes';
import { formatMoney, formatDate } from '@/lib/types';
import { DEFAULT_EXCHANGE_RATE, useDisplayCurrency } from '@/lib/currency';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import { Select } from '@/components/ui/Select';
import { printHtml } from '@/lib/print';
import { FiDownload, FiHome, FiCheckCircle, FiDollarSign, FiTrendingUp, FiPercent, FiBookmark, FiArrowDownCircle, FiCalendar, FiChevronDown, FiFilter, FiSearch, FiSliders, FiX } from 'react-icons/fi';

function SalesMetric({ label, value, icon, tone = '#1877F2' }: { label: string; value: ReactNode; icon: ReactNode; tone?: string }) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const len = text.length;
  const valueSize = len > 13 ? 'sm:text-[13px] lg:text-sm' : len > 10 ? 'sm:text-sm lg:text-base' : 'sm:text-base lg:text-[18px]';

  return (
    <MetricTile
      label={label}
      value={<span className={valueSize}>{value}</span>}
      icon={icon}
      tone={tone}
      truncateLabel
    />
  );
}

type FilterOption = { value: string | number; label: string };

function FilterSelect({
  value,
  onChange,
  options,
  allValue = '',
  placeholder = 'Todos',
  icon,
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  options: FilterOption[];
  allValue?: string | number;
  placeholder?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value));
  return (
    <div className={open ? 'relative z-30' : 'relative'}>
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">{icon}</span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`input !h-10 w-full max-w-full truncate cursor-pointer ${icon ? '!pl-9' : ''} !rounded-xl border-slate-200 bg-white text-left shadow-sm`}
      >
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-slate-700">{selected ? selected.label : placeholder}</span>
          <FiChevronDown className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <>
          <button type="button" aria-hidden className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[0_16px_32px_rgba(15,23,42,0.14)]">
            <button
              type="button"
              onClick={() => { onChange(allValue); setOpen(false); }}
              className={`block w-full truncate px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#F3F8FF] ${String(allValue) === String(value) ? 'font-semibold text-[#1259C4]' : 'text-slate-500'}`}
            >
              {placeholder}
            </button>
            {options.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                title={o.label}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`block w-full truncate px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#F3F8FF] ${String(o.value) === String(value) ? 'font-semibold text-[#1259C4]' : 'text-slate-700'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
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

const SALE_CURRENCY_KEY = 'crm_sale_entry_currency';

function readSaleCurrency(): SaleCurrency {
  if (typeof window === 'undefined') return 'PEN';
  try { return window.localStorage.getItem(SALE_CURRENCY_KEY) === 'USD' ? 'USD' : 'PEN'; } catch { return 'PEN'; }
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
  const [sessionUser, setSessionUser] = useState<any>(null);
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
  const [initialPaymentMode, setInitialPaymentMode] = useState<'contado' | 'partes'>('contado');
  const [initialParts, setInitialParts] = useState(3);
  const [graceMonths, setGraceMonths] = useState(0);
  const [applyInterest, setApplyInterest] = useState(false);
  const [interestType, setInterestType] = useState<'sin_intereses' | 'tea'>('sin_intereses');
  const [tea, setTea] = useState(0);
  const [saleDate, setSaleDate] = useState(todayInput());
  const [conditions, setConditions] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [saleCurrency, setSaleCurrencyState] = useState<SaleCurrency>('PEN');
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
    try {
      const storedUser = JSON.parse(localStorage.getItem('crm_user') || 'null');
      setSessionUser(storedUser);
      if (storedUser?.role === 'agent' && storedUser?.id) setAgentId(Number(storedUser.id));
    } catch { setSessionUser(null); }
  }, []);

  useEffect(() => {
    setIsAdmin(role === 'admin' || role === 'superadmin');
    api.get<any[]>('/projects').then(setProjects).catch(() => {});
    api.get<any[]>('/clients').then((d) => setClients(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
    if (role === 'admin' || role === 'superadmin') api.get<any[]>('/users/agents').then(setAgents).catch(() => {});
    api.get<any[]>('/lots').then((d) => setLots(Array.isArray(d) ? d : ((d as any)?.items || []))).catch(() => {});
    loadAllSalesQuotes(api, lockedProjectId).then(setQuotes).catch(() => {});
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
    const quoteStatus = String(q.status || 'enviada');
    if (!['enviada', 'actualizada'].includes(quoteStatus)) return false;
    const lotStage = String(q.lotSellingStage || '').toLowerCase();
    const lotStatus = String(q.lotStatus || '').toLowerCase();
    if (lotStage && lotStage !== 'disponible') return false;
    if (lotStatus && lotStatus === 'vendido') return false;
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
  const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const salePriceDisplay = round2(salePrice);
  const salePriceUsd = exchangeRate > 0 ? round2(salePrice / exchangeRate) : 0;
  const exchangeRateDisplay = round2(exchangeRate);
  const quoteProjectId = lockedProjectId || projectId || Number(selectedLot?.projectId || 0);

  useEffect(() => {
    if (!open) return;
    const stored = readSaleCurrency();
    setSaleCurrencyState(stored);
    if (!(exchangeRate > 0)) setExchangeRate(displayRate > 0 ? displayRate : DEFAULT_EXCHANGE_RATE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toPen = useCallback(
    (amountInEntryCurrency: number) => (saleCurrency === 'USD' ? round2(Number(amountInEntryCurrency || 0) * exchangeRate) : round2(Number(amountInEntryCurrency || 0))),
    [saleCurrency, exchangeRate],
  );
  const fromPen = useCallback(
    (amountInPen: number) => (saleCurrency === 'USD' ? round2(Number(amountInPen || 0) / (exchangeRate || DEFAULT_EXCHANGE_RATE)) : round2(Number(amountInPen || 0))),
    [saleCurrency, exchangeRate],
  );

  function setSaleCurrency(next: SaleCurrency) {
    if (next === saleCurrency) return;
    setSalePrice((current) => (next === 'USD' ? round2(current / (exchangeRate || DEFAULT_EXCHANGE_RATE)) : round2(current * (exchangeRate || DEFAULT_EXCHANGE_RATE))));
    setCuotaInicial((current) => (next === 'USD' ? round2(current / (exchangeRate || DEFAULT_EXCHANGE_RATE)) : round2(current * (exchangeRate || DEFAULT_EXCHANGE_RATE))));
    setSaleCurrencyState(next);
    try { window.localStorage.setItem(SALE_CURRENCY_KEY, next); } catch { /* noop */ }
  }


  const lotOptionLabel = (lot: any, fromQuote = false) =>
    `Lote ${lot?.code || lot?.id} — ${formatMoney(lotReferencePrice(lot))}${fromQuote ? ' (de la cotización)' : ''}`;
  const lotOptions = (() => {
    const list = lots.filter((l: any) =>
      l.status !== 'vendido' && l.sellingStage !== 'vendido' && l.sellingStage !== 'separado'
      && (!projectId || Number(l.projectId) === Number(projectId)));
    const inList = list.some((l: any) => Number(l.id) === Number(lotId));
    if (lotId && !inList) {
      const extra = selectedLot || { id: lotId, code: selectedQuote?.lotCode, price: 0 };
      return [extra, ...list];
    }
    return list;
  })();

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

  async function selectQuote(q: any) {
    const values = buildQuoteAssignedValues(q, { today: todayInput(), lockedProjectId, currentProjectId: projectId });

    setExchangeRate(values.exchangeRate);
    setSelectedQuoteId(values.quoteId);
    setSelectedQuoteSnapshot(q);
    setProjectId(values.projectId);
    setLotId(values.lotId);
    setClientName(values.clientName);
    setSalePrice(values.salePricePen);
    setPaymentMethod(values.paymentMethod);
    setCuotaInicial(values.cuotaInicialPen);
    setTotalCuotas(values.totalCuotas);
    setInitialPaymentMode(values.initialPaymentMode);
    setInitialParts(values.initialParts);
    setGraceMonths(values.graceMonths);
    setApplyInterest(values.interestType === 'tea');
    setInterestType(values.interestType);
    setTea(values.tea);
    setSaleDate(values.saleDate);
    setConditions((current) => (current ? current : values.cotizacionNote));
    setShowCotizaciones(false);
    setPreview(null);

    // El cliente de la cotizacion se reutiliza si ya existe en la cartera.
    const match = clients.find((c: any) => {
      const fullName = String(c.fullName || c.full_name || '').trim().toLowerCase();
      return fullName && fullName === values.clientName.trim().toLowerCase();
    });
    setClientId(match ? Number(match.id) : 0);

    if (!values.lotId) {
      toast('La cotización no tiene lote asignado. Selecciona el lote manualmente.', 'err');
      return;
    }

    const known = lots.find((l: any) => Number(l.id) === Number(values.lotId));
    if (!known) {
      try {
        const lot = await findLotById(api, values.lotId, []);
        if (lot) setLots((current) => (current.some((l: any) => Number(l.id) === Number(lot.id)) ? current : [lot, ...current]));
      } catch { /* si falla, el usuario puede elegir el lote a mano */ }
    } else if (Number(known.projectId) !== Number(values.projectId)) {
      setProjectId(Number(known.projectId || values.projectId));
    }

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
        totalCuotas, cuotaInicial, graceMonths: applyInterest ? graceMonths : 0, interestType: applyInterest ? 'tea' : 'sin_intereses', tea: applyInterest ? tea : undefined,
        paymentMethod,
      }).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [open, salePrice, totalCuotas, cuotaInicial, graceMonths, applyInterest, tea, paymentMethod, projectId, lotId, agentId]);

  async function registrar() {
    if (!selectedQuoteId) return toast('Selecciona una cotizacion antes de registrar la venta. Si no existe, genera una primero.', 'err');
    if (!lotId) return toast('Selecciona un lote', 'err');
    if (!clientName.trim() && !clientId) return toast('Ingresa el nombre del cliente real.', 'err');
    if (!agentId) return toast('No se pudo identificar el agente logueado', 'err');
    if (!salePrice) return toast('Ingresa el precio de venta', 'err');
    if (!saleDate) return toast('Selecciona la fecha de venta', 'err');
    if (!(Number(exchangeRate) > 0)) return toast('Ingresa un tipo de cambio valido', 'err');
    if (paymentMethod !== 'Contado') {
      if (!(Number(totalCuotas) > 0)) return toast('Ingresa el numero de cuotas del financiamiento', 'err');
      if (!(Number(cuotaInicial) > 0)) return toast('Ingresa la cuota inicial', 'err');
      if (Number(cuotaInicial) >= Number(salePrice)) return toast('La cuota inicial debe ser menor al precio de venta', 'err');
      if (initialPaymentMode === 'partes' && !(Number(initialParts) >= 2 && Number(initialParts) <= 24)) return toast('Ingresa un numero de partes valido para la inicial', 'err');
      if (applyInterest && !(Number(tea) > 0)) return toast('Ingresa la TEA para las cuotas con interes', 'err');
      if (applyInterest && Number(graceMonths) > Number(totalCuotas)) return toast('Las cuotas sin interes no pueden superar el total de cuotas', 'err');
    }
    try {
      const lot = lots.find((l) => l.id === Number(lotId));
      const resolvedClientId = clientId || await assignClientByName(false);
      if (!resolvedClientId) return;
      const sale = selectedQuote || null;
      await api.post('/sales', {
        projectId: lockedProjectId || projectId || lot?.projectId || 1, lotId: Number(lotId),
        clientId: resolvedClientId, agentId: Number(agentId), salePrice,
        exchangeRate: Number(exchangeRate) > 0 ? Number(exchangeRate) : undefined,
        paymentMethod,
        totalCuotas: paymentMethod === 'Contado' ? undefined : (totalCuotas || undefined),
        cuotaInicial: paymentMethod === 'Contado' ? undefined : (cuotaInicial || undefined),
        initialPaymentMode: paymentMethod === 'Contado' ? undefined : initialPaymentMode,
        initialParts: paymentMethod !== 'Contado' && initialPaymentMode === 'partes' ? initialParts : undefined,
        graceMonths: paymentMethod !== 'Contado' && applyInterest ? graceMonths : undefined,
        interestType: paymentMethod === 'Contado' ? undefined : (applyInterest ? 'tea' : 'sin_intereses'),
        tea: paymentMethod !== 'Contado' && applyInterest ? tea : undefined,
        quoteId: sale?.id ? Number(sale.id) : (selectedQuoteId || undefined),
        saleDate: saleDate || undefined,
        conditions: (selectedQuoteId && !/cotizacion\s*q\d+/i.test(conditions))
          ? [conditions.trim(), `Cotizacion Q${selectedQuoteId}`].filter(Boolean).join(' | ')
          : (conditions || undefined),
      });
      toast('Separación registrada. Queda pendiente de validación.');
      setOpen(false); setLotId(0); setSelectedQuoteId(0); setSelectedQuoteSnapshot(null); setClientId(0); setClientName(''); setConditions(''); setSalePrice(0);
      setPaymentMethod('Contado'); setTotalCuotas(0); setCuotaInicial(0); setInitialPaymentMode('contado'); setInitialParts(3); setGraceMonths(0); setApplyInterest(false); setInterestType('sin_intereses'); setTea(0);
      setSaleDate(todayInput()); setAgentId(role === 'agent' ? Number(sessionUser?.id || 0) : 0); setPreview(null);
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
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 xl:gap-3">
          <SalesMetric label="Area Vendida m2" value={soldArea.toLocaleString('es-PE', { maximumFractionDigits: 2 })} icon={<FiHome />} tone="#1259C4" />
          <SalesMetric label="Lotes vendidos" value={String(totalSales)} icon={<FiCheckCircle />} tone="#0F8B5F" />
          <SalesMetric label="Monto total vendido" value={show(total)} icon={<FiDollarSign />} tone="#171717" />
          <SalesMetric label="Financiamiento D." value={show(financingTotal)} icon={<FiTrendingUp />} tone="#1259C4" />
          <SalesMetric label="Comisiones devengadas" value={show(comm)} icon={<FiPercent />} tone="#B45309" />
          <SalesMetric label="Separaciones" value={pending.length} icon={<FiBookmark />} tone="#0E7490" />
          <SalesMetric label="Pago Inicial" value={show(initialPaymentTotal)} icon={<FiArrowDownCircle />} tone="#1259C4" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-[#F2F7FF] shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 rounded-t-2xl border-b border-slate-200/80 bg-white/60 px-4 py-3 backdrop-blur-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="relative w-full max-w-md flex-1">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input !h-10 !w-full !pl-9 !rounded-xl border-slate-200 bg-white shadow-sm transition-all focus:border-[#1877F2]/40 focus:ring-2 focus:ring-[#1877F2]/10"
                    placeholder="Buscar lote, cliente o agente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {search && (
                  <button className="btn-neutral !h-10 !px-3 text-xs" onClick={() => { setSearch(''); setDebouncedSearch(''); }}>
                    <FiX className="mr-1" /> Limpiar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 self-end xl:self-auto">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#D8E6FF] bg-[#EEF5FF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1355C4]">
                  <FiSliders />
                  {hasFilters ? `${Object.values({ statusFilter, agentFilter, fromDate, toDate, search: search ? 'search' : '' }).filter(Boolean).length} activos` : 'Sin filtros'}
                </span>
                <button className="btn-primary !h-10" onClick={() => setOpen(true)}>Registrar venta</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Estado">
              <FilterSelect
                value={statusFilter}
                onChange={(v) => setStatusFilter(String(v))}
                allValue=""
                options={[
                  { value: 'aprobada', label: 'Aprobadas' },
                  { value: 'pendiente', label: 'Pendientes' },
                ]}
                placeholder="Todos"
                icon={<FiFilter />}
              />
            </Field>

            <Field label="Asesor">
              <FilterSelect
                value={agentFilter}
                onChange={(v) => setAgentFilter(Number(v))}
                allValue={0}
                options={agents.map((a: any) => ({ value: Number(a.id), label: String(a.name || '') }))}
                placeholder="Todos"
              />
            </Field>

            <Field label="Desde">
              <div className="relative">
                <FiCalendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input !h-10 !pl-9 !rounded-xl border-slate-200 bg-white shadow-sm" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
            </Field>

            <Field label="Hasta">
              <div className="relative">
                <FiCalendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input !h-10 !pl-9 !rounded-xl border-slate-200 bg-white shadow-sm" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </Field>

            <div className="flex items-end">
              {hasFilters ? (
                <button className="btn-neutral !h-10 w-full !rounded-xl text-xs font-semibold" onClick={limpiarFiltros}>
                  <FiX className="mr-1" /> Limpiar filtros
                </button>
              ) : (
                <div className="flex h-10 w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                  Filtros activos
                </div>
              )}
            </div>
          </div>
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
            <div className="px-3 pb-4 sm:px-4"><PaginationBar mobileCompact page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={(n) => { setLimit(n); setPage(1); }} label="Ventas" /></div>
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
              {/* Moneda de trabajo: los campos de monto se capturan en esta moneda
                  y se registran siempre en soles (S/). El tipo de cambio se
                  conserva al alternar, así el monto real no cambia. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-lg border border-[#D9E7FF] bg-white p-0.5" role="group" aria-label="Moneda de la ficha">
                  {(['PEN', 'USD'] as SaleCurrency[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={saleCurrency === option}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${saleCurrency === option ? 'text-white' : 'text-slate-600 hover:bg-[#F3F8FF]'}`}
                      style={saleCurrency === option ? { background: '#1259C4' } : undefined}
                      onClick={() => setSaleCurrency(option)}
                    >
                      {option === 'PEN' ? 'Soles (S/)' : 'Dólares (US$)'}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-500">
                  {saleCurrency === 'USD'
                    ? `Captura en US$ · se registra en S/ al tipo de cambio ${exchangeRateDisplay ? exchangeRateDisplay.toLocaleString('es-PE', { maximumFractionDigits: 4 }) : '-'}`
                    : 'Captura y registro en soles (S/)'}
                </span>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-[#D7E8FF] bg-gradient-to-br from-[#F7FBFF] via-white to-[#F1F6FF] p-3 shadow-[0_12px_28px_rgba(18,89,196,0.06)]">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Cliente o lote</span>
                  <input
                    className="input !h-11 text-sm !rounded-xl border-[#D9E7FF] bg-white shadow-sm transition-all focus:border-[#1259C4] focus:ring-2 focus:ring-[#1259C4]/10"
                    placeholder="Nombre, telefono o codigo"
                    value={quoteSearch}
                    onChange={(e) => { setQuoteSearch(e.target.value); setShowCotizaciones(true); }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Desde</span>
                  <input type="date" className="input !h-11 text-sm !rounded-xl border-[#D9E7FF] bg-white shadow-sm transition-all focus:border-[#1259C4] focus:ring-2 focus:ring-[#1259C4]/10" value={quoteFrom} onChange={(e) => setQuoteFrom(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Hasta</span>
                  <input type="date" className="input !h-11 text-sm !rounded-xl border-[#D9E7FF] bg-white shadow-sm transition-all focus:border-[#1259C4] focus:ring-2 focus:ring-[#1259C4]/10" value={quoteTo} onChange={(e) => setQuoteTo(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="btn-primary h-11 whitespace-nowrap !rounded-xl !px-4 text-sm font-semibold shadow-[0_10px_18px_rgba(18,89,196,0.22)]"
                  onClick={() => setShowCotizaciones((v) => !v)}
                >
                  {showCotizaciones ? 'Ocultar lista' : 'Asignar cotizacion'}
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DDEBFF] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1259C4]">
                  {availableQuotes.length} disponible{availableQuotes.length === 1 ? '' : 's'}
                </span>
                {(quoteSearch || quoteFrom || quoteTo) && (
                  <button type="button" className="font-semibold transition-colors hover:text-[#0D4AAD]" style={{ color: '#1259C4' }} onClick={() => { setQuoteSearch(''); setQuoteFrom(''); setQuoteTo(''); }}>
                    Limpiar filtros
                  </button>
                )}
              </div>

              {showCotizaciones && (
                <div className="mt-3 overflow-hidden rounded-xl border border-[#D9E7FF] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                  <div className="flex items-center justify-between gap-2 border-b border-[#EAF1FF] bg-[#F4F9FF] px-3 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#1259C4' }}>Elige una cotizacion</span>
                    <button type="button" className="text-xs text-slate-400 transition-colors hover:text-slate-600" onClick={() => setShowCotizaciones(false)}>Cerrar</button>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 bg-white">
                    {availableQuotes.map((q: any) => (
                      <button
                        key={q.id}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#F3F8FF] focus:bg-[#EAF3FF] focus:outline-none"
                        onClick={() => selectQuote(q)}
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-800">Lote {q.lotCode || q.lotId}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {q.clientName || 'Sin cliente'} · {q.paymentMethod === 'credito' ? `Al crédito · ${Number(q.totalCuotas || 0)} cuotas` : 'Contado'}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-md bg-[#EEF5FF] px-2 py-1 text-xs font-semibold text-[#1259C4]">
                          {formatMoney(Math.round(Number(q.finalPriceUsd || 0) * Number(q.exchangeRate || 0)))}
                          <span className="ml-1 font-normal text-[#1259C4]/80">
                            (US$ {Number(q.finalPriceUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </span>
                        </span>
                      </button>
                    ))}
                    {availableQuotes.length === 0 && (
                      <p className="px-3 py-4 text-xs text-slate-400 text-center">No hay cotizaciones que coincidan con el filtro.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {!selectedQuote && showQuoteHint && (
            <div className="rounded-lg border p-3 mb-4 text-sm" style={{ borderColor: '#BFDBFE', background: '#EFF6FF' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p style={{ color: '#1259C4' }}>Para registrar una venta primero selecciona una cotización. Si no existe, genera una y vuelve a cargarla aquí.</p>
                  <a
                    className="btn-primary"
                    href={quoteProjectId ? `/projects/${quoteProjectId}/quotes${lotId ? `?lotId=${lotId}` : ''}` : '/projects'}
                  >
                    Generar cotización
                  </a>
                </div>
            </div>
            )}

            {/* Lote y responsable */}
            <div className="grid grid-cols-2 gap-3">
              {!lockedProjectId && (
                <div className="col-span-2">
                  <Field label="Proyecto">
                    <Select
                      value={projectId}
                      onChange={(v) => { setProjectId(Number(v)); setLotId(0); setSelectedQuoteId(0); setSelectedQuoteSnapshot(null); setSalePrice(0); }}
                      options={[{ value: 0, label: 'Auto / Todos' }, ...projects.map((p: any) => ({ value: p.id, label: p.name }))]}
                    />
                  </Field>
                </div>
              )}
              <Field label="Lote *">
                <Select
                  value={lotId}
                  onChange={(v) => selectLot(Number(v))}
                  options={[{ value: 0, label: 'Selecciona…' }, ...lotOptions.map((l: any) => ({ value: l.id, label: lotOptionLabel(l, Boolean(selectedQuote) && Number(l.id) === Number(lotId)) }))]}
                />
              </Field>
              <div className="hidden"><Field label="Cliente"><Select value={clientId} onChange={(v) => setClientId(Number(v))} options={[{ value: 0, label: '— Sin asignar —' }, ...clients.map((c: any) => ({ value: c.id, label: (c.fullName || c.full_name || '— Sin nombre —') }))]} /></Field></div>
              {role === 'agent' ? (
                <Field label="Agente asignado"><div className="input flex items-center bg-slate-50 text-slate-700">{sessionUser?.name || 'Agente logueado'}</div></Field>
              ) : (
                <Field label="Agente *"><Select value={agentId} onChange={(v) => setAgentId(Number(v))} options={[{ value: 0, label: 'Selecciona…' }, ...agents.map((a: any) => ({ value: a.id, label: a.name }))]} /></Field>
              )}
            </div>
            {lotId > 0 && salePrice > 0 && (
              <p className="text-xs mt-1" style={{ color: '#1259C4' }}>
                {selectedQuote ? 'Precio final cargado desde la cotizacion seleccionada.' : 'Precio referencial autocompletado desde el Precio Venta de Lotizacion de este lote.'}
                {' '}Se registra en S/ {round2(salePrice).toLocaleString('es-PE', { maximumFractionDigits: 2 })} (US$ {round2(salePriceUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).
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
            </div>

            {/* Monto y fecha */}
            <div className="border-t mt-4 pt-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,.85fr)_minmax(0,.9fr)]">
                <Field label={`Precio de venta (${saleCurrency === 'USD' ? 'US$' : 'S/'})*`}>
                  <input
                    type="number"
                    className="input"
                    value={fromPen(salePrice) || ''}
                    onChange={(e) => setSalePrice(toPen(Number(e.target.value || 0)))}
                  />
                </Field>
                <Field label={`Precio equiv. (${saleCurrency === 'USD' ? 'S/' : 'US$'})`}>
                  <input
                    type="number"
                    className="input"
                    value={saleCurrency === 'USD' ? round2(salePrice) || '' : round2(salePriceUsd) || ''}
                    onChange={(e) => setSalePrice(saleCurrency === 'USD'
                      ? round2(Number(e.target.value || 0))
                      : round2(Number(e.target.value || 0) * exchangeRate))}
                  />
                </Field>
                <Field label="TC">
                  <input
                    type="number"
                    step="0.0001"
                    className="input"
                    value={exchangeRateDisplay || ''}
                    onChange={(e) => setExchangeRate(round2(Number(e.target.value || 0)))}
                  />
                </Field>
                <Field label="Fecha"><input type="date" className="input" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></Field>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Se registra siempre en soles: S/ {round2(salePrice).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = US$ {round2(salePriceUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Forma de pago */}
            <div className="border-t mt-4 pt-3">
              <Field label="Forma de pago">
                <Select value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
              </Field>
            </div>

            {paymentMethod !== 'Contado' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label={`Cuota inicial (${saleCurrency === 'USD' ? 'US$' : 'S/'})`}>
                    <input type="number" className="input" value={fromPen(cuotaInicial) || ''} onChange={(e) => setCuotaInicial(toPen(Number(e.target.value)))} />
                  </Field>
                  <Field label="Nro. de cuotas"><input type="number" min={0} max={120} className="input" value={totalCuotas} onChange={(e) => setTotalCuotas(Number(e.target.value))} /></Field>
                </div>

                <div className="rounded-lg border p-3 mt-3" style={{ borderColor: '#E5E7EB' }}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Cuota inicial sin interes</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Forma de pago de la inicial">
                      <Select value={initialPaymentMode} onChange={(v) => setInitialPaymentMode(v as any)} options={[{ value: 'contado', label: 'Pago de contado (1 sola vez)' }, { value: 'partes', label: 'En partes iguales' }]} />
                    </Field>
                    {initialPaymentMode === 'partes' && (
                      <Field label="Numero de partes">
                        <input type="number" min={2} max={24} className="input" value={initialParts} onChange={(e) => setInitialParts(Number(e.target.value))} />
                      </Field>
                    )}
                  </div>
                  {initialPaymentMode === 'partes' && cuotaInicial > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      La inicial se paga en <b>{Math.max(2, initialParts)} partes</b> de <b>{formatAmountIn(fromPen(cuotaInicial) / Math.max(2, initialParts), saleCurrency)}</b> cada una, sin interes.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border p-3 mt-3" style={{ borderColor: '#E5E7EB' }}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Financiamiento del saldo</p>
                  <Field label="Las primeras cuotas, sin interes?">
                    <Select
                      value={applyInterest ? 'con' : 'sin'}
                      onChange={(v) => { const enabled = v === 'con'; setApplyInterest(enabled); setInterestType(enabled ? 'tea' : 'sin_intereses'); if (!enabled) setGraceMonths(0); }}
                      options={[{ value: 'sin', label: 'Todas las cuotas sin interes' }, { value: 'con', label: 'Si, las primeras N sin interes y el resto con interes' }]}
                    />
                  </Field>
                  {applyInterest && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                {preview && preview.totalCuotas > 0 && (
                  <div className="rounded-xl bg-canvas p-4 mt-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">Saldo a financiar:</span><b>{formatAmountIn(fromPen(preview.saldoFinanciar), saleCurrency)}</b></div>
                    {preview.graceMonths > 0 && (
                      <div className="flex justify-between"><span className="text-slate-600">{preview.graceMonths} cuotas sin interes:</span><b>{formatAmountIn(fromPen(preview.graceCuota), saleCurrency)}</b></div>
                    )}
                    {preview.interestMonths > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">{preview.interestMonths} cuotas {applyInterest ? 'con interes' : 'sin interes'}:</span>
                        <b>{formatAmountIn(fromPen(preview.valorCuota), saleCurrency)}</b>
                      </div>
                    )}
                    {saleCurrency === 'USD' && (
                      <p className="text-[11px] text-slate-500">
                        Valores convertidos; se registran en soles: {formatMoney(preview.saldoFinanciar)} de saldo.
                      </p>
                    )}
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
