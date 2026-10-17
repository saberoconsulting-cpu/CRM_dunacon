'use client';
import { useEffect, useState, useCallback } from 'react';
import { Toaster, toast, Field } from '@/components/ui/ui';
import { api, getToken } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { formatDate } from '@/lib/types';
import { useIncomeStatementReal, projectedFinancialAmount } from '@/components/features/income-statement/IncomeStatementView';
import { partnerContribution, isNewPartner, issuePartnerShares } from '@/lib/partner-shares';
import { useDisplayCurrency, displayNumberGlobal, displaySymbol } from '@/lib/currency';
import ExchangeRateField from '@/components/features/finances/ExchangeRateField';
import { Select } from '@/components/ui/Select';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { KpiCard } from '@/components/ui/Metrics';
import { FiEdit3, FiSearch, FiTrash2, FiX, FiDollarSign, FiCreditCard, FiTrendingUp, FiAlertTriangle, FiFileText, FiLayers } from 'react-icons/fi';

type T = {
  id: number; type: string; displayType?: string; category: string; concept: string; amount: string; txnDate: string; projectId?: number | null;
  paymentId?: number | null; lotId?: number | null; clientId?: number | null; lotCode?: string | null; clientName?: string | null; paymentMethod?: string | null;
  paymentCategory?: string | null; categoryCode?: string | null; classification?: string | null; agentName?: string | null; operationNumber?: string | null;
};

type BankMovement = {
  id: number;
  accountKey?: string | null;
  movementDate?: string | null;
  monthLabel?: string | null;
  description?: string | null;
  counterparty?: string | null;
  depositAmount?: string | number;
  movementType?: string | null;
  eerrClassification?: string | null;
  code?: string | null;
};

type BankAccount = {
  accountKey: string;
  currency?: string | null;
};

type FinanceDashManual = {
  boletasEmitidas: string;
  totalAcciones: string;
  factorActualizacion: string;
  accionesAVender: string;
  compromisoTerreno: string;
  dataLabels: Record<string, string>;
  commitmentLabels: Record<string, string>;
  structureLabels: Record<string, string>;
  socios: Array<{ name: string; capital: string; adicional: string; aporteTotal?: string; inversionActualizada?: string; newPartner?: boolean }>;
  dataRows: Array<{ code: string; label: string; value: string }>;
  commitmentRows: Array<{ priority: string; creditor: string; amount: string }>;
  structureRows: Array<{ label: string; amount: string }>;
};
type FinanceDashManualField = 'boletasEmitidas' | 'totalAcciones' | 'factorActualizacion' | 'accionesAVender' | 'compromisoTerreno';

type FinanceDashData = {
  budget: Record<string, number>;
  statement: any;
  staticFlow: any;
  dynamicFlow: any;
  payments: any;
  salesOverdue: { count: number; amount: number };
  paymentRowsOverdue: { count: number; amount: number };
  loans: { amount: number; interest: number; updated: number };
};

type FinanceClassRow = {
  key: string;
  sourceId?: number;
  code: string;
  category?: string;
  movementType: string;
  eerrClassification: string;
  cashflowRowId?: string;
  paymentMethod: string;
  sortOrder: string;
  custom?: boolean;
  deleted?: boolean;
};

// Shared row sizing for partners and financing tables.
const SUMMARY_TABLE_STYLE = '[&_tbody_tr]:h-10 md:[&_tbody_tr]:h-[60px] [&_td]:!align-middle [&_td]:!py-2 md:[&_td]:!py-3 [&_td]:!text-xs md:[&_td]:!text-sm [&_input]:!h-6 md:[&_input]:!h-9 [&_input]:!text-xs md:[&_input]:!text-sm [&_th]:!py-2 md:[&_th]:!py-2.5 [&_th]:!text-xs md:[&_th]:!text-[13px]';

const FINANCING_TABLE_STYLE = '[&_tbody_tr]:h-10 [&_td]:!align-middle [&_td]:!py-1.5 [&_td]:!text-xs lg:[&_td]:!text-sm [&_input]:!h-7 [&_input]:!text-xs lg:[&_input]:!text-sm [&_tbody_td]:border-b [&_tbody_td]:border-slate-200';

const FINANCE_PAYMENT_CATEGORIES = ['cuota_inicial', 'cuota', 'lote', 'separacion', 'mantenimiento', 'operacion', 'prestamo', 'otros'];
const FINANCE_CLASSIFICATIONS = ['Venta de Lote', 'Compra de Lote', 'Operacion', 'Financiamiento', 'Ingreso Extraordinario', 'Otros'];
const PAYMENT_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia',
  deposito: 'Deposito', cheque_gerencia: 'Cheque gerencia', tarjeta: 'Tarjeta', otro: 'Otro',
};
const paymentLabel = (v?: string | null) => (v ? (PAYMENT_LABEL[v] || v) : '-');

function todayInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function usd(value: number) {
  return displayNumberGlobal(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function usd0(value: number) {
  return displayNumberGlobal(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function compactUsd(value: number) {
  return `${displaySymbol()} ${Math.round(displayNumberGlobal(value)).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function num(value: unknown) {
  return Number(value || 0) || 0;
}

function numericText(value: unknown) {
  const normalized = String(value ?? '').replace('%', '').replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function plainText(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isLoanMovement(item: Partial<BankMovement>) {
  const text = [
    item.movementType,
    item.eerrClassification,
    item.code,
    item.description,
  ].map(plainText).join(' ');
  return text.includes('prestamo');
}

function paymentRowUsd(payment: any) {
  const usd = payment?.amountUsd != null ? Number(payment.amountUsd) : Number(payment?.amount || 0);
  return Number.isFinite(usd) ? usd : 0;
}

function cashflowTotal(model: any, id: string) {
  const rows = Array.isArray(model?.rows) ? model.rows : [];
  const row = rows.find((item: any) => item?.id === id);
  return Array.isArray(row?.values) ? row.values.reduce((sum: number, value: unknown) => sum + num(value), 0) : 0;
}

function isLandMatrixLabel(label: string) {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() === 'precio de terreno matriz';
}

function landAcquisitionAmount(model: any) {
  const rows: any[] = Array.isArray(model?.rows) ? model.rows : [];
  const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const isLandChild = (row: any, seen = new Set<string>()): boolean => {
    if (row.id === 'land-cost' || row.parentId === 'land' || row.parentId === 'land-cost') return true;
    if (!row.parentId || seen.has(row.id)) return false;
    seen.add(row.id);
    const parent = rows.find(item => item.id === row.parentId);
    return parent ? isLandChild(parent, seen) : false;
  };
  const acquisition = rows.find(row => isLandChild(row) && normalize(row.label) === 'adquisicion de terreno');
  return cashflowTotal(model, acquisition?.id ?? 'land-cost');
}

function teaToTem(tea: unknown) {
  const teaValue = numericText(tea);
  const annualRate = (teaValue > 0 && teaValue < 1 ? teaValue * 100 : teaValue) / 100;
  if (annualRate <= 0) return 0;
  return (Math.pow(1 + annualRate, 1 / 12) - 1) * 100;
}

function monthsBetweenDates(from?: string | null, to?: string | null) {
  if (!from || !to) return 0;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, days / 30);
}

function loanMonths(value: number) {
  if (value <= 0) return '0';
  if (value < 1) return value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

function firstPositive(...values: number[]) {
  return values.find((value) => Number(value || 0) > 0) || 0;
}

function cleanCategoryCode(value: unknown) {
  return String(value || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
}

function defaultFinanceClassRows(): FinanceClassRow[] {
  return [
    { key: 'default-pp', paymentMethod: 'Deposito', movementType: 'Ingreso', code: 'PP', category: 'Prestamo', eerrClassification: 'Financiamiento', sortOrder: '1', custom: true },
    { key: 'default-pv', paymentMethod: '', movementType: 'Ingreso', code: 'PV', category: 'Pago venta de lote', eerrClassification: 'Venta de Lote', sortOrder: '2', custom: true },
    { key: 'default-pci', paymentMethod: '', movementType: 'Ingreso', code: 'PCI', category: 'Cuota Inicial', eerrClassification: 'Venta de Lote', sortOrder: '3', custom: true },
    { key: 'default-pc', paymentMethod: '', movementType: 'Ingreso', code: 'PC', category: 'Cuota', eerrClassification: 'Venta de Lote', sortOrder: '4', custom: true },
    { key: 'default-po', paymentMethod: '', movementType: 'Egreso', code: 'PO', category: 'Obra', eerrClassification: 'Inversion/Construccion', sortOrder: '5', custom: true },
    { key: 'default-pm', paymentMethod: '', movementType: 'Egreso', code: 'PM', category: 'Mantenimiento', eerrClassification: 'Operacion (G&A, com, admin)', sortOrder: '6', custom: true },
    { key: 'default-mk', paymentMethod: '', movementType: 'Egreso', code: 'MK', category: 'Marketing', eerrClassification: 'Operacion (G&A, com, admin)', sortOrder: '7', custom: true },
    { key: 'default-ad', paymentMethod: '', movementType: 'Egreso', code: 'AD', category: 'Administracion', eerrClassification: 'Operacion (G&A, com, admin)', sortOrder: '8', custom: true },
    { key: 'default-co', paymentMethod: '', movementType: 'Egreso', code: 'CO', category: 'Comisiones', eerrClassification: 'Operacion (G&A, com, admin)', sortOrder: '9', custom: true },
    { key: 'default-pe', paymentMethod: '', movementType: 'Egreso', code: 'PE', category: 'Pago Extraordinario', eerrClassification: 'Otros', sortOrder: '10', custom: true },
  ];
}

function normalizeFinanceClassRows(rows: any[]): FinanceClassRow[] {
  return rows.map((row, index) => ({
    key: String(row.key || `row-${index + 1}`),
    sourceId: row.sourceId != null ? Number(row.sourceId) : undefined,
    code: cleanCategoryCode(row.code),
    category: String(row.category || row.paymentCategory || (row.code && String(row.code).length > 3 ? row.code : '') || row.movementType || ''),
    movementType: String(row.movementType === 'egreso' ? 'Egreso' : row.movementType === 'ingreso' ? 'Ingreso' : row.movementType || 'Ingreso'),
    eerrClassification: String(row.eerrClassification || ''),
    cashflowRowId: String(row.cashflowRowId || ''),
    paymentMethod: String(row.paymentMethod || ''),
    sortOrder: String(row.sortOrder || index + 1),
    custom: row.custom !== false,
    deleted: Boolean(row.deleted),
  })).filter((row) => !row.deleted);
}

const defaultFinanceDashManual = (): FinanceDashManual => ({
  boletasEmitidas: '',
  totalAcciones: '1000',
  factorActualizacion: '1.6',
  accionesAVender: '300',
  compromisoTerreno: '',
  dataLabels: {},
  commitmentLabels: {},
  structureLabels: {},
  socios: [
    { name: 'Socio 1', capital: '20000', adicional: '10000' },
    { name: 'Socio 2', capital: '20000', adicional: '' },
    { name: 'Socio 3', capital: '', adicional: '', newPartner: true },
  ],
  dataRows: [],
  commitmentRows: [],
  structureRows: [],
});

export default function FinancesView({ lockedProjectId }: { lockedProjectId?: number }) {
  const [txns, setTxns] = useState<T[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'pago_lote' | 'ingreso' | 'egreso'>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [extraordinaryAmount, setExtraordinaryAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [openExp, setOpenExp] = useState(false);
  const [openIn, setOpenIn] = useState(false);
  const [showLoans, setShowLoans] = useState(false);
  const [showAllPartnerColumns, setShowAllPartnerColumns] = useState(false);
  const [showClassification, setShowClassification] = useState(false);
  const [loanFrom, setLoanFrom] = useState('');
  const [loanTo, setLoanTo] = useState('');
  const [loanUpdatedAt, setLoanUpdatedAt] = useState(todayInput());
  const [loanTea, setLoanTea] = useState('10');
  const [loanTem, setLoanTem] = useState('0.80');
  const [loanRows, setLoanRows] = useState<BankMovement[]>([]);
  const [loanManual, setLoanManual] = useState<Record<number, { months?: string; interest?: string }>>({});
  const [loanManualLoaded, setLoanManualLoaded] = useState(false);
  const [loanLoading, setLoanLoading] = useState(false);
  const [financeDash, setFinanceDash] = useState<FinanceDashData | null>(null);
  const [financeDashManual, setFinanceDashManual] = useState<FinanceDashManual>(defaultFinanceDashManual());
  const [financeDashLoaded, setFinanceDashLoaded] = useState(false);
  const [financePanel, setFinancePanel] = useState<'commitments' | 'structure'>('commitments');
  const [financeClassRows, setFinanceClassRows] = useState<FinanceClassRow[]>([]);
  const [financeClassLoaded, setFinanceClassLoaded] = useState(false);
  const [eForm, setEForm] = useState<any>({ txnDate: todayInput(), category: 'otros' });
  const [iForm, setIForm] = useState<any>({ txnDate: todayInput(), category: 'otros' });
  const ef = (k: string, v: any) => setEForm((p: any) => ({ ...p, [k]: v }));
  const inf = (k: string, v: any) => setIForm((p: any) => ({ ...p, [k]: v }));
  // Moneda unica de la pantalla: `show()` convierte los montos (que vienen en
  // soles de la base de datos) a la moneda activa antes de pintarlos.
  const { currency, format: show } = useDisplayCurrency();
  const loanSettingsKey = lockedProjectId ? `loan_manual_${lockedProjectId}` : '';
  const financeDashSettingsKey = lockedProjectId ? `finance_dashboard_${lockedProjectId}` : '';
  const financeClassSettingsKey = lockedProjectId ? `finance_classification_${lockedProjectId}` : '';

  const load = useCallback(async () => {
    try {
      const pq = lockedProjectId ? `projectId=${lockedProjectId}` : '';
      const txnQ = [typeFilter ? `type=${typeFilter}` : '', cat ? `category=${cat}` : '', debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : '', pq, `page=${page}`, `limit=${limit}`].filter(Boolean).join('&');
      const [t] = await Promise.all([
        api.get<any>(`/finances/transactions${txnQ ? `?${txnQ}` : ''}`),
      ]);
      const items = Array.isArray(t) ? t : (t?.items || []);
      setTxns(items || []);
      setMeta({
        total: Number(Array.isArray(t) ? t.length : (t?.total ?? items.length)),
        totalPages: Number(Array.isArray(t) ? 1 : (t?.totalPages ?? 1)),
      });
      setTotalAmount(Number(Array.isArray(t) ? (t as T[]).reduce((sum, r) => sum + Number(r.amount || 0), 0) : (t?.totalAmount ?? 0)));
      setExtraordinaryAmount(Number(Array.isArray(t)
        ? (t as T[]).filter((r) => r.paymentId == null && ['ingreso', 'egreso'].includes(r.type)).reduce((sum, r) => sum + num(r.amount), 0)
        : (t?.extraordinaryAmount ?? 0)));
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [cat, typeFilter, debouncedSearch, lockedProjectId, page, limit]);

  useEffect(() => {
    load();
    api.get<any[]>('/projects').then(setProjects).catch(() => {});
    const lotQuery = lockedProjectId ? `/lots?projectId=${lockedProjectId}&limit=1000` : '/lots?limit=1000';
    api.get<any>(lotQuery).then((data) => setLots(Array.isArray(data) ? data : (data?.items || []))).catch(() => setLots([]));
  }, [load, lockedProjectId]);
  useEffect(() => {
    const refresh = () => { void load(); };
    const token = getToken();
    const socket = token ? getSocket(token) : null;
    const events = ['connect', 'payment.created', 'payment.updated', 'financial.imported'];
    events.forEach((event) => socket?.on(event, refresh));
    window.addEventListener('focus', refresh);
    return () => {
      events.forEach((event) => socket?.off(event, refresh));
      window.removeEventListener('focus', refresh);
    };
  }, [load]);
  useEffect(() => { setPage(1); }, [cat, typeFilter, debouncedSearch, lockedProjectId]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadLoans = useCallback(async () => {
    if (!lockedProjectId || !showLoans) return;
    setLoanLoading(true);
    try {
      const accountsData = await api.get<{ items?: BankAccount[] }>(`/bank-accounts/accounts?projectId=${lockedProjectId}`).catch(() => ({ items: [] }));
      const accounts = accountsData.items?.length ? accountsData.items : [{ accountKey: 'GENERAL' }];
      const responses = await Promise.all(accounts.map((account) => {
        const q = new URLSearchParams();
        q.set('projectId', String(lockedProjectId));
        q.set('accountKey', account.accountKey);
        return api.get<any>(`/bank-accounts?${q.toString()}`).catch(() => ({ items: [] }));
      }));
      setLoanRows(responses
        .flatMap((data) => Array.isArray(data) ? data : (data?.items || []))
        .filter(isLoanMovement));
    } catch (e: any) {
      toast(e.message || 'No se pudieron cargar los prestamos', 'err');
      setLoanRows([]);
    } finally {
      setLoanLoading(false);
    }
  }, [lockedProjectId, showLoans]);

  useEffect(() => { loadLoans(); }, [loadLoans]);

  const loadFinanceDash = useCallback(async () => {
    if (!lockedProjectId) return;
    try {
      const [budget, statement, staticFlow, dynamicFlow, payments, paymentsList, salesContext, bankAccountsData, loanSetting] = await Promise.all([
        api.get<any>(`/construction-budget?projectId=${lockedProjectId}`).catch(() => ({})),
        api.get<any>(`/finances/income-statement?projectId=${lockedProjectId}`).catch(() => ({})),
        api.get<any>(`/cashflow/model?projectId=${lockedProjectId}&mode=estatico`).catch(() => null),
        api.get<any>(`/cashflow/model?projectId=${lockedProjectId}&mode=dinamico`).catch(() => null),
        api.get<any>(`/payments/caja?projectId=${lockedProjectId}`).catch(() => ({})),
        api.get<any>(`/payments?projectId=${lockedProjectId}&limit=1000`).catch(() => ({ items: [] })),
        api.get<any>(`/sales/payment-context?projectId=${lockedProjectId}`).catch(() => ({ sales: [] })),
        api.get<{ items?: BankAccount[] }>(`/bank-accounts/accounts?projectId=${lockedProjectId}`).catch(() => ({ items: [] })),
        api.get<{ value?: string }>(`/settings/value/${encodeURIComponent(loanSettingsKey)}`).catch(() => ({ value: '' })),
      ]);
      const bankAccounts = bankAccountsData.items?.length ? bankAccountsData.items : [{ accountKey: 'GENERAL' }];
      const bankResponses = await Promise.all(bankAccounts.map((account) => {
        const q = new URLSearchParams();
        q.set('projectId', String(lockedProjectId));
        q.set('accountKey', account.accountKey);
        return api.get<any>(`/bank-accounts?${q.toString()}`).catch(() => ({ items: [] }));
      }));
      const movements = bankResponses.flatMap((data) => Array.isArray(data) ? data : (data?.items || []));
      let loanParsed: any = {};
      try { loanParsed = loanSetting?.value ? JSON.parse(loanSetting.value) : {}; } catch { loanParsed = {}; }
      const loanManualData = loanParsed?.manual && typeof loanParsed.manual === 'object' ? loanParsed.manual : {};
      const loanInterest = Object.values(loanManualData).reduce((sum: number, item: any) => sum + num(item?.interest), 0);
      const loanRowsData = movements.filter(isLoanMovement);
      const loanAmount = loanRowsData.reduce((sum: number, item: any) => sum + num(item.depositAmount), 0);
      const overduePlanRows = (Array.isArray(salesContext?.sales) ? salesContext.sales : [])
        .flatMap((sale: any) => Array.isArray(sale?.plan) ? sale.plan : (Array.isArray(sale?.installments) ? sale.installments : []))
        .filter((row: any) => row?.overdue && !row?.paid);
      const today = new Date().toISOString().slice(0, 10);
      const paymentRows = Array.isArray(paymentsList) ? paymentsList : (paymentsList?.items || []);
      const overduePaymentRows = paymentRows
        .filter((payment: any) => String(payment.status || '') !== 'pagado')
        .filter((payment: any) => payment.dueDate && String(payment.dueDate).slice(0, 10) < today);
      setFinanceDash({
        budget: {
          ...(budget?.summary?.categories || budget?.categories || budget || {}),
          __grandTotal: num(budget?.summary?.grandTotal ?? budget?.grandTotal),
        },
        statement,
        staticFlow,
        dynamicFlow,
        payments,
        salesOverdue: {
          count: overduePlanRows.length,
          amount: overduePlanRows.reduce((sum: number, row: any) => sum + num(row.amount), 0),
        },
        paymentRowsOverdue: {
          count: overduePaymentRows.length,
          amount: overduePaymentRows.reduce((sum: number, row: any) => sum + paymentRowUsd(row), 0),
        },
        loans: { amount: loanAmount, interest: loanInterest, updated: loanAmount + loanInterest },
      });
    } catch (e: any) {
      toast(e.message || 'No se pudo cargar el tablero financiero', 'err');
    }
  }, [lockedProjectId, loanSettingsKey]);

  useEffect(() => { loadFinanceDash(); }, [loadFinanceDash]);

  useEffect(() => {
    if (!showClassification && !openExp && !openIn) return;
    let alive = true;
    setFinanceClassLoaded(false);
    api.get<{ value?: string }>(`/settings/value/${encodeURIComponent(financeClassSettingsKey)}`)
      .then((res) => {
        if (!alive) return;
        let parsed: any = {};
        try { parsed = res?.value ? JSON.parse(res.value) : {}; } catch { parsed = {}; }
        const rows = Array.isArray(parsed?.rows) && parsed.rows.length
          ? normalizeFinanceClassRows(parsed.rows)
          : defaultFinanceClassRows();
        setFinanceClassRows(rows);
      })
      .catch(() => {
        if (alive) setFinanceClassRows(defaultFinanceClassRows());
      })
      .finally(() => {
        if (alive) setFinanceClassLoaded(true);
      });
    return () => { alive = false; };
    const defaultData: FinanceClassRow[] = [
      { key: 'default-1', paymentMethod: 'Deposito', movementType: 'Ingreso', code: 'Prestamo', eerrClassification: 'Financiamiento', sortOrder: '1', custom: true },
      { key: 'default-2', paymentMethod: 'Yape', movementType: 'Ingreso', code: 'Prestamo', eerrClassification: 'Financiamiento', sortOrder: '2', custom: true },
      { key: 'default-3', paymentMethod: 'Efectivo', movementType: 'Ingreso', code: 'Prestamo', eerrClassification: 'Financiamiento', sortOrder: '3', custom: true },
      { key: 'default-4', paymentMethod: '', movementType: 'Egreso', code: 'Obra', eerrClassification: 'Inversión/Construcción', sortOrder: '4', custom: true },
      { key: 'default-5', paymentMethod: '', movementType: 'Egreso', code: 'Mantenimiento', eerrClassification: 'Operación (G&A, com, admin)', sortOrder: '5', custom: true },
      { key: 'default-6', paymentMethod: '', movementType: 'Egreso', code: 'Marketing', eerrClassification: 'Operación (G&A, com, admin)', sortOrder: '6', custom: true },
      { key: 'default-7', paymentMethod: '', movementType: 'Egreso', code: 'Administración', eerrClassification: 'Operación (G&A, com, admin)', sortOrder: '7', custom: true },
      { key: 'default-8', paymentMethod: '', movementType: 'Egreso', code: 'Comisiones', eerrClassification: 'Operación (G&A, com, admin)', sortOrder: '8', custom: true },
      { key: 'default-9', paymentMethod: '', movementType: 'Egreso', code: 'Pago Extraordinario', eerrClassification: 'Venta de Lote', sortOrder: '9', custom: true },
      { key: 'default-10', paymentMethod: '', movementType: 'Ingreso', code: 'Cuota Inicial', eerrClassification: 'Venta de Lote', sortOrder: '10', custom: true },
      { key: 'default-11', paymentMethod: '', movementType: 'Ingreso', code: 'Cuota', eerrClassification: 'Venta de Lote', sortOrder: '11', custom: true },
    ];
    setFinanceClassRows(defaultData);
    setFinanceClassLoaded(true);
  }, [showClassification, openExp, openIn, financeClassSettingsKey]);

  useEffect(() => {
    if (!showClassification || !financeClassSettingsKey || !lockedProjectId || !financeClassLoaded) return;
    const timer = setTimeout(() => {
      const rowsToSave = financeClassRows.map((row) => ({ ...row, code: cleanCategoryCode(row.code) }));
      api.put(`/settings/value/${encodeURIComponent(financeClassSettingsKey)}`, {
        value: JSON.stringify({ rows: rowsToSave }),
      }).catch(() => toast('No se pudo guardar la clasificacion de Finanzas', 'err'));
    }, 600);
    return () => clearTimeout(timer);
  }, [showClassification, financeClassSettingsKey, financeClassRows, lockedProjectId, financeClassLoaded]);

  useEffect(() => {
    if (!showLoans || !loanSettingsKey) return;
    let alive = true;
    setLoanManualLoaded(false);
    api.get<{ value?: string }>(`/settings/value/${encodeURIComponent(loanSettingsKey)}`)
      .then((res) => {
        if (!alive) return;
        let parsed: any = {};
        try { parsed = res?.value ? JSON.parse(res.value) : {}; } catch { parsed = {}; }
        setLoanManual(parsed?.manual && typeof parsed.manual === 'object' ? parsed.manual : {});
        if (parsed?.updatedAt) setLoanUpdatedAt(String(parsed.updatedAt));
        if (parsed?.tea != null) setLoanTea(String(parsed.tea));
        if (parsed?.tem != null) setLoanTem(String(parsed.tem));
      })
      .catch(() => {
        if (alive) setLoanManual({});
      })
      .finally(() => {
        if (alive) setLoanManualLoaded(true);
      });
    return () => { alive = false; };
  }, [showLoans, loanSettingsKey]);

  useEffect(() => {
    if (!showLoans || !loanSettingsKey || !loanManualLoaded) return;
    const timer = setTimeout(() => {
      api.put(`/settings/value/${encodeURIComponent(loanSettingsKey)}`, {
        value: JSON.stringify({
          updatedAt: loanUpdatedAt,
          tea: loanTea,
          tem: loanTem,
          manual: loanManual,
        }),
      }).catch(() => toast('No se pudieron guardar los datos manuales de prestamos', 'err'));
    }, 600);
    return () => clearTimeout(timer);
  }, [showLoans, loanSettingsKey, loanManualLoaded, loanUpdatedAt, loanTea, loanTem, loanManual]);

  useEffect(() => {
    if (!financeDashSettingsKey) return;
    let alive = true;
    setFinanceDashLoaded(false);
    api.get<{ value?: string }>(`/settings/value/${encodeURIComponent(financeDashSettingsKey)}`)
      .then((res) => {
        if (!alive) return;
        let parsed: any = {};
        try { parsed = res?.value ? JSON.parse(res.value) : {}; } catch { parsed = {}; }
        const defaults = defaultFinanceDashManual();
        setFinanceDashManual({
          ...defaults,
          ...parsed,
          socios: Array.isArray(parsed?.socios) ? parsed.socios.map((socio: FinanceDashManual['socios'][number], index: number) => ({ ...socio, newPartner: isNewPartner(socio, index) })) : defaults.socios,
          dataLabels: parsed?.dataLabels && typeof parsed.dataLabels === 'object' ? parsed.dataLabels : defaults.dataLabels,
          commitmentLabels: parsed?.commitmentLabels && typeof parsed.commitmentLabels === 'object' ? parsed.commitmentLabels : defaults.commitmentLabels,
          structureLabels: parsed?.structureLabels && typeof parsed.structureLabels === 'object' ? parsed.structureLabels : defaults.structureLabels,
          dataRows: Array.isArray(parsed?.dataRows) ? parsed.dataRows : defaults.dataRows,
          commitmentRows: Array.isArray(parsed?.commitmentRows) ? parsed.commitmentRows : defaults.commitmentRows,
          structureRows: Array.isArray(parsed?.structureRows) ? parsed.structureRows : defaults.structureRows,
        });
      })
      .catch(() => {
        if (alive) setFinanceDashManual(defaultFinanceDashManual());
      })
      .finally(() => {
        if (alive) setFinanceDashLoaded(true);
      });
    return () => { alive = false; };
  }, [financeDashSettingsKey]);

  useEffect(() => {
    if (!financeDashSettingsKey || !financeDashLoaded) return;
    const timer = setTimeout(() => {
      api.put(`/settings/value/${encodeURIComponent(financeDashSettingsKey)}`, {
        value: JSON.stringify(financeDashManual),
      }).catch(() => toast('No se pudo guardar el tablero financiero', 'err'));
    }, 600);
    return () => clearTimeout(timer);
  }, [financeDashSettingsKey, financeDashLoaded, financeDashManual]);

  async function addEgreso() {
    if (!eForm.concept || !eForm.amount) return toast('Completa concepto y monto', 'err');
    try {
      await api.post('/finances/expense', {
        projectId: lockedProjectId || eForm.projectId || null,
        expenseClass: eForm.expenseClass || 'operacion',
        lotLabel: eForm.lotLabel || null,
        clientLabel: eForm.clientLabel || null,
        paymentMethod: eForm.paymentMethod || null,
        paymentCategory: eForm.paymentCategory || eForm.category || 'otros',
        categoryCode: eForm.categoryCode || null,
        classification: eForm.classification || eForm.expenseClass || 'Operacion',
        agentName: eForm.agentName || null,
        category: eForm.category || eForm.paymentCategory || 'otros',
        concept: eForm.concept,
        amount: Number(eForm.amount),
        expenseDate: eForm.txnDate || todayInput(),
      });
      toast('Egreso registrado'); setOpenExp(false); setEForm({ txnDate: todayInput(), category: 'otros' }); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }
  async function addIngreso() {
    if (!iForm.concept || !iForm.amount) return toast('Completa concepto y monto', 'err');
    try {
      await api.post('/finances/income', {
        projectId: lockedProjectId || iForm.projectId || null,
        lotLabel: iForm.lotLabel || null,
        clientLabel: iForm.clientLabel || null,
        paymentMethod: iForm.paymentMethod || null,
        paymentCategory: iForm.paymentCategory || iForm.category || 'otros_ingresos',
        categoryCode: iForm.categoryCode || null,
        classification: iForm.classification || 'Ingreso',
        agentName: iForm.agentName || null,
        category: iForm.category || iForm.paymentCategory || 'otros_ingresos',
        concept: iForm.concept,
        amount: Number(iForm.amount),
        txnDate: iForm.txnDate || todayInput(),
      });
      toast('Ingreso adicional registrado'); setOpenIn(false); setIForm({ txnDate: todayInput(), category: 'otros' }); load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  const normalized = (value: unknown) => String(value || '').trim().toLowerCase();
  const categoryOptions = Array.from(new Set([
    ...financeClassRows.map((row) => row.category || row.code).filter(Boolean),
    ...FINANCE_PAYMENT_CATEGORIES,
  ]));
  const financeClassCategoryRows = () => {
    const seen = new Set<string>();
    return financeClassRows.filter((row) => {
      const value = String(row.category || row.code || '').trim();
      if (!value || seen.has(normalized(value))) return false;
      seen.add(normalized(value));
      return true;
    });
  };

  function applyLotToForm(kind: 'income' | 'expense', value: string) {
    const update = kind === 'income' ? inf : ef;
    update('lotLabel', value);
    if (!value.trim()) {
      update('clientLabel', '');
      update('agentName', '');
      return;
    }
    const term = normalized(value).replace(/^lote\s+/, '');
    const lot = lots.find((item: any) => normalized(item.code) === term || normalized(`lote ${item.code}`) === normalized(value));
    if (!lot) return;
    update('lotLabel', lot.code || value);
    update('clientLabel', lot.clientName || '');
    update('agentName', lot.agentName || '');
  }

  function applyCategoryToForm(kind: 'income' | 'expense', value: string) {
    const update = kind === 'income' ? inf : ef;
    update('category', value);
    update('paymentCategory', value);
    const row = financeClassRows.find((item) => normalized(item.category) === normalized(value) || normalized(item.code) === normalized(value));
    if (!row) {
      if (!value.trim() || normalized(value) === 'otros') {
        update('classification', '');
        update('paymentMethod', '');
        update('categoryCode', '');
      }
      return;
    }
    update('category', row.category || value);
    update('paymentCategory', row.category || value);
    update('categoryCode', row.code || '');
    update('classification', row.eerrClassification || '');
    if (row.paymentMethod) update('paymentMethod', row.paymentMethod);
  }

  function operationNumber(kind: 'income' | 'expense') {
    return `${kind === 'income' ? 'I' : 'E'} (se asigna al guardar)`;
  }

  const lotSuggestions = (value: unknown) => {
    const term = normalized(value);
    if (!term || !term.startsWith('l')) return [];
    return lots
      .filter((lot: any) => normalized(lot.code).includes(term) || normalized(`lote ${lot.code}`).includes(term))
      .slice(0, 20);
  };

  const loanTemCalculated = teaToTem(loanTea);
  const loanTableRows = loanRows.map((row, index) => {
    const amount = Number(row.depositAmount || 0);
    const months = monthsBetweenDates(row.movementDate, loanUpdatedAt);
    const interest = months > 0 && loanTemCalculated > 0
      ? amount * (Math.pow(1 + loanTemCalculated / 100, months) - 1)
      : 0;
    return {
      ...row,
      index: index + 1,
      amount,
      months,
      interest,
      updatedAmount: amount + interest,
    };
  });
  const loanTotals = loanTableRows.reduce((acc, row) => {
    acc.amount += row.amount;
    acc.interest += row.interest;
    acc.updated += row.updatedAmount;
    return acc;
  }, { amount: 0, interest: 0, updated: 0 });
  const loanSummaryRows = Object.values(loanTableRows.reduce((acc: Record<string, { creditor: string; amount: number; interest: number; updated: number }>, row) => {
    const creditor = String(row.counterparty || 'Sin acreedor');
    if (!acc[creditor]) acc[creditor] = { creditor, amount: 0, interest: 0, updated: 0 };
    acc[creditor].amount += row.amount;
    acc[creditor].interest += row.interest;
    acc[creditor].updated += row.updatedAmount;
    return acc;
  }, {}));
  const budget = financeDash?.budget || {};
  const statement = financeDash?.statement || {};
  const paymentsMetrics = financeDash?.payments?.metrics || {};
  const ingresoVentaLotes = cashflowTotal(financeDash?.staticFlow, 'income') || num(statement?.proyectado?.ingresos) || cashflowTotal(financeDash?.dynamicFlow, 'income');
  const precioTerrenoMatriz = landAcquisitionAmount(financeDash?.staticFlow);
  const costoTerreno = firstPositive(cashflowTotal(financeDash?.staticFlow, 'land'), num(budget.costo_terreno));
  const costoDirecto = firstPositive(cashflowTotal(financeDash?.staticFlow, 'direct'), num(budget.costo_directo));
  const costoIndirecto = firstPositive(cashflowTotal(financeDash?.staticFlow, 'indirect'), num(budget.costo_indirecto));
  const gastosVentasAdmin = firstPositive(cashflowTotal(financeDash?.staticFlow, 'selling'), num(budget.gastos_ventas_admin));
  const gastosFinancierosPresupuesto = firstPositive(cashflowTotal(financeDash?.staticFlow, 'financial') + cashflowTotal(financeDash?.staticFlow, 'tax'), num(budget.gastos_financieros_impuestos));
  const pptoObra = firstPositive(num((budget as any).__grandTotal), costoTerreno + costoDirecto + costoIndirecto + gastosVentasAdmin + gastosFinancierosPresupuesto);
  const utilidadAjustada = cashflowTotal(financeDash?.staticFlow, 'adjusted');
  const prestamosTotal = num(financeDash?.loans.amount);
  const gastosFinancieros = cashflowTotal(financeDash?.staticFlow, 'financial') + cashflowTotal(financeDash?.staticFlow, 'tax');
  const ventaLotesReal = cashflowTotal(financeDash?.dynamicFlow, 'income') || num(statement?.ingresos);
  const pagoCuotasLotes = num(paymentsMetrics.initialPaymentAmount) + num(paymentsMetrics.paidCuotasAmount);
  const ingresosExtra = extraordinaryAmount;
  const boletasEmitidas = num(paymentsMetrics.receiptCount);
  const boletasEmitidasMonto = num(paymentsMetrics.receiptAmount);
  const cuotasPorCobrar = Math.max(0, ingresoVentaLotes - pagoCuotasLotes);
  const cuotasMora = num(financeDash?.paymentRowsOverdue.amount);
  const cuotasMoraCount = num(financeDash?.paymentRowsOverdue.count);
  const cuentasPorPagar = num(paymentsMetrics.pendingAmount);
  const totalAcciones = num(financeDashManual.totalAcciones);
  const sociosBase = financeDashManual.socios;
  const totalAporteSocios = sociosBase.reduce((sum, socio, index) => sum + (isNewPartner(socio, index) ? 0 : partnerContribution(socio, index)), 0);
  const valorInicialAccion = totalAcciones > 0 ? totalAporteSocios / totalAcciones : 0;
  const factorActualizacion = num(financeDashManual.factorActualizacion);
  const valorActualAccion = valorInicialAccion * factorActualizacion;
  const shareIssue = issuePartnerShares(
    sociosBase.map((socio, index) => isNewPartner(socio, index) ? 0 : partnerContribution(socio, index)),
    sociosBase.map((socio, index) => isNewPartner(socio, index) ? Number(socio.aporteTotal ?? socio.inversionActualizada ?? 0) : 0),
    totalAcciones, valorActualAccion,
  );
  const sociosRows = sociosBase.map((socio, index) => {
    const newPartner = isNewPartner(socio, index);
    const aporteCapital = newPartner ? 0 : num(socio.capital);
    const aporteAdicional = newPartner ? 0 : num(socio.adicional);
    const aporteTotal = newPartner ? 0 : partnerContribution(socio, index);
    const acciones = shareIssue.initial[index];
    const participacion = totalAcciones > 0 ? acciones / totalAcciones : 0;
    const inversionActualizada = newPartner ? partnerContribution(socio, index) : acciones * valorActualAccion;
    const accionesFinal = shareIssue.final[index];
    const pctAcciones = shareIssue.finalTotal > 0 ? accionesFinal / shareIssue.finalTotal : 0;
    const utilidad = pctAcciones * utilidadAjustada;
    return {
      isNewPartner: newPartner,
      index: index + 1,
      name: socio.name,
      aporteCapital, aporteAdicional, aporteTotal, participacion, acciones,
      inversionActualizada, accionesFinal, pctAcciones, utilidad,
      rentabilidadActualizada: inversionActualizada > 0 ? utilidad / inversionActualizada : 0,
    };
  });
  const socioTotals = sociosRows.reduce((acc, row) => {
    acc.capital += row.aporteCapital;
    acc.adicional += row.aporteAdicional;
    acc.total += row.aporteTotal;
    acc.acciones += row.acciones;
    acc.inversion += row.inversionActualizada;
    acc.final += row.accionesFinal;
    acc.utilidad += row.utilidad;
    acc.rentabilidad += row.rentabilidadActualizada;
    return acc;
  }, { capital: 0, adicional: 0, total: 0, acciones: 0, inversion: 0, final: 0, utilidad: 0, rentabilidad: 0 });
  const compromisoTerrenoValue = precioTerrenoMatriz;
  const { treeByLine: statementTree, hasFinancialFlowChildren } = useIncomeStatementReal(lockedProjectId || 0, [], financeDash?.staticFlow || null, financeDash?.dynamicFlow || null);
  const compromisoGastosFinancieros = projectedFinancialAmount(financeDash?.staticFlow || null, statementTree.financiero || [], hasFinancialFlowChildren, num(statement?.proyectado?.financiamiento));
  const estructuraBase: Array<[string, string, number]> = [
    ['capital', 'Aporte de Capital', socioTotals.inversion],
    ['venta_lotes', 'Venta de Lotes (20% de Lotes)', ingresoVentaLotes * 0.20],
    ['preventa', 'Preventa (25% de los lotes)', ingresoVentaLotes * 0.25],
    ['prestamos_aporte', 'Prestamos (Aporte Adicional)', socioTotals.total],
  ];
  const financiamientoBancario = pptoObra - estructuraBase.reduce((sum, [, , value]) => sum + value, 0);
  const estructuraRows: Array<[string, string, number]> = [
    ...estructuraBase,
    ['prestamos_bancos', 'Prestamos - Bancos', financiamientoBancario],
  ];
  const estructuraTotal = estructuraRows.reduce((sum, row) => sum + num(row[2]), 0);
  const compromisoRows = [
    ['1', financeDashManual.commitmentLabels.terreno || 'Terreno', compromisoTerrenoValue, 'terreno'],
    ['2', financeDashManual.commitmentLabels.deuda_clientes || 'Deuda Clientes', pagoCuotasLotes, 'deuda_clientes'],
    ['3', financeDashManual.commitmentLabels.gastos_financieros || 'Gastos Financieros', compromisoGastosFinancieros, 'gastos_financieros'],
    ...sociosRows.map((row) => [String(row.index + 3), row.name || `Socio ${row.index}`, row.inversionActualizada] as [string, string, number]),
    ...financeDashManual.commitmentRows.map((row, index) => [row.priority || String(sociosRows.length + 4 + index), row.creditor || 'Nuevo acreedor', num(row.amount)] as [string, string, number]),
  ] as Array<[string, string, number] | [string, string, number, string]>;
  const compromisoTotal = compromisoRows.reduce((sum, [, , value]) => sum + num(value), 0);
  const dashboardCards: Array<{ label: string; value: number; note: string; color: string; manual?: FinanceDashManualField }> = [
    { label: 'Ingreso Venta de Lotes', value: ingresoVentaLotes, note: `${num(paymentsMetrics.totalSaleLots)} lotes`, color: '#16A36A' },
    { label: 'Ppto de Obra US$', value: pptoObra, note: `Avance Real: ${compactUsd(cashflowTotal(financeDash?.dynamicFlow, 'direct'))}`, color: '#16A36A' },
    { label: 'Costo del Terreno US$', value: costoTerreno, note: `Deuda: ${compactUsd(cashflowTotal(financeDash?.dynamicFlow, 'land'))}`, color: '#2563EB' },
    { label: 'Gastos de Ventas y Adm.', value: gastosVentasAdmin, note: `Real: ${compactUsd(cashflowTotal(financeDash?.dynamicFlow, 'selling'))}`, color: '#2563EB' },
    { label: 'Utilidad Ajustada Neta', value: utilidadAjustada, note: `Real: ${compactUsd(cashflowTotal(financeDash?.dynamicFlow, 'adjusted'))}`, color: '#DC2626' },
    { label: 'Prestamos US$', value: prestamosTotal, note: 'Capital', color: '#DC2626' },
    { label: 'Gastos Financieros US$', value: gastosFinancieros, note: 'Flujo de caja', color: '#CA8A04' },
    { label: 'Venta de Lotes Real', value: ventaLotesReal, note: `${num(paymentsMetrics.totalSaleLots)} lotes`, color: '#16A36A' },
    { label: 'Pago Cuotas de Lotes', value: pagoCuotasLotes, note: `${num(paymentsMetrics.paidCuotas)} cuotas`, color: '#16A36A' },
    { label: 'Ingresos Extraordinarios US$', value: ingresosExtra, note: 'Flujo financiero', color: '#2563EB' },
    { label: 'Facturas / Boletas', value: boletasEmitidas, note: `Total: ${compactUsd(boletasEmitidasMonto)}`, color: '#2563EB' },
    { label: 'Cuotas por Cobrar US$', value: cuotasPorCobrar, note: `${num(paymentsMetrics.pendingCuotas)} cuotas`, color: '#DC2626' },
    { label: 'Cuotas en Mora', value: cuotasMora, note: `${cuotasMoraCount} cuotas`, color: '#DC2626' },
    { label: 'Cuentas por Pagar US$', value: cuentasPorPagar, note: 'Cuotas pendientes', color: '#CA8A04' },
  ];
  const updateSocio = (index: number, patch: Partial<{ name: string; capital: string; adicional: string; aporteTotal?: string; inversionActualizada?: string; newPartner?: boolean }>) => {
    setFinanceDashManual((current) => ({
      ...current,
      socios: current.socios.map((socio, itemIndex) => itemIndex === index ? { ...socio, ...patch } : socio),
    }));
  };
  const updateManualArray = <K extends 'dataRows' | 'commitmentRows' | 'structureRows'>(key: K, index: number, patch: Partial<FinanceDashManual[K][number]>) => {
    setFinanceDashManual((current) => ({
      ...current,
      [key]: (current[key] as any[]).map((row, itemIndex) => itemIndex === index ? { ...row, ...patch } : row),
    }));
  };
  const removeManualArrayRow = (key: 'dataRows' | 'commitmentRows' | 'structureRows', index: number) => {
    setFinanceDashManual((current) => ({
      ...current,
      [key]: (current[key] as any[]).filter((_, itemIndex) => itemIndex !== index),
    }));
  };
  const removeSocio = (index: number) => {
    setFinanceDashManual((current) => ({
      ...current,
      socios: current.socios.map((socio, itemIndex) => ({ ...socio, newPartner: isNewPartner(socio, itemIndex) })).filter((_, itemIndex) => itemIndex !== index),
    }));
  };
  const focusRowInput = (event: any) => {
    const input = event.currentTarget.closest('tr')?.querySelector('input:not(:disabled)') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  };
  const rowIconButton = 'inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-700';
  const rowDangerButton = 'inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600';
  const rowDangerDisabledButton = 'inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md border bg-white text-slate-300 opacity-60';
  const updateFinanceClassRow = (key: string, patch: Partial<FinanceClassRow>) => {
    setFinanceClassRows((rows) => rows.map((row) => row.key === key ? { ...row, ...patch, ...(patch.code !== undefined ? { code: cleanCategoryCode(patch.code) } : {}) } : row));
  };
  const addFinanceClassRow = () => {
    setFinanceClassRows((rows) => [
      ...rows,
      { key: `custom-${Date.now()}`, code: '', category: 'Nueva categoria', movementType: 'Ingreso', eerrClassification: '', cashflowRowId: '', paymentMethod: '', sortOrder: String(rows.length + 1), custom: true },
    ]);
  };
  const removeFinanceClassRow = (key: string) => {
    setFinanceClassRows((rows) => rows.filter((row) => row.key !== key));
  };
  const saveFinanceClassificationNow = (rows = financeClassRows) => {
    if (!financeClassSettingsKey) return;
    const invalid = rows.find((row) => cleanCategoryCode(row.code).length < 2);
    if (invalid) return toast('El codigo debe tener minimo 2 letras y maximo 3', 'err');
    api.put(`/settings/value/${encodeURIComponent(financeClassSettingsKey)}`, {
      value: JSON.stringify({ rows: rows.map((row) => ({ ...row, code: cleanCategoryCode(row.code) })) }),
    }).then(() => toast('Clasificacion guardada')).catch(() => toast('No se pudo guardar la clasificacion de Finanzas', 'err'));
  };

  return (
    <>
      <Toaster />
      <datalist id="finance-lots-expense">
        {lotSuggestions(eForm.lotLabel).map((lot: any) => (
          <option key={lot.id || lot.code} value={lot.code || ''}>{lot.clientName ? `${lot.clientName} - ${lot.agentName || 'Sin agente'}` : lot.agentName || ''}</option>
        ))}
      </datalist>
      <datalist id="finance-lots-income">
        {lotSuggestions(iForm.lotLabel).map((lot: any) => (
          <option key={lot.id || lot.code} value={lot.code || ''}>{lot.clientName ? `${lot.clientName} - ${lot.agentName || 'Sin agente'}` : lot.agentName || ''}</option>
        ))}
      </datalist>
      <datalist id="finance-categories">
        {categoryOptions.map((category) => (
          <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>
        ))}
      </datalist>
      <datalist id="finance-payment-methods">
        {Array.from(new Set([...Object.keys(PAYMENT_LABEL), ...financeClassRows.map((row) => row.paymentMethod).filter(Boolean)])).map((method) => (
          <option key={method} value={method}>{paymentLabel(method)}</option>
        ))}
      </datalist>
      <datalist id="finance-classifications">
        {Array.from(new Set([...FINANCE_CLASSIFICATIONS, ...financeClassRows.map((row) => row.eerrClassification).filter(Boolean)])).map((classification) => (
          <option key={classification} value={classification} />
        ))}
      </datalist>
      <div className="space-y-5">
        {showLoans ? (
          <div className="card w-full p-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b px-4 py-3 xl:flex-row xl:items-center xl:justify-between" style={{ borderColor: '#E5E7EB' }}>
              <h3 className="font-semibold">Prestamos</h3>
              <div className="flex flex-wrap items-center justify-end gap-2 xl:flex-nowrap">
                <label className="text-xs font-semibold text-slate-500">Fecha de actualizacion</label>
                <input type="date" className="input !h-9 !w-auto" value={loanUpdatedAt} onChange={(e) => setLoanUpdatedAt(e.target.value)} />
                <label className="text-xs font-semibold text-slate-500">TEA</label>
                <input className="input !h-9 !w-20" value={loanTea} onChange={(e) => setLoanTea(e.target.value)} />
                <label className="text-xs font-semibold text-slate-500">TEM</label>
                <input className="input !h-9 !w-20 bg-slate-50 text-right" value={loanTemCalculated.toFixed(2)} readOnly />
                <button className="btn-neutral !h-9" type="button" onClick={() => { setLoanFrom(''); setLoanTo(''); }}>Todo</button>
                <button className="btn-neutral !h-9" type="button" onClick={() => setShowLoans(false)}><FiX /> Cerrar</button>
              </div>
            </div>
            <div className="overflow-auto p-3">
              {loanLoading ? <p className="p-4 text-slate-400">Cargando prestamos...</p> : (
                <table className="table-base table-fixed border-separate border-spacing-0 text-[12px]" style={{ minWidth: 1460, width: '100%' }}>
                  <colgroup>
                    <col style={{ width: 54 }} />
                    <col style={{ width: 104 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 250 }} />
                    <col style={{ width: 190 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 126 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 118 }} />
                    <col style={{ width: 128 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th-base !px-2 text-center" style={{ background: '#6B7280', color: '#fff' }}>Item</th>
                      <th className="th-base !whitespace-normal !px-2 !leading-tight text-center" style={{ background: '#6B7280', color: '#fff' }}>Fecha de<br />ABONO</th>
                      <th className="th-base !whitespace-normal !px-4 !leading-tight text-center" style={{ background: '#6B7280', color: '#fff', overflow: 'hidden' }}>Mes</th>
                      <th className="th-base !whitespace-normal !px-4 !leading-tight text-left" style={{ background: '#6B7280', color: '#fff', overflow: 'hidden' }}>Descripcion<br />(EC BCP)</th>
                      <th className="th-base !whitespace-normal !px-2 !leading-tight text-left" style={{ background: '#6B7280', color: '#fff' }}>Proveedor (Egreso)<br />Cliente (Ingreso)</th>
                      <th className="th-base !whitespace-normal !px-2 !leading-tight text-right" style={{ background: '#6B7280', color: '#fff' }}>Abono<br />(Ingreso)</th>
                      <th className="th-base !whitespace-normal !px-2 !leading-tight text-left" style={{ background: '#6B7280', color: '#fff' }}>TIPO INGRESO<br />GASTO</th>
                      <th className="th-base !whitespace-normal !px-2 !leading-tight text-center" style={{ background: '#6B7280', color: '#fff' }}>Fecha de<br />Actualizacion</th>
                      <th className="th-base !whitespace-normal !px-2 !leading-tight text-right" style={{ background: '#6B7280', color: '#fff' }}>Meses del<br />Prestamo</th>
                      <th className="th-base !whitespace-normal !px-2 !leading-tight text-right" style={{ background: '#6B7280', color: '#fff' }}>Intereses<br />US$</th>
                      <th className="th-base !whitespace-normal !px-2 !leading-tight text-right" style={{ background: '#6B7280', color: '#fff' }}>Monto<br />Actualizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loanTableRows.map((row) => (
                      <tr key={row.id}>
                        <td className="td-base !px-2 text-center">{row.index}</td>
                        <td className="td-base !px-2 text-center">{formatDate(row.movementDate)}</td>
                        <td className="td-base !px-4 text-center" style={{ overflow: 'hidden' }}>{row.monthLabel || '-'}</td>
                        <td className="td-base !px-4 truncate" style={{ overflow: 'hidden' }} title={row.description || '-'}>{row.description || '-'}</td>
                        <td className="td-base !px-2 truncate font-medium" title={row.counterparty || '-'}>{row.counterparty || '-'}</td>
                        <td className="td-base !px-2 text-right tabular-nums">{usd0(row.amount)}</td>
                        <td className="td-base !px-2 truncate" title={row.movementType || 'PRESTAMO'}>{row.movementType || 'PRESTAMO'}</td>
                        <td className="td-base !px-2 text-center">{formatDate(loanUpdatedAt)}</td>
                        <td className="td-base !px-2 text-right tabular-nums">{loanMonths(row.months)}</td>
                        <td className="td-base !px-2 text-right tabular-nums">{usd0(row.interest)}</td>
                        <td className="td-base !px-2 text-right font-semibold tabular-nums">{usd0(row.updatedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#0B2F6E' }}>
                      <td className="td-base !px-2 font-bold text-white" colSpan={4}></td>
                      <td className="td-base !px-2 font-bold text-white">Totales {displaySymbol()}</td>
                      <td className="td-base !px-2 font-bold text-white text-right tabular-nums">{usd0(loanTotals.amount)}</td>
                      <td className="td-base !px-2" colSpan={3}></td>
                      <td className="td-base !px-2 font-bold text-white text-right tabular-nums">{usd0(loanTotals.interest)}</td>
                      <td className="td-base !px-2 font-bold text-white text-right tabular-nums">{usd0(loanTotals.updated)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              <div className="mt-6 max-w-3xl">
                <h3 className="mb-2 font-semibold">Resumen</h3>
                <table className="table-base table-fixed text-[12px]" style={{ minWidth: 680, width: '100%' }}>
                  <colgroup>
                    <col style={{ width: 64 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 156 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="th-base !px-3 text-center" style={{ background: '#6B7280', color: '#fff' }}>Item</th>
                      <th className="th-base !px-3 text-left" style={{ background: '#6B7280', color: '#fff' }}>Acreedor</th>
                      <th className="th-base !px-3 text-right" style={{ background: '#6B7280', color: '#fff' }}>Prestamo</th>
                      <th className="th-base !px-3 text-right" style={{ background: '#6B7280', color: '#fff' }}>Intereses</th>
                      <th className="th-base !px-3 text-right" style={{ background: '#6B7280', color: '#fff' }}>Deuda Actualizada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanSummaryRows.map((row, index) => (
                      <tr key={row.creditor}>
                        <td className="td-base !px-3 text-center">{index + 1}</td>
                        <td className="td-base !px-3 truncate font-medium" title={row.creditor}>{row.creditor}</td>
                        <td className="td-base !px-3 text-right tabular-nums">{usd0(row.amount)}</td>
                        <td className="td-base !px-3 text-right tabular-nums">{usd0(row.interest)}</td>
                        <td className="td-base !px-3 text-right font-semibold tabular-nums">{usd0(row.updated)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#0B2F6E' }}>
                      <td className="td-base !px-3 font-bold text-white"></td>
                      <td className="td-base !px-3 font-bold text-white">Total {displaySymbol()}</td>
                      <td className="td-base !px-3 font-bold text-white text-right tabular-nums">{usd0(loanTotals.amount)}</td>
                      <td className="td-base !px-3 font-bold text-white text-right tabular-nums">{usd0(loanTotals.interest)}</td>
                      <td className="td-base !px-3 font-bold text-white text-right tabular-nums">{usd0(loanTotals.updated)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : (
        <>
        <section className="space-y-2">
          <h2 className="text-2xl font-black tracking-normal" style={{ color: '#001BFF' }}>FINANZAS</h2>
          
          {[
            { title: 'Indicadores Proyectados', cards: dashboardCards.slice(0, 7), offset: 0 },
            { title: 'Indicadores Operación Real', cards: dashboardCards.slice(7), offset: 7 },
          ].map((group) => (
            <div key={group.title}>
              <h3 className="mb-1 text-lg font-black" style={{ color: '#334155' }}>{group.title}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7 [&_.card-card-kpi]:!px-2 [&_.kpi-label]:gap-1 [&_.kpi-label>span:first-child]:!h-6 [&_.kpi-label>span:first-child]:!w-6 [&_.kpi-label-text]:!text-[9px] [&_.kpi-label-text]:tracking-normal [&_.kpi-helper]:!text-[9px]">
                {group.cards.map((card, index) => {
                  const icons = [FiDollarSign, FiLayers, FiLayers, FiCreditCard, FiTrendingUp, FiCreditCard, FiCreditCard, FiDollarSign, FiCreditCard, FiDollarSign, FiFileText, FiCreditCard, FiAlertTriangle, FiCreditCard];
                  const Icon = icons[group.offset + index];
                  return (
                    <KpiCard
                      key={card.label}
                      label={card.label.replace('US$', displaySymbol())}
                      value={card.manual ? (
                        <input
                          aria-label={card.label.replace('US$', displaySymbol())}
                          className="w-full min-w-0 border-0 bg-transparent text-center text-[15px] font-extrabold tabular-nums outline-none sm:text-base"
                          style={{ color: card.color }}
                          value={financeDashManual[card.manual]}
                          onChange={(event) => setFinanceDashManual((current) => ({ ...current, [card.manual!]: event.target.value }))}
                          placeholder="0"
                        />
                      ) : compactUsd(card.value)}
                      helper={<span className="block text-left">{card.note}</span>}
                      icon={<Icon />}
                      tone={card.color}
                      truncateLabel={false}
                      valueAlign="center"
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <div className="min-w-0 rounded-lg border bg-white p-3 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
            <div className="mb-3 flex items-center justify-between gap-1 md:gap-3">
              <h3 className="text-base md:text-lg font-black" style={{ color: '#001BFF' }}>Socios</h3>
              <button className="btn-neutral !h-8 !px-2 text-[11px] whitespace-nowrap md:!h-9 md:!px-3 md:text-sm" type="button" onClick={() => setFinanceDashManual((current) => ({ ...current, socios: [...current.socios, { name: `Socio ${current.socios.length + 1}`, capital: '', adicional: '', newPartner: true }] }))}>Agregar socio</button>
            <button
              type="button"
              className="btn-neutral !h-8 !px-2 text-[11px] whitespace-nowrap md:hidden"
              aria-expanded={showAllPartnerColumns}
              aria-controls="partners-full-table"
              onClick={() => setShowAllPartnerColumns(current => !current)}
            >
              {showAllPartnerColumns ? 'Ocultar datos' : 'Mostrar datos'}
            </button>
            </div>
            {!showAllPartnerColumns && (
              <div className="overflow-hidden rounded-md border border-slate-200 md:hidden">
                <table className="w-full table-fixed border-collapse text-[11px] text-center [&_th]:border [&_th]:border-slate-300 [&_th]:align-middle [&_th]:px-1 [&_th]:py-2 [&_td]:border [&_td]:border-slate-300 [&_td]:px-1 [&_td]:py-1 [&_td]:align-middle [&_tbody_tr]:h-8">
                  <colgroup><col className="w-[44%]" /><col className="w-[34%]" /><col className="w-[22%]" /></colgroup>
                  <thead>
                    <tr className="text-[#1F2937] [&_th:first-child]:bg-[#D1D5DB] [&_th:not(:first-child)]:bg-[#A9D18E]">
                      <th scope="col" className="px-2 py-2 text-center"><span className="block">Nombre</span><span className="block">del socio</span></th>
                      <th scope="col" className="px-2 py-2 text-center"><span className="block">Aporte final</span><span className="block">{displaySymbol()}</span></th>
                      <th scope="col" className="px-2 py-2 text-center"><span className="block">Acciones</span><span className="block">finales (%)</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sociosRows.map((row, index) => (
                      <tr key={index} className="[&_td:first-child]:bg-[#F1F3F5]">
                        <td className="px-1 py-1"><input aria-label={`Nombre del socio ${row.index}`} className="h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-1 text-center text-[11px] outline-none focus:border-blue-400 focus:bg-white focus:ring-1 focus:ring-blue-400" value={row.name} onChange={(event) => updateSocio(index, { name: event.target.value })} /></td>
                        <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums">{usd0(row.inversionActualizada)}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums">{(row.pctAcciones * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#000066] font-bold text-white">
                      <td className="px-2 py-2">Total</td>
                      <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums">{usd0(socioTotals.inversion)}</td>
                      <td className="px-2 py-2 text-center">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div id="partners-full-table" className={`${showAllPartnerColumns ? 'block' : 'hidden'} overflow-auto rounded-md border md:block`} style={{ borderColor: '#E5E7EB' }}>
              <table className="w-full min-w-[1000px] md:min-w-0 table-fixed border-collapse text-[10px] lg:text-[11px] [&_td]:border [&_td]:border-slate-300 [&_th]:border [&_th]:border-slate-300">
                <colgroup>
                  {[15, 8, 8, 9, 7, 7, 11, 8, 6, 9, 7, 5].map((width, index) => (
                    <col key={index} style={{ width: `${width}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {[
                      ['Nombre'],
                      ['Aporte', 'Capital US$'],
                      ['Aporte', 'Adicional US$'],
                      ['Aporte', 'Total US$'],
                      ['Participación', '%'],
                      ['Nro. de', 'Acciones'],
                      ['Aporte Capital -', 'Nuevos Socios $'],
                      ['Acciones', 'finales'],
                      ['% de', 'acciones'],
                      ['Utilidad US$'],
                      ['Rentabilidad', '%'],
                      ['Acción'],
                    ].map((lines, index) => (
                      <th key={lines.join(' ')} scope="col" className="th-base !whitespace-normal !text-[10px] lg:!text-[11px] !font-semibold !tracking-normal !px-1 !py-2 !align-middle leading-snug text-white" style={{ textAlign: 'center', background: index < 6 ? '#D1D5DB' : index <= 9 ? '#A9D18E' : '#2F75B5', color: index <= 9 ? '#1F2937' : '#fff' }}>{lines.map((line) => <span key={line} className={`block whitespace-nowrap ${index === 6 ? 'text-[9px] lg:text-[10px] tracking-tight' : ''}`}>{line.replace('US$', displaySymbol())}</span>)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sociosRows.map((row, index) => (
                    <tr key={index} className="[&_td:nth-child(-n+6)]:!bg-[#F1F3F5]">
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle overflow-hidden text-ellipsis"><input className="input !h-7 !min-w-0 !rounded-none !px-1 !text-[10px] lg:!text-[11px] !bg-transparent !border-transparent !shadow-none !w-full !max-w-none focus:!border-blue-400 focus:!bg-white focus:!ring-1 disabled:!bg-transparent disabled:!border-transparent disabled:!shadow-none" aria-label={`Nombre del socio ${row.index}`} value={row.name} onChange={(e) => updateSocio(index, { name: e.target.value })} /></td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle">{!row.isNewPartner && (<input className="input !h-7 !min-w-0 !rounded-none !px-1 !text-[10px] lg:!text-[11px] !bg-transparent !border-transparent !shadow-none text-right !w-full !max-w-none focus:!border-blue-400 focus:!bg-white focus:!ring-1 disabled:!bg-transparent disabled:!border-transparent disabled:!shadow-none" disabled={row.isNewPartner} readOnly={currency === 'PEN'} value={row.isNewPartner ? '' : currency === 'PEN' ? usd0(financeDashManual.socios[index]?.capital as any) : financeDashManual.socios[index]?.capital || ''} onChange={(e) => updateSocio(index, { capital: e.target.value })} />)}</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle">{!row.isNewPartner && (<input className="input !h-7 !min-w-0 !rounded-none !px-1 !text-[10px] lg:!text-[11px] !bg-transparent !border-transparent !shadow-none text-right !w-full !max-w-none focus:!border-blue-400 focus:!bg-white focus:!ring-1 disabled:!bg-transparent disabled:!border-transparent disabled:!shadow-none" disabled={row.isNewPartner} readOnly={currency === 'PEN'} value={row.isNewPartner ? '' : currency === 'PEN' ? usd0(financeDashManual.socios[index]?.adicional as any) : financeDashManual.socios[index]?.adicional || ''} onChange={(e) => updateSocio(index, { adicional: e.target.value })} />)}</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right font-semibold">{row.isNewPartner ? '' : usd0(row.aporteTotal)}</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-center">{row.isNewPartner ? '' : `${(row.participacion * 100).toFixed(0)}%`}</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right">{row.isNewPartner ? '' : usd0(row.acciones)}</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right">
                        {row.isNewPartner ? <input aria-label={`Aporte de nuevo socio ${row.name}`} inputMode="decimal" className="input !h-7 !min-w-0 !rounded-none !px-1 !text-[10px] lg:!text-[11px] !bg-transparent !border-transparent !shadow-none text-right !w-full focus:!border-blue-400 focus:!bg-white focus:!ring-1" readOnly={currency === 'PEN'} value={currency === 'PEN' ? usd0(row.inversionActualizada) : financeDashManual.socios[index]?.aporteTotal ?? financeDashManual.socios[index]?.inversionActualizada ?? ''} onChange={(e) => updateSocio(index, { aporteTotal: e.target.value })} /> : usd0(row.inversionActualizada)}
                        {shareIssue.invalid.includes(index) && <p role="alert" className="mt-1 text-xs text-red-700">Ingresa un aporte positivo y un valor actualizado de accion valido.</p>}
                      </td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right">{usd0(row.accionesFinal)}</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-center">{(row.pctAcciones * 100).toFixed(0)}%</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right" title={`${displaySymbol()} ${usd0(utilidadAjustada)} x ${(row.pctAcciones * 100).toFixed(0)}%`}>{usd0(row.utilidad)}</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-center">{(row.rentabilidadActualizada * 100).toFixed(0)}%</td>
                      <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-center"><div className="flex justify-center gap-0"><button className="inline-flex h-6 w-4 items-center justify-center text-slate-600 hover:text-blue-700" type="button" title="Editar" onClick={focusRowInput}><FiEdit3 size={12} /></button><button className="inline-flex h-6 w-4 items-center justify-center text-red-600 hover:text-red-800" type="button" title="Eliminar" onClick={() => removeSocio(index)}><FiTrash2 size={12} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#000066' }}>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle font-bold text-white text-center" >Total</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right font-bold text-white">{usd0(socioTotals.capital)}</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right font-bold text-white">{usd0(socioTotals.adicional)}</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right font-bold text-white">{usd0(socioTotals.total)}</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-center font-bold text-white">100%</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right font-bold text-white">{usd0(socioTotals.acciones)}</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right font-bold text-white">{usd0(socioTotals.inversion)}</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right font-bold text-white">{usd0(socioTotals.final)}</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-center font-bold text-white">100%</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-right font-bold text-white">{usd0(socioTotals.utilidad)}</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle text-center font-bold text-white">{(socioTotals.rentabilidad * 100).toFixed(0)}%</td>
                    <td className="td-base !px-1 !py-1 !text-[10px] lg:!text-[11px] !align-middle" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:gap-4">
            <div className="min-w-0 rounded-lg border bg-white p-2 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="font-bold text-blue-700">Datos Importantes</h3>
                <button className="btn-neutral !h-8 text-xs" type="button" onClick={() => setFinanceDashManual((current) => ({ ...current, dataRows: [...current.dataRows, { code: `D.${current.dataRows.length + 9}`, label: 'Nuevo dato', value: '' }] }))}>Agregar dato</button>
              </div>
              <div className="overflow-x-auto rounded-md border" style={{ borderColor: '#E5E7EB' }}>
              <table className="w-full table-fixed border-collapse text-xs">
                <colgroup>
                  <col className="w-[30px] lg:w-[38px]" />
                  <col />
                  <col className="w-[88px] lg:w-[120px]" />
                  <col className="w-[48px] lg:w-[60px]" />
                </colgroup>
                <tbody>
                  {[
                    ['D.1', 'total_acciones', financeDashManual.dataLabels.total_acciones || 'Total Acciones', 'totalAcciones'],
                    ['D.2', 'valor_inicial_accion', financeDashManual.dataLabels.valor_inicial_accion || 'Valor Inicial de la Accion US$', null],
                    ['D.3', 'factor_actualizacion', financeDashManual.dataLabels.factor_actualizacion || 'Factor Actualizacion de la accion', 'factorActualizacion'],
                    ['D.4', 'valor_actual_accion', financeDashManual.dataLabels.valor_actual_accion || 'Valor Actual de la Accion US$', null],
                    ['D.5', 'utilidad_ajustada', financeDashManual.dataLabels.utilidad_ajustada || 'Utilidad Ajustada US$', null],
                    ['D.6', 'ppto_obra', financeDashManual.dataLabels.ppto_obra || 'Ppto. de Obra US$', null],
                    ['D.7', 'precio_terreno_matriz', 'Precio de Terreno Matriz', null],
                  ].map(([code, labelKey, label, key]) => (
                    <tr key={String(code)} className="border-b border-[#F3E4B0]" style={{ background: '#FFF8DB' }}>
                      <td className="w-[30px] lg:w-[38px] px-1 lg:px-1.5 py-2 text-center text-[10px] font-bold text-[#8A6A00]">{code}</td>
                      <td className="px-1 lg:px-2 py-1.5"><input disabled={labelKey === 'precio_terreno_matriz'} className="input input-ghost !h-7 !w-full !min-w-0 !border-0 !bg-transparent !px-1 font-semibold text-[#1F2937]" value={String(label).replace('US$', displaySymbol())} onChange={(e) => setFinanceDashManual((current) => ({ ...current, dataLabels: { ...current.dataLabels, [String(labelKey)]: e.target.value } }))} /></td>
                      <td className="w-[88px] lg:w-[120px] pl-1 pr-2 py-1.5 text-right whitespace-nowrap lg:text-sm">
                        {key ? <input className="input !h-7 !w-full !min-w-0 !max-w-none !rounded-md !px-1 text-right text-xs lg:text-sm" value={(financeDashManual as any)[key]} onChange={(e) => setFinanceDashManual((current) => ({ ...current, [key as string]: e.target.value }))} /> : (labelKey === 'valor_inicial_accion' ? usd0(valorInicialAccion) : labelKey === 'valor_actual_accion' ? usd0(valorActualAccion) : labelKey === 'utilidad_ajustada' ? `${displaySymbol()} ${usd0(utilidadAjustada)}` : labelKey === 'precio_terreno_matriz' ? usd0(precioTerrenoMatriz) : compactUsd(pptoObra))}
                      </td>
                      <td className="w-[48px] lg:w-[60px] px-0.5 lg:px-1 py-1.5 text-center">
                        <div className="flex justify-center gap-1">
                          <button disabled={labelKey === 'precio_terreno_matriz'} className={labelKey === 'precio_terreno_matriz' ? rowDangerDisabledButton : rowIconButton} type="button" title={labelKey === 'precio_terreno_matriz' ? 'Dato del flujo de caja' : 'Editar'} onClick={focusRowInput}><FiEdit3 size={13} /></button>
                          <button className={rowDangerDisabledButton} type="button" title="Fila base" disabled><FiTrash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-[#F3E4B0]" style={{ background: '#FFF8DB' }}>
                    <td className="w-[30px] lg:w-[38px] px-1 lg:px-1.5 py-2 text-center text-[10px] font-bold text-[#8A6A00]">D.8</td>
                    <td className="px-1 lg:px-2 py-1.5"><input aria-label="Nombre del dato tipo de cambio" className="input input-ghost !h-7 !w-full !min-w-0 !border-0 !bg-transparent !px-1 font-semibold text-[#1F2937]" value={financeDashManual.dataLabels.tipo_cambio ?? 'Tipo de cambio'} onChange={(e) => setFinanceDashManual((current) => ({ ...current, dataLabels: { ...current.dataLabels, tipo_cambio: e.target.value } }))} /></td>
                    <td className="w-[88px] lg:w-[120px] pl-1 pr-2 py-1.5 text-right whitespace-nowrap lg:text-sm"><ExchangeRateField /></td>
                    <td className="w-[48px] lg:w-[60px] px-0.5 lg:px-1 py-1.5 text-center">
                      <div className="flex justify-center gap-1">
                        <button className={rowIconButton} type="button" title="Editar nombre" aria-label="Editar nombre del tipo de cambio" onClick={focusRowInput}><FiEdit3 size={13} /></button>
                        <button className={rowDangerDisabledButton} type="button" title="Fila base" aria-label="Eliminar tipo de cambio" disabled><FiTrash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                  {financeDashManual.dataRows.map((row, index) => isLandMatrixLabel(row.label) ? null : (
                    <tr key={`data-${index}`} className="border-b border-[#F3E4B0]" style={{ background: '#FFF8DB' }}>
                      <td className="w-[30px] lg:w-[38px] px-1 lg:px-1.5 py-1.5 text-center"><input className="input input-ghost !h-7 !border-0 !bg-transparent !px-0 text-center text-[10px] font-bold text-[#8A6A00]" value={row.code} onChange={(e) => updateManualArray('dataRows', index, { code: e.target.value })} /></td>
                      <td className="px-1 lg:px-2 py-1.5"><input className="input input-ghost !h-7 !w-full !min-w-0 !border-0 !bg-transparent !px-1 font-semibold text-[#1F2937]" value={row.label} onChange={(e) => updateManualArray('dataRows', index, { label: e.target.value })} /></td>
                      <td className="w-[88px] lg:w-[120px] pl-1 pr-2 py-1.5 text-right whitespace-nowrap lg:text-sm"><input className="input !h-7 !w-full !min-w-0 !max-w-none !rounded-md !px-1 text-right text-xs lg:text-sm" value={row.value} onChange={(e) => updateManualArray('dataRows', index, { value: e.target.value })} /></td>
                      <td className="w-[48px] lg:w-[60px] px-0.5 lg:px-1 py-1.5 text-center">
                        <div className="flex justify-center gap-1">
                          <button className={rowIconButton} type="button" title="Editar" onClick={focusRowInput}><FiEdit3 size={13} /></button>
                          <button className={rowDangerButton} type="button" title="Eliminar" onClick={() => removeManualArrayRow('dataRows', index)}><FiTrash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border bg-white p-2 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex rounded-lg border bg-slate-50 p-1" style={{ borderColor: '#E5E7EB' }}>
                  <button className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${financePanel === 'commitments' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-blue-700'}`} type="button" onClick={() => setFinancePanel('commitments')}>Compromisos Financieros</button>
                  <button className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${financePanel === 'structure' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-blue-700'}`} type="button" onClick={() => setFinancePanel('structure')}>Estructura de Financiamiento</button>
                </div>
                {financePanel === 'commitments' ? (
                  <button className="btn-neutral !h-8 text-xs" type="button" onClick={() => setFinanceDashManual((current) => ({ ...current, commitmentRows: [...current.commitmentRows, { priority: String(sociosRows.length + current.commitmentRows.length + 4), creditor: 'Nuevo acreedor', amount: '' }] }))}>Agregar dato</button>
                ) : null}
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
              {financePanel === 'commitments' ? (
              <table className={`w-full table-fixed border-collapse text-xs [&_th]:!px-2 [&_th]:align-middle [&_td]:!px-2 [&_td]:align-middle [&_input]:min-w-0 [&_input]:!px-0 ${FINANCING_TABLE_STYLE}`} style={{ minWidth: 460 }}>
                <colgroup><col style={{ width: '14%' }} /><col style={{ width: '32%' }} /><col style={{ width: '22%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /></colgroup>
                <thead><tr style={{ background: '#000066' }}><th className="px-2 py-2 text-center text-[10px] font-bold leading-tight text-white">Prioridad</th><th className="px-2 py-2 text-left text-[10px] font-bold leading-tight text-white">Acreedor</th><th className="px-2 py-2 text-right text-[10px] font-bold leading-tight text-white">{displaySymbol()}</th><th className="px-2 py-2 text-center text-[10px] font-bold leading-tight text-white">Porcentaje</th><th className="px-2 py-2 text-center text-[10px] font-bold leading-tight text-white">Accion</th></tr></thead>
                <tbody>
                  {compromisoRows.map((row, index) => {
                    const customIndex = index - (3 + sociosRows.length);
                    const isCustom = customIndex >= 0;
                    const labelKey = row.length === 4 ? String(row[3]) : '';
                    return <tr key={`${row[0]}-${index}`}><td className="td-base text-center">{isCustom ? <input className="input input-ghost !h-7 !border-0 !bg-transparent text-center" value={financeDashManual.commitmentRows[customIndex]?.priority || ''} onChange={(e) => updateManualArray('commitmentRows', customIndex, { priority: e.target.value })} /> : row[0]}</td><td className="td-base">{isCustom ? <input className="input input-ghost !h-7 !border-0 !bg-transparent" value={financeDashManual.commitmentRows[customIndex]?.creditor || ''} onChange={(e) => updateManualArray('commitmentRows', customIndex, { creditor: e.target.value })} /> : <input className="input input-ghost !h-7 !border-0 !bg-transparent" value={row[1]} onChange={(e) => setFinanceDashManual((current) => ({ ...current, commitmentLabels: { ...current.commitmentLabels, [labelKey]: e.target.value } }))} />}</td><td className="td-base text-right">{isCustom ? <input className="input input-ghost !h-7 !border-0 !bg-transparent text-right" readOnly={currency === 'PEN'} value={currency === 'PEN' ? usd0(num(row[2])) : financeDashManual.commitmentRows[customIndex]?.amount || ''} onChange={(e) => updateManualArray('commitmentRows', customIndex, { amount: e.target.value })} /> : usd0(num(row[2]))}</td><td className="td-base text-center whitespace-nowrap">{compromisoTotal > 0 ? `${((num(row[2]) / compromisoTotal) * 100).toFixed(0)}%` : '0%'}</td><td className="td-base text-center"><div className="flex justify-center gap-1"><button className={rowIconButton} type="button" title="Editar" onClick={focusRowInput}><FiEdit3 size={13} /></button>{isCustom ? <button className={rowDangerButton} type="button" title="Eliminar" onClick={() => removeManualArrayRow('commitmentRows', customIndex)}><FiTrash2 size={13} /></button> : <button className={rowDangerDisabledButton} type="button" title="Fila base" disabled><FiTrash2 size={13} /></button>}</div></td></tr>;
                  })}
                </tbody>
                <tfoot><tr style={{ background: '#064E3B' }}><td className="td-base font-bold text-white" colSpan={2}>Total {displaySymbol()}</td><td className="td-base text-right font-bold text-white">{usd0(compromisoTotal)}</td><td className="td-base text-center font-bold text-white">{compromisoTotal > 0 ? '100%' : '0%'}</td><td className="td-base"></td></tr></tfoot>
              </table>
              ) : (
              <table className={`w-full table-fixed border-collapse text-xs [&_th]:!px-2 [&_th]:align-middle [&_td]:!px-2 [&_td]:align-middle ${FINANCING_TABLE_STYLE}`} style={{ minWidth: 400 }}>
                <colgroup><col style={{ width: '54%' }} /><col style={{ width: '28%' }} /><col style={{ width: '18%' }} /></colgroup>
                <thead><tr style={{ background: '#000066' }}><th className="px-2 py-2 text-left text-[10px] font-bold text-white">Estructura Financiam.</th><th className="px-2 py-2 text-right text-[10px] font-bold text-white">{displaySymbol()}</th><th className="px-2 py-2 text-center text-[10px] font-bold text-white">%</th></tr></thead>
                <tbody>
                  {estructuraRows.map(([key, label, value]) => (
                    <tr key={key}>
                      <td className="td-base">{label}</td>
                      <td className="td-base text-right tabular-nums">{usd0(value)}</td>
                      <td className="td-base text-center tabular-nums">{estructuraTotal !== 0 ? `${((value / estructuraTotal) * 100).toFixed(1)}%` : '0%'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ background: '#064E3B' }}><td className="td-base font-bold text-white">Total Financiamiento</td><td className="td-base text-right font-bold text-white">{usd0(estructuraTotal)}</td><td className="td-base text-center font-bold text-white">{estructuraTotal !== 0 ? '100.0%' : '0%'}</td></tr></tfoot>
              </table>
              )}
              </div>
            </div>
          </div>
        </section>
        <div className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold">Flujo financiero</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 max-sm:[&_button]:min-w-0 max-sm:[&_button]:px-2 max-sm:[&_button]:text-xs">
              <button className="btn-primary whitespace-nowrap" onClick={() => setOpenIn(true)}>Registrar ingreso</button>
              <button className="btn-outline whitespace-nowrap" onClick={() => setOpenExp(true)}>Registrar egreso</button>
              <button className="btn-outline whitespace-nowrap" onClick={() => setShowLoans(true)}>Prestamos</button>
              <button className="btn-outline whitespace-nowrap" onClick={() => setShowClassification(true)}>Clasificacion</button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#E5E7EB' }}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex w-full flex-nowrap items-center justify-between gap-1 sm:contents">
              {([
                { key: '' as const, label: 'Todos', bg: '#F3F4F6', color: '#374151', activeBg: '#171717', activeColor: '#FFFFFF' },
                { key: 'pago_lote' as const, label: 'Pagos de lotes', bg: '#F3E8FF', color: '#6B21A8', activeBg: '#7E22CE', activeColor: '#FFFFFF' },
                { key: 'ingreso' as const, label: 'Ingreso', bg: '#EAF7EE', color: '#125A3B', activeBg: '#16A36A', activeColor: '#FFFFFF' },
                { key: 'egreso' as const, label: 'Egreso', bg: '#E7F0FE', color: '#1259C4', activeBg: '#1259C4', activeColor: '#FFFFFF' },
              ]).map((option) => {
                const active = typeFilter === option.key;
                return (
                  <button
                    key={option.key || 'todos'}
                    type="button"
                    onClick={() => setTypeFilter(option.key)}
                    aria-pressed={active}
                    className="whitespace-nowrap rounded-full px-1.5 py-1 text-[11px] font-semibold transition-all sm:px-3 sm:text-xs"
                    style={{
                      background: active ? option.activeBg : option.bg,
                      color: active ? option.activeColor : option.color,
                      boxShadow: active ? '0 4px 10px rgba(15,23,42,.16)' : 'none',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
              </div>
              <div className="relative ml-1 w-full sm:w-72">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input !h-9 !pl-9"
                  placeholder="Buscar lote, cliente, medio pago o concepto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={cat}
                onChange={setCat}
                options={[{ value: '', label: 'Todas las categorias' }, ...categoryOptions.map((c) => ({ value: c, label: c.replaceAll('_', ' ') }))]}
              />
            </div>
            {(cat || search || typeFilter) && (
              <button className="btn-neutral !h-8 w-full text-xs sm:w-auto" onClick={() => { setCat(''); setSearch(''); setDebouncedSearch(''); setTypeFilter(''); }}>Limpiar filtros</button>
            )}
          </div>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-auto">
            {loading ? <p className="p-4 text-slate-400">Cargando...</p>
              : txns.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">Aun no hay movimientos.</p>
              : (
              <table className="table-base table-head-plomo w-full [&_th]:!whitespace-normal [&_td]:!whitespace-normal [&_td]:break-words">
                <thead><tr>
                  <th className="th-base">ID</th><th className="th-base">Lote</th><th className="th-base">Cliente/Proveedor</th><th className="th-base">Modo de Pago</th>
                  <th className="th-base">Tipo</th><th className="th-base !whitespace-normal !leading-snug"><span className="block whitespace-nowrap">Tipo de Pago/</span><span className="block whitespace-nowrap">Categoría</span></th><th className="th-base">Clasificacion</th><th className="th-base">Agente</th><th className="th-base">Concepto</th>
                  <th className="th-base">Monto {displaySymbol()}</th><th className="th-base">Fecha</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="td-base font-semibold">{t.paymentId != null ? `P${t.paymentId}` : t.operationNumber || `${t.type === 'ingreso' ? 'I' : 'E'}${t.id}`}</td>
                      <td className="td-base"><span className="inline-block whitespace-nowrap">{t.lotCode || (t.lotId ? `#${t.lotId}` : '-')}</span></td>
                      <td className="td-base">{t.clientName || (t.clientId ? `#${t.clientId}` : '-')}</td>
                      <td className="td-base">{paymentLabel(t.paymentMethod)}</td>
                      <td className="td-base"><span className="badge whitespace-nowrap" style={{ background: t.paymentId != null ? '#F3E8FF' : t.type === 'ingreso' ? '#EAF7EE' : '#E7F0FE', color: t.paymentId != null ? '#6B21A8' : t.type === 'ingreso' ? '#125A3B' : '#1259C4' }}>{t.paymentId != null ? 'Pago de lote' : t.displayType || (t.type === 'ingreso' ? 'Ingreso' : 'Egreso')}</span></td>
                      <td className="td-base capitalize">{t.paymentCategory || t.category}</td>
                      <td className="td-base">{t.classification || '-'}</td>
                      <td className="td-base">{t.agentName || '-'}</td>
                      <td className="td-base">{t.concept}</td>
                      <td className="td-base font-medium tabular-nums">{show(t.amount)}</td>
                      <td className="td-base">{formatDate(t.txnDate)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0B2F6E' }}>
                    <td className="td-base font-bold text-white" colSpan={9}>Totales ({meta.total})</td>
                    <td className="td-base font-bold text-white tabular-nums">{show(totalAmount)}</td>
                    <td className="td-base" />
                  </tr>
                </tfoot>
              </table>
              )}
          </div>
          <div className="bg-white p-3 border-t" style={{ borderColor: '#F0F1F3' }}>
            <PaginationBar label="Movimientos" page={page} totalPages={meta.totalPages} total={meta.total} limit={limit} setPage={setPage} setLimit={setLimit} />
          </div>
        </div>
        </>
        )}
      </div>
      {showClassification && (
        <div className="fixed right-6 top-24 z-40 max-h-[calc(100dvh-7rem)] overflow-auto rounded-md border bg-white shadow-2xl" style={{ borderColor: '#E5E7EB' }}>
          <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: '#E5E7EB' }}>
            <h3 className="font-semibold">Clasificacion</h3>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button className="btn-neutral !h-9" type="button" onClick={addFinanceClassRow}>Agregar</button>
              <button className="btn-neutral !h-9" type="button" onClick={() => setShowClassification(false)}><FiX /> Cerrar</button>
            </div>
          </div>
          <div className="overflow-auto p-3">
            {!financeClassLoaded ? <p className="p-4 text-slate-400">Cargando clasificacion...</p> : (
              <table className="table-base table-head-plomo" style={{ width: 800, minWidth: 800 }}>
                <thead>
                  <tr>
                    <th className="th-base">Codigo</th>
                    <th className="th-base">Tipo</th>
                    <th className="th-base">Categorias</th>
                    <th className="th-base">Clasificación</th>
                    <th className="th-base">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {financeClassRows.map((row, index) => (
                    <tr key={row.key}>
                      <td className="td-base w-[90px]">
                        <input
                          className={`input input-ghost !h-7 text-center font-bold uppercase ${row.code && row.code.length < 2 ? '!border-red-300 !text-red-600' : ''}`}
                          value={row.code}
                          maxLength={3}
                          onChange={(e) => updateFinanceClassRow(row.key, { code: e.target.value })}
                        />
                      </td>
                      <td className="td-base" style={{ background: row.movementType === 'Ingreso' ? '#EAF7EE' : row.movementType === 'Egreso' ? '#FFF7ED' : 'transparent' }}>
                        <Select
                          value={row.movementType}
                          onChange={(v) => updateFinanceClassRow(row.key, { movementType: v })}
                          options={[
                            { value: 'Ingreso', label: 'Ingreso' },
                            { value: 'Egreso', label: 'Egreso' }
                          ]}
                          className="input-ghost !h-7"
                        />
                      </td>
                      <td className="td-base"><input className="input input-ghost !h-7" value={row.category || ''} onChange={(e) => updateFinanceClassRow(row.key, { category: e.target.value })} /></td>
                      <td className="td-base" style={{ background: row.eerrClassification === 'Financiamiento' ? '#E0F2FE' : row.eerrClassification === 'Inversión/Construcción' ? '#ECFDF5' : row.eerrClassification === 'Operación (G&A, com, admin)' ? '#FEF3C7' : row.eerrClassification === 'Venta de Lote' ? '#FEE2E2' : 'transparent' }}><input className="input input-ghost !h-7" value={row.eerrClassification} onChange={(e) => updateFinanceClassRow(row.key, { eerrClassification: e.target.value })} /></td>
                      <td className="td-base text-center"><div className="flex justify-center gap-1"><button className={rowIconButton} type="button" title="Editar" onClick={focusRowInput}><FiEdit3 size={13} /></button><button className={rowDangerButton} type="button" title="Eliminar" onClick={() => removeFinanceClassRow(row.key)}><FiTrash2 size={13} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {openExp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenExp(false)} />
          <div className="relative max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 sm:max-h-[92vh] sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="font-semibold" style={{ fontSize: 17 }}>Registrar egreso</h3>
              <span className="text-sm font-black text-[#001BFF]">ID: {operationNumber('expense')}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Lote/Otros"><input className="input" list="finance-lots-expense" value={eForm.lotLabel || ''} onChange={(e) => applyLotToForm('expense', e.target.value)} placeholder="Busca lote o escribe otros" /></Field>
              <Field label="Cliente/Proveedor"><input className="input" value={eForm.clientLabel || ''} onChange={(e) => ef('clientLabel', e.target.value)} /></Field>
              <Field label="Modo de Pago"><input className="input" list="finance-payment-methods" value={eForm.paymentMethod || ''} onChange={(e) => ef('paymentMethod', e.target.value)} /></Field>
              <Field label="Tipo de Pago/Categoria">
                <Select
                  value={eForm.category || ''}
                  onChange={(v) => applyCategoryToForm('expense', v)}
                  options={[{ value: '', label: 'Selecciona...' }, ...financeClassCategoryRows().map(r => ({ value: r.category || r.code, label: r.category || r.code }))]}
                />
              </Field>
              <Field label="Agente"><input className="input" value={eForm.agentName || ''} onChange={(e) => ef('agentName', e.target.value)} /></Field>
              <Field label="Clasificacion"><input className="input bg-slate-50" value={eForm.classification || ''} readOnly placeholder="Se rellena segun la categoria" /></Field>
              <Field label="Monto US$ *"><input type="number" className="input" value={eForm.amount || ''} onChange={(e) => ef('amount', e.target.value)} /></Field>
              <Field label="Fecha"><input type="date" className="input" value={eForm.txnDate || todayInput()} onChange={(e) => ef('txnDate', e.target.value)} /></Field>
            </div>
            <Field label="Concepto *"><input className="input" value={eForm.concept || ''} onChange={(e) => ef('concept', e.target.value)} /></Field>
            {!lockedProjectId && (
              <Field label="Proyecto"><Select value={eForm.projectId || ''} onChange={(v) => ef('projectId', v ? Number(v) : null)} options={[{ value: '', label: '-' }, ...projects.map((p: any) => ({ value: p.id, label: p.name }))]} /></Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpenExp(false)}>Cancelar</button>
              <button className="btn-primary" onClick={addEgreso}>Guardar egreso</button>
            </div>
          </div>
        </div>
      )}
      {openIn && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpenIn(false)} />
          <div className="relative max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 sm:max-h-[92vh] sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="font-semibold" style={{ fontSize: 17 }}>Registrar ingreso adicional</h3>
              <span className="text-sm font-black text-[#001BFF]">ID: {operationNumber('income')}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Lote/Otros"><input className="input" list="finance-lots-income" value={iForm.lotLabel || ''} onChange={(e) => applyLotToForm('income', e.target.value)} placeholder="Busca lote o escribe otros" /></Field>
              <Field label="Cliente/Proveedor"><input className="input" value={iForm.clientLabel || ''} onChange={(e) => inf('clientLabel', e.target.value)} /></Field>
              <Field label="Modo de Pago"><input className="input" list="finance-payment-methods" value={iForm.paymentMethod || ''} onChange={(e) => inf('paymentMethod', e.target.value)} /></Field>
              <Field label="Tipo de Pago/Categoria">
                <Select
                  value={iForm.category || ''}
                  onChange={(v) => applyCategoryToForm('income', v)}
                  options={[{ value: '', label: 'Selecciona...' }, ...financeClassCategoryRows().map(r => ({ value: r.category || r.code, label: r.category || r.code }))]}
                />
              </Field>
              <Field label="Agente"><input className="input" value={iForm.agentName || ''} onChange={(e) => inf('agentName', e.target.value)} /></Field>
              <Field label="Clasificacion"><input className="input bg-slate-50" value={iForm.classification || ''} readOnly placeholder="Se rellena segun la categoria" /></Field>
              <Field label="Monto US$ *"><input type="number" className="input" value={iForm.amount || ''} onChange={(e) => inf('amount', e.target.value)} /></Field>
              <Field label="Fecha"><input type="date" className="input" value={iForm.txnDate || todayInput()} onChange={(e) => inf('txnDate', e.target.value)} /></Field>
            </div>
            <Field label="Concepto *"><input className="input" value={iForm.concept || ''} onChange={(e) => inf('concept', e.target.value)} /></Field>
            {!lockedProjectId && (
              <Field label="Proyecto"><Select value={iForm.projectId || ''} onChange={(v) => inf('projectId', v ? Number(v) : null)} options={[{ value: '', label: '-' }, ...projects.map((p: any) => ({ value: p.id, label: p.name }))]} /></Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-neutral" onClick={() => setOpenIn(false)}>Cancelar</button>
              <button className="btn-primary" onClick={addIngreso}>Guardar ingreso</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

