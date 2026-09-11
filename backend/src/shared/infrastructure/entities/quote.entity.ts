// shared/infrastructure/entities/quote.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('quotes')
export class QuoteEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'lot_id' })
  lotId: number;

  @Column({ name: 'client_name', length: 200 })
  clientName: string;

  @Column({ name: 'client_email', length: 255, nullable: true })
  clientEmail?: string;

  @Column({ name: 'client_phone', length: 50, nullable: true })
  clientPhone?: string;

  @Column({ name: 'price_per_m2_usd', type: 'numeric', precision: 12, scale: 2, default: 0 })
  pricePerM2Usd: string;

  @Column({ name: 'lot_price_usd', type: 'numeric', precision: 14, scale: 2, default: 0 })
  lotPriceUsd: string;

  @Column({ name: 'bono_descuento_usd', type: 'numeric', precision: 14, scale: 2, default: 0 })
  bonoDescuentoUsd: string;

  @Column({ name: 'bono_especial_usd', type: 'numeric', precision: 14, scale: 2, default: 0 })
  bonoEspecialUsd: string;

  @Column({ name: 'final_price_usd', type: 'numeric', precision: 14, scale: 2, default: 0 })
  finalPriceUsd: string;

  @Column({ name: 'payment_method', length: 20, default: 'contado' })
  paymentMethod: string;

  @Column({ name: 'cuota_inicial_usd', type: 'numeric', precision: 14, scale: 2, default: 0 })
  cuotaInicialUsd: string;

  @Column({ name: 'total_cuotas', type: 'int', default: 0 })
  totalCuotas: number;

  @Column({ name: 'interest_type', length: 20, default: 'sin_intereses' })
  interestType: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  tea: string;

  @Column({ name: 'valor_cuota_usd', type: 'numeric', precision: 14, scale: 2, default: 0 })
  valorCuotaUsd: string;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 8, scale: 4, default: 3.75 })
  exchangeRate: string;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
