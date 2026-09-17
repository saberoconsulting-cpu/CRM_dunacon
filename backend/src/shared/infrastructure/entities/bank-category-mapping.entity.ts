// shared/infrastructure/entities/bank-category-mapping.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('bank_category_mappings')
@Index('idx_bank_categories_project', ['projectId'])
@Index('idx_bank_categories_type', ['projectId', 'movementType'])
export class BankCategoryMappingEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'movement_type', type: 'varchar', length: 150 })
  movementType: string;

  @Column({ name: 'eerr_classification', type: 'varchar', length: 150 })
  eerrClassification: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
