import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('project_lot_data')
@Index(['projectId', 'code'], { unique: true })
export class ProjectLotDataEntity {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'project_id' }) projectId: number;
  @Column({ length: 50 }) code: string;
  @Column({ length: 255, default: '' }) address: string;
  @Column({ length: 80, default: '' }) type: string;
  @Column({ name: 'area_m2', type: 'numeric', precision: 14, scale: 2, default: 0 }) areaM2: string;
  @Column({ length: 80, default: '' }) perimeter: string;
  @Column({ length: 255, default: '' }) dimensions: string;
  @Column({ length: 80, default: '' }) front: string;
  @Column({ name: 'left_side', length: 80, default: '' }) leftSide: string;
  @Column({ name: 'right_side', length: 80, default: '' }) rightSide: string;
  @Column({ length: 80, default: '' }) back: string;
  @Column({ length: 80, default: '' }) status: string;
  @Column({ length: 255, default: '' }) owner: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
