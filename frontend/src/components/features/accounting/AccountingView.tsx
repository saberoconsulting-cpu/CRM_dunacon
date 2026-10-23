'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useProjectReadonly } from '@/lib/project-readonly-context';
import { AccountingInvoice, Currency, InvoiceKind, accountingIndicators, inAccountingYear, invoiceCurrencyAmounts, invoiceSum } from '@/lib/accounting';
import InvoiceEntry from './InvoiceEntry';
import CashEntry from './CashEntry';
import CashView from './CashView';
import { CashData, CashMovement } from '@/lib/accounting-cash';
import { DeleteRecord, RecordActions } from './RecordActions';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { downloadAccountingPdf } from '@/lib/accounting-pdf';
import { FiDownload, FiSliders } from 'react-icons/fi';
import { AccountingParameters, DEFAULT_ACCOUNTING_PARAMETERS } from '@/lib/accounting-parameters';
import AccountingParametersPanel from './AccountingParametersPanel';
import InvoiceBaseCell from './InvoiceBaseCell';
import { accountingRegisterYear } from '@/lib/accounting-period';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './accounting.module.css';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CURRENT_YEAR = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Lima' }).format(new Date()));
const RECENT_YEARS = Array.from({ length: 8 }, (_, index) => CURRENT_YEAR - index);
const amount = (value: number) => value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: string) => value ? value.split('-').reverse().join('/') : '—';

