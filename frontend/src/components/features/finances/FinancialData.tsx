'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { useDisplayCurrency } from '@/lib/currency';
import ExchangeRateField from './ExchangeRateField';
import { Select } from '@/components/ui/Select';

type FinancialAccount = {
  id: string;
  accountKey: string;
  name: string;
  displayName: string;
  isPrincipal: boolean;
  company: string;
  ruc: string;
  bank: string;
  currency: string;
  accountNumber: string;
  cci: string;
};

const columns: Array<{ key: Exclude<keyof FinancialAccount, 'id' | 'accountKey' | 'name' | 'displayName' | 'isPrincipal'>; label: string }> = [
  { key: 'company', label: 'Empresa' },
  { key: 'ruc', label: 'RUC' },
  { key: 'bank', label: 'Banco' },
  { key: 'currency', label: 'Moneda' },
  { key: 'accountNumber', label: 'Nro. Cta Corriente.' },
  { key: 'cci', label: 'Código Cta. Interb. (CCI)' },
];

function formatBankNumber(value: string, field: 'accountNumber' | 'cci'): string {
  const digits = value.replace(/[\s-]/g, '');
  if (field === 'cci' || digits.length > 13) return digits.match(/.{1,4}/g)?.join('-') || '';
  const groups = [4, 4, 5];
  let offset = 0;
  return groups.map(size => { const group = digits.slice(offset, offset + size); offset += size; return group; }).filter(Boolean).join('-');
}

