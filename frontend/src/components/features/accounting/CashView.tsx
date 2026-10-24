'use client';

import { MutableRefObject, useEffect, useState } from 'react';
import { useDisplayCurrency } from '@/lib/currency';
import { accountingDisplayAmount } from '@/lib/accounting-display';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { cashByDocument, cashLedger, cashMonthly, cashOpeningBalance, cashBaseYear, CASH_DOCUMENT_TYPES, CashData, CashMovement } from '@/lib/accounting-cash';
import { RecordActions } from './RecordActions';
import { PaginationBar } from '@/components/ui/PaginationBar';
import CashChart from './CashChart';
import CashClassificationPanel from './CashClassificationPanel';
import { downloadAccountingExcel } from '@/lib/accounting-excel';
import { downloadAccountingPdf } from '@/lib/accounting-pdf';
import styles from './accounting.module.css';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function CashView({ projectId, data, year, onYear, month, onMonth, disabled, onOpening, onEdit, onDelete, onSaved, exportRef, cards }: { projectId: number; data: CashData; year: string; onYear: (value: string) => void; month: string; onMonth: (value: string) => void; disabled: boolean; onOpening: (year: string, balance: number) => void; onEdit: (row: CashMovement) => void; onDelete: (row: CashMovement) => void; onSaved: (row: CashMovement) => void; exportRef: MutableRefObject<((format?: 'pdf' | 'excel') => Promise<void>) | null>; cards: string[][] }) {
  const { currency, exchangeRate } = useDisplayCurrency();
  const symbol = currency === 'PEN' ? 'S/' : 'US$';
  const convert = (value: number) => accountingDisplayAmount(value, 'PEN', currency, exchangeRate);
  const amount = (value: number) => convert(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [search, setSearch] = useState('');
  const opening = cashOpeningBalance(data, year);
  const baseYear = cashBaseYear(data, year);
  const carried = year !== baseYear;
  const [editingBase, setEditingBase] = useState(false);
  const [baseDraft, setBaseDraft] = useState('');
  const [openingInput, setOpeningInput] = useState(String(opening));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [documentSaving, setDocumentSaving] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState('');
  const [page, setPage] = useState(1);
  const [showDocuments, setShowDocuments] = useState(false);
  const [documentDetailsExpanded, setDocumentDetailsExpanded] = useState(false);
  const [showClassification, setShowClassification] = useState(false);
  const [incomeMonth, setIncomeMonth] = useState('');
  const [expenseMonth, setExpenseMonth] = useState('');
  useEffect(() => { setPage(1); }, [projectId, year, month, search]);
  useEffect(() => { setOpeningInput(String(opening)); setError(''); }, [opening, year]);
  const availableYears = Array.from(new Set([
    ...data.rows.map(row => row.date.slice(0, 4)), ...Object.keys(data.openings), year,
    new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Lima' }).format(new Date()),
  ])).filter(value => /^\d{4}$/.test(value)).sort().reverse();
  const ledger = cashLedger(data.rows, year, opening);
  const filtered = ledger.filter(r => (!month || r.date.slice(5, 7) === month) && (!search || `${r.paidTo} ${r.description} ${r.responsible}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, totalPages);
  const visibleMovements = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  useEffect(() => { setPage(value => Math.min(value, totalPages)); }, [totalPages]);
  const monthly = cashMonthly(data.rows, year, opening);
  const documents = cashByDocument(data.rows, year);
  const totalDeposit = monthly.reduce((n, r) => n + r.deposit, 0);
  const totalExpense = monthly.reduce((n, r) => n + r.expense, 0);
  useEffect(() => {
    exportRef.current = (format = 'pdf') => (format === 'excel' ? downloadAccountingExcel : downloadAccountingPdf)({
      title: 'Caja Chica', projectId, cards: [], registerOnly: true,
      period: `Año ${year} | ${month ? MONTHS[Number(month) - 1] : 'Todos los meses'}${search ? ` | Buscar: ${search}` : ''}`,
      summaryPeriod: `Resumen anual ${year} | Moneda: ${symbol} | Saldo inicial ${symbol} ${amount(opening)}`,
      register: { title: 'Movimientos de Caja Chica', headers: ['Item', 'Fecha', 'Mes', 'Pagado a', 'Descripción', 'Tipo documento', ...(documentDetailsExpanded ? ['N.º documento', 'Responsable'] : []), `Abono ${symbol}`, `Gasto ${symbol}`, `Saldo ${symbol}`, 'Categoría', 'Clasificación'], weights: [.45, .9, .8, 1.25, 2.2, 1.1, ...(documentDetailsExpanded ? [1, 1.2] : []), .85, .85, .85, 1, 1], rows: filtered.map(r => [String(r.item), r.date.split('-').reverse().join('/'), `${MONTHS[Number(r.date.slice(5, 7)) - 1]} ${year}`, r.paidTo, r.description, r.documentType, ...(documentDetailsExpanded ? [r.documentNumber, r.responsible] : []), amount(r.deposit), amount(r.expense), amount(r.balance), r.category, r.classification]), totals: ['Total anual', '', '', '', '', '', ...(documentDetailsExpanded ? ['', ''] : []), amount(totalDeposit), amount(totalExpense), amount(monthly[11].final), '', ''] },
      summaries: [
        { title: `Resumen mensual ${year}`, headers: ['Mes', `Saldo inicial ${symbol}`, `Abono ${symbol}`, `Gasto ${symbol}`, `Saldo final ${symbol}`], rows: monthly.map(r => [MONTHS[r.month], amount(r.initial), amount(r.deposit), amount(r.expense), amount(r.final)]), totals: [`Total ${symbol}`, amount(opening), amount(totalDeposit), amount(totalExpense), amount(monthly[11].final)] },
        { title: `Resumen por tipo de documento ${year}`, headers: ['Tipo de documento', `Abono ${symbol}`, `Gasto ${symbol}`], weights: [2, 1, 1], rows: documents.map(r => [r.documentType, amount(r.deposit), amount(r.expense)]), totals: [`Total ${symbol}`, amount(totalDeposit), amount(totalExpense)] },
      ],
      chart: { title: `Ingresos y gastos ${year} · ${symbol}`, labels: MONTHS, series: [
        { name: incomeMonth === '' ? 'Ingresos' : `Ingresos (${incomeMonth === 'none' ? 'ocultos' : MONTHS[Number(incomeMonth)]})`, values: monthly.map(r => incomeMonth === '' || Number(incomeMonth) === r.month ? convert(r.deposit) : 0) },
        { name: expenseMonth === '' ? 'Gastos' : `Gastos (${expenseMonth === 'none' ? 'ocultos' : MONTHS[Number(expenseMonth)]})`, values: monthly.map(r => expenseMonth === '' || Number(expenseMonth) === r.month ? convert(r.expense) : 0) },
      ] },
    });
    return () => { exportRef.current = null; };
  }, [exportRef, projectId, year, month, search, opening, data, incomeMonth, expenseMonth, cards, currency, exchangeRate, documentDetailsExpanded]);
  return <>
    <Modal open={editingBase} title={`Editar saldo inicial base ? ${baseYear}`} onClose={() => { if (!busy) setEditingBase(false); }}>
      <form className={styles.entry} onSubmit={async event => {
        event.preventDefault(); if (disabled || busy) return;
        setBusy(true); setError('');
        try {
          const saved = await api.put<{ balance: number }>('/accounting/cash/opening', { projectId, year: Number(baseYear), balance: baseDraft });
          onOpening(baseYear, saved.balance); setEditingBase(false);
        } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el saldo.'); }
        finally { setBusy(false); }
      }}>
        <p>Esta base corresponde al primer a?o ({baseYear}). Al cambiarla se recalculan los saldos de todos los a?os siguientes.</p>
        <label className={styles.fileLabel}>Saldo inicial base S/<input className="input" type="number" step="0.01" required value={baseDraft} disabled={disabled || busy} onChange={event => setBaseDraft(event.target.value)} /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}><button type="button" className="btn-neutral" disabled={busy} onClick={() => setEditingBase(false)}>Cancelar</button><button type="submit" className="btn-primary" disabled={disabled || busy}>{busy ? 'Guardando...' : 'Guardar base'}</button></div>
      </form>
    </Modal>
    {showClassification && <CashClassificationPanel projectId={projectId} onClose={() => setShowClassification(false)} />}
    <div className={styles.filters}><div className={styles.cashFilterHeading}><h2>Caja Chica</h2><div className={styles.cashYearFilter} role="group" aria-label="Filtro de años de Caja Chica"><span>Años</span><Select className={styles.cashYearSelect} value={year} onChange={onYear} options={availableYears.map(value => ({ value, label: value }))} /></div></div><button type="button" onClick={() => setShowClassification(true)}>Clasificación</button><label>Mes<select value={month} onChange={e => onMonth(e.target.value)}><option value="">Todos</option>{MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}</select></label><label>Buscar<input placeholder="Pagado a / responsable" value={search} onChange={e => setSearch(e.target.value)} /></label><button type="button" onClick={() => { onMonth(''); setSearch(''); }}>Limpiar</button></div>
    {documentError && <p role="alert" className={styles.error}>{documentError}</p>}
    <div className={`${styles.register} ${styles.cashRegister}`}><table><thead><tr>{['Item', 'Fecha', 'Mes', 'Pagado a', 'Descripción'].map(h => <th key={h}>{h}</th>)}<th className={styles.documentTypeColumn}><button type="button" aria-expanded={documentDetailsExpanded} onClick={() => setDocumentDetailsExpanded(value => !value)} title={`${documentDetailsExpanded ? 'Ocultar' : 'Mostrar'} número de documento y responsable`}>Tipo doc. {documentDetailsExpanded ? '−' : '+'}</button></th>{documentDetailsExpanded && <><th>N.º Documento</th><th>Responsable</th></>}{[`Abono ${symbol}`, `Gasto ${symbol}`, `Saldo ${symbol}`, 'Categoría', 'Clasificación', 'Acciones'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {visibleMovements.map(row => <tr key={row.id}><td>{row.item}</td><td>{row.date.split('-').reverse().join('/')}</td><td>{MONTHS[Number(row.date.slice(5, 7)) - 1]} {year}</td><td>{row.paidTo}</td><td>{row.description}</td><td className={styles.documentTypeColumn}><select className={styles.documentTypeSelect} aria-label={`Tipo de documento del movimiento ${row.item}`} title={row.documentType} value={row.documentType} disabled={disabled || documentSaving !== null} onChange={async e => {
        const documentType = e.target.value;
        if (disabled || documentSaving !== null || documentType === row.documentType) return;
        setDocumentSaving(row.id); setDocumentError('');
        try { const saved = await api.patch<CashMovement>(`/accounting/cash/${row.id}`, { projectId, row: { ...row, documentType } }); onSaved(saved); }
        catch (err) { setDocumentError(err instanceof Error ? err.message : 'No se pudo guardar el tipo de documento.'); }
        finally { setDocumentSaving(null); }
      }}>{!CASH_DOCUMENT_TYPES.some(value => value === row.documentType) && <option value={row.documentType}>{row.documentType}</option>}{CASH_DOCUMENT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></td>{documentDetailsExpanded && <><td>{row.documentNumber || '—'}</td><td>{row.responsible}</td></>}<td>{amount(row.deposit)}</td><td>{amount(row.expense)}</td><td className={styles.balance}>{amount(row.balance)}</td><td>{row.category || '—'}</td><td>{row.classification || '—'}</td><td><RecordActions attachment={{ type: 'cash', id: row.id, projectId, hasFiles: 'attachments' in row && Array.isArray(row.attachments) && row.attachments.length > 0 }} disabled={disabled} label={`movimiento ${row.item}`} onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} /></td></tr>)}
      {!filtered.length && <tr><td colSpan={documentDetailsExpanded ? 14 : 12} className={styles.empty}>Sin movimientos para estos filtros.</td></tr>}
    </tbody><tfoot><tr><td colSpan={documentDetailsExpanded ? 8 : 6}>Total acumulado del año</td><td>{amount(totalDeposit)}</td><td>{amount(totalExpense)}</td><td>{amount(monthly[11].final)}</td><td colSpan={3} /></tr></tfoot></table></div>
    <PaginationBar page={currentPage} totalPages={totalPages} total={filtered.length} limit={10} setPage={setPage} label="movimientos" compact />
    <div className={styles.cashSummary}>
      <section><div className={styles.cashSummaryHeader}><h2>RESUMEN · {year}</h2><form className={styles.openingForm} onSubmit={async e => {
        e.preventDefault(); if (disabled || busy) return;
        if (carried) { setBaseDraft(String(data.openings[baseYear] || 0)); setError(''); setEditingBase(true); return; }
        setBusy(true); setError('');
        const savedYear = year;
        try { const saved = await api.put<{ balance: number }>('/accounting/cash/opening', { projectId, year: Number(savedYear), balance: openingInput }); onOpening(savedYear, saved.balance); }
        catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el saldo.'); }
        finally { setBusy(false); }
      }}><label>Saldo inicial S/<input type="number" step="0.01" required readOnly={carried} value={openingInput} disabled={disabled || busy} onChange={e => setOpeningInput(e.target.value)} /></label><button type="submit" disabled={disabled || busy || (!carried && Number(openingInput) === opening)} className="btn-neutral">{busy ? 'Guardando…' : carried ? 'Editar base' : 'Guardar saldo'}</button><button type="button" className="btn-neutral" aria-expanded={showDocuments} aria-controls="cash-document-summary" onClick={() => setShowDocuments(value => !value)}>{showDocuments ? 'Ocultar tipos de documento' : 'Tipos de documento'}</button></form>
        {carried && <p className={styles.hint}>Saldo inicial calculado con el cierre anterior. Base manual: {baseYear}.</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        </div><table><thead><tr>{['Mes', `Saldo inicial ${symbol}`, `Abono ${symbol}`, `Gastos ${symbol}`, `Saldo final ${symbol}`].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{monthly.map(row => <tr key={row.month}><td>{MONTHS[row.month]}</td><td>{amount(row.initial)}</td><td>{amount(row.deposit)}</td><td>{amount(row.expense)}</td><td>{amount(row.final)}</td></tr>)}</tbody><tfoot><tr><td>Totales {symbol}</td><td>{amount(opening)}</td><td>{amount(totalDeposit)}</td><td>{amount(totalExpense)}</td><td>{amount(monthly[11].final)}</td></tr></tfoot></table>
      </section>
      {!showDocuments && <CashChart year={year} monthly={monthly} incomeMonth={incomeMonth} expenseMonth={expenseMonth} setIncomeMonth={setIncomeMonth} setExpenseMonth={setExpenseMonth} />}
      {showDocuments && <section className={styles.cashDocumentSummary} id="cash-document-summary"><div className={styles.cashSummaryHeader}><h2>Resumen por tipo de documento · {year}</h2></div><table><thead><tr><th>Tipo de Documento</th><th>Abono {symbol}</th><th>Gasto {symbol}</th></tr></thead><tbody>{documents.map(row => <tr key={row.documentType}><td className={styles.documentTypeColumn} title={row.documentType}>{row.documentType}</td><td>{amount(row.deposit)}</td><td>{amount(row.expense)}</td></tr>)}</tbody><tfoot><tr><td>Total {symbol}</td><td>{amount(totalDeposit)}</td><td>{amount(totalExpense)}</td></tr></tfoot></table></section>}
    </div>
  </>;
}
