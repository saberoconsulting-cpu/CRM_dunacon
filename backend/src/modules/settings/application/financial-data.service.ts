import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AppSettingEntity } from '../../../shared/infrastructure/entities/app-setting.entity';
import { BankAccountEntity } from '../../../shared/infrastructure/entities/bank-account.entity';
import { linkFinancialAccounts, parseFinancialStore } from '../../../shared/application/financial-accounts';
import { SaveFinancialAccountDto } from './dto/financial-account.dto';

@Injectable()
export class FinancialDataService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async get(projectId: number, manager: EntityManager = this.ds.manager) {
    const key = `finance_financial_data_${projectId}`;
    const repo = manager.getRepository(AppSettingEntity);
    const [masters, setting, company, ruc] = await Promise.all([
      manager.getRepository(BankAccountEntity).find({ where: { projectId, isActive: true }, order: { id: 'ASC' } }),
      repo.findOne({ where: { key } }), repo.findOne({ where: { key: 'company_name' } }), repo.findOne({ where: { key: 'company_ruc' } }),
    ]);
    const store = parseFinancialStore(setting?.value);
    return { exchangeRate: store.exchangeRate, labels: store.labels || {}, accounts: linkFinancialAccounts(masters, store, { company: company?.value || undefined, ruc: ruc?.value || undefined }) };
  }

  async save(projectId: number, dto: SaveFinancialAccountDto) {
    const allowedLabels = ['exchangeRate', 'company', 'ruc', 'bank', 'currency', 'accountNumber', 'cci'];
    if (dto.labels && Object.entries(dto.labels).some(([key, value]) => !allowedLabels.includes(key) || typeof value !== 'string' || !value.trim() || value.length > 120)) throw new BadRequestException('Los nombres deben tener entre 1 y 120 caracteres.');
    return this.ds.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(624158, $1::integer)', [projectId]);
      const current = await this.get(projectId, manager);
      const account = current.accounts.find(item => item.accountKey === dto.accountKey);
      if (!account) throw new BadRequestException('La cuenta ya no existe en Cuentas y bancos de este proyecto.');
      const key = `finance_financial_data_${projectId}`;
      const repo = manager.getRepository(AppSettingEntity);
      const existing = await repo.findOne({ where: { key } });
      const store = parseFinancialStore(existing?.value);
      const details = { ...account, company: dto.company.trim(), ruc: dto.ruc.trim(), bank: dto.bank.trim(), currency: dto.currency, accountNumber: dto.accountNumber.trim(), cci: dto.cci.trim() };
      // Preserve other accounts and legacy records; a save updates this account only.
      store.accounts = [...store.accounts.filter(item => item.accountKey !== dto.accountKey && item.id !== dto.accountKey), details];
      store.version = 2; store.exchangeRate = dto.exchangeRate;
      if (dto.labels !== undefined) store.labels = Object.fromEntries(Object.entries(dto.labels).map(([key, value]) => [key, value.trim()]));
      await repo.save(repo.create({ ...existing, key, value: JSON.stringify(store) }));
      return this.get(projectId, manager);
    });
  }
}