export default function AccountingView({ projectId }: { projectId: number }) {
  const [invoices, setInvoices] = useState<AccountingInvoice[]>([]);
  const [cash, setCash] = useState<CashData>({ rows: [], openings: {} });
  const [editingInvoice, setEditingInvoice] = useState<AccountingInvoice | null>(null);
  const [editingCash, setEditingCash] = useState<CashMovement | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; cash: boolean; label: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [parameters, setParameters] = useState<AccountingParameters>(DEFAULT_ACCOUNTING_PARAMETERS);
  const [showParameters, setShowParameters] = useState(false);
  const [reload, setReload] = useState(0);
  const cashExportRef = useRef<(() => Promise<void>) | null>(null);
  const [tab, setTab] = useState<InvoiceKind | 'cash'>('purchase');
  const readonly = useProjectReadonly();
  useEffect(() => {
    let active = true; setLoading(true); setInvoices([]); setCash({ rows: [], openings: {} }); setLoadError('');
    Promise.allSettled([api.get<AccountingInvoice[]>(`/accounting?projectId=${projectId}`), api.get<CashData>(`/accounting/cash?projectId=${projectId}`), api.get<AccountingParameters>(`/accounting/parameters?projectId=${projectId}`)])
      .then(([rows, cashData, savedParameters]) => {
        if (!active) return;
        if (rows.status === 'fulfilled') {
          setInvoices(rows.value);
          setSummaryYear('all');
        }
        if (cashData.status === 'fulfilled') setCash(cashData.value);
        if (savedParameters.status === 'fulfilled') setParameters(savedParameters.value);
        const errors = [rows, cashData, savedParameters].flatMap((result, index) => result.status === 'rejected' ? [`${['Facturas', 'Caja Chica', 'Parámetros'][index]}: ${result.reason?.message || 'No se pudo cargar.'}`] : []);
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
  const [currency, setCurrency] = useState<Currency>('PEN');
  const [expanded, setExpanded] = useState<Record<Currency, boolean>>({ PEN: false, USD: false });
  const [deductionExpanded, setDeductionExpanded] = useState(false);
  const [dueDateExpanded, setDueDateExpanded] = useState(false);
  const registerDates = tab === 'cash' ? cash.rows.map(row => row.date) : invoices.filter(row => row.kind === tab).map(row => row.issuedAt);
  const savedYears = Array.from(new Set(registerDates.map(date => date.slice(0, 4)))).sort().reverse();
  useEffect(() => {
    if (!loading && tab === 'cash') setYear(current => accountingRegisterYear(cash.rows.map(row => row.date), current));
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
  const summaryRows = invoices.filter(r => (currency === 'PEN' || r.currency === 'USD') && inAccountingYear(r, summaryYear, CURRENT_YEAR));
  const selected = summaryRows.filter(r => r.kind === tab);
  const symbol = currency === 'PEN' ? 'S/' : 'US$';
  const monthly = MONTHS.map((name, index) => {
    const rows = summaryRows.filter(r => Number(r.issuedAt.slice(5, 7)) === index + 1);
    const active = rows.filter(r => r.kind === tab);
    return { name, count: active.length, base: invoiceSum(active, 'base', currency === 'PEN'), purchases: invoiceSum(rows.filter(r => r.kind === 'purchase'), 'base', currency === 'PEN'), sales: invoiceSum(rows.filter(r => r.kind === 'sale'), 'base', currency === 'PEN') };
  });
  const annual = [
    { name: 'Ventas', value: invoiceSum(summaryRows.filter(r => r.kind === 'sale'), 'base', currency === 'PEN') },
    { name: 'Compras', value: invoiceSum(summaryRows.filter(r => r.kind === 'purchase'), 'base', currency === 'PEN') },
  ];
  const expandedColumns = (expanded.PEN ? 2 : 0) + (expanded.USD ? 3 : 0) + (deductionExpanded ? 2 : 0) + (dueDateExpanded ? 1 : 0);
  const columns = (sale ? 12 : 13) + expandedColumns;
  const cashPeriod = cash.rows.filter(r => (tab === 'cash' ? r.date.startsWith(year) : invoiceYear === 'all' || r.date.startsWith(invoiceYear)) && (!month || r.date.slice(5, 7) === month) && (!from || r.date >= from) && (!to || r.date <= to));
  const indicators = accountingIndicators(periodRows, cashPeriod);
  const cards = [
    ['Comprob. ventas', `S/ ${amount(indicators.sales)}`, `IGV ventas: S/ ${amount(indicators.salesIgv)}`],
    ['Comprob. compras', `S/ ${amount(indicators.purchases)}`, `IGV compras: S/ ${amount(indicators.purchaseIgv)}`],
    ['IGV (crédito fiscal)', `S/ ${amount(indicators.igvBalance)}`, 'IGV ventas − IGV compras'],
    ['Pago detracciones', `S/ ${amount(indicators.deductionPaid)}`, `Pendiente: S/ ${amount(indicators.deductionPending)}`],
    ['Caja chica pagos', `S/ ${amount(indicators.cashPayments)}`, `Depósitos: S/ ${amount(indicators.cashDeposits)}`],
    ['Validación facturas', `S/ ${amount(indicators.validated)}`, `Por validar: S/ ${amount(indicators.pending)}`],
    ['Notas de crédito', `S/ ${amount(indicators.creditNotes)}`, `${indicators.creditNotesCount} notas de crédito`],
  ];
  const exportPdf = async () => {
    if (loading || pdfBusy) return;
    setPdfBusy(true); setPdfError('');
    try {
      if (tab === 'cash') {
        if (!cashExportRef.current) throw new Error('El reporte todavía está cargando. Vuelve a intentarlo.');
        await cashExportRef.current();
      } else {
        const currencyValues = (r: AccountingInvoice, unit: Currency) => invoiceCurrencyAmounts(r, unit)?.map(amount) || ['', '', ''];
        const totalsFor = (unit: Currency) => ['base', 'igv', 'total'].map(field => amount(invoiceSum(unit === 'PEN' ? filtered : filtered.filter(r => r.currency === 'USD'), field as 'base' | 'igv' | 'total', unit === 'PEN')));
        await downloadAccountingPdf({
          title, projectId, cards,
          period: `${invoiceYear === 'all' ? 'Todos los años' : `Año ${invoiceYear}`} | ${month ? MONTHS[Number(month) - 1] : 'Todos los meses'}${party ? ` | ${partyLabel}: ${party}` : ''}${from ? ` | Desde ${date(from)}` : ''}${to ? ` | Hasta ${date(to)}` : ''}`,
          summaryPeriod: `Resumen: ${summaryYear === 'all' ? 'Todos los años' : summaryYear === 'recent' ? 'Últimos 8 años' : summaryYear} | Moneda: ${symbol}`,
          register: { title, headers: ['N.º', 'Tipo doc.', 'Emisión', 'Vencimiento', 'N.º comprob.', 'RUC', partyLabel, 'Base S/', 'IGV S/', 'Total S/', 'Base US$', 'IGV US$', 'Total US$', 'Detracción S/', 'N.º detracción', 'Fecha detracción', 'T. cambio', ...(!sale ? ['Validada'] : []), 'Ref. comprob. (NC)'], weights: [.4, 1, .85, .85, 1, 1.05, 1.6, .8, .8, .8, .8, .8, .8, .8, .9, .85, .65, ...(!sale ? [.6] : []), 1], rows: filtered.map((r, index) => [`${sale ? 'V' : 'C'}${index + 1}`, r.documentType, date(r.issuedAt), date(r.dueAt), r.number, r.ruc, r.supplier, ...currencyValues(r, 'PEN'), ...currencyValues(r, 'USD'), amount(r.deduction), r.deductionNumber, date(r.deductionDate), String(r.exchangeRate), ...(!sale ? [r.validated ? 'SÍ' : 'NO'] : []), r.creditReference]), totals: ['Total', '', '', '', '', '', '', ...totalsFor('PEN'), ...totalsFor('USD'), amount(filtered.reduce((n, r) => n + r.deduction, 0)), '', '', '', ...(!sale ? [''] : []), ''] },
          summaries: [{ title: `RESUMEN ${title}`, headers: ['Mes', 'N.º facturas', `Base sin IGV ${symbol}`], rows: monthly.map(r => [r.name, String(r.count), amount(r.base)]), totals: ['Total', String(selected.length), amount(invoiceSum(selected, 'base', currency === 'PEN'))] }],
          chart: { title: `Ventas y compras por mes · ${symbol}`, labels: monthly.map(r => r.name), series: [{ name: 'Ventas', values: monthly.map(r => r.sales) }, { name: 'Compras', values: monthly.map(r => r.purchases) }] },
        });
      }
    } catch (e) { setPdfError(e instanceof Error ? e.message : 'No se pudo descargar el PDF.'); }
    finally { setPdfBusy(false); }
  };
  return <div className={styles.sheet} data-project-lock-managed="true">
    {showParameters && <AccountingParametersPanel key={projectId} projectId={projectId} parameters={parameters} onSaved={setParameters} disabled={readonly || loading || !!loadError} onClose={() => setShowParameters(false)} />}
    <div className={styles.toolbar}>
      <div className={styles.tabs} role="tablist" aria-label="Secciones de Contabilidad">
        {([['purchase', '1. Facturas Compra'], ['sale', '2. Facturas Venta'], ['cash', '3. Caja Chica']] as const).map(([value, label]) => <button key={value} type="button" role="tab" id={`accounting-tab-${value}`} aria-selected={tab === value} aria-controls="accounting-panel" onClick={() => { setTab(value); setParty(''); setEditingInvoice(null); setEditingCash(null); }}>{label}</button>)}
      </div>
      <div className={styles.actions}><button type="button" className="btn-neutral !h-8 !rounded-md !px-3 !text-xs" disabled={loading || !!loadError} onClick={() => setShowParameters(true)}><FiSliders />Parámetros</button><button type="button" className="btn-neutral !h-8 !rounded-md !px-3 !text-xs" disabled={loading || !!loadError || pdfBusy} onClick={exportPdf}><FiDownload />{pdfBusy ? 'Generando PDF...' : 'Descargar PDF'}</button>{tab !== 'cash' ? <InvoiceEntry key={`${projectId}-${tab}`} projectId={projectId} kind={tab} parameters={parameters} blockedReason={loadError || (loading ? 'Cargando el registro...' : undefined)} editing={editingInvoice} onEditClose={() => setEditingInvoice(null)} disabled={readonly || loading || !!loadError} onSaved={rows => { setInvoices(prev => [...prev.map(r => rows.find(next => next.id === r.id) || r), ...rows.filter(r => !prev.some(existing => existing.id === r.id))]); setInvoiceYear('all'); setMonth(''); setFrom(''); setTo(''); setParty(''); }} /> : <CashEntry key={projectId} projectId={projectId} blockedReason={loadError || (loading ? 'Cargando el registro...' : undefined)} editing={editingCash} onEditClose={() => setEditingCash(null)} disabled={readonly || loading || !!loadError} onSaved={rows => { setCash(prev => ({ ...prev, rows: [...prev.rows.map(r => rows.find(next => next.id === r.id) || r), ...rows.filter(r => !prev.rows.some(existing => existing.id === r.id))] })); if (rows[0]) setYear(rows[0].date.slice(0, 4)); }} />}</div>
    </div>
    {loadError && <div role="alert" className={styles.error}>{loadError} Los registros que no se pudieron cargar no se muestran. <button type="button" className="btn-neutral !h-8" onClick={() => setReload(value => value + 1)} disabled={loading}>Reintentar carga</button></div>}
    {!loading && <div className="my-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">{tab !== 'cash' && <button type="button" className="btn-neutral !h-8 !text-xs" onClick={() => { setInvoiceYear('all'); setMonth(''); setParty(''); setFrom(''); setTo(''); }}>Ver todos</button>}<span>{registerDates.length} registros cargados del servidor en esta sección.</span>{savedYears.map(savedYear => <button type="button" key={savedYear} className="btn-neutral !h-8 !text-xs" onClick={() => { if (tab === 'cash') setYear(savedYear); else setInvoiceYear(savedYear); setMonth(''); setParty(''); setFrom(''); setTo(''); }}>Ver {savedYear} ({registerDates.filter(date => date.startsWith(savedYear)).length})</button>)}</div>}
    {pdfError && <p role="alert" className={styles.error}>{pdfError}</p>}
    <section className={styles.cards} aria-label="Indicadores contables">{cards.map(([label, value, description]) => <article key={label}><h2>{label}</h2><strong>{value}</strong><p>{description}</p></article>)}</section>
    <div role="tabpanel" id="accounting-panel" aria-labelledby={`accounting-tab-${tab}`}>
    {tab === 'cash' ? <CashView key={projectId} projectId={projectId} exportRef={cashExportRef} cards={cards} data={cash} year={year} onYear={setYear} month={month} onMonth={setMonth} disabled={readonly || loading || !!loadError} onOpening={(savedYear, balance) => setCash(prev => ({ ...prev, openings: { ...prev.openings, [savedYear]: balance } }))} onEdit={setEditingCash} onSaved={saved => setCash(prev => ({ ...prev, rows: prev.rows.map(row => row.id === saved.id ? saved : row) }))} onDelete={row => setDeleting({ id: row.id, cash: true, label: `${row.date} · ${row.description}` })} /> : <>
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
        {(['PEN', 'USD'] as const).map(unit => <CurrencyHeaders key={unit} unit={unit} expanded={expanded[unit]} toggle={() => setExpanded(prev => ({ ...prev, [unit]: !prev[unit] }))} />)}
        <th><button type="button" aria-expanded={deductionExpanded} onClick={() => setDeductionExpanded(value => !value)} title={`${deductionExpanded ? 'Ocultar' : 'Mostrar'} número y fecha de detracción`}>Detracción S/ {deductionExpanded ? '−' : '+'}</button></th>
        {deductionExpanded && <><th>N.º detracción</th><th>Fecha detracción</th></>}
        {[...(!sale ? ['Validada'] : []), 'Ref. comprob. (NC)', 'Acciones'].map(label => <th key={label}>{label}</th>)}
      </tr></thead><tbody>{visibleInvoices.map((row, index) => <tr key={row.id}>
        <td>{sale ? 'V' : 'C'}{pageOffset + index + 1}</td><td>{row.documentType}</td><td>{date(row.issuedAt)}</td>{dueDateExpanded && <td className={styles.dateColumn}>{date(row.dueAt)}</td>}<td>{MONTHS[Number(row.issuedAt.slice(5, 7)) - 1]} {row.issuedAt.slice(0, 4)}</td><td>{row.number}</td><td>{row.ruc}</td><td className={styles.partyCell} title={row.supplier}>{row.supplier}</td>
        {(['PEN', 'USD'] as const).map(unit => <CurrencyCells key={unit} row={row} unit={unit} expanded={expanded[unit]} baseEditor={row.currency === unit ? <InvoiceBaseCell row={row} projectId={projectId} igvRate={parameters.igvRate} disabled={readonly || loading || !!loadError} onSaved={saved => setInvoices(prev => prev.map(invoice => invoice.id === saved.id ? saved : invoice))} /> : undefined} />)}
        <td>{amount(row.deduction)}</td>{deductionExpanded && <><td>{row.deductionNumber || '—'}</td><td>{date(row.deductionDate)}</td></>}{!sale && <td className={row.validated ? styles.yes : styles.no}>{row.validated ? 'SÍ' : 'NO'}</td>}<td>{row.creditReference || '—'}</td><td><RecordActions disabled={readonly || loading || !!loadError} label={row.number} onEdit={() => setEditingInvoice(row)} onDelete={() => setDeleting({ id: row.id, cash: false, label: row.number })} /></td>
      </tr>)}{!filtered.length && <tr><td colSpan={columns} className={styles.empty}>{loading ? 'Cargando facturas…' : loadError ? 'No se pudo cargar el registro.' : 'Sin facturas para estos filtros. Ingresa una nueva factura o importa un archivo Excel.'}</td></tr>}</tbody>
        <tfoot><tr><td colSpan={dueDateExpanded ? 8 : 7}>{filtered.length} comprobantes · Totales</td>{(['PEN', 'USD'] as const).map(unit => <CurrencyCells key={unit} unit={unit} expanded={expanded[unit]} isTotal row={{ currency: unit, exchangeRate: 1, base: invoiceSum(unit === 'PEN' ? filtered : filtered.filter(r => r.currency === 'USD'), 'base', unit === 'PEN'), igv: invoiceSum(unit === 'PEN' ? filtered : filtered.filter(r => r.currency === 'USD'), 'igv', unit === 'PEN'), total: invoiceSum(unit === 'PEN' ? filtered : filtered.filter(r => r.currency === 'USD'), 'total', unit === 'PEN') }} />)}<td>{amount(filtered.reduce((n, r) => n + r.deduction, 0))}</td><td colSpan={(sale ? 2 : 3) + (deductionExpanded ? 2 : 0)} /></tr></tfoot>
      </table></div>
      <PaginationBar page={currentPage} totalPages={totalPages} total={filtered.length} limit={10} setPage={setPage} label="facturas" compact />
    </section>
    <section aria-label={`Resumen ${title}`}>
      <div className={styles.summaryHeading}><h2>RESUMEN {title}</h2><label className={styles.yearFilter}>Año<select value={summaryYear} onChange={e => setSummaryYear(e.target.value)}><option value="all">Todos</option><option value="recent">Últimos 8 años</option>{RECENT_YEARS.map(value => <option key={value} value={String(value)}>{value}</option>)}</select></label><div className={styles.toggle} aria-label="Moneda del resumen">{(['PEN', 'USD'] as const).map(unit => <button key={unit} type="button" aria-pressed={currency === unit} onClick={() => setCurrency(unit)}>{unit === 'PEN' ? 'Soles' : 'Dólares'}</button>)}</div></div>
      <div className={styles.summary}>
      <div><table><thead><tr><th>Mes</th><th>N.º facturas</th><th>Base sin IGV {symbol}</th></tr></thead><tbody>{monthly.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.count}</td><td>{amount(row.base)}</td></tr>)}</tbody><tfoot><tr><td>Total</td><td>{selected.length}</td><td>{amount(invoiceSum(selected, 'base', currency === 'PEN'))}</td></tr></tfoot></table></div>
      <div className={styles.chart}><h2>Ventas vs. compras · {symbol}</h2>{summaryRows.length ? <ResponsiveContainer width="100%" height={215}><BarChart data={annual} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={65} /><Tooltip formatter={(v: number) => `${symbol} ${amount(v)}`} /><Bar dataKey="value" name="Base sin IGV" fill="#4472c4" /></BarChart></ResponsiveContainer> : <div className={styles.chartEmpty}>Sin movimientos para este período</div>}</div>
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
  const values = invoiceCurrencyAmounts(row, unit);
  return <><td className={styles.expandedAmount}>{baseEditor ?? (values ? amount(values[0]) : '—')}</td>{expanded && <><td className={styles.expandedAmount}>{values ? amount(values[1]) : '—'}</td><td className={styles.expandedAmount}>{values ? amount(values[2]) : '—'}</td>{unit === 'USD' && <td>{!isTotal && row.currency === 'USD' ? row.exchangeRate : '—'}</td>}</>}</>;
}
