'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
  FiCreditCard,
  FiArrowDown,
  FiArrowUp,
  FiDownload,
  FiEdit3,
  FiFilter,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSave,
  FiSettings,
  FiTrash2,
  FiUploadCloud,
  FiX,
} from 'react-icons/fi';
import { Toaster, toast, Field } from '@/components/ui/ui';
import CurrencyToggle from '@/components/ui/CurrencyToggle';
import AnnualReportPanel from '@/components/features/bank-accounts/AnnualReportPanel';
import CategoryMasterPanel from '@/components/features/bank-accounts/CategoryMasterPanel';
import { api, uploadFile } from '@/lib/api';
import { BRAND } from '@/lib/types';
import { DEFAULT_EXCHANGE_RATE, useDisplayCurrency } from '@/lib/currency';

type Movement = {
  id: number;
  projectId: number;
  accountKey: string;
  itemNumber: number | null;
  movementDate: string | null;
  monthLabel: string | null;
  description: string | null;
  counterparty: string | null;
  depositAmount: string;
  chargeAmount: string;
  bookBalance: string | null;
  openingBalance: string | null;
  movementType: string | null;
  eerrClassification: string | null;
  invoiceNumber: string | null;
  observation: string | null;
  currency: string;
  source: string;
  importBatch: string | null;
  sourceFile: string | null;
};

type PreviewRow = {
  rowNumber: number;
  itemNumber: number | null;
  movementDate: string | null;
  monthLabel: string | null;
  description: string | null;
  counterparty: string | null;
  depositAmount: number;
  chargeAmount: number;
  bookBalance: number | null;
  movementType: string | null;
  eerrClassification: string | null;
  invoiceNumber: string | null;
  observation: string | null;
  errors: string[];
};

type Preview = {
  sheet: string;
  totalRows: number;
  validRows: number;
  errors: Array<{ rowNumber: number; message: string }>;
  rows: PreviewRow[];
  saldoInicial: number | null;
  saldoFinal: number | null;
  totals: { abonos: number; cargos: number };
  sourceFile: string;
};

type Category = {
  id: number;
  movementType: string;
  eerrClassification: string;
};

type BankAccount = {
  id: number;
  accountKey: string;
  name: string;
  bank: string | null;
  accountNumber: string | null;
};

const BORDER = '#E2E8F0';
const INK = '#0F172A';
const MUTED = '#64748B';
const PAGE_SIZE = 25;

const emptyFilters = { from: '', to: '', currency: '', movementType: '', eerrClassification: '', search: '' };

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(value: string | null) {
  if (!value) return '-';
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return value;
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${months[Number(match[2]) - 1] || match[2]} ${match[1]}`;
}

function prettyDate(value: string | null) {
  if (!value) return '-';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1].slice(-2)}` : value;
}

