import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettingEntity } from '../../../shared/infrastructure/entities/app-setting.entity';

export interface AppSettingsDto {
  companyName: string;
  color: string;
  alertCuotas: string;
  approvalNotify: string;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettingEntity)
    private readonly repo: Repository<AppSettingEntity>,
  ) {}

  private async getRaw(): Promise<Record<string, string>> {
    const all = await this.repo.find();
    const out: Record<string, string> = {};
    all.forEach((s) => { out[s.key] = s.value != null ? s.value : ''; });
    return out;
  }

  async get(): Promise<AppSettingsDto> {
    const r = await this.getRaw();
    return {
      companyName: r.company_name || '',
      color: r.color || '#1877F2',
      alertCuotas: r.alert_cuotas != null ? r.alert_cuotas : '1',
      approvalNotify: r.approval_notify != null ? r.approval_notify : '1',
    };
  }

  async set(partial: Partial<AppSettingsDto>) {
    const entries = {
      company_name: partial.companyName,
      color: partial.color,
      alert_cuotas: partial.alertCuotas,
      approval_notify: partial.approvalNotify,
    };
    for (const [k, v] of Object.entries(entries)) {
      if (v === undefined) continue;
      const exists = await this.repo.findOne({ where: { key: k } });
      if (exists) { exists.value = v; await this.repo.save(exists); }
      else { await this.repo.save(this.repo.create({ key: k, value: v })); }
    }
    return this.get();
  }
}
