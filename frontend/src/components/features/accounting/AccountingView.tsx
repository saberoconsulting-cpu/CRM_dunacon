'use client';

import { useEffect, useRef, useState } from 'react';
import { useDisplayCurrency } from '@/lib/currency';
import { accountingDisplayAmount, displayedInvoice } from '@/lib/accounting-display';
import { api } from '@/lib/api';
import { useProjectReadonly } from '@/lib/project-readonly-context';
import { AccountingInvoice, Currency, InvoiceKind, accountingIndicators, inAccountingYear, invoiceSum } from '@/lib/accounting';
import InvoiceEntry from './InvoiceEntry';
import CashEntry from './CashEntry';
import CashView from './CashView';
import { CashData, CashMovement } from '@/lib/accounting-cash';
import { DeleteRecord, RecordActions } from './RecordActions';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { downloadAccountingExcel } from '@/lib/accounting-excel';
import { downloadAccountingPdf } from '@/lib/accounting-pdf';
import { KpiCard } from '@/components/ui/Metrics';
import { FiFileText, FiShoppingCart, FiActivity, FiCreditCard, FiDollarSign, FiCheckCircle, FiRotateCcw, FiDownload } from 'react-icons/fi';
import { DEFAULT_ACCOUNTING_PARAMETERS } from '@/lib/accounting-parameters';
import InvoiceBaseCell from './InvoiceBaseCell';
import { accountingRegisterYear, inAccountingPeriod } from '@/lib/accounting-period';
import { Bar, BarChart, Cell, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './accounting.module.css';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CURRENT_YEAR = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Lima' }).format(new Date()));
const RECENT_YEARS = Array.from({ length: 8 }, (_, index) => CURRENT_YEAR - index);
const amount = (value: number) => value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cardAmount = (value: number) => value.toLocaleString('es-PE', { maximumFractionDigits: 0 });
const date = (value: string) => value ? value.split('-').reverse().join('/') : '—';

export default function AccountingView({ projectId }: { projectId: number }) {
  const [invoices, setInvoices] = useState<AccountingInvoice[]>([]);
  const [cash, setCash] = useState<CashData>({ rows: [], openings: {} });
  const [editingInvoice, setEditingInvoice] = useState<AccountingInvoice | null>(null);
  const [editingCash, setEditingCash] = useState<CashMovement | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; cash: boolean; label: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sourcesLoaded, setSourcesLoaded] = useState({ invoices: false, cash: false });
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const parameters = DEFAULT_ACCOUNTING_PARAMETERS;
  const [reload, setReload] = useState(0);
  const cashExportRef = useRef<((format?: 'pdf' | 'excel') => Promise<void>) | null>(null);
  const [tab, setTab] = useState<InvoiceKind | 'cash'>('purchase');
  const readonly = useProjectReadonly();
  useEffect(() => {
    let active = true; setLoading(true); setInvoices([]); setCash({ rows: [], openings: {} }); setLoadError('');
    setSourcesLoaded({ invoices: false, cash: false });
    Promise.allSettled([api.get<AccountingInvoice[]>(`/accounting?projectId=${projectId}`), api.get<CashData>(`/accounting/cash?projectId=${projectId}`)])
      .then(([rows, cashData]) => {
        if (!active) return;
        setSourcesLoaded({ invoices: rows.status === 'fulfilled', cash: cashData.status === 'fulfilled' });
        if (rows.status === 'fulfilled') {
          setInvoices(rows.value);
          setSummaryYear('all');
        }
        if (cashData.status === 'fulfilled') setCash(cashData.value);
        const errors = [rows, cashData].flatMap((result, index) => result.status === 'rejected' ? [`${['Facturas', 'Caja Chica', 'Parámetros'][index]}: ${result.reason?.message || 'No se pudo cargar.'}`] : []);
        setLoadError(errors.join(' '));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, reload]);
  const [month, setMonth] = useState('');
  const [party, setParty] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [invoiceYear, setInvoiceYear] = useState('all');
  const [summaryYear, setSummaryYear] = useState('all');
  const { currency, setCurrency, exchangeRate } = useDisplayCurrency();
  const displayRow = (row: AccountingInvoice) => displayedInvoice(row, currency, exchangeRate);
  const displaySum = (rows: AccountingInvoice[], field: 'base' | 'igv' | 'total') => invoiceSum(rows.map(displayRow), field);
  const displayDeduction = (row: AccountingInvoice) => displayRow(row).deduction;
  const [expanded, setExpanded] = useState<Record<Currency, boolean>>({ PEN: false, USD: false });
  const [deductionExpanded, setDeductionExpanded] = useState(false);
  const [dueDateExpanded, setDueDateExpanded] = useState(false);
  const registerDates = tab === 'cash' ? cash.rows.map(row => row.date) : invoices.filter(row => row.kind === tab).map(row => row.issuedAt);
  const savedYears = Array.from(new Set(registerDates.map(date => date.slice(0, 4)))).sort().reverse();
  useEffect(() => {
    if (!loading && tab === 'cash') setYear(current => current === 'all' ? current : accountingRegisterYear(cash.rows.map(row => row.date), current));
  }, [loading, tab, invoices, cash.rows]);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [projectId, tab, year, invoiceYear, month, party, from, to]);
  const sale = tab === 'sale';
  const title = sale ? 'Facturas Venta' : 'Facturas Compra';
  const partyLabel = sale ? 'Cliente' : 'Proveedor';
  const periodRows = invoices.filter(row => (invoiceYear === 'all' || row.issuedAt.startsWith(invoiceYear))
    && (!month || row.issuedAt.slice(5, 7) === month)
    && (!from || row.issuedAt >= from) && (!to || row.issuedAt <= to));
  const filtered = periodRows.filter(row => row.kind === tab && (!party || row.supplier.toLocaleLowerCase().includes(party.toLocaleLowerCase())));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, totalPages);
  const pageOffset = (currentPage - 1) * 10;
  const visibleInvoices = filtered.slice(pageOffset, pageOffset + 10);
  useEffect(() => { setPage(value => Math.min(value, totalPages)); }, [totalPages]);
  const summaryRows = invoices.filter(r => inAccountingYear(r, summaryYear, CURRENT_YEAR));
  const selected = summaryRows.filter(r => r.kind === tab);
  const symbol = currency === 'PEN' ? 'S/' : 'US$';
  const monthly = MONTHS.map((name, index) => {
    const rows = summaryRows.filter(r => Number(r.issuedAt.slice(5, 7)) === index + 1);
    const active = rows.filter(r => r.kind === tab);
    return { name, count: active.length, base: displaySum(active, 'base'), purchases: displaySum(rows.filter(r => r.kind === 'purchase'), 'base'), sales: displaySum(rows.filter(r => r.kind === 'sale'), 'base') };
  });
  const annual = [
    { name: 'Ventas', value: displaySum(summaryRows.filter(r => r.kind === 'sale'), 'base') },
    { name: 'Compras', value: displaySum(summaryRows.filter(r => r.kind === 'purchase'), 'base') },
  ];
  const expandedColumns = (expanded[currency] ? currency === 'USD' ? 3 : 2 : 0) + (deductionExpanded ? 2 : 0) + (dueDateExpanded ? 1 : 0);
  const columns = 12 + expandedColumns;
  const indicatorPeriod = { year: tab === 'cash' ? year : invoiceYear, month, from: tab === 'cash' ? '' : from, to: tab === 'cash' ? '' : to };
  const indicatorInvoices = invoices.filter(row => inAccountingPeriod(row.issuedAt, indicatorPeriod));
  const cashPeriod = cash.rows.filter(row => inAccountingPeriod(row.date, indicatorPeriod));
  const indicators = accountingIndicators(indicatorInvoices.map(row => ({ ...displayRow(row), currency: 'PEN', exchangeRate: 1 })), cashPeriod.map(row => ({ ...row, deposit: accountingDisplayAmount(row.deposit, 'PEN', currency, exchangeRate), expense: accountingDisplayAmount(row.expense, 'PEN', currency, exchangeRate) })));
  const cards = [
    ['Facturas ventas', `${symbol} ${cardAmount(indicators.sales)}`, `IGV ventas: ${symbol} ${amount(indicators.salesIgv)}`],
    ['Facturas compras', `${symbol} ${cardAmount(indicators.purchases)}`, `IGV compras: ${symbol} ${amount(indicators.purchaseIgv)}`],
    ['Diferencia IGV', `${symbol} ${cardAmount(indicators.igvBalance)}`, 'IGV ventas − IGV compras'],
    ['Pago detracciones', `${symbol} ${cardAmount(indicators.deductionPaid)}`, `Pendiente: ${symbol} ${amount(indicators.deductionPending)}`],
    ['Caja chica pagos', `${symbol} ${cardAmount(indicators.cashPayments)}`, `Depósitos: ${symbol} ${amount(indicators.cashDeposits)}`],
    ['Validación facturas', `${symbol} ${cardAmount(indicators.validated)}`, `Por validar: ${symbol} ${amount(indicators.pending)}`],
    ['Notas de crédito', `${symbol} ${cardAmount(indicators.creditNotes)}`, `${indicators.creditNotesCount} notas de crédito`],
  ].map((card, index) => (index === 4 ? sourcesLoaded.cash : sourcesLoaded.invoices) ? card : [card[0], loading ? 'Cargando…' : 'No disponible', loading ? 'Consultando registros…' : 'No se pudo cargar este registro.']);
  const exportPdf = async (format: 'pdf' | 'excel' = 'pdf') => {
    if (loading || pdfBusy) return;
    setPdfBusy(true); setPdfError('');
    try {
      if (tab === 'cash') {
        if (!cashExportRef.current) throw new Error('El reporte todavía está cargando. Vuelve a intentarlo.');
        await cashExportRef.current(format);
      } else {
        const currencyValues = (r: AccountingInvoice) => [displayRow(r).base, displayRow(r).igv, displayRow(r).base + displayRow(r).igv].map(amount);
        const totalsFor = () => ['base', 'igv', 'total'].map(field => amount(displaySum(filtered, field as 'base' | 'igv' | 'total')));
        await (format === 'excel' ? downloadAccountingExcel : downloadAccountingPdf)({
          title, projectId, cards, registerOnly: true,
          cardColors: ['16A36A', '2563EB', 'DC2626', 'CA8A04', 'CA8A04', '16A36A', '2563EB'],
          period: `${invoiceYear === 'all' ? 'Todos los años' : `Año ${invoiceYear}`} | ${month ? MONTHS[Number(month) - 1] : 'Todos los meses'}${party ? ` | ${partyLabel}: ${party}` : ''}${from ? ` | Desde ${date(from)}` : ''}${to ? ` | Hasta ${date(to)}` : ''}`,
          summaryPeriod: `Resumen: ${summaryYear === 'all' ? 'Todos los años' : summaryYear === 'recent' ? 'Últimos 8 años' : summaryYear} | Moneda: ${symbol}`,
          register: { title, headers: ['N.º', 'Tipo doc.', 'Emisión', 'Vencimiento', 'N.º comprob.', 'RUC', partyLabel, `Base ${symbol}`, `IGV ${symbol}`, `Total ${symbol}`, `Detracción ${symbol}`, 'N.º detracción', 'Fecha detracción', 'T. cambio', 'Validada', 'Ref. comprob. (NC)'], weights: [.4, .85, .85, .85, 1, 1.05, sale ? 2.4 : 1.6, .8, .8, .8, .8, .75, 1, .8, .75, .9], rows: filtered.map((r, index) => [`${sale ? 'V' : 'C'}${index + 1}`, r.documentType, date(r.issuedAt), date(r.dueAt), r.number, r.ruc, r.supplier, ...currencyValues(r), amount(displayDeduction(r)), r.deductionNumber, date(r.deductionDate), String(r.exchangeRate), r.validated ? 'SÍ' : 'NO', r.creditReference]), totals: ['Total', '', '', '', '', '', '', ...totalsFor(), amount(filtered.reduce((n, r) => n + displayDeduction(r), 0)), '', '', '', '', ''] },
          summaries: [{ title: `RESUMEN ${title}`, headers: ['Mes', 'N.º facturas', `Base sin IGV ${symbol}`], rows: monthly.map(r => [r.name, String(r.count), amount(r.base)]), totals: ['Total', String(selected.length), amount(displaySum(selected, 'base'))] }],
          chart: { title: `Ventas y compras por mes · ${symbol}`, labels: monthly.map(r => r.name), series: [{ name: 'Ventas', values: monthly.map(r => r.sales) }, { name: 'Compras', values: monthly.map(r => r.purchases) }] },
        });
      }
    } catch (e) { setPdfError(e instanceof Error ? e.message : 'No se pudo generar el reporte.'); }
    finally { setPdfBusy(false); }
  };
  return <div className={styles.sheet} data-project-lock-managed="true">
    <div className={styles.toolbar}>
      <div className={styles.tabs} role="tablist" aria-label="Secciones de Contabilidad">
        {([['purchase', '1. Facturas Compra'], ['sale', '2. Facturas Venta'], ['cash', '3. Caja Chica']] as const).map(([value, label]) => <button key={value} type="button" role="tab" id={`accounting-tab-${value}`} aria-selected={tab === value} aria-controls="accounting-panel" onClick={() => { setTab(value); setParty(''); setEditingInvoice(null); setEditingCash(null); }}>{label}</button>)}
      </div>
      <div className={styles.actions}><button type="button" className="btn-neutral !h-8 !rounded-md !px-3 !text-xs" disabled={loading || !!loadError || pdfBusy} onClick={() => exportPdf()}><FiDownload />{pdfBusy ? 'Generando...'  : 'Descargar PDF'}</button>{tab !== 'cash' ? <InvoiceEntry key={`${projectId}-${tab}`} projectId={projectId} kind={tab} blockedReason={loadError || (loading ? 'Cargando el registro...' : undefined)} editing={editingInvoice} onEditClose={() => setEditingInvoice(null)} disabled={readonly || loading || !!loadError} onSaved={rows => { setInvoices(prev => [...prev.map(r => rows.find(next => next.id === r.id) || r), ...rows.filter(r => !prev.some(existing => existing.id === r.id))]); setInvoiceYear('all'); setMonth(''); setFrom(''); setTo(''); setParty(''); }} /> : <CashEntry key={projectId} projectId={projectId} blockedReason={loadError || (loading ? 'Cargando el registro...' : undefined)} editing={editingCash} onEditClose={() => setEditingCash(null)} disabled={readonly || loading || !!loadError} onSaved={rows => { setCash(prev => ({ ...prev, rows: [...prev.rows.map(r => rows.find(next => next.id === r.id) || r), ...rows.filter(r => !prev.rows.some(existing => existing.id === r.id))] })); if (rows[0]) setYear(rows[0].date.slice(0, 4)); }} />}</div>
    </div>
    {loadError && <div role="alert" className={styles.error}>{loadError} Los registros que no se pudieron cargar no se muestran. <button type="button" className="btn-neutral !h-8" onClick={() => setReload(value => value + 1)} disabled={loading}>Reintentar carga</button></div>}
    {pdfError && <p role="alert" className={styles.error}>{pdfError}</p>}
    {tab !== 'cash' && <section className={styles.cards} aria-label="Indicadores contables">{cards.map(([label, value, description], index) => {
      const tones = ['#16A36A', '#2563EB', '#DC2626', '#CA8A04', '#DC2626', '#16A36A', '#2563EB'];
      const Icon = [FiFileText, FiShoppingCart, FiActivity, FiCreditCard, FiDollarSign, FiCheckCircle, FiRotateCcw][index];
      return <KpiCard key={label} label={label} value={value} helper={<span className="block text-left">{description}</span>} icon={<Icon />} tone={tones[index]} truncateLabel={false} valueAlign="center" valueSize="expanded" />;
    })}</section>}
    <div role="tabpanel" id="accounting-panel" aria-labelledby={`accounting-tab-${tab}`}>
    {tab === 'cash' ? <CashView key={projectId} projectId={projectId} invoices={invoices} invoiceStatus={sourcesLoaded.invoices ? 'ready' : loading ? 'loading' : 'error'} status={sourcesLoaded.cash ? 'ready' : loading ? 'loading' : 'error'} exportRef={cashExportRef} cards={cards} data={cash} year={year} onYear={setYear} month={month} onMonth={setMonth} disabled={readonly || loading || !!loadError} onOpening={(savedYear, balance) => setCash(prev => ({ ...prev, openings: { ...prev.openings, [savedYear]: balance } }))} onEdit={setEditingCash} onSaved={saved => setCash(prev => ({ ...prev, rows: prev.rows.map(row => row.id === saved.id ? saved : row) }))} onDelete={row => setDeleting({ id: row.id, cash: true, label: `${row.date} · ${row.description}` })} /> : <>
    <section aria-label={title}>
      <div className={styles.filters}><h2>{title}</h2>
        <label>Año<select value={invoiceYear} onChange={e => setInvoiceYear(e.target.value)}><option value="all">Todos los años</option>{Array.from(new Set([...savedYears, String(CURRENT_YEAR), invoiceYear].filter(value => value !== 'all'))).sort().reverse().map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Mes<select value={month} onChange={e => setMonth(e.target.value)}><option value="">Todos</option>{MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}</select></label>
        <label>{partyLabel}<input placeholder={`Buscar ${partyLabel.toLowerCase()}`} value={party} onChange={e => setParty(e.target.value)} /></label>
        <label>Desde<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
        <label>Hasta<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
        <button type="button" onClick={() => { setInvoiceYear('all'); setMonth(''); setParty(''); setFrom(''); setTo(''); }}>Limpiar</button>
      </div>
      {from && to && from > to && <p role="alert">La fecha inicial debe ser anterior a la fecha final.</p>}
      <div className={`${styles.register} ${styles.invoiceRegister}`}><table><thead><tr>
        {['N.º', 'Tipo doc.'].map(label => <th key={label}>{label}</th>)}
        <th><button type="button" aria-expanded={dueDateExpanded} aria-label={`${dueDateExpanded ? 'Ocultar' : 'Mostrar'} fecha de vencimiento`} onClick={() => setDueDateExpanded(value => !value)} title={`${dueDateExpanded ? 'Ocultar' : 'Mostrar'} fecha de vencimiento`}>Fecha emisión {dueDateExpanded ? '−' : '+'}</button></th>
        {dueDateExpanded && <th className={styles.dateColumn}>Fecha venc.</th>}
        {['Mes', 'N.º comprob.', 'N.º RUC', partyLabel].map(label => <th key={label} className={label === partyLabel ? styles.partyCell : undefined}>{label}</th>)}
        {([currency]).map(unit => <CurrencyHeaders key={unit} unit={unit} expanded={expanded[unit]} toggle={() => setExpanded(prev => ({ ...prev, [unit]: !prev[unit] }))} />)}
        <th><button type="button" aria-expanded={deductionExpanded} onClick={() => setDeductionExpanded(value => !value)} title={`${deductionExpanded ? 'Ocultar' : 'Mostrar'} número y fecha de detracción`}>Detracción {symbol} {deductionExpanded ? '−' : '+'}</button></th>
        {deductionExpanded && <><th>N.º detracción</th><th>Fecha detracción</th></>}
        {['Validada', 'Ref. comprob. (NC)', 'Acciones'].map(label => <th key={label}>{label}</th>)}
      </tr></thead><tbody>{visibleInvoices.map((row, index) => <tr key={row.id}>
        <td>{sale ? 'V' : 'C'}{pageOffset + index + 1}</td><td>{row.documentType}</td><td>{date(row.issuedAt)}</td>{dueDateExpanded && <td className={styles.dateColumn}>{date(row.dueAt)}</td>}<td>{MONTHS[Number(row.issuedAt.slice(5, 7)) - 1]} {row.issuedAt.slice(0, 4)}</td><td>{row.number}</td><td>{row.ruc}</td><td className={styles.partyCell} title={row.supplier}>{row.supplier}</td>
        {([currency]).map(unit => <CurrencyCells key={unit} row={{ ...displayRow(row), exchangeRate: row.currency === 'USD' ? row.exchangeRate : exchangeRate }} unit={unit} expanded={expanded[unit]} baseEditor={row.currency === unit ? <InvoiceBaseCell row={row} projectId={projectId} igvRate={parameters.igvRate} disabled={readonly || loading || !!loadError} onSaved={saved => setInvoices(prev => prev.map(invoice => invoice.id === saved.id ? saved : invoice))} /> : undefined} />)}
        <td>{amount(displayDeduction(row))}</td>{deductionExpanded && <><td>{row.deductionNumber || '—'}</td><td>{date(row.deductionDate)}</td></>}<td className={row.validated ? styles.yes : styles.no}>{row.validated ? 'SÍ' : 'NO'}</td><td>{row.creditReference || '—'}</td><td><RecordActions attachment={{ type: 'invoice', id: row.id, projectId, hasFiles: 'attachments' in row && Array.isArray(row.attachments) && row.attachments.length > 0 }} disabled={readonly || loading || !!loadError} label={row.number} onEdit={() => setEditingInvoice(row)} onDelete={() => setDeleting({ id: row.id, cash: false, label: row.number })} /></td>
      </tr>)}{!filtered.length && <tr><td colSpan={columns} className={styles.empty}>{loading ? 'Cargando facturas…' : loadError ? 'No se pudo cargar el registro.' : 'Sin facturas para estos filtros. Ingresa una nueva factura o importa un archivo Excel.'}</td></tr>}</tbody>
        <tfoot><tr><td colSpan={dueDateExpanded ? 8 : 7}>{filtered.length} comprobantes · Totales</td>{([currency]).map(unit => <CurrencyCells key={unit} unit={unit} expanded={expanded[unit]} isTotal row={{ currency: unit, exchangeRate: 1, base: displaySum(filtered, 'base'), igv: displaySum(filtered, 'igv'), total: displaySum(filtered, 'total') }} />)}<td>{amount(filtered.reduce((n, r) => n + displayDeduction(r), 0))}</td><td colSpan={3 + (deductionExpanded ? 2 : 0)} /></tr></tfoot>
      </table></div>
      <PaginationBar page={currentPage} totalPages={totalPages} total={filtered.length} limit={10} setPage={setPage} label="facturas" compact />
    </section>
    <section aria-label={`Resumen ${title}`}>
      <div className={styles.summaryHeading}><h2>RESUMEN {title}</h2><label className={styles.yearFilter}>Año<select value={summaryYear} onChange={e => setSummaryYear(e.target.value)}><option value="all">Todos</option><option value="recent">Últimos 8 años</option>{RECENT_YEARS.map(value => <option key={value} value={String(value)}>{value}</option>)}</select></label><div className={styles.toggle} aria-label="Moneda del resumen">{(['PEN', 'USD'] as const).map(unit => <button key={unit} type="button" aria-pressed={currency === unit} onClick={() => setCurrency(unit)}>{unit === 'PEN' ? 'Soles' : 'Dólares'}</button>)}</div></div>
      <div className={styles.summary}>
      <div><table><thead><tr><th>Mes</th><th>N.º facturas</th><th>Base sin IGV {symbol}</th></tr></thead><tbody>{monthly.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.count}</td><td>{amount(row.base)}</td></tr>)}</tbody><tfoot><tr><td>Total</td><td>{selected.length}</td><td>{amount(displaySum(selected, 'base'))}</td></tr></tfoot></table></div>
      <div className={styles.chart}><h2>Ventas vs. compras · {symbol}</h2>{summaryRows.length ? <ResponsiveContainer width="100%" height={215}><BarChart data={annual} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={65} /><Tooltip formatter={(v: number) => `${symbol} ${amount(v)}`} /><Bar dataKey="value" name="Base sin IGV">{annual.map(row => <Cell key={row.name} fill={row.name === 'Compras' ? '#ed9b40' : '#4472c4'} />)}</Bar></BarChart></ResponsiveContainer> : <div className={styles.chartEmpty}>Sin movimientos para este período</div>}</div>
      <div className={styles.chart}><h2>Ventas vs. compras por mes · {symbol}</h2>{summaryRows.length ? <ResponsiveContainer width="100%" height={215}><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tickFormatter={v => v.slice(0, 3)} tick={{ fontSize: 9 }} interval={0} /><YAxis width={50} tick={{ fontSize: 10 }} /><Tooltip formatter={(v: number) => `${symbol} ${amount(v)}`} /><Legend /><Bar dataKey="sales" name="Ventas" fill="#4472c4" /><Bar dataKey="purchases" name="Compras" fill="#ed9b40" /></BarChart></ResponsiveContainer> : <div className={styles.chartEmpty}>Sin movimientos para este período</div>}</div>
      </div>
    </section>
    </>}
    </div>
    <DeleteRecord key={deleting?.id || 'none'} target={deleting ? { url: `/accounting/${deleting.cash ? 'cash/' : ''}${deleting.id}?projectId=${projectId}`, label: deleting.label } : null} disabled={readonly || loading} onClose={() => setDeleting(null)} onDeleted={() => { if (!deleting) return; if (deleting.cash) setCash(prev => ({ ...prev, rows: prev.rows.filter(r => r.id !== deleting.id) })); else setInvoices(prev => prev.filter(r => r.id !== deleting.id)); }} />
  </div>;
}