export default function FinancialData({ projectId, toolbarContainer, active }: { projectId: number; toolbarContainer: HTMLDivElement | null; active: boolean }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<FinancialAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [dirtyAccounts, setDirtyAccounts] = useState<string[]>([]);
  const selectedAccount = rows.find(row => row.id === selectedAccountId) || rows[0];
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { exchangeRate, setExchangeRate } = useDisplayCurrency();
  const settingsKey = `/settings/financial-data/${projectId}`;

  useEffect(() => {
    let alive = true;
    setLoading(true); setFailed(false); setDirty(false); setDirtyAccounts([]);
    api.get<{ accounts: FinancialAccount[]; exchangeRate?: number; labels?: Record<string, string> }>(settingsKey).then(saved => {
      if (!alive) return;
      setLabels(saved.labels || {});
      setRows(saved.accounts.map(account => ({ ...account, accountNumber: /^\d{13,20}$/.test(account.accountNumber.replace(/[\s-]/g, '')) ? formatBankNumber(account.accountNumber, 'accountNumber') : account.accountNumber, cci: /^\d{20}$/.test(account.cci.replace(/[\s-]/g, '')) ? formatBankNumber(account.cci, 'cci') : account.cci })));
      if (saved.exchangeRate && saved.exchangeRate > 0) setExchangeRate(Number(saved.exchangeRate));
    }).catch(() => {
      if (alive) { setFailed(true); toast('No se pudieron cargar los datos financieros', 'err'); }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [settingsKey, attempt, setExchangeRate]);

  async function save() {
    if (loading || failed || saving || !dirty) return;
    const targets = dirtyAccounts.length ? rows.filter(account => dirtyAccounts.includes(account.id)) : selectedAccount ? [selectedAccount] : [];
    if (!targets.length) return;
    const normalizedRows = targets.map(account => ({ ...account, accountNumber: account.accountNumber.replace(/[\s-]/g, ''), cci: account.cci.replace(/[\s-]/g, '') }));
    const invalidAccount = normalizedRows.find(account => !/^\d{13,20}$/.test(account.accountNumber));
    if (invalidAccount) {
      setSelectedAccountId(invalidAccount.id);
      toast('El numero de cuenta corriente debe tener entre 13 y 20 digitos', 'err');
      return;
    }
    const invalidCci = normalizedRows.find(account => !/^\d{20}$/.test(account.cci));
    if (invalidCci) {
      setSelectedAccountId(invalidCci.id);
      toast('El CCI debe tener exactamente 20 digitos', 'err');
      return;
    }
    setSaving(true);
    try {
      for (const account of targets) {
        await api.put(settingsKey, { accountKey: account.accountKey, company: account.company, ruc: account.ruc, bank: account.bank, currency: account.currency, accountNumber: account.accountNumber.trim(), cci: account.cci.trim(), exchangeRate, labels });
      }
      setDirtyAccounts([]);
      setDirty(false);
      toast('Datos financieros guardados');
    } catch { toast('No se pudieron guardar los datos financieros. Tus cambios siguen en el cuadro.', 'err'); }
    finally { setSaving(false); }
  }

  return <>
    {toolbarContainer && active && createPortal((
          <div className="flex w-full min-w-0 items-center gap-1 sm:gap-2">
            <div className="min-w-0 flex-1">
              <Select
                disabled={saving || loading || failed}
                className="min-w-0 [&>button]:!h-8 [&>button]:!min-w-0 [&>button]:!gap-1 [&>button]:!rounded-md [&>button]:!px-1.5 [&>button]:!text-[10px] sm:[&>button]:!px-3 sm:[&>button]:!text-xs [&>button>span]:min-w-0 [&>button>span]:truncate"
                aria-label="Elegir cuenta"
                value={selectedAccount?.id || ''}
                onChange={setSelectedAccountId}
                options={[
                  { value: '', label: 'Elegir cuenta' },
                  ...rows.map(row => ({ value: row.id, label: row.displayName })),
                ]}
              />
            </div>
            {dirty && (
            <button type="button" className="btn-primary !h-8 shrink-0 !px-1.5 !text-[10px] sm:!px-2 sm:!text-xs" disabled={saving || loading || failed || !selectedAccount || !dirty} onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</button>
            )}
          </div>
    ), toolbarContainer)}
    <div className="min-w-0">
      {loading ? <p className="p-4 text-sm text-slate-500">Cargando datos financieros…</p> : failed ?
        <button type="button" className="btn-neutral" onClick={() => setAttempt(value => value + 1)}>Reintentar carga</button> :
        <fieldset className="min-w-0" disabled={saving}>
          <div className="overflow-hidden rounded-md border border-[#E5E7EB]">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup><col className="w-[8%] sm:w-[30px] lg:w-[38px]" /><col className="w-[38%] sm:w-auto" /><col className="w-[54%] sm:w-[60%]" /></colgroup>
              <tbody>
                <tr className="border-t border-[#F3E4B0] bg-[#FFF8DB]">
                  <td className="sm:w-[30px] lg:w-[38px] px-0.5 sm:px-1 lg:px-1.5 py-2 text-center text-[10px] font-bold text-[#8A6A00]">F.1</td>
                  <th scope="row" className="px-0.5 sm:px-1 lg:px-2 py-1.5 text-left font-semibold text-[#1F2937]"><div className="flex h-7 min-w-0 items-center px-0.5 text-[11px] leading-tight sm:h-7 sm:px-1 sm:text-sm"><input className="h-7 w-full min-w-0 border-0 bg-transparent p-0 font-semibold outline-none focus:bg-white/60" aria-label="Nombre de F.1" maxLength={120} value={labels.exchangeRate ?? 'Tipo Cambio US$/S'} onChange={event => { setLabels(current => ({ ...current, exchangeRate: event.target.value })); setDirty(true); }} /></div></th>
                  <td className="sm:w-[60%] pl-1 pr-1 sm:pr-2 py-1.5 text-right whitespace-nowrap lg:text-sm" onChange={() => setDirty(true)}><ExchangeRateField className="h-7 w-full min-w-0 rounded-md border border-transparent bg-white px-1 text-right text-xs lg:text-sm tabular-nums outline-none transition focus:border-[#1877F2] focus:bg-[#F5F9FF]" /></td>
                </tr>
              </tbody>
              {rows.filter(row => row.id === selectedAccount?.id).map((row) => <tbody key={row.id}>
                {columns.map((column, index) => <tr key={column.key} className="border-t border-[#F3E4B0] bg-[#FFF8DB]">
                  <td className="sm:w-[30px] lg:w-[38px] px-0.5 sm:px-1 lg:px-1.5 py-2 text-center text-[10px] font-bold text-[#8A6A00]">F.{index + 2}</td>
                  <th scope="row" className="px-0.5 sm:px-1 lg:px-2 py-1.5 text-left font-semibold text-[#1F2937]"><div className="flex h-7 min-w-0 items-center px-0.5 text-[11px] sm:px-1 sm:text-sm"><input className="h-7 w-full min-w-0 border-0 bg-transparent p-0 font-semibold leading-tight outline-none focus:bg-white/60" aria-label={`Nombre de F.${index + 2}`} maxLength={120} value={labels[column.key] ?? column.label} onChange={event => { setLabels(current => ({ ...current, [column.key]: event.target.value })); setDirty(true); }} /></div></th>
                  <td className="sm:w-[60%] pl-1 pr-1 sm:pr-2 py-1.5 text-right whitespace-nowrap lg:text-sm">
                    {column.key === 'currency' ? <Select
                      className="[&>button]:!h-7 [&>button]:!rounded-md [&>button]:!border-transparent [&>button]:!bg-white [&>button]:!bg-none [&>button]:!px-1 [&>button]:!py-0 [&>button]:!text-xs lg:[&>button]:!text-sm [&>button]:!shadow-none [&>button:focus]:!border-[#1877F2]"
                      value={row.currency}
                      onChange={value => {
                        setRows(current => current.map(account => account.id === row.id ? { ...account, currency: value } : account)); setDirtyAccounts(current => [...new Set([...current, row.id])]); setDirty(true);
                      }}
                      options={[
                        { value: '', label: 'Seleccionar moneda' },
                        { value: 'PEN', label: 'Soles (PEN)' },
                        { value: 'USD', label: 'Dolares (USD)' },
                        ...(!['', 'PEN', 'USD'].includes(row.currency) ? [{ value: row.currency, label: row.currency }] : []),
                      ]}
                    /> : <input className={`h-7 w-full min-w-0 rounded-md border border-transparent bg-white px-1 text-xs lg:text-sm outline-none transition focus:border-[#1877F2] focus:bg-[#F5F9FF] ${column.key === 'accountNumber' || column.key === 'cci' ? 'tabular-nums tracking-tight max-sm:text-[12px]' : ''}`} aria-label={column.label} inputMode={column.key === 'accountNumber' || column.key === 'cci' ? 'numeric' : undefined} type="text" value={row[column.key]} onBlur={() => {
                      if (column.key !== 'accountNumber' && column.key !== 'cci') return;
                      const field = column.key;
                      setRows(current => current.map(account => account.id === row.id ? { ...account, [field]: formatBankNumber(account[field], field) } : account));
                    }} placeholder={column.key === 'bank' ? 'Ej. BCP' : ''} onChange={event => {
                      const isBankNumber = column.key === 'accountNumber' || column.key === 'cci';
                      let value = isBankNumber ? event.target.value.replace(/[^\d\s-]/g, '') : event.target.value;
                      if (isBankNumber && value.replace(/\D/g, '').length > 20) return;
                      if (column.key === 'accountNumber') {
                        const input = event.currentTarget;
                        let beforeCursor = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
                        let digits = value.replace(/\D/g, '');
                        const inputType = (event.nativeEvent as InputEvent).inputType;
                        if (digits.length === row.accountNumber.replace(/\D/g, '').length && value.length < row.accountNumber.length) {
                          if (inputType === 'deleteContentBackward' && beforeCursor > 0) {
                            digits = digits.slice(0, beforeCursor - 1) + digits.slice(beforeCursor); beforeCursor--;
                          } else if (inputType === 'deleteContentForward') digits = digits.slice(0, beforeCursor) + digits.slice(beforeCursor + 1);
                        }
                        value = formatBankNumber(digits, 'accountNumber');
                        const formatted = value;
                        requestAnimationFrame(() => {
                          let position = 0; let count = 0;
                          while (position < formatted.length && count < beforeCursor) { if (/\d/.test(formatted[position])) count++; position++; }
                          if (document.activeElement === input) input.setSelectionRange(position, position);
                        });
                      }
                      setRows(current => current.map(account => account.id === row.id ? { ...account, [column.key]: value } : account)); setDirtyAccounts(current => [...new Set([...current, row.id])]); setDirty(true);
                    }} />}
                  </td>
                </tr>)}
              </tbody>)}
            </table>
          </div>
          {rows.length === 0 && <p className="p-3 text-sm text-slate-500">Crea las cuentas en Cuentas y bancos para completar aqui sus datos financieros.</p>}

        </fieldset>}
    </div>

  </>;
}
