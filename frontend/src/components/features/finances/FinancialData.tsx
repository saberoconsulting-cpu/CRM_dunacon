'use client';

import { useEffect, useState } from 'react';
import { Modal, toast } from '@/components/ui/ui';
import { api } from '@/lib/api';
import { useDisplayCurrency } from '@/lib/currency';
import ExchangeRateField from './ExchangeRateField';
import { Select } from '@/components/ui/Select';

type FinancialAccount = {
  id: string;
  company: string;
  ruc: string;
  bank: string;
  currency: string;
  accountNumber: string;
  cci: string;
};

const columns: Array<{ key: Exclude<keyof FinancialAccount, 'id'>; label: string }> = [
  { key: 'company', label: 'Empresa' },
  { key: 'ruc', label: 'RUC' },
  { key: 'bank', label: 'Banco' },
  { key: 'currency', label: 'Moneda' },
  { key: 'accountNumber', label: 'Nro. de Cuenta Corriente' },
  { key: 'cci', label: 'Código de Cuenta Interbancario (CCI)' },
];

function newAccount(): FinancialAccount {
  return { id: crypto.randomUUID(), company: 'Dunacon Sociedad Anónima Cerrada', ruc: '20608624393', bank: '', currency: '', accountNumber: '', cci: '' };
}

