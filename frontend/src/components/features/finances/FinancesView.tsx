'use client';
import { useEffect, useState, useCallback } from 'react';
import { Toaster, toast, Field } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/types';
import { useDisplayCurrency } from '@/lib/currency';
import { Select } from '@/components/ui/Select';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { FiEdit3, FiSearch, FiTrash2, FiX } from 'react-icons/fi';

type T = {
  id: number; type: string; category: string; concept: string; amount: string; txnDate: string; projectId?: number | null;
  lotId?: number | null; clientId?: number | null; lotCode?: string | null; clientName?: string | null; paymentMethod?: string | null;
  paymentCategory?: string | null; classification?: string | null; agentName?: string | null;
};

type BankMovement = {
  id: number;
  movementDate?: string | null;
  monthLabel?: string | null;
  description?: string | null;
  counterparty?: string | null;
  depositAmount?: string | number;
  movementType?: string | null;
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
  socios: Array<{ name: string; capital: string; adicional: string }>;
  dataRows: Array<{ code: string; label: string; value: string }>;
  commitmentRows: Array<{ priority: string; creditor: string; amount: string }>;
  structureRows: Array<{ label: string; amount: string }>;
};

type FinanceDashData = {
  budget: Record<string, number>;
  statement: any;
  staticFlow: any;
  dynamicFlow: any;
  payments: any;
  salesOverdue: { count: number; amount: number };
  loans: { amount: number; interest: number; updated: number };
  extraIncome: number;
};

type FinanceClassRow = {
  key: string;
  sourceId?: number;
  code: string;
  movementType: string;
  eerrClassification: string;
  cashflowRowId: string;
  paymentMethod: string;
  sortOrder: string;
  custom?: boolean;
  deleted?: boolean;
};

