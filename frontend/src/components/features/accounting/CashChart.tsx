'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { cashMonthly } from '@/lib/accounting-cash';
import styles from './accounting.module.css';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const amount = (value: number) => value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashChart({ year, monthly, incomeMonth, expenseMonth, setIncomeMonth, setExpenseMonth }: { year: string; monthly: ReturnType<typeof cashMonthly>; incomeMonth: string; expenseMonth: string; setIncomeMonth: (value: string) => void; setExpenseMonth: (value: string) => void }) {
  const rows = monthly.map(row => ({
    name: MONTHS[row.month],
    income: incomeMonth === '' || Number(incomeMonth) === row.month ? row.deposit : null,
    expense: expenseMonth === '' || Number(expenseMonth) === row.month ? row.expense : null,
  }));
  const income = rows.reduce((n, r) => n + (r.income || 0), 0);
  const expense = rows.reduce((n, r) => n + (r.expense || 0), 0);
  return <section className={styles.cashChart} aria-label={`Ingresos y gastos de Caja Chica de ${year}`}>
    <div className={styles.cashSummaryHeader}><h2>Ingresos y gastos · {year}</h2><div className={styles.chartFilters}>
      <label>Ingresos<select value={incomeMonth} onChange={e => setIncomeMonth(e.target.value)}><option value="">Todos los meses</option><option value="none">Ocultar ingresos</option>{MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
      <label>Gastos<select value={expenseMonth} onChange={e => setExpenseMonth(e.target.value)}><option value="">Todos los meses</option><option value="none">Ocultar gastos</option>{MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
    </div></div>
    <div className={styles.cashChartPanel}>
      <div className={styles.chartAmounts}><span>Ingresos <strong>S/ {amount(income)}</strong></span><span>Gastos <strong>S/ {amount(expense)}</strong></span></div>
      <ResponsiveContainer width="100%" height={270}><BarChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tickFormatter={value => value.slice(0, 3)} interval={0} tick={{ fontSize: 10 }} /><YAxis width={60} tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => `S/ ${amount(value)}`} /><Legend /><Bar dataKey="income" name="Ingresos" fill="#1877f2" radius={[3, 3, 0, 0]} /><Bar dataKey="expense" name="Gastos" fill="#ed9b40" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
    </div>
  </section>;
}
