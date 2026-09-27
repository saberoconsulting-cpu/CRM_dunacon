import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('project_lot_catalog')
@Index(['projectId', 'code'], { unique: true })
export class ProjectLotCatalogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  type?: string | null;

  @Column({ name: 'area_m2', type: 'numeric', precision: 12, scale: 2, default: 0 })
  areaM2: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  dimensions?: string | null;

  @Column({ name: 'price_m2', type: 'numeric', precision: 14, scale: 2, default: 0 })
  priceM2: string;

  @Column({ name: 'sale_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  salePrice: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  discount: string;

  @Column({ name: 'final_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  finalPrice: string;

  @Column({ length: 50, default: 'Disponible' })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  client?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