export default function FinancialData({ projectId }: { projectId: number }) {
  const [rows, setRows] = useState<FinancialAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accountToDelete, setAccountToDelete] = useState<FinancialAccount | null>(null);
  const selectedAccount = rows.find(row => row.id === selectedAccountId) || rows[0];
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { exchangeRate, setExchangeRate } = useDisplayCurrency();
  const settingsKey = `finance_financial_data_${projectId}`;

  useEffect(() => {
    let alive = true;
    setLoading(true); setFailed(false); setDirty(false);
    api.get<{ value?: string }>(`/settings/value/${settingsKey}`).then(response => {
      if (!alive) return;
      const saved = response.value ? JSON.parse(response.value) : null;
      if (saved && !Array.isArray(saved.accounts)) throw new Error('Datos no válidos');
      setRows(saved ? saved.accounts : [newAccount()]);
      if (saved?.exchangeRate > 0) setExchangeRate(Number(saved.exchangeRate));
    }).catch(() => {
      if (alive) { setFailed(true); toast('No se pudieron cargar los datos financieros', 'err'); }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [settingsKey, attempt, setExchangeRate]);

  async function save() {
    if (loading || failed || saving) return;
    const invalidAccount = rows.find(account => !/^\d{13}$/.test(account.accountNumber));
    if (invalidAccount) {
      setSelectedAccountId(invalidAccount.id);
      toast('El numero de cuenta corriente debe tener exactamente 13 digitos', 'err');
      return;
    }
    const invalidCci = rows.find(account => !/^\d{20}$/.test(account.cci));
    if (invalidCci) {
      setSelectedAccountId(invalidCci.id);
      toast('El CCI debe tener exactamente 20 digitos', 'err');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/settings/value/${settingsKey}`, { value: JSON.stringify({ version: 1, exchangeRate, accounts: rows }) });
      setDirty(false);
      toast('Datos financieros guardados');
    } catch { toast('No se pudieron guardar los datos financieros. Tus cambios siguen en el cuadro.', 'err'); }
    finally { setSaving(false); }
  }

  return <>
    <div className="min-w-0">
      {loading ? <p className="p-4 text-sm text-slate-500">Cargando datos financieros…</p> : failed ?
        <button type="button" className="btn-neutral" onClick={() => setAttempt(value => value + 1)}>Reintentar carga</button> :
        <fieldset disabled={saving}>
          <div className="mb-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Select
                aria-label="Elegir cuenta"
                value={selectedAccount?.id || ''}
                onChange={setSelectedAccountId}
                options={[
                  { value: '', label: 'Elegir cuenta' },
                  ...rows.map((row, index) => ({ value: row.id, label: [row.bank || `Cuenta ${index + 1}`, row.currency === 'USD' ? 'D\u00f3lares' : row.currency === 'PEN' ? 'Soles' : row.currency].filter(Boolean).join(' - ') })),
                ]}
              />
            </div>
            <button type="button" className="btn-neutral !h-8 shrink-0 text-xs" onClick={() => {
              const account = newAccount();
              setRows(current => [...current, account]); setSelectedAccountId(account.id); setDirty(true);
            }}>Agregar dato</button>
            {selectedAccount && <button type="button" className="btn-neutral !h-8 shrink-0 !px-2 text-xs !text-red-600" title="Eliminar cuenta seleccionada" onClick={() => {
              setAccountToDelete(selectedAccount);
            }}>Eliminar</button>}
            <button type="button" className="btn-primary !h-8 shrink-0 !px-2 text-xs" onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
          <div className="overflow-hidden rounded-md border border-[#E5E7EB]">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup><col className="w-[60%]" /><col className="w-[40%]" /></colgroup>
              <tbody>
                <tr className="border-t border-[#F3E4B0] bg-[#FFF8DB]">
                  <th scope="row" className="px-2 py-1.5 text-left font-semibold text-[#1F2937]">Tipo de cambio (S/ por US$)</th>
                  <td className="px-2 py-1.5" onChange={() => setDirty(true)}><ExchangeRateField className="w-full min-w-0 rounded border border-transparent bg-white px-1 py-1.5 text-right text-xs tabular-nums outline-none transition focus:border-[#1877F2] focus:bg-[#F5F9FF]" /></td>
                </tr>
              </tbody>
              {rows.filter(row => row.id === selectedAccount?.id).map((row) => <tbody key={row.id}>
                {columns.map(column => <tr key={column.key} className="border-t border-[#F3E4B0] bg-[#FFF8DB]">
                  <th scope="row" className="break-words px-2 py-1.5 text-left font-semibold text-[#1F2937]">{column.label}</th>
                  <td className="px-2 py-1.5">
                    {column.key === 'currency' ? <Select
                      className="[&>button]:!h-auto [&>button]:!rounded [&>button]:!border-transparent [&>button]:!bg-white [&>button]:!bg-none [&>button]:!px-1 [&>button]:!py-1.5 [&>button]:!text-xs [&>button]:!shadow-none [&>button:focus]:!border-[#1877F2]"
                      value={row.currency}
                      onChange={value => {
                        setRows(current => current.map(account => account.id === row.id ? { ...account, currency: value } : account)); setDirty(true);
                      }}
                      options={[
                        { value: '', label: 'Seleccionar moneda' },
                        { value: 'PEN', label: 'Soles (PEN)' },
                        { value: 'USD', label: 'Dolares (USD)' },
                        ...(!['', 'PEN', 'USD'].includes(row.currency) ? [{ value: row.currency, label: row.currency }] : []),
                      ]}
                    /> : <input className="w-full min-w-0 rounded border border-transparent bg-white px-1 py-1.5 text-xs outline-none transition focus:border-[#1877F2] focus:bg-[#F5F9FF]" aria-label={column.label} inputMode={column.key === 'accountNumber' || column.key === 'cci' ? 'numeric' : undefined} maxLength={column.key === 'accountNumber' ? 13 : column.key === 'cci' ? 20 : undefined} value={row[column.key]} placeholder={column.key === 'bank' ? 'Ej. BCP' : ''} onChange={event => {
                      const value = column.key === 'accountNumber' || column.key === 'cci' ? event.target.value.replace(/\D/g, '').slice(0, column.key === 'cci' ? 20 : 13) : event.target.value;
                      setRows(current => current.map(account => account.id === row.id ? { ...account, [column.key]: value } : account)); setDirty(true);
                    }} />}
                  </td>
                </tr>)}
              </tbody>)}
            </table>
          </div>
          {rows.length === 0 && <p className="p-3 text-sm text-slate-500">Agrega una cuenta bancaria para registrar sus datos.</p>}

        </fieldset>}
    </div>
    <Modal open={accountToDelete !== null} onClose={() => setAccountToDelete(null)} title="Eliminar cuenta bancaria" width="max-w-sm">
      <div onKeyDown={event => { if (event.key === 'Escape') setAccountToDelete(null); }}>
        <p className="text-sm text-slate-600">Vas a quitar esta cuenta de los datos financieros:</p>
        <div className="my-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-slate-800">
          {accountToDelete?.bank || 'Cuenta bancaria'}
          {accountToDelete?.currency && <span className="ml-2 font-normal text-slate-500">{accountToDelete.currency === 'USD' ? 'D\u00f3lares' : accountToDelete.currency === 'PEN' ? 'Soles' : accountToDelete.currency}</span>}
        </div>
        <p className="text-xs leading-relaxed text-slate-500">La cuenta se quitará del cuadro. Para confirmar el cambio en la base de datos, pulsa Guardar.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-neutral" autoFocus onClick={() => setAccountToDelete(null)}>Cancelar</button>
          <button type="button" className="btn-neutral !border-red-600 !bg-red-600 !text-white hover:!bg-red-700" onClick={() => {
            if (!accountToDelete) return;
            setRows(current => current.filter(account => account.id !== accountToDelete.id));
            if (selectedAccountId === accountToDelete.id) setSelectedAccountId('');
            setDirty(true); setAccountToDelete(null);
          }}>Eliminar cuenta</button>
        </div>
      </div>
    </Modal>
  </>;
}
