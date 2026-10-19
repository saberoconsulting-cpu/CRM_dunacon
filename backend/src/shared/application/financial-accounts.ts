import { BadRequestException } from '@nestjs/common';
import { BankAccountEntity } from '../infrastructure/entities/bank-account.entity';

export type FinancialDetails = { company: string; ruc: string; bank: string; currency: string; accountNumber: string; cci: string };
export type LinkedFinancialAccount = FinancialDetails & { id: string; accountKey: string; name: string; displayName: string; isPrincipal: boolean };
export type FinancialStore = { version?: number; exchangeRate?: number; labels?: Record<string, string>; accounts: Array<Partial<FinancialDetails> & { id?: string; accountKey?: string }> };

export function parseFinancialStore(value?: string | null): FinancialStore {
  if (!value) return { accounts: [] };
  try {
    const saved = JSON.parse(value);
    if (!saved || !Array.isArray(saved.accounts)) throw new Error();
    return saved;
  } catch { throw new BadRequestException('No se pueden leer los datos financieros guardados del proyecto.'); }
}

/** Names and identities always come from Cuentas y bancos; manual details are keyed to that identity. */
export function linkFinancialAccounts(masters: BankAccountEntity[], store: FinancialStore, defaults: { company?: string; ruc?: string } = {}): LinkedFinancialAccount[] {
  const normalize = (value?: string | null) => String(value || '').trim().toUpperCase();
  const digits = (value?: string | null) => String(value || '').replace(/[\s-]/g, '');
  return masters.filter(master => master.isActive).map(master => {
    let details = store.accounts.find(item => item.accountKey === master.accountKey || item.id === master.accountKey);
    if (!details) {
      // Keep existing manual data only when the legacy account can be matched unambiguously.
      const legacy = store.accounts.filter(item => !item.accountKey && normalize(item.bank) === normalize(master.bank) && normalize(item.currency) === normalize(master.currency));
      const matchingMasters = masters.filter(item => item.isActive && normalize(item.bank) === normalize(master.bank) && normalize(item.currency) === normalize(master.currency));
      const byNumber = master.accountNumber ? legacy.filter(item => digits(item.accountNumber) === digits(master.accountNumber)) : [];
      if (byNumber.length === 1) details = byNumber[0];
      else if (legacy.length === 1 && matchingMasters.length === 1) details = legacy[0];
    }
    return {
      id: master.accountKey, accountKey: master.accountKey, name: master.name,
      displayName: `${master.bank ? `${master.bank} - ` : ''}${master.name}`,
      isPrincipal: master.accountKey === 'GENERAL',
      company: details?.company ?? defaults.company ?? 'Dunacon Sociedad An\u00f3nima Cerrada',
      ruc: details?.ruc ?? defaults.ruc ?? '20608624393',
      bank: details?.bank ?? master.bank ?? '', currency: details?.currency ?? master.currency,
      accountNumber: details?.accountNumber ?? master.accountNumber ?? '', cci: details?.cci ?? '',
    };
  });
}
