'use client';

import { MutableRefObject, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cashByDocument, cashLedger, cashMonthly, CashData, CashMovement } from '@/lib/accounting-cash';
import { RecordActions } from './RecordActions';
import { PaginationBar } from '@/components/ui/PaginationBar';
import CashChart from './CashChart';
import CashClassificationPanel from './CashClassificationPanel';
import { downloadAccountingPdf } from '@/lib/accounting-pdf';
import styles from './accounting.module.css';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const amount = (value: number) => value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashView({ projectId, data, year, onYear, month, onMonth, disabled, onOpening, onEdit, onDelete, exportRef, cards }: { projectId: number; data: CashData; year: string; onYear: (value: string) => void; month: string; onMonth: (value: string) => void; disabled: boolean; onOpening: (year: string, balance: number) => void; onEdit: (row: CashMovement) => void; onDelete: (row: CashMovement) => void; exportRef: MutableRefObject<(() => Promise<void>) | null>; cards: string[][] }) {
  const [search, setSearch] = useState('');
  const [openingInput, setOpeningInput] = useState(String(data.openings[year] || 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showClassification, setShowClassification] = useState(false);
  const [incomeMonth, setIncomeMonth] = useState('');
  const [expenseMonth, setExpenseMonth] = useState('');
  useEffect(() => { setPage(1); }, [projectId, year, month, search]);
  useEffect(() => { setOpeningInput(String(data.openings[year] || 0)); setError(''); }, [data.openings, year]);
  const opening = data.openings[year] || 0;
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
    exportRef.current = () => downloadAccountingPdf({
      title: 'Caja Chica', projectId, cards,
      period: `Año ${year} | ${month ? MONTHS[Number(month) - 1] : 'Todos los meses'}${search ? ` | Buscar: ${search}` : ''}`,
      summaryPeriod: `Resumen anual ${year} | Moneda: soles | Saldo inicial S/ ${amount(opening)}`,
      register: { title: 'Movimientos de Caja Chica', headers: ['Item', 'Fecha', 'Pagado a', 'Descripción', 'Tipo documento', 'N.º documento', 'Responsable', 'Abono S/', 'Gasto S/', 'Saldo S/', 'Categoría', 'Clasificación'], weights: [.5, 1, 1.3, 2, 1.2, 1, 1.2, .9, .9, .9, 1, 1], rows: filtered.map(r => [String(r.item), r.date.split('-').reverse().join('/'), r.paidTo, r.description, r.documentType, r.documentNumber, r.responsible, amount(r.deposit), amount(r.expense), amount(r.balance), r.category, r.classification]), totals: ['Total anual', '', '', '', '', '', '', amount(totalDeposit), amount(totalExpense), amount(monthly[11].final), '', ''] },
      summaries: [
        { title: `Resumen mensual ${year}`, headers: ['Mes', 'Saldo inicial S/', 'Abono S/', 'Gasto S/', 'Saldo final S/'], rows: monthly.map(r => [MONTHS[r.month], amount(r.initial), amount(r.deposit), amount(r.expense), amount(r.final)]), totals: ['Total S/', amount(opening), amount(totalDeposit), amount(totalExpense), amount(monthly[11].final)] },
        { title: `Resumen por tipo de documento ${year}`, headers: ['Tipo de documento', 'Abono S/', 'Gasto S/'], weights: [2, 1, 1], rows: documents.map(r => [r.documentType, amount(r.deposit), amount(r.expense)]), totals: ['Total S/', amount(totalDeposit), amount(totalExpense)] },
      ],
      chart: { title: `Ingresos y gastos ${year} · S/`, labels: MONTHS, series: [
        { name: incomeMonth === '' ? 'Ingresos' : `Ingresos (${incomeMonth === 'none' ? 'ocultos' : MONTHS[Number(incomeMonth)]})`, values: monthly.map(r => incomeMonth === '' || Number(incomeMonth) === r.month ? r.deposit : 0) },
        { name: expenseMonth === '' ? 'Gastos' : `Gastos (${expenseMonth === 'none' ? 'ocultos' : MONTHS[Number(expenseMonth)]})`, values: monthly.map(r => expenseMonth === '' || Number(expenseMonth) === r.month ? r.expense : 0) },
      ] },
    });
    return () => { exportRef.current = null; };
  }, [exportRef, projectId, year, month, search, opening, data, incomeMonth, expenseMonth, cards]);
  return <>
    {showClassification && <CashClassificationPanel projectId={projectId} onClose={() => setShowClassification(false)} />}
    <div className={styles.filters}><h2>Caja Chica</h2><button type="button" onClick={() => setShowClassification(true)}>Clasificación</button><label>Año<input type="number" min="2000" max="2100" value={year} onChange={e => onYear(e.target.value)} /></label><label>Mes<select value={month} onChange={e => onMonth(e.target.value)}><option value="">Todos</option>{MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}</select></label><label>Buscar<input placeholder="Pagado a / responsable" value={search} onChange={e => setSearch(e.target.value)} /></label><button type="button" onClick={() => { onMonth(''); setSearch(''); }}>Limpiar</button></div>
    <div className={`${styles.register} ${styles.cashRegister}`}><table><thead><tr>{['Item', 'Fecha', 'Mes', 'Pagado a', 'Descripción', 'Tipo Documento', 'N.º Documento', 'Responsable', 'Abono S/', 'Gasto S/', 'Saldo S/', 'Categoría', 'Clasificación', 'Acciones'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {visibleMovements.map(row => <tr key={row.id}><td>{row.item}</td><td>{row.date.split('-').reverse().join('/')}</td><td>{MONTHS[Number(row.date.slice(5, 7)) - 1]} {year}</td><td>{row.paidTo}</td><td>{row.description}</td><td>{row.documentType}</td><td>{row.documentNumber || '—'}</td><td>{row.responsible}</td><td>{amount(row.deposit)}</td><td>{amount(row.expense)}</td><td className={styles.balance}>{amount(row.balance)}</td><td>{row.category || '—'}</td><td>{row.classification || '—'}</td><td><RecordActions disabled={disabled} label={`movimiento ${row.item}`} onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} /></td></tr>)}
      {!filtered.length && <tr><td colSpan={14} className={styles.empty}>Sin movimientos para estos filtros.</td></tr>}
    </tbody><tfoot><tr><td colSpan={8}>Total acumulado del año</td><td>{amount(totalDeposit)}</td><td>{amount(totalExpense)}</td><td>{amount(monthly[11].final)}</td><td colSpan={3} /></tr></tfoot></table></div>
    <PaginationBar page={currentPage} totalPages={totalPages} total={filtered.length} limit={10} setPage={setPage} label="movimientos" compact />
    <div className={styles.cashSummary}>
      <section><div className={styles.cashSummaryHeader}><h2>RESUMEN · {year}</h2><form className={styles.openingForm} onSubmit={async e => {
        e.preventDefault(); if (disabled || busy) return;
        setBusy(true); setError('');
        const savedYear = year;
        try { const saved = await api.put<{ balance: number }>('/accounting/cash/opening', { projectId, year: Number(savedYear), balance: openingInput }); onOpening(savedYear, saved.balance); }
        catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el saldo.'); }
        finally { setBusy(false); }
      }}><label>Saldo inicial S/<input type="number" step="0.01" required value={openingInput} disabled={disabled || busy} onChange={e => setOpeningInput(e.target.value)} /></label><button type="submit" disabled={disabled || busy || Number(openingInput) === opening} className="btn-neutral">{busy ? 'Guardando…' : 'Guardar saldo'}</button><button type="button" className="btn-neutral" aria-expanded={showDocuments} aria-controls="cash-document-summary" onClick={() => setShowDocuments(value => !value)}>{showDocuments ? 'Ocultar tipos de documento' : 'Tipos de documento'}</button></form>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        </div><table><thead><tr>{['Mes', 'Saldo inicial S/', 'Abono S/', 'Gastos S/', 'Saldo final S/'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{monthly.map(row => <tr key={row.month}><td>{MONTHS[row.month]}</td><td>{amount(row.initial)}</td><td>{amount(row.deposit)}</td><td>{amount(row.expense)}</td><td>{amount(row.final)}</td></tr>)}</tbody><tfoot><tr><td>Totales S/</td><td>{amount(opening)}</td><td>{amount(totalDeposit)}</td><td>{amount(totalExpense)}</td><td>{amount(monthly[11].final)}</td></tr></tfoot></table>
      </section>
      {!showDocuments && <CashChart year={year} monthly={monthly} incomeMonth={incomeMonth} expenseMonth={expenseMonth} setIncomeMonth={setIncomeMonth} setExpenseMonth={setExpenseMonth} />}
      {showDocuments && <section className={styles.cashDocumentSummary} id="cash-document-summary"><div className={styles.cashSummaryHeader}><h2>Resumen por tipo de documento · {year}</h2></div><table><thead><tr><th>Tipo de Documento</th><th>Abono S/</th><th>Gasto S/</th></tr></thead><tbody>{documents.map(row => <tr key={row.documentType}><td>{row.documentType}</td><td>{amount(row.deposit)}</td><td>{amount(row.expense)}</td></tr>)}</tbody><tfoot><tr><td>Total S/</td><td>{amount(totalDeposit)}</td><td>{amount(totalExpense)}</td></tr></tfoot></table></section>}
    </div>
  </>;
}
