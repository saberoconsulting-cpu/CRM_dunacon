import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('project_documents')
export class ProjectDocumentEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ length: 50 })
  kind: string;

  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'mime_type', length: 120, nullable: true })
  mimeType: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  size: string;

  @Column({ length: 500 })
  url: string;

  @Column({ name: 'public_id', length: 255, nullable: true })
  publicId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