function CurrencyHeaders({ unit, expanded, toggle }: { unit: Currency; expanded: boolean; toggle: () => void }) {
  const symbol = unit === 'PEN' ? 'S/' : 'US$';
  return <><th className={`${unit === 'PEN' ? styles.pen : styles.usd} ${styles.expandedAmount}`}><button type="button" aria-expanded={expanded} onClick={toggle} title={`${expanded ? 'Ocultar' : 'Mostrar'} IGV y total en ${symbol}${unit === 'USD' ? ' y tipo de cambio' : ''}`}>Base imp. {symbol} {expanded ? '−' : '+'}</button></th>{expanded && <><th className={`${unit === 'PEN' ? styles.pen : styles.usd} ${styles.expandedAmount}`}>IGV {symbol}</th><th className={`${unit === 'PEN' ? styles.pen : styles.usd} ${styles.expandedAmount}`}>Total {symbol}</th>{unit === 'USD' && <th className={styles.usd}>T. cambio</th>}</>}</>;
}
function CurrencyCells({ row, unit, expanded, isTotal = false, baseEditor }: { row: Pick<AccountingInvoice, 'currency' | 'base' | 'igv' | 'exchangeRate'> & { total?: number }; unit: Currency; expanded: boolean; isTotal?: boolean; baseEditor?: import('react').ReactNode }) {
  const values = [row.base, row.igv, row.total ?? row.base + row.igv];
  return <><td className={styles.expandedAmount}>{baseEditor ?? (values ? amount(values[0]) : '—')}</td>{expanded && <><td className={styles.expandedAmount}>{values ? amount(values[1]) : '—'}</td><td className={styles.expandedAmount}>{values ? amount(values[2]) : '—'}</td>{unit === 'USD' && <td>{!isTotal && row.currency === 'USD' ? row.exchangeRate : '—'}</td>}</>}</>;
}