function salaryToUSD(value: unknown, rate: number) {
  const safeRate = Number(rate) > 0 ? Number(rate) : DEFAULT_EXCHANGE_RATE;
  const converted = Number(value || 0) / safeRate;
  return converted.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function monthLabelFromDate(value: string | null) {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  return `${MONTH_NAMES[Number(match[2]) - 1] || match[2]} ${match[1]}`;
}

const QUICK_DESCRIPTIONS = [
  'TRAN.CTAS.TERC.BM',
  'COM.MANTENIM',
  'TRANSFERENCIA RECIBIDA',
  'PAGO PROVEEDOR',
  'COBRO CUOTA',
  'SERVICIO LUZ',
  'SERVICIO AGUA',
  'PAGO HABILITACION',
];

export default function BankAccountsView({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<Movement[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [facets, setFacets] = useState<any>({ eerrClassifications: [], months: [], batches: [] });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Movement | null>(null);
  const [deleting, setDeleting] = useState<Movement | null>(null);
  const [form, setForm] = useState<any>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryRows, setCategoryRows] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState('0');
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
  const [operationAscending, setOperationAscending] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountKey, setAccountKey] = useState('GENERAL');
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', bank: '', accountNumber: '' });
  const [savingAccount, setSavingAccount] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const { currency, setCurrency, exchangeRate, setExchangeRate, toDisplay, format: show } = useDisplayCurrency();

  const query = useMemo(() => {
    const params = new URLSearchParams({ projectId: String(projectId), accountKey });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [projectId, accountKey, filters]);

  const applyData = useCallback((data: any) => {
    if (!data) return;
    if (data.items) setItems(data.items);
    if (data.summary) {
      setSummary(data.summary);
      if (data.summary.saldoInicial !== undefined) setOpeningBalanceDraft(String(data.summary.saldoInicial ?? 0));
    }
    if (data.facets) setFacets(data.facets);
    setDataVersion((value) => value + 1);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<any>(`/bank-accounts?${query}`);
      applyData(data);
    } catch (error: any) {
      toast(error?.message || 'No se pudo cargar el estado de cuenta', 'err');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [query]);

  useEffect(() => {
    api.get<{ items: BankAccount[] }>(`/bank-accounts/accounts?projectId=${projectId}`)
      .then((data) => {
        const next = data?.items || [];
        setAccounts(next);
        if (next.length && !next.some((item) => item.accountKey === accountKey)) setAccountKey(next[0].accountKey);
      })
      .catch(() => setAccounts([]));
  }, [projectId]);

  async function addAccount() {
    if (!accountForm.name.trim()) return toast('Ingresa el nombre de la cuenta', 'err');
    setSavingAccount(true);
    try {
      const data = await api.post<{ items: BankAccount[] }>('/bank-accounts/accounts', {
        projectId,
        name: accountForm.name.trim(),
        bank: accountForm.bank.trim() || undefined,
        accountNumber: accountForm.accountNumber.trim() || undefined,
      });
      setAccounts(data.items || []);
      const created = data.items?.[data.items.length - 1];
      if (created) setAccountKey(created.accountKey);
      setAccountForm({ name: '', bank: '', accountNumber: '' });
      setAccountModalOpen(false);
      toast('Cuenta bancaria agregada');
    } catch (error: any) {
      toast(error?.message || 'No se pudo agregar la cuenta', 'err');
    } finally {
      setSavingAccount(false);
    }
  }
  // El mapeo EERR alimenta el desplegable TIPO y el autocompletado del form.
  const loadCategories = useCallback(async () => {
    try {
      const data = await api.get<any>(`/bank-accounts/categories?projectId=${projectId}`);
      setCategories(data?.items || []);
      setCategoryRows((data?.items || []).length);
    } catch {
      setCategories([]);
      setCategoryRows(0);
    }
  }, [projectId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const eerrByType = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of categories) map.set(item.movementType.trim().toUpperCase(), item.eerrClassification);
    return map;
  }, [categories]);

  const categoryTypes = useMemo(
    () => Array.from(new Set(categories.map((item) => item.movementType))).sort(),
    [categories],
  );

  const counterparties = useMemo(
    () => Array.from(new Set(items.map((item) => item.counterparty).filter(Boolean) as string[])).sort(),
    [items],
  );

  // Al elegir el TIPO se autocompleta su CLASIFICACION EERR segun el mapeo.
  function pickMovementType(value: string) {
    const matched = eerrByType.get(value.trim().toUpperCase());
    setForm((current: any) => ({
      ...current,
      movementType: value,
      eerrClassification: matched || current.eerrClassification || '',
    }));
  }

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const sortedItems = useMemo(() => [...items].sort((left, right) => {
    const leftOperation = left.itemNumber ?? Number.MAX_SAFE_INTEGER;
    const rightOperation = right.itemNumber ?? Number.MAX_SAFE_INTEGER;
    if (leftOperation !== rightOperation) return operationAscending ? leftOperation - rightOperation : rightOperation - leftOperation;
    return operationAscending ? left.id - right.id : right.id - left.id;
  }), [items, operationAscending]);
  const pageItems = sortedItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const movementTotals = useMemo(() => ({
    deposits: items.reduce((total, item) => total + num(item.depositAmount), 0),
    charges: items.reduce((total, item) => total + num(item.chargeAmount), 0),
  }), [items]);

  async function handleFile(file?: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const data = await uploadFile('/bank-accounts/import/preview', file);
      setPreview(data);
      if (!data?.rows?.length) toast('El Excel no tiene movimientos reconocibles', 'err');
    } catch (error: any) {
      toast(error?.message || 'No se pudo leer el Excel', 'err');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const data = await api.post<any>('/bank-accounts/import', {
        projectId,
        rows: preview.rows.filter((row) => row.errors.length === 0),
        accountKey,
        currency: currency === 'USD' ? 'USD' : 'PEN',
        sourceFile: preview.sourceFile,
        importBatch: `batch-${Date.now()}`,
        skipDuplicates: true,
        openingBalance: preview.saldoInicial,
      });
      setItems(data?.items || []);
      setSummary(data?.summary || {});
      setFacets(data?.facets || { eerrClassifications: [], months: [], batches: [] });
      setPreview(null);
      const parts = [`${data?.imported || 0} movimientos agregados`];
      if (data?.duplicates) parts.push(`${data.duplicates} duplicados omitidos`);
      if (data?.invalid) parts.push(`${data.invalid} filas vacias omitidas`);
      toast(parts.join(' - '));
    } catch (error: any) {
      toast(error?.message || 'No se pudo importar el Excel', 'err');
    } finally {
      setImporting(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ projectId, currency, movementDate: '', monthLabel: '', depositAmount: '', chargeAmount: '', eerrClassification: '' });
    setFormOpen(true);
    formRef.current?.scrollTo({ top: 0 });
  }

  function openEdit(item: Movement) {
    setEditing(item);
    setForm({
      ...item,
      movementDate: item.movementDate ? item.movementDate.slice(0, 10) : '',
      depositAmount: num(item.depositAmount) || '',
      chargeAmount: num(item.chargeAmount) || '',
    });
    setFormOpen(true);
    formRef.current?.scrollTo({ top: 0 });
  }

  function pickDate(value: string) {
    setForm((current: any) => ({ ...current, movementDate: value, monthLabel: monthLabelFromDate(value) }));
  }

  async function save() {
    const deposit = num(form.depositAmount);
    const charge = num(form.chargeAmount);
    if (!deposit && !charge) return toast('Ingresa un abono o un cargo', 'err');
    if (deposit && charge) return toast('No puede tener abono y cargo a la vez', 'err');
    if (!form.description && !form.counterparty) return toast('Ingresa la descripcion o el proveedor/cliente', 'err');

    try {
      const payload = {
        ...form,
        projectId,
        depositAmount: deposit,
        chargeAmount: charge,
        bookBalance: form.bookBalance === '' || form.bookBalance === null || form.bookBalance === undefined ? null : num(form.bookBalance),
      };
      const data = editing
        ? await api.patch<any>(`/bank-accounts/${editing.id}`, payload)
        : await api.post<any>('/bank-accounts', payload);

      applyData(data);
      toast(editing ? 'Movimiento actualizado' : 'Movimiento registrado');
      setEditing(null);
      setForm({ projectId, currency, movementDate: '', monthLabel: '', depositAmount: '', chargeAmount: '', eerrClassification: '' });
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      toast(error?.message || 'No se pudo guardar el movimiento', 'err');
    }
  }

  async function remove(item: Movement) {
    try {
      const data = await api.delete<any>(`/bank-accounts/${item.id}`);
      applyData(data);
      toast('Movimiento eliminado');
      setDeleting(null);
    } catch (error: any) {
      toast(error?.message || 'No se pudo eliminar', 'err');
    }
  }

  async function saveOpeningBalance() {
    const value = num(openingBalanceDraft);
    if (value < 0) return toast('El saldo inicial no puede ser negativo', 'err');
    setSavingOpeningBalance(true);
    try {
      const data = await api.patch<any>('/bank-accounts/opening-balance', {
        projectId,
        accountKey,
        currency: 'PEN',
        openingBalance: value,
      });
      applyData(data);
      toast('Saldo inicial actualizado');
    } catch (error: any) {
      toast(error?.message || 'No se pudo actualizar el saldo inicial', 'err');
    } finally {
      setSavingOpeningBalance(false);
    }
  }

  const f = (key: string, value: any) => setFilters((current) => ({ ...current, [key]: value }));
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const cards = [
    { label: 'Saldo inicial', value: show(summary?.saldoInicial), color: BRAND.blue, helper: 'Saldo al inicio del periodo' },
    { label: 'Total ingresos', value: show(summary?.totalAbonos), color: '#16A36A', helper: 'Suma de abonos del periodo' },
    { label: 'Total egresos', value: show(summary?.totalCargos), color: '#DC2626', helper: 'Suma de cargos del periodo' },
    { label: 'Saldo final', value: show(summary?.saldoFinal), color: '#0E46A0', helper: 'Saldo al cierre del periodo' },
    { label: 'Movimientos', value: String(summary?.movimientos || 0), color: '#7C3AED', helper: `${summary?.meses || 0} meses con movimiento` },
    { label: 'Saldo en US$ (referencial)', value: `US$ ${salaryToUSD(summary?.saldoFinal, exchangeRate)}`, color: '#D97706', helper: `Tipo de cambio S/ ${Number(exchangeRate || 0).toLocaleString('es-PE', { maximumFractionDigits: 4 })}` },
  ];

  return (
    <>
      <Toaster />
      <div className="space-y-5">
        <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
          <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="mt-3 text-2xl font-bold" style={{ color: INK }}>Cuentas y bancos</h2>
              <p className="mt-1 max-w-3xl text-sm" style={{ color: MUTED }}>
                Sube el Excel las veces que necesites: los movimientos se acumulan sin borrar los anteriores.
              </p>
            </div>
            <div className="order-first flex w-full justify-start lg:order-none lg:w-auto lg:justify-end">
              <CurrencyToggle currency={currency} setCurrency={setCurrency} exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} />
            </div>
            <div className="relative flex w-full items-center gap-2 lg:w-auto">
              <button
                type="button"
                className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:text-sm lg:w-56 lg:flex-none"
                style={{ borderColor: BORDER }}
                onClick={() => setAccountMenuOpen((value) => !value)}
                aria-expanded={accountMenuOpen}
                aria-label="Seleccionar cuenta bancaria"
              >
                <span className="min-w-0 truncate">
                  {accounts.find((account) => account.accountKey === accountKey)?.bank
                    ? `${accounts.find((account) => account.accountKey === accountKey)?.bank} - `
                    : ''}
                  {accounts.find((account) => account.accountKey === accountKey)?.name || 'Seleccionar cuenta'}
                </span>
                <FiChevronDown className={`shrink-0 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {accountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setAccountMenuOpen(false)} />
                  <div className="absolute left-0 top-11 z-40 w-full overflow-hidden rounded-md border bg-white p-1 shadow-xl lg:w-64" style={{ borderColor: BORDER }}>
                    {accounts.map((account) => (
                      <button
                        key={account.accountKey}
                        type="button"
                        className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs transition-colors hover:bg-[#F3F7FC] sm:text-sm ${account.accountKey === accountKey ? 'bg-[#EAF3FF] text-[#1877F2]' : 'text-slate-700'}`}
                        onClick={() => { setAccountKey(account.accountKey); setAccountMenuOpen(false); }}
                      >
                        <span className="min-w-0 truncate">{account.bank ? `${account.bank} - ` : ''}{account.name}</span>
                        {account.accountNumber && <span className="ml-2 shrink-0 text-[10px] text-slate-400">...{account.accountNumber.slice(-4)}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button className="btn-outline !h-9 shrink-0 justify-center whitespace-nowrap !px-2 text-xs sm:!px-3" onClick={() => setAccountModalOpen(true)}>
                <FiPlus /> <span className="sm:hidden">Agregar</span><span className="hidden sm:inline">Agregar cuenta</span>
              </button>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:max-w-[560px] lg:flex-wrap lg:justify-end">
              <button className="btn-neutral w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={load} disabled={loading}>
                <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Actualizar
              </button>
              <button className="btn-outline w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <FiUploadCloud /> {uploading ? 'Leyendo...' : 'Subir Excel'}
              </button>
              <button className="btn-primary w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto" onClick={openCreate}>
                <FiPlus /> <span className="sm:hidden">Registrar Op.</span><span className="hidden sm:inline">Registrar</span>
              </button>
              <button
                className="btn-neutral w-full justify-center whitespace-nowrap !px-3 text-xs sm:text-sm lg:w-auto"
                onClick={() => setCategoriesOpen((value) => !value)}
                aria-expanded={categoriesOpen}
                title="Configuracion de Categorias y Mapeo EERR"
              >
                <FiSettings /> Categorias{categoryRows ? ` (${categoryRows})` : ''}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t bg-[#F8FAFC] p-4 xl:grid-cols-6" style={{ borderColor: BORDER }}>
            {cards.map((card) => (
              <div key={card.label} className="min-w-0 rounded-md border bg-white p-3 sm:p-4" style={{ borderColor: BORDER }}>
                <p className="truncate text-[10px] font-semibold uppercase leading-tight tracking-wide sm:text-xs" style={{ color: MUTED }} title={card.label}>{card.label}</p>
                {card.label === 'Saldo inicial' ? (
                  <div className="mt-1 flex min-w-0 items-center gap-1">
                    <input
                      className="input !h-8 min-w-0 flex-1 !px-2 text-sm font-bold tabular-nums"
                      type="number"
                      step="0.01"
                      value={openingBalanceDraft}
                      onChange={(event) => setOpeningBalanceDraft(event.target.value)}
                      aria-label="Saldo inicial"
                    />
                    <button
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white"
                      style={{ background: BRAND.blue }}
                      onClick={saveOpeningBalance}
                      disabled={savingOpeningBalance}
                      title="Guardar saldo inicial"
                      aria-label="Guardar saldo inicial"
                    >
                      <FiSave />
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 truncate text-base font-bold tabular-nums sm:text-lg" style={{ color: card.color }} title={card.value}>{card.value}</p>
                )}
                <p className="mt-0.5 hidden truncate text-[10px] sm:block" style={{ color: '#94A3B8' }}>{card.helper}</p>
              </div>
            ))}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </section>

        {accountModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setAccountModalOpen(false)} />
            <form
              className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
              onSubmit={(event) => { event.preventDefault(); addAccount(); }}
            >
              <div className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: BORDER }}>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: INK }}>Agregar cuenta bancaria</h3>
                  <p className="mt-1 text-xs" style={{ color: MUTED }}>Los movimientos quedaran separados en esta cuenta.</p>
                </div>
                <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setAccountModalOpen(false)} aria-label="Cerrar">
                  <FiX />
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                <Field label="Nombre de la cuenta">
                  <input autoFocus className="input" placeholder="Ej. Cuenta BBVA" value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Banco">
                    <input className="input" placeholder="BBVA" value={accountForm.bank} onChange={(event) => setAccountForm((current) => ({ ...current, bank: event.target.value }))} />
                  </Field>
                  <Field label="Nro. de cuenta (14 dígitos)">
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      maxLength={14}
                      pattern="[0-9]{14}"
                      placeholder="Opcional"
                      value={accountForm.accountNumber}
                      onChange={(event) => setAccountForm((current) => ({ ...current, accountNumber: event.target.value.replace(/\D/g, '').slice(0, 14) }))}
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="btn-neutral justify-center" onClick={() => setAccountModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary justify-center" disabled={savingAccount}>
                  <FiPlus /> {savingAccount ? 'Guardando...' : 'Guardar cuenta'}
                </button>
              </div>
            </form>
          </div>
        )}

        <section className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ borderColor: BORDER }}>
          <div className="flex flex-col gap-2 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: BORDER }}>
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative min-w-0 flex-1 lg:w-80">
                <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input !h-9 !pl-8 text-sm"
                  placeholder="Buscar descripcion, proveedor o factura"
                  value={filters.search}
                  onChange={(event) => f('search', event.target.value)}
                />
              </div>
              <button className="btn-neutral !h-9 !px-3 text-xs" onClick={() => setShowFilters((value) => !value)}>
                <FiFilter /> Filtros{activeFilters ? ` (${activeFilters})` : ''}
              </button>
              {activeFilters > 0 && (
                <button className="btn-neutral !h-9 !px-2 text-xs" onClick={() => setFilters({ ...emptyFilters })} title="Limpiar filtros">
                  <FiX /> Limpiar
                </button>
              )}
            </div>
            <p className="text-xs" style={{ color: MUTED }}>
              {items.length} movimientos{preview ? '' : ''}
            </p>
          </div>

          {showFilters && (
            <div className="grid gap-3 border-b bg-[#F8FAFC] p-4 sm:grid-cols-2 xl:grid-cols-5" style={{ borderColor: BORDER }}>
              <Field label="Desde"><input type="date" className="input !h-9" value={filters.from} onChange={(e) => f('from', e.target.value)} /></Field>
              <Field label="Hasta"><input type="date" className="input !h-9" value={filters.to} onChange={(e) => f('to', e.target.value)} /></Field>
              <Field label="Tipo">
                <select className="input !h-9" value={filters.movementType} onChange={(e) => f('movementType', e.target.value)}>
                  <option value="">Todos</option>
                  <option value="INGRESO">Ingreso (abono)</option>
                  <option value="GASTO">Gasto (cargo)</option>
                </select>
              </Field>
              <Field label="Clasificacion EERR">
                <select className="input !h-9" value={filters.eerrClassification} onChange={(e) => f('eerrClassification', e.target.value)}>
                  <option value="">Todas</option>
                  {(facets?.eerrClassifications || []).map((option: any) => (
                    <option key={option.value} value={option.value}>{option.value} ({option.count})</option>
                  ))}
                </select>
              </Field>
              <Field label="Moneda">
                <select className="input !h-9" value={filters.currency} onChange={(e) => f('currency', e.target.value)}>
                  <option value="">S/ y US$</option>
                  <option value="PEN">Soles (S/)</option>
                  <option value="USD">Dolares (US$)</option>
                </select>
              </Field>
            </div>
          )}

          {loading ? (
            <p className="p-8 text-center text-sm text-slate-400">Cargando estado de cuenta...</p>
          ) : items.length === 0 ? (
            <div className="grid place-items-center px-5 py-14 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-md" style={{ background: '#EAF3FF', color: BRAND.blue }}><FiCreditCard /></div>
              <h3 className="mt-4 font-semibold" style={{ color: INK }}>Aun no hay movimientos</h3>
              <p className="mt-1 max-w-md text-sm" style={{ color: MUTED }}>Sube el Excel del estado de cuenta bancario o registra un movimiento manual.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button className="btn-outline" onClick={() => fileRef.current?.click()}><FiUploadCloud /> Subir Excel</button>
                <button className="btn-primary" onClick={openCreate}><FiPlus /> Registrar</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b bg-white px-4 py-2" style={{ borderColor: BORDER }}>
                <p className="text-xs font-semibold" style={{ color: MUTED }}>Movimientos por operación</p>
                <button
                  className="btn-neutral !h-8 !px-2 text-xs"
                  onClick={() => setOperationAscending((value) => !value)}
                  title={operationAscending ? 'Ordenar de la última operación a la primera' : 'Ordenar de la primera operación a la última'}
                >
                  {operationAscending ? <FiArrowDown /> : <FiArrowUp />} {operationAscending ? 'Última primero' : 'Primera primero'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr className="border-b" style={{ borderColor: BORDER }}>
                      <th className="th-base text-center">Item</th>
                      <th className="th-base">Fecha abono</th>
                      <th className="th-base">Mes</th>
                      <th className="th-base">Descripcion (EC BCP)</th>
                      <th className="th-base">Proveedor / Cliente</th>
                      <th className="th-base text-right">Abono</th>
                      <th className="th-base text-right">Cargo</th>
                      <th className="th-base text-right">Saldo contable</th>
                      <th className="th-base">Tipo</th>
                      <th className="th-base">Clasif. EERR</th>
                      <th className="th-base">Nro. Factura</th>
                      <th className="th-base">Observacion</th>
                      <th className="th-base text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((item) => {
                      const deposit = num(item.depositAmount);
                      const charge = num(item.chargeAmount);
                      const isIncome = deposit > 0 || item.movementType === 'INGRESO';
                      const isEditing = editing?.id === item.id;
                      return (
                        <tr
                          key={item.id}
                          className="cursor-pointer border-b last:border-b-0 hover:bg-slate-50"
                          style={{ borderColor: '#EEF2F7', background: isEditing ? '#EAF3FF' : undefined }}
                          onClick={() => openEdit(item)}
                          title="Clic para cargar este registro en el formulario"
                        >
                          <td className="td-base whitespace-nowrap text-center text-xs tabular-nums" style={{ color: MUTED }}>{item.itemNumber ?? '-'}</td>
                          <td className="td-base whitespace-nowrap text-xs tabular-nums">{prettyDate(item.movementDate)}</td>
                          <td className="td-base whitespace-nowrap" style={{ color: MUTED }}>{item.monthLabel || monthLabel(item.movementDate)}</td>
                          <td className="td-base max-w-[240px] truncate" title={item.description || ''}>{item.description || '-'}</td>
                          <td className="td-base max-w-[220px] truncate" title={item.counterparty || ''}>{item.counterparty || '-'}</td>
                          <td className="td-base whitespace-nowrap text-right text-xs font-semibold tabular-nums" style={{ color: deposit ? '#16A36A' : '#CBD5E1' }}>
                            {deposit ? show(deposit) : '-'}
                          </td>
                          <td className="td-base whitespace-nowrap text-right text-xs font-semibold tabular-nums" style={{ color: charge ? '#DC2626' : '#CBD5E1' }}>
                            {charge ? show(charge) : '-'}
                          </td>
                          <td className="td-base whitespace-nowrap text-right text-xs font-bold tabular-nums" style={{ color: INK }}>
                            {item.bookBalance === null ? '-' : show(num(item.bookBalance))}
                          </td>
                          <td className="td-base">
                            <span className="badge whitespace-nowrap" style={{ background: isIncome ? '#E7F6EE' : '#FDECEC', color: isIncome ? '#16A36A' : '#DC2626' }}>
                              {isIncome ? 'Ingreso' : 'Gasto'}
                            </span>
                          </td>
                          <td className="td-base max-w-[180px] truncate" style={{ color: MUTED }} title={item.eerrClassification || ''}>{item.eerrClassification || '-'}</td>
                          <td className="td-base whitespace-nowrap" style={{ color: MUTED }}>{item.invoiceNumber || '-'}</td>
                          <td className="td-base max-w-[180px] truncate" style={{ color: MUTED }} title={item.observation || ''}>{item.observation || '-'}</td>
                          <td className="td-base">
                            <div className="flex justify-end gap-1">
                              <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100" title="Modificar este registro" onClick={(event) => { event.stopPropagation(); openEdit(item); }}><FiEdit3 /></button>
                              <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600" title="Eliminar" onClick={(event) => { event.stopPropagation(); setDeleting(item); }}><FiTrash2 /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-[#F8FAFC] font-bold" style={{ borderColor: BORDER }}>
                      <td className="td-base text-xs" colSpan={5} style={{ color: INK }}>Totales</td>
                      <td className="td-base whitespace-nowrap text-right text-xs tabular-nums" style={{ color: '#16A36A' }}>{show(movementTotals.deposits)}</td>
                      <td className="td-base whitespace-nowrap text-right text-xs tabular-nums" style={{ color: '#DC2626' }}>{show(movementTotals.charges)}</td>
                      <td className="td-base whitespace-nowrap text-right text-xs tabular-nums" style={{ color: INK }}>{show(num(summary?.saldoFinal))}</td>
                      <td className="td-base" colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: BORDER }}>
                <p className="text-xs" style={{ color: MUTED }}>
                  Mostrando {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, items.length)} de {items.length}
                </p>
                <div className="flex items-center gap-1">
                  <button className="btn-neutral !h-8 !px-2 text-xs" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><FiChevronLeft /> Anterior</button>
                  <span className="px-2 text-xs font-semibold tabular-nums" style={{ color: INK }}>{page} / {pageCount}</span>
                  <button className="btn-neutral !h-8 !px-2 text-xs" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente <FiChevronRight /></button>
                </div>
              </div>
            </>
          )}
        </section>

        <AnnualReportPanel projectId={projectId} accountKey={accountKey} currency={currency} rate={exchangeRate} refreshKey={dataVersion} />

        {categoriesOpen && (
          <CategoryMasterPanel
            projectId={projectId}
            onClose={() => setCategoriesOpen(false)}
            onChanged={() => { loadCategories(); load(); }}
          />
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreview(null)} />
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: BORDER }}>
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ color: INK, fontSize: 17 }}>Previsualizacion del Excel</h3>
                <p className="mt-0.5 truncate text-xs" style={{ color: MUTED }}>
                  {preview.sourceFile} - hoja {preview.sheet} - {preview.validRows} de {preview.totalRows} filas listas
                </p>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setPreview(null)}><FiX /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b bg-[#F8FAFC] px-5 py-3 sm:grid-cols-4" style={{ borderColor: BORDER }}>
              {[
                { label: 'Saldo inicial', value: show(preview.saldoInicial) },
                { label: 'Total abonos', value: show(preview.totals?.abonos) },
                { label: 'Total cargos', value: show(preview.totals?.cargos) },
                { label: 'Saldo final', value: show(preview.saldoFinal) },
              ].map((item) => (
                <div key={item.label} className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase" style={{ color: MUTED }}>{item.label}</p>
                  <p className="truncate text-sm font-bold tabular-nums" style={{ color: INK }}>{item.value}</p>
                </div>
              ))}
            </div>

            {preview.errors.length > 0 && (
              <div className="max-h-24 overflow-y-auto border-b bg-amber-50 px-5 py-2" style={{ borderColor: BORDER }}>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><FiAlertCircle /> {preview.errors.length} avisos (esas filas no se importaran)</p>
                <ul className="mt-1 space-y-0.5">
                  {preview.errors.slice(0, 20).map((error, index) => (
                    <li key={`${error.rowNumber}-${index}`} className="text-xs text-amber-700">Fila {error.rowNumber}: {error.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              <table className="table-base">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b" style={{ borderColor: BORDER }}>
                    <th className="th-base text-center">Fila</th>
                    <th className="th-base">Fecha</th>
                    <th className="th-base">Descripcion</th>
                    <th className="th-base">Proveedor / Cliente</th>
                    <th className="th-base text-right">Abono</th>
                    <th className="th-base text-right">Cargo</th>
                    <th className="th-base text-right">Saldo</th>
                    <th className="th-base">Clasif. EERR</th>
                    <th className="th-base">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 200).map((row) => (
                    <tr key={row.rowNumber} className="border-b last:border-b-0" style={{ borderColor: '#EEF2F7', background: row.errors.length ? '#FFFBEB' : undefined }}>
                      <td className="td-base text-center tabular-nums" style={{ color: MUTED }}>{row.rowNumber}</td>
                      <td className="td-base whitespace-nowrap tabular-nums">{prettyDate(row.movementDate)}</td>
                      <td className="td-base max-w-[220px] truncate" title={row.description || ''}>{row.description || '-'}</td>
                      <td className="td-base max-w-[200px] truncate" title={row.counterparty || ''}>{row.counterparty || '-'}</td>
                      <td className="td-base text-right tabular-nums" style={{ color: row.depositAmount ? '#16A36A' : '#CBD5E1' }}>{row.depositAmount ? show(row.depositAmount) : '-'}</td>
                      <td className="td-base text-right tabular-nums" style={{ color: row.chargeAmount ? '#DC2626' : '#CBD5E1' }}>{row.chargeAmount ? show(row.chargeAmount) : '-'}</td>
                      <td className="td-base text-right tabular-nums" style={{ color: INK }}>{row.bookBalance === null ? '-' : show(row.bookBalance)}</td>
                      <td className="td-base max-w-[160px] truncate" style={{ color: MUTED }}>{row.eerrClassification || '-'}</td>
                      <td className="td-base">
                        {row.errors.length
                          ? <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>Con avisos</span>
                          : <span className="badge" style={{ background: '#E7F6EE', color: '#16A36A' }}>Listo</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: BORDER }}>
              <p className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
                <FiCheckCircle style={{ color: '#16A36A' }} /> Se agregaran a los {items.length} movimientos existentes, sin borrar nada.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button className="btn-neutral justify-center" onClick={() => setPreview(null)}>Cancelar</button>
                <button className="btn-primary justify-center" onClick={confirmImport} disabled={importing || preview.validRows === 0}>
                  <FiUploadCloud /> {importing ? 'Importando...' : `Importar ${preview.validRows} movimientos`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFormOpen(false)} />
          <div ref={formRef} className="relative max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold" style={{ color: INK, fontSize: 17 }}>
                  {editing ? 'Modificar movimiento' : 'Registrar movimiento'}
                </h3>
                <p className="mt-0.5 text-sm" style={{ color: MUTED }}>
                  {editing ? `Editando el registro #${editing.id}. Solo se puede actualizar la observación.` : 'Ingreso manual al estado de cuenta bancario.'}
                </p>
              </div>
              {editing && (
                <button
                  className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold"
                  style={{ borderColor: '#FCA5A5', color: '#DC2626', background: '#FEF2F2' }}
                  onClick={() => openCreate()}
                >
                  Cancelar edicion
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha de abono">
                <input type="date" className="input" readOnly={!!editing} value={form.movementDate || ''} onChange={(event) => pickDate(event.target.value)} />
              </Field>
              <Field label="Mes (automatico)">
                <input className="input" readOnly placeholder="Se completa con la fecha" value={form.monthLabel || ''} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Descripcion">
                <input
                  className="input"
                  list="bank-descriptions"
                  placeholder="Ej. TRAN.CTAS.TERC.BM"
                  readOnly={!!editing}
                  value={form.description || ''}
                  onChange={(event) => setForm((p: any) => ({ ...p, description: event.target.value }))}
                />
                <datalist id="bank-descriptions">
                  {QUICK_DESCRIPTIONS.map((option) => <option key={option} value={option} />)}
                </datalist>
              </Field>
              <Field label="Proveedor (egreso) / Cliente (ingreso)">
                <input
                  className="input"
                  list="bank-counterparties"
                  placeholder="Escribe para buscar o agregar"
                  readOnly={!!editing}
                  value={form.counterparty || ''}
                  onChange={(event) => setForm((p: any) => ({ ...p, counterparty: event.target.value }))}
                />
                <datalist id="bank-counterparties">
                  {counterparties.map((option) => <option key={option} value={option} />)}
                </datalist>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Field label="Abono (ingreso)">
                <input type="number" step="0.01" min="0" className="input" readOnly={!!editing} value={form.depositAmount ?? ''} onChange={(event) => setForm((p: any) => ({ ...p, depositAmount: event.target.value, chargeAmount: event.target.value ? '' : p.chargeAmount }))} />
              </Field>
              <Field label="Cargo (egreso)">
                <input type="number" step="0.01" min="0" className="input" readOnly={!!editing} value={form.chargeAmount ?? ''} onChange={(event) => setForm((p: any) => ({ ...p, chargeAmount: event.target.value, depositAmount: event.target.value ? '' : p.depositAmount }))} />
              </Field>
              <Field label="Moneda">
                <select className="input" disabled={!!editing} value={form.currency || 'PEN'} onChange={(event) => setForm((p: any) => ({ ...p, currency: event.target.value }))}>
                  <option value="PEN">S/ PEN</option>
                  <option value="USD">US$ USD</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo ingreso/gasto">
                <input
                  className="input"
                  list="bank-category-types"
                  placeholder="Selecciona o escribe el concepto"
                  readOnly={!!editing}
                  value={form.movementType || ''}
                  onChange={(event) => pickMovementType(event.target.value)}
                />
                <datalist id="bank-category-types">
                  {categoryTypes.map((option) => <option key={option} value={option} />)}
                </datalist>
              </Field>
              <Field label="Clasificacion EERR (automatico)">
                <input className="input" readOnly placeholder="Se completa con el tipo" value={form.eerrClassification || ''} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nro. Factura / Boleta">
                <input className="input" readOnly={!!editing} value={form.invoiceNumber || ''} onChange={(event) => setForm((p: any) => ({ ...p, invoiceNumber: event.target.value }))} />
              </Field>
              <Field label="Observacion">
                <input
                  className="input"
                  placeholder="Ej. Cuota Inicial"
                  maxLength={40}
                  value={form.observation || ''}
                  onChange={(event) => setForm((p: any) => ({ ...p, observation: event.target.value }))}
                />
              </Field>
            </div>

            <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
              <button className="btn-neutral justify-center" onClick={() => setFormOpen(false)}>Cerrar</button>
              <button
                className="justify-center font-semibold text-white"
                style={{ backgroundColor: editing ? '#DC2626' : '#1877F2', borderRadius: 6, height: 40, padding: '0 18px' }}
                onClick={save}
              >
                {editing ? 'Modificar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDeleting(null)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-50 text-red-600"><FiTrash2 /></div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold" style={{ color: INK }}>Eliminar movimiento</h3>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>Se retirara del estado de cuenta y se recalcularan los saldos.</p>
              </div>
            </div>
            <div className="mt-4 rounded-md border bg-slate-50 p-3" style={{ borderColor: BORDER }}>
              <p className="text-xs font-bold uppercase" style={{ color: MUTED }}>Movimiento seleccionado</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: INK }}>{deleting.description || deleting.counterparty || 'Sin descripcion'}</p>
              <p className="text-xs" style={{ color: MUTED }}>{prettyDate(deleting.movementDate)} - {show(num(deleting.depositAmount) || num(deleting.chargeAmount))}</p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn-neutral justify-center" onClick={() => setDeleting(null)}>Cancelar</button>
              <button className="btn-primary justify-center bg-red-600 hover:bg-red-700" onClick={() => remove(deleting)}><FiTrash2 /> Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
