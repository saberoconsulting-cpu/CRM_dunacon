// shared/infrastructure/entities/project.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('projects')
export class ProjectEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 255, nullable: true })
  location: string;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude: string;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude: string;

  @Column({ name: 'cover_image_url', length: 500, nullable: true })
  coverImageUrl: string;

  @Column({ name: 'logo_image_url', length: 500, nullable: true })
  logoImageUrl: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ name: 'reference_price', type: 'numeric', precision: 14, scale: 2, nullable: true })
  referencePrice: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