const CATS = ['marketing', 'mantenimiento', 'obra', 'administracion', 'comisiones', 'otros'];
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
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function compactUsd(value: number) {
  return `US$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function num(value: unknown) {
  return Number(value || 0) || 0;
}

function cashflowTotal(model: any, id: string) {
  const rows = Array.isArray(model?.rows) ? model.rows : [];
  const row = rows.find((item: any) => item?.id === id);
  return Array.isArray(row?.values) ? row.values.reduce((sum: number, value: unknown) => sum + num(value), 0) : 0;
}

function firstPositive(...values: number[]) {
  return values.find((value) => Number(value || 0) > 0) || 0;
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
    { name: 'Socio 3', capital: '', adicional: '' },
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
  const [typeFilter, setTypeFilter] = useState<'' | 'ingreso' | 'egreso'>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [openExp, setOpenExp] = useState(false);
  const [openIn, setOpenIn] = useState(false);
  const [showLoans, setShowLoans] = useState(false);
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
  const { format: show } = useDisplayCurrency();
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
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [cat, typeFilter, debouncedSearch, lockedProjectId, page, limit]);

  useEffect(() => {
    load();
    api.get<any[]>('/projects').then(setProjects).catch(() => {});
    const lotQuery = lockedProjectId ? `/lots?projectId=${lockedProjectId}&limit=1000` : '/lots?limit=1000';
    api.get<any>(lotQuery).then((data) => setLots(Array.isArray(data) ? data : (data?.items || []))).catch(() => setLots([]));
  }, [load, lockedProjectId]);
  useEffect(() => { setPage(1); }, [cat, typeFilter, debouncedSearch, lockedProjectId]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadLoans = useCallback(async () => {
    if (!lockedProjectId || !showLoans) return;
    setLoanLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('projectId', String(lockedProjectId));
      q.set('movementType', 'PRESTAMO');
      if (loanFrom) q.set('from', loanFrom);
      if (loanTo) q.set('to', loanTo);
      const data = await api.get<any>(`/bank-accounts?${q.toString()}`);
      setLoanRows(Array.isArray(data) ? data : (data?.items || []));
    } catch (e: any) {
      toast(e.message || 'No se pudieron cargar los prestamos', 'err');
      setLoanRows([]);
    } finally {
      setLoanLoading(false);
    }
  }, [lockedProjectId, showLoans, loanFrom, loanTo]);

  useEffect(() => { loadLoans(); }, [loadLoans]);

  const loadFinanceDash = useCallback(async () => {
    if (!lockedProjectId) return;
    try {
      const [budget, statement, staticFlow, dynamicFlow, payments, salesContext, bank, loanSetting] = await Promise.all([
        api.get<any>(`/construction-budget?projectId=${lockedProjectId}`).catch(() => ({})),
        api.get<any>(`/finances/income-statement?projectId=${lockedProjectId}`).catch(() => ({})),
        api.get<any>(`/cashflow/model?projectId=${lockedProjectId}&mode=estatico`).catch(() => null),
        api.get<any>(`/cashflow/model?projectId=${lockedProjectId}&mode=dinamico`).catch(() => null),
        api.get<any>(`/payments/caja?projectId=${lockedProjectId}`).catch(() => ({})),
        api.get<any>(`/sales/payment-context?projectId=${lockedProjectId}`).catch(() => ({ sales: [] })),
        api.get<any>(`/bank-accounts?projectId=${lockedProjectId}&limit=500`).catch(() => ({ items: [] })),
        api.get<{ value?: string }>(`/settings/value/${encodeURIComponent(loanSettingsKey)}`).catch(() => ({ value: '' })),
      ]);
      const movements = Array.isArray(bank) ? bank : (bank?.items || []);
      const extraIncome = movements
        .filter((item: any) => num(item.depositAmount) > 0 && !String(item.movementType || '').toLowerCase().includes('prestamo'))
        .reduce((sum: number, item: any) => sum + num(item.depositAmount), 0);
      let loanParsed: any = {};
      try { loanParsed = loanSetting?.value ? JSON.parse(loanSetting.value) : {}; } catch { loanParsed = {}; }
      const loanManualData = loanParsed?.manual && typeof loanParsed.manual === 'object' ? loanParsed.manual : {};
      const loanInterest = Object.values(loanManualData).reduce((sum: number, item: any) => sum + num(item?.interest), 0);
      const loanRowsData = movements.filter((item: any) => String(item.movementType || '').toLowerCase().includes('prestamo'));
      const loanAmount = loanRowsData.reduce((sum: number, item: any) => sum + num(item.depositAmount), 0);
      const overduePlanRows = (Array.isArray(salesContext?.sales) ? salesContext.sales : [])
        .flatMap((sale: any) => Array.isArray(sale?.plan) ? sale.plan : (Array.isArray(sale?.installments) ? sale.installments : []))
        .filter((row: any) => row?.overdue && !row?.paid);
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
        loans: { amount: loanAmount, interest: loanInterest, updated: loanAmount + loanInterest },
        extraIncome,
      });
    } catch (e: any) {
      toast(e.message || 'No se pudo cargar el tablero financiero', 'err');
    }
  }, [lockedProjectId, loanSettingsKey]);

  useEffect(() => { loadFinanceDash(); }, [loadFinanceDash]);

  useEffect(() => {
    if ((!showClassification && !openExp && !openIn) || !lockedProjectId || !financeClassSettingsKey) return;
    let alive = true;
    setFinanceClassLoaded(false);
    Promise.all([
      api.get<any>(`/bank-accounts/categories?projectId=${lockedProjectId}`).catch(() => ({ items: [] })),
      api.get<{ value?: string }>(`/settings/value/${encodeURIComponent(financeClassSettingsKey)}`).catch(() => ({ value: '' })),
    ]).then(([categories, saved]) => {
      if (!alive) return;
      let parsed: any = {};
      try { parsed = saved?.value ? JSON.parse(saved.value) : {}; } catch { parsed = {}; }
      const savedRows = Array.isArray(parsed?.rows) ? parsed.rows : [];
      const savedBySource = new Map(savedRows.filter((row: any) => row.sourceId).map((row: any) => [Number(row.sourceId), row]));
      const baseRows: FinanceClassRow[] = (Array.isArray(categories?.items) ? categories.items : []).map((item: any, index: number) => {
        const savedRow: any = savedBySource.get(Number(item.id)) || {};
        return {
          key: `source-${item.id}`,
          sourceId: Number(item.id),
          code: String(savedRow.code ?? item.code ?? ''),
          movementType: String(savedRow.movementType ?? item.movementType ?? ''),
          eerrClassification: String(savedRow.eerrClassification ?? item.eerrClassification ?? ''),
          cashflowRowId: String(savedRow.cashflowRowId ?? item.cashflowRowId ?? ''),
          paymentMethod: String(savedRow.paymentMethod ?? ''),
          sortOrder: String(savedRow.sortOrder ?? item.sortOrder ?? index + 1),
          deleted: Boolean(savedRow.deleted),
        };
      });
      const customRows = savedRows
        .filter((row: any) => row.custom && !row.sourceId)
        .map((row: any, index: number) => ({
          key: String(row.key || `custom-${Date.now()}-${index}`),
          code: String(row.code || ''),
          movementType: String(row.movementType || ''),
          eerrClassification: String(row.eerrClassification || ''),
          cashflowRowId: String(row.cashflowRowId || ''),
          paymentMethod: String(row.paymentMethod || ''),
          sortOrder: String(row.sortOrder || baseRows.length + index + 1),
          custom: true,
        }));
      setFinanceClassRows([...baseRows, ...customRows].filter((row) => !row.deleted));
    }).catch((error: any) => {
      if (alive) toast(error?.message || 'No se pudo cargar clasificacion', 'err');
    }).finally(() => {
      if (alive) setFinanceClassLoaded(true);
    });
    return () => { alive = false; };
  }, [showClassification, openExp, openIn, lockedProjectId, financeClassSettingsKey]);

  useEffect(() => {
    if (!showClassification || !financeClassSettingsKey || !financeClassLoaded) return;
    const timer = setTimeout(() => {
      api.put(`/settings/value/${encodeURIComponent(financeClassSettingsKey)}`, {
        value: JSON.stringify({ rows: financeClassRows }),
      }).catch(() => toast('No se pudo guardar la clasificacion de Finanzas', 'err'));
    }, 600);
    return () => clearTimeout(timer);
  }, [showClassification, financeClassSettingsKey, financeClassLoaded, financeClassRows]);

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
          socios: Array.isArray(parsed?.socios) ? parsed.socios : defaults.socios,
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
    ...financeClassRows.map((row) => row.movementType).filter(Boolean),
    ...FINANCE_PAYMENT_CATEGORIES,
  ]));

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
    const row = financeClassRows.find((item) => normalized(item.movementType) === normalized(value));
    if (!row) {
      if (!value.trim() || normalized(value) === 'otros') {
        update('classification', '');
        update('paymentMethod', '');
      }
      return;
    }
    update('classification', row.eerrClassification || '');
    if (row.paymentMethod) update('paymentMethod', row.paymentMethod);
  }

  const lotSuggestions = (value: unknown) => {
    const term = normalized(value);
    if (!term || !term.startsWith('l')) return [];
    return lots
      .filter((lot: any) => normalized(lot.code).includes(term) || normalized(`lote ${lot.code}`).includes(term))
      .slice(0, 20);
  };

  const loanTableRows = loanRows.map((row, index) => {
    const amount = Number(row.depositAmount || 0);
    const manual = loanManual[row.id] || {};
    const months = Number(manual.months || 0);
    const interest = Number(manual.interest || 0);
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
  const ingresosExtra = num(financeDash?.extraIncome);
  const boletasEmitidas = num(financeDashManual.boletasEmitidas);
  const cuotasPorCobrar = Math.max(0, ingresoVentaLotes - pagoCuotasLotes);
  const cuotasMora = firstPositive(num(paymentsMetrics.overdueAmount), num(financeDash?.salesOverdue.amount));
  const cuotasMoraCount = firstPositive(num(paymentsMetrics.overduePayments), num(financeDash?.salesOverdue.count));
  const cuentasPorPagar = num(paymentsMetrics.pendingAmount);
  const totalAcciones = num(financeDashManual.totalAcciones);
  const sociosBase = financeDashManual.socios;
  const totalAporteSocios = sociosBase.reduce((sum, socio) => sum + num(socio.capital) + num(socio.adicional), 0);
  const valorInicialAccion = totalAcciones > 0 ? totalAporteSocios / totalAcciones : 0;
  const factorActualizacion = num(financeDashManual.factorActualizacion);
  const valorActualAccion = valorInicialAccion * factorActualizacion;
  const accionesAVender = num(financeDashManual.accionesAVender);
  const sociosRows = sociosBase.map((socio, index) => {
    const aporteCapital = num(socio.capital);
    const aporteAdicional = num(socio.adicional);
    const aporteTotal = aporteCapital + aporteAdicional;
    const participacion = totalAporteSocios > 0 ? aporteTotal / totalAporteSocios : 0;
    const acciones = participacion * totalAcciones;
    const inversionActualizada = acciones * valorActualAccion;
    const ventaAcciones = participacion * accionesAVender;
    const accionesFinal = Math.max(0, acciones - ventaAcciones);
    const pctAcciones = totalAcciones > 0 ? accionesFinal / totalAcciones : 0;
    const utilidad = pctAcciones * utilidadAjustada;
    return {
      index: index + 1,
      name: socio.name,
      aporteCapital,
      aporteAdicional,
      aporteTotal,
      participacion,
      acciones,
      inversionActualizada,
      ventaAcciones,
      accionesFinal,
      pctAcciones,
      utilidad,
      rentabilidadActualizada: inversionActualizada > 0 ? utilidad / inversionActualizada : 0,
      rentabilidadInicial: aporteTotal > 0 ? utilidad / aporteTotal : 0,
    };
  });
  const socioTotals = sociosRows.reduce((acc, row) => {
    acc.capital += row.aporteCapital;
    acc.adicional += row.aporteAdicional;
    acc.total += row.aporteTotal;
    acc.acciones += row.acciones;
    acc.inversion += row.inversionActualizada;
    acc.venta += row.ventaAcciones;
    acc.final += row.accionesFinal;
    acc.utilidad += row.utilidad;
    return acc;
  }, { capital: 0, adicional: 0, total: 0, acciones: 0, inversion: 0, venta: 0, final: 0, utilidad: 0 });
  const compromisoTerrenoValue = financeDashManual.compromisoTerreno === '' ? costoTerreno : num(financeDashManual.compromisoTerreno);
  const estructuraRows = [
    ['capital', financeDashManual.structureLabels.capital || 'Aporte de Capital', socioTotals.capital],
    ['venta_lotes', financeDashManual.structureLabels.venta_lotes || 'Venta de Lotes (Pagos)', ingresoVentaLotes * 0.20],
    ['preventa', financeDashManual.structureLabels.preventa || 'Preventa (25% de los lotes)', ingresoVentaLotes * 0.25],
    ['prestamos_aporte', financeDashManual.structureLabels.prestamos_aporte || 'Prestamos (Aporte Adici)', socioTotals.total],
    ['prestamos_bancos', financeDashManual.structureLabels.prestamos_bancos || 'Prestamos - Bancos', prestamosTotal],
    ...financeDashManual.structureRows.map((row) => ['', row.label || 'Nuevo dato', num(row.amount)] as [string, string, number]),
  ] as Array<[string, string, number]>;
  const estructuraTotal = estructuraRows.reduce((sum, row) => sum + num(row[2]), 0);
  const compromisoRows = [
    ['1', financeDashManual.commitmentLabels.terreno || 'Terreno', compromisoTerrenoValue, 'terreno'],
    ['2', financeDashManual.commitmentLabels.deuda_clientes || 'Deuda Clientes', pagoCuotasLotes, 'deuda_clientes'],
    ['3', financeDashManual.commitmentLabels.gastos_financieros || 'Gastos Financieros', gastosFinancieros, 'gastos_financieros'],
    ...sociosRows.map((row) => [String(row.index + 3), row.name || `Socio ${row.index}`, row.aporteTotal] as [string, string, number]),
    ...financeDashManual.commitmentRows.map((row, index) => [row.priority || String(sociosRows.length + 4 + index), row.creditor || 'Nuevo acreedor', num(row.amount)] as [string, string, number]),
  ] as Array<[string, string, number] | [string, string, number, string]>;
  const compromisoTotal = compromisoRows.reduce((sum, [, , value]) => sum + num(value), 0);
  const dashboardCards = [
    { label: 'Ingreso Venta de Lotes', value: ingresoVentaLotes, note: `${num(paymentsMetrics.totalSaleLots)} lotes`, color: '#16A36A' },
    { label: 'Ppto de Obra US$', value: pptoObra, note: `Avance Real: ${compactUsd(cashflowTotal(financeDash?.dynamicFlow, 'direct'))}`, color: '#16A36A' },
    { label: 'Costo del Terreno US$', value: costoTerreno, note: `Deuda: ${compactUsd(cashflowTotal(financeDash?.dynamicFlow, 'land'))}`, color: '#2563EB' },
    { label: 'Gastos de Ventas y Adm.', value: gastosVentasAdmin, note: `Real: ${compactUsd(cashflowTotal(financeDash?.dynamicFlow, 'selling'))}`, color: '#2563EB' },
    { label: 'Utilidad Ajustada Neta', value: utilidadAjustada, note: `Real: ${compactUsd(cashflowTotal(financeDash?.dynamicFlow, 'adjusted'))}`, color: '#DC2626' },
    { label: 'Prestamos US$', value: prestamosTotal, note: 'Capital', color: '#DC2626' },
    { label: 'Gastos Financieros US$', value: gastosFinancieros, note: 'Flujo de caja', color: '#CA8A04' },
    { label: 'Venta de Lotes Real', value: ventaLotesReal, note: `${num(paymentsMetrics.totalSaleLots)} lotes`, color: '#16A36A' },
    { label: 'Pago Cuotas de Lotes', value: pagoCuotasLotes, note: `${num(paymentsMetrics.paidCuotas)} cuotas`, color: '#16A36A' },
    { label: 'Ingresos Extraordinarios US$', value: ingresosExtra, note: 'Cuentas y bancos', color: '#2563EB' },
    { label: 'Boletas Emitidas US$', value: boletasEmitidas, note: 'Editable', color: '#2563EB', manual: 'boletasEmitidas' as const },
    { label: 'Cuotas por Cobrar US$', value: cuotasPorCobrar, note: `${num(paymentsMetrics.pendingCuotas)} cuotas`, color: '#DC2626' },
    { label: 'Cuotas en Mora', value: cuotasMora, note: `${cuotasMoraCount} cuotas`, color: '#DC2626' },
    { label: 'Cuentas por Pagar US$', value: cuentasPorPagar, note: 'Cuotas pendientes', color: '#CA8A04' },
  ];
  const updateSocio = (index: number, patch: Partial<{ name: string; capital: string; adicional: string }>) => {
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
      socios: current.socios.filter((_, itemIndex) => itemIndex !== index),
    }));
  };
  const focusRowInput = (event: any) => {
    const input = event.currentTarget.closest('tr')?.querySelector('input') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  };
  const rowIconButton = 'inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-700';
  const rowDangerButton = 'inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600';
  const updateFinanceClassRow = (key: string, patch: Partial<FinanceClassRow>) => {
    setFinanceClassRows((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  };
  const addFinanceClassRow = () => {
    setFinanceClassRows((rows) => [
      ...rows,
      { key: `custom-${Date.now()}`, code: '', movementType: 'Nuevo concepto', eerrClassification: '', cashflowRowId: '', paymentMethod: '', sortOrder: String(rows.length + 1), custom: true },
    ]);
  };
  const removeFinanceClassRow = (key: string) => {
    setFinanceClassRows((rows) => rows.filter((row) => row.key !== key));
  };
  const saveFinanceClassificationNow = (rows = financeClassRows) => {
    if (!financeClassSettingsKey) return;
    api.put(`/settings/value/${encodeURIComponent(financeClassSettingsKey)}`, {
      value: JSON.stringify({ rows }),
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
          <div className="card ml-auto w-fit max-w-full p-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b px-4 py-3 xl:flex-row xl:items-center xl:justify-between" style={{ borderColor: '#E5E7EB' }}>
              <h3 className="font-semibold">Prestamos</h3>
              <div className="flex flex-wrap items-center justify-end gap-2 xl:flex-nowrap">
                <label className="text-xs font-semibold text-slate-500">Fecha de actualizacion</label>
                <input type="date" className="input !h-9 !w-auto" value={loanUpdatedAt} onChange={(e) => setLoanUpdatedAt(e.target.value)} />
                <label className="text-xs font-semibold text-slate-500">TEA</label>
                <input className="input !h-9 !w-20" value={loanTea} onChange={(e) => setLoanTea(e.target.value)} />
                <label className="text-xs font-semibold text-slate-500">TEM</label>
                <input className="input !h-9 !w-20" value={loanTem} onChange={(e) => setLoanTem(e.target.value)} />
                <input type="date" className="input !h-9 !w-auto" value={loanFrom} onChange={(e) => setLoanFrom(e.target.value)} title="Desde" />
                <input type="date" className="input !h-9 !w-auto" value={loanTo} onChange={(e) => setLoanTo(e.target.value)} title="Hasta" />
                <button className="btn-neutral !h-9" type="button" onClick={() => { setLoanFrom(''); setLoanTo(''); }}>Todo</button>
                <button className="btn-neutral !h-9" type="button" onClick={() => setShowLoans(false)}><FiX /> Cerrar</button>
              </div>
            </div>
            <div className="overflow-auto p-3">
              {loanLoading ? <p className="p-4 text-slate-400">Cargando prestamos...</p> : (
                <table className="table-base" style={{ minWidth: 1480, width: '100%' }}>
                  <thead>
                    <tr>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Item</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Fecha de ABONO</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Mes</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Descripcion (EC BCP)</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Proveedor (Egreso)/Cliente (Ingreso)</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Abono (Ingreso)</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>TIPO INGRESO/GASTO</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Fecha de Actualizacion</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Meses del Prestamo</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Intereses US$</th>
                      <th className="th-base" style={{ background: '#6B7280', color: '#fff' }}>Monto Actualizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loanTableRows.map((row) => (
                      <tr key={row.id}>
                        <td className="td-base text-center">{row.index}</td>
                        <td className="td-base">{formatDate(row.movementDate)}</td>
                        <td className="td-base">{row.monthLabel || '-'}</td>
                        <td className="td-base">{row.description || '-'}</td>
                        <td className="td-base font-medium">{row.counterparty || '-'}</td>
                        <td className="td-base text-right tabular-nums">{usd(row.amount)}</td>
                        <td className="td-base">{row.movementType || 'PRESTAMO'}</td>
                        <td className="td-base">{formatDate(loanUpdatedAt)}</td>
                        <td className="td-base"><input className="input !h-8 text-right" value={loanManual[row.id]?.months || ''} onChange={(e) => setLoanManual((cur) => ({ ...cur, [row.id]: { ...cur[row.id], months: e.target.value } }))} /></td>
                        <td className="td-base"><input className="input !h-8 text-right" value={loanManual[row.id]?.interest || ''} onChange={(e) => setLoanManual((cur) => ({ ...cur, [row.id]: { ...cur[row.id], interest: e.target.value } }))} /></td>
                        <td className="td-base text-right font-semibold tabular-nums">{usd(row.updatedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#0B2F6E' }}>
                      <td className="td-base font-bold text-white" colSpan={4}></td>
                      <td className="td-base font-bold text-white">Totales US$</td>
                      <td className="td-base font-bold text-white text-right">{usd(loanTotals.amount)}</td>
                      <td className="td-base" colSpan={3}></td>
                      <td className="td-base font-bold text-white text-right">{usd(loanTotals.interest)}</td>
                      <td className="td-base font-bold text-white text-right">{usd(loanTotals.updated)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              <div className="mt-6 max-w-3xl">
                <h3 className="mb-2 font-semibold">Resumen</h3>
                <table className="table-base">
                  <thead><tr><th className="th-base">Item</th><th className="th-base">Acreedor</th><th className="th-base">Prestamo</th><th className="th-base">Intereses</th><th className="th-base">Deuda Actualizada</th></tr></thead>
                  <tbody>
                    {loanSummaryRows.map((row, index) => (
                      <tr key={row.creditor}><td className="td-base">{index + 1}</td><td className="td-base">{row.creditor}</td><td className="td-base text-right">{usd(row.amount)}</td><td className="td-base text-right">{usd(row.interest)}</td><td className="td-base text-right">{usd(row.updated)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr style={{ background: '#0B2F6E' }}><td className="td-base font-bold text-white"></td><td className="td-base font-bold text-white">Total US$</td><td className="td-base font-bold text-white text-right">{usd(loanTotals.amount)}</td><td className="td-base font-bold text-white text-right">{usd(loanTotals.interest)}</td><td className="td-base font-bold text-white text-right">{usd(loanTotals.updated)}</td></tr></tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : (
        <>
        <section className="space-y-4">
          <h2 className="text-2xl font-black tracking-normal" style={{ color: '#001BFF' }}>FINANZAS</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            {dashboardCards.map((card) => (
              <div key={card.label} className="min-h-[104px] rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md" style={{ borderColor: '#E5E7EB', borderTopColor: card.color, borderTopWidth: 3 }}>
                <p className="min-h-8 text-center text-[10px] font-bold uppercase leading-snug text-slate-600">{card.label}</p>
                {card.manual ? (
                  <input
                    className="mt-1 w-full border-0 bg-transparent text-center text-base font-black text-blue-700 outline-none sm:text-lg"
                    value={financeDashManual[card.manual]}
                    onChange={(e) => setFinanceDashManual((current) => ({ ...current, [card.manual!]: e.target.value }))}
                    placeholder="0"
                  />
                ) : (
                  <p className="mt-1 truncate text-center text-base font-black text-blue-700 sm:text-lg">{compactUsd(card.value)}</p>
                )}
                <p className="mt-2 truncate text-[10px] text-slate-500">- {card.note}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border bg-white p-3 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">Socios</h3>
              <button className="btn-neutral !h-8 text-xs" type="button" onClick={() => setFinanceDashManual((current) => ({ ...current, socios: [...current.socios, { name: `Socio ${current.socios.length + 1}`, capital: '', adicional: '' }] }))}>Agregar socio</button>
            </div>
            <div className="overflow-auto rounded-md border" style={{ borderColor: '#E5E7EB' }}>
              <table className="table-base" style={{ minWidth: 1320 }}>
                <thead>
                  <tr>
                    {['Socios', 'Nombres y Apellidos', 'Aporte Capital US$', 'Aporte Adicional US$', 'Aporte Total US$', 'Participacion %', 'Nro. de Acciones', 'Inversion Actualizado US$', 'Venta # Acciones', 'Nro. Acciones Final', '% de Acciones', 'Utilidad US$', 'Rentabilidad %', 'Rentabilidad % (Resp Inv Inicial)', 'Accion'].map((head, index) => (
                      <th key={head} className="th-base text-white" style={{ background: index >= 7 && index <= 11 ? '#A9D18E' : index >= 12 ? '#2F75B5' : '#7F7F7F', color: index >= 7 && index <= 11 ? '#000' : '#fff' }}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sociosRows.map((row, index) => (
                    <tr key={index}>
                      <td className="td-base text-center">{row.index}</td>
                      <td className="td-base"><input className="input input-ghost !h-7 !border-0 !bg-transparent" value={row.name} onChange={(e) => updateSocio(index, { name: e.target.value })} /></td>
                      <td className="td-base"><input className="input input-ghost !h-7 !border-0 !bg-transparent text-right" value={financeDashManual.socios[index]?.capital || ''} onChange={(e) => updateSocio(index, { capital: e.target.value })} /></td>
                      <td className="td-base"><input className="input input-ghost !h-7 !border-0 !bg-transparent text-right" value={financeDashManual.socios[index]?.adicional || ''} onChange={(e) => updateSocio(index, { adicional: e.target.value })} /></td>
                      <td className="td-base text-right font-semibold">{usd(row.aporteTotal)}</td>
                      <td className="td-base text-center">{(row.participacion * 100).toFixed(0)}%</td>
                      <td className="td-base text-right">{usd(row.acciones)}</td>
                      <td className="td-base text-right">{usd(row.inversionActualizada)}</td>
                      <td className="td-base text-right">{usd(row.ventaAcciones)}</td>
                      <td className="td-base text-right">{usd(row.accionesFinal)}</td>
                      <td className="td-base text-center">{(row.pctAcciones * 100).toFixed(0)}%</td>
                      <td className="td-base text-right">{usd(row.utilidad)}</td>
                      <td className="td-base text-center">{(row.rentabilidadActualizada * 100).toFixed(1)}%</td>
                      <td className="td-base text-center">{(row.rentabilidadInicial * 100).toFixed(1)}%</td>
                      <td className="td-base text-center"><div className="flex justify-center gap-1"><button className={rowIconButton} type="button" title="Editar" onClick={focusRowInput}><FiEdit3 size={13} /></button><button className={rowDangerButton} type="button" title="Eliminar" onClick={() => removeSocio(index)}><FiTrash2 size={13} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#000066' }}>
                    <td className="td-base font-bold text-white" colSpan={2}>Total</td>
                    <td className="td-base text-right font-bold text-white">{usd(socioTotals.capital)}</td>
                    <td className="td-base text-right font-bold text-white">{usd(socioTotals.adicional)}</td>
                    <td className="td-base text-right font-bold text-white">{usd(socioTotals.total)}</td>
                    <td className="td-base text-center font-bold text-white">100%</td>
                    <td className="td-base text-right font-bold text-white">{usd(socioTotals.acciones)}</td>
                    <td className="td-base text-right font-bold text-white">{usd(socioTotals.inversion)}</td>
                    <td className="td-base text-right font-bold text-white">{usd(socioTotals.venta)}</td>
                    <td className="td-base text-right font-bold text-white">{usd(socioTotals.final)}</td>
                    <td className="td-base text-center font-bold text-white">100%</td>
                    <td className="td-base text-right font-bold text-white">{usd(socioTotals.utilidad)}</td>
                    <td className="td-base" colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2 xl:gap-7">
            <div className="min-w-0 rounded-lg border bg-white p-3 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="font-bold text-blue-700">Datos Importantes</h3>
                <button className="btn-neutral !h-8 text-xs" type="button" onClick={() => setFinanceDashManual((current) => ({ ...current, dataRows: [...current.dataRows, { code: `D.${current.dataRows.length + 8}`, label: 'Nuevo dato', value: '' }] }))}>Agregar dato</button>
              </div>
              <div className="overflow-x-auto rounded-md border" style={{ borderColor: '#E5E7EB' }}>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {[
                    ['D.1', 'total_acciones', financeDashManual.dataLabels.total_acciones || 'Total Acciones', 'totalAcciones'],
                    ['D.2', 'valor_inicial_accion', financeDashManual.dataLabels.valor_inicial_accion || 'Valor Inicial de la Accion US$', null],
                    ['D.3', 'factor_actualizacion', financeDashManual.dataLabels.factor_actualizacion || 'Factor Actualizacion de la accion', 'factorActualizacion'],
                    ['D.4', 'valor_actual_accion', financeDashManual.dataLabels.valor_actual_accion || 'Valor Actual de la Accion US$', null],
                    ['D.5', 'acciones_vender', financeDashManual.dataLabels.acciones_vender || 'Acciones a vender', 'accionesAVender'],
                    ['D.6', 'utilidad_ajustada', financeDashManual.dataLabels.utilidad_ajustada || 'Utilidad Ajustada US$', null],
                    ['D.7', 'ppto_obra', financeDashManual.dataLabels.ppto_obra || 'Ppto. de Obra US$', null],
                  ].map(([code, labelKey, label, key]) => (
                    <tr key={String(code)} className="border-b border-[#F3E4B0]" style={{ background: '#FFF8DB' }}>
                      <td className="w-[42px] px-1.5 py-2 text-center text-[10px] font-bold text-[#8A6A00]">{code}</td>
                      <td className="px-2 py-1.5"><input className="input input-ghost !h-7 !border-0 !bg-transparent !px-1 font-semibold text-[#1F2937]" value={String(label)} onChange={(e) => setFinanceDashManual((current) => ({ ...current, dataLabels: { ...current.dataLabels, [String(labelKey)]: e.target.value } }))} /></td>
                      <td className="w-[130px] px-2 py-1.5 text-right">
                        {key ? <input className="input !h-7 !w-auto !rounded-md !px-2 min-w-[54px] max-w-[130px] text-right text-xs" style={{ width: `${Math.max(54, String((financeDashManual as any)[key] || '').length * 8 + 24)}px` }} value={(financeDashManual as any)[key]} onChange={(e) => setFinanceDashManual((current) => ({ ...current, [key as string]: e.target.value }))} /> : (labelKey === 'valor_inicial_accion' ? usd(valorInicialAccion) : labelKey === 'valor_actual_accion' ? usd(valorActualAccion) : labelKey === 'utilidad_ajustada' ? compactUsd(utilidadAjustada) : compactUsd(pptoObra))}
                      </td>
                    </tr>
                  ))}
                  {financeDashManual.dataRows.map((row, index) => (
                    <tr key={`data-${index}`} className="border-b border-[#F3E4B0]" style={{ background: '#FFF8DB' }}>
                      <td className="w-[42px] px-1.5 py-1.5 text-center"><input className="input input-ghost !h-7 !border-0 !bg-transparent !px-0 text-center text-[10px] font-bold text-[#8A6A00]" value={row.code} onChange={(e) => updateManualArray('dataRows', index, { code: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><input className="input input-ghost !h-7 !border-0 !bg-transparent !px-1 font-semibold text-[#1F2937]" value={row.label} onChange={(e) => updateManualArray('dataRows', index, { label: e.target.value })} /></td>
                      <td className="w-[130px] px-2 py-1.5 text-right"><input className="input !h-7 !w-auto !rounded-md !px-2 min-w-[54px] max-w-[130px] text-right text-xs" style={{ width: `${Math.max(54, String(row.value || '').length * 8 + 24)}px` }} value={row.value} onChange={(e) => updateManualArray('dataRows', index, { value: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border bg-white p-3 shadow-sm" style={{ borderColor: '#E5E7EB' }}>
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex rounded-lg border bg-slate-50 p-1" style={{ borderColor: '#E5E7EB' }}>
                  <button className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${financePanel === 'commitments' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-blue-700'}`} type="button" onClick={() => setFinancePanel('commitments')}>Compromisos Financieros</button>
                  <button className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${financePanel === 'structure' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-blue-700'}`} type="button" onClick={() => setFinancePanel('structure')}>Estructura de Financiamiento</button>
                </div>
                {financePanel === 'commitments' ? (
                  <button className="btn-neutral !h-8 text-xs" type="button" onClick={() => setFinanceDashManual((current) => ({ ...current, commitmentRows: [...current.commitmentRows, { priority: String(sociosRows.length + current.commitmentRows.length + 4), creditor: 'Nuevo acreedor', amount: '' }] }))}>Agregar dato</button>
                ) : (
                  <button className="btn-neutral !h-8 text-xs" type="button" onClick={() => setFinanceDashManual((current) => ({ ...current, structureRows: [...current.structureRows, { label: 'Nuevo dato', amount: '' }] }))}>Agregar dato</button>
                )}
              </div>
              <div className="overflow-x-auto">
              {financePanel === 'commitments' ? (
              <table className="table-base text-xs" style={{ minWidth: 460 }}>
                <thead><tr style={{ background: '#000066' }}><th className="px-2 py-2 text-left text-[10px] font-bold leading-tight text-white">Prioridad</th><th className="px-2 py-2 text-left text-[10px] font-bold leading-tight text-white">Acreedor</th><th className="px-2 py-2 text-right text-[10px] font-bold leading-tight text-white">USD</th><th className="px-2 py-2 text-center text-[10px] font-bold leading-tight text-white">Accion</th></tr></thead>
                <tbody>
                  {compromisoRows.map((row, index) => {
                    const customIndex = index - (3 + sociosRows.length);
                    const isCustom = customIndex >= 0;
                    const labelKey = row.length === 4 ? String(row[3]) : '';
                    return <tr key={`${row[0]}-${index}`}><td className="td-base text-center">{isCustom ? <input className="input input-ghost !h-7 !border-0 !bg-transparent text-center" value={financeDashManual.commitmentRows[customIndex]?.priority || ''} onChange={(e) => updateManualArray('commitmentRows', customIndex, { priority: e.target.value })} /> : row[0]}</td><td className="td-base">{isCustom ? <input className="input input-ghost !h-7 !border-0 !bg-transparent" value={financeDashManual.commitmentRows[customIndex]?.creditor || ''} onChange={(e) => updateManualArray('commitmentRows', customIndex, { creditor: e.target.value })} /> : <input className="input input-ghost !h-7 !border-0 !bg-transparent" value={row[1]} onChange={(e) => setFinanceDashManual((current) => ({ ...current, commitmentLabels: { ...current.commitmentLabels, [labelKey]: e.target.value } }))} />}</td><td className="td-base text-right">{labelKey === 'terreno' ? <input className="input input-ghost !h-7 !border-0 !bg-transparent text-right" value={financeDashManual.compromisoTerreno === '' ? String(costoTerreno || '') : financeDashManual.compromisoTerreno} onChange={(e) => setFinanceDashManual((current) => ({ ...current, compromisoTerreno: e.target.value }))} /> : isCustom ? <input className="input input-ghost !h-7 !border-0 !bg-transparent text-right" value={financeDashManual.commitmentRows[customIndex]?.amount || ''} onChange={(e) => updateManualArray('commitmentRows', customIndex, { amount: e.target.value })} /> : usd(num(row[2]))}</td><td className="td-base text-center"><div className="flex justify-center gap-1"><button className={rowIconButton} type="button" title="Editar" onClick={focusRowInput}><FiEdit3 size={13} /></button>{isCustom && <button className={rowDangerButton} type="button" title="Eliminar" onClick={() => removeManualArrayRow('commitmentRows', customIndex)}><FiTrash2 size={13} /></button>}</div></td></tr>;
                  })}
                </tbody>
                <tfoot><tr style={{ background: '#064E3B' }}><td className="td-base font-bold text-white" colSpan={2}>Total US$</td><td className="td-base text-right font-bold text-white">{usd(compromisoTotal)}</td><td className="td-base"></td></tr></tfoot>
              </table>
              ) : (
              <table className="w-full text-xs">
                <thead><tr style={{ background: '#000066' }}><th className="w-[50%] px-3 py-2 text-left text-[10px] font-bold leading-tight text-white">Estructura Financiam.</th><th className="w-[22%] px-3 py-2 text-right text-[10px] font-bold leading-tight text-white">USD</th><th className="w-[10%] px-3 py-2 text-center text-[10px] font-bold leading-tight text-white">%</th><th className="w-[18%] px-3 py-2 text-center text-[10px] font-bold leading-tight text-white">Accion</th></tr></thead>
                <tbody>
                  {estructuraRows.map(([key, label, value], index) => {
                    const v = num(value);
                    const customIndex = index - 5;
                    const isCustom = customIndex >= 0;
                    return <tr key={`${label}-${index}`}><td className="td-base">{isCustom ? <input className="input input-ghost !h-7 !border-0 !bg-transparent" value={financeDashManual.structureRows[customIndex]?.label || ''} onChange={(e) => updateManualArray('structureRows', customIndex, { label: e.target.value })} /> : <input className="input input-ghost !h-7 !border-0 !bg-transparent" value={label} onChange={(e) => setFinanceDashManual((current) => ({ ...current, structureLabels: { ...current.structureLabels, [key]: e.target.value } }))} />}</td><td className="td-base text-right">{isCustom ? <input className="input input-ghost !h-7 !border-0 !bg-transparent text-right" value={financeDashManual.structureRows[customIndex]?.amount || ''} onChange={(e) => updateManualArray('structureRows', customIndex, { amount: e.target.value })} /> : usd(v)}</td><td className="td-base text-center">{estructuraTotal > 0 ? `${((v / estructuraTotal) * 100).toFixed(1)}%` : '0%'}</td><td className="td-base text-center"><div className="flex justify-center gap-1"><button className={rowIconButton} type="button" title="Editar" onClick={focusRowInput}><FiEdit3 size={13} /></button>{isCustom && <button className={rowDangerButton} type="button" title="Eliminar" onClick={() => removeManualArrayRow('structureRows', customIndex)}><FiTrash2 size={13} /></button>}</div></td></tr>;
                  })}
                </tbody>
                <tfoot><tr style={{ background: '#064E3B' }}><td className="td-base font-bold text-white">Total Financiamiento</td><td className="td-base text-right font-bold text-white">{usd(estructuraTotal)}</td><td className="td-base text-center font-bold text-white">100.0%</td><td className="td-base"></td></tr></tfoot>
              </table>
              )}
              </div>
            </div>
          </div>
        </section>
        <div className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold">Flujo financiero</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <button className="btn-primary whitespace-nowrap" onClick={() => setOpenExp(true)}>Registrar egreso</button>
              <button className="btn-outline whitespace-nowrap" onClick={() => setShowLoans(true)}>Prestamos</button>
              <button className="btn-outline whitespace-nowrap" onClick={() => setShowClassification(true)}>Clasificacion</button>
              <button className="btn-outline whitespace-nowrap" onClick={() => setOpenIn(true)}>Registrar ingreso</button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#E5E7EB' }}>
            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: '' as const, label: 'Todos', bg: '#F3F4F6', color: '#374151', activeBg: '#171717', activeColor: '#FFFFFF' },
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
                    className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
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
                options={[{ value: '', label: 'Todas las categorias' }, ...CATS.map((c) => ({ value: c, label: c }))]}
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
              <table className="table-base table-head-plomo" style={{ minWidth: 1120 }}>
                <thead><tr>
                  <th className="th-base">Id.</th><th className="th-base">Lote</th><th className="th-base">Cliente/Proveedor</th><th className="th-base">Modo de Pago</th>
                  <th className="th-base">Tipo</th><th className="th-base">Tipo de Pago/Categoria</th><th className="th-base">Clasificacion</th><th className="th-base">Agente</th><th className="th-base">Concepto</th>
                  <th className="th-base">Monto US$</th><th className="th-base">Fecha</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="td-base font-semibold">{t.type === 'ingreso' ? 'P' : 'E'}{t.id}</td>
                      <td className="td-base">{t.lotCode || (t.lotId ? `#${t.lotId}` : '-')}</td>
                      <td className="td-base">{t.clientName || (t.clientId ? `#${t.clientId}` : '-')}</td>
                      <td className="td-base">{paymentLabel(t.paymentMethod)}</td>
                      <td className="td-base"><span className="badge" style={{ background: t.type === 'ingreso' ? '#EAF7EE' : '#E7F0FE', color: t.type === 'ingreso' ? '#125A3B' : '#1259C4' }}>{t.type}</span></td>
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
                    <th className="th-base">Item</th>
                    <th className="th-base">Cod.</th>
                    <th className="th-base">Categoria</th>
                    <th className="th-base">Clasif. FC</th>
                    <th className="th-base">Medio de pago</th>
                    <th className="th-base">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {financeClassRows.map((row, index) => (
                    <tr key={row.key}>
                      <td className="td-base w-20 text-center font-semibold">{index + 1}</td>
                      <td className="td-base w-24"><input className="input input-ghost !h-7" value={row.code} onChange={(e) => updateFinanceClassRow(row.key, { code: e.target.value.toUpperCase() })} /></td>
                      <td className="td-base"><input className="input input-ghost !h-7" value={row.movementType} onChange={(e) => updateFinanceClassRow(row.key, { movementType: e.target.value })} /></td>
                      <td className="td-base"><input className="input input-ghost !h-7" value={row.eerrClassification} onChange={(e) => updateFinanceClassRow(row.key, { eerrClassification: e.target.value })} /></td>
                      <td className="td-base"><input className="input !h-8" placeholder="Ej. Yape, transferencia" value={row.paymentMethod} onChange={(e) => updateFinanceClassRow(row.key, { paymentMethod: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { const value = (e.target as HTMLInputElement).value; const nextRows = financeClassRows.map((item) => item.key === row.key ? { ...item, paymentMethod: value } : item); setFinanceClassRows(nextRows); (e.target as HTMLInputElement).blur(); saveFinanceClassificationNow(nextRows); } }} /></td>
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
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Registrar egreso</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Referencia / Detalle"><input className="input" list="finance-lots-expense" value={eForm.lotLabel || ''} onChange={(e) => applyLotToForm('expense', e.target.value)} placeholder="Manual u opcional: L-23" /></Field>
              <Field label="Cliente/Proveedor"><input className="input" value={eForm.clientLabel || ''} onChange={(e) => ef('clientLabel', e.target.value)} /></Field>
              <Field label="Modo de Pago"><input className="input" list="finance-payment-methods" value={eForm.paymentMethod || ''} onChange={(e) => ef('paymentMethod', e.target.value)} /></Field>
              <Field label="Tipo de Pago/Categoria"><input className="input" list="finance-categories" value={eForm.category || ''} onChange={(e) => applyCategoryToForm('expense', e.target.value)} placeholder="Escribe iniciales y selecciona" /></Field>
              <Field label="Clasificacion"><input className="input" list="finance-classifications" value={eForm.classification || ''} onChange={(e) => ef('classification', e.target.value)} /></Field>
              <Field label="Agente"><input className="input" value={eForm.agentName || ''} onChange={(e) => ef('agentName', e.target.value)} /></Field>
              <Field label="Monto US$ *"><input type="number" className="input" value={eForm.amount || ''} onChange={(e) => ef('amount', e.target.value)} /></Field>
              <Field label="Fecha"><input type="date" className="input" value={eForm.txnDate || todayInput()} onChange={(e) => ef('txnDate', e.target.value)} /></Field>
            </div>
            <Field label="Concepto *"><input className="input" value={eForm.concept || ''} onChange={(e) => ef('concept', e.target.value)} /></Field>
            <Field label="Clasificacion de la inversion/gasto">
              <Select value={eForm.expenseClass || 'operacion'} onChange={(v) => ef('expenseClass', v)} options={[{ value: 'operacion', label: 'Operacion (G&A, comisiones, admin)' }, { value: 'inversion', label: 'Inversion / Construccion' }, { value: 'financiamiento', label: 'Financiamiento' }, { value: 'compra_terreno', label: 'Compra de terreno' }]} />
            </Field>
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
            <h3 className="font-semibold mb-5" style={{ fontSize: 17 }}>Registrar ingreso adicional</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Referencia / Lote"><input className="input" list="finance-lots-income" value={iForm.lotLabel || ''} onChange={(e) => applyLotToForm('income', e.target.value)} placeholder="Opcional: escribe L-23" /></Field>
              <Field label="Cliente/Proveedor"><input className="input" value={iForm.clientLabel || ''} onChange={(e) => inf('clientLabel', e.target.value)} /></Field>
              <Field label="Modo de Pago"><input className="input" list="finance-payment-methods" value={iForm.paymentMethod || ''} onChange={(e) => inf('paymentMethod', e.target.value)} /></Field>
              <Field label="Tipo de Pago/Categoria"><input className="input" list="finance-categories" value={iForm.category || ''} onChange={(e) => applyCategoryToForm('income', e.target.value)} placeholder="Escribe iniciales y selecciona" /></Field>
              <Field label="Clasificacion"><input className="input" list="finance-classifications" value={iForm.classification || ''} onChange={(e) => inf('classification', e.target.value)} /></Field>
              <Field label="Agente"><input className="input" value={iForm.agentName || ''} onChange={(e) => inf('agentName', e.target.value)} /></Field>
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

