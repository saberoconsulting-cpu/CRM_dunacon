import { randomUUID } from 'crypto';
// modules/projects/application/projects.service.ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, IsNull, Not, In } from 'typeorm';
import { ProjectEntity } from '../../../shared/infrastructure/entities/project.entity';
import { BlockEntity } from '../../../shared/infrastructure/entities/block.entity';
import { LotEntity } from '../../../shared/infrastructure/entities/lot.entity';
import { PlanEntity } from '../../../shared/infrastructure/entities/plan.entity';
import { AuditLogEntity } from '../../../shared/infrastructure/entities/audit-log.entity';
import { ProjectDocumentEntity } from '../../../shared/infrastructure/entities/project-document.entity';
import { UserProjectEntity } from '../../../shared/infrastructure/entities/user-project.entity';
import { uploadProjectPhoto, deleteProjectPhoto, uploadToCloudinary } from '../../../shared/infrastructure/upload/cloudinary.util';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(LotEntity)
    private readonly lotRepo: Repository<LotEntity>,
    @InjectRepository(BlockEntity)
    private readonly blockRepo: Repository<BlockEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    @InjectRepository(ProjectDocumentEntity)
    private readonly projectDocumentRepo: Repository<ProjectDocumentEntity>,
    @InjectRepository(UserProjectEntity)
    private readonly userProjectRepo: Repository<UserProjectEntity>,
  ) {}

  async audit(userId: number, action: string, entity?: string, entityId?: number) {
    await this.auditRepo.save({ userId, action, entity, entityId });
  }

  private async geocode(location?: string): Promise<{ latitude?: number; longitude?: number }> {
    if (!location || !location.trim()) return {};
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(location)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CRM-Inmobiliario/1.0 (dev)' },
      });
      if (!res.ok) return {};
      const list = await res.json();
      const hit = Array.isArray(list) && list[0];
      if (hit && hit.lat != null && hit.lon != null) {
        return { latitude: Number(hit.lat), longitude: Number(hit.lon) };
      }
      return {};
    } catch {
      return {};
    }
  }

  async create(dto: CreateProjectDto, actorId: number) {
    let lat = dto.latitude;
    let lng = dto.longitude;
    const shouldGeocode = (lat == null || lng == null);
    if (shouldGeocode) {
      const g = await this.geocode(dto.location);
      if (g.latitude != null && g.longitude != null) { lat = g.latitude; lng = g.longitude; }
    }
    const project = this.projectRepo.create({
      name: dto.name,
      description: dto.description,
      location: dto.location,
      status: dto.status || 'active',
      latitude: lat != null ? String(lat) : null,
      longitude: lng != null ? String(lng) : null,
      referencePrice: dto.referencePrice != null ? String(dto.referencePrice) : null,
    } as DeepPartial<ProjectEntity>);
    const saved = await this.projectRepo.save(project);
    await this.audit(actorId, 'CREAR_PROYECTO', 'projects', saved.id);
    return saved;
  }

  async list(user?: { id: number; role: string }) {
    const where: any = { deletedAt: IsNull() };
    if (user && user.role === 'agent') {
      const rows = await this.userProjectRepo.find({ where: { userId: user.id } });
      const allowed = rows.map((row) => Number(row.projectId)).filter(Boolean);
      if (!allowed.length) return [];
      where.id = In(allowed);
    }
    const projects = await this.projectRepo.find({ where, order: { sortOrder: 'ASC', createdAt: 'DESC', id: 'DESC' } });
    const withStats = await Promise.all(
      projects.map(async (p) => {
        const [total, disponibles, reservados, adelantos, primeras, vendidos] =
          await Promise.all([
            this.lotRepo.count({ where: { projectId: p.id } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'disponible' } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'reservado' } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'adelanto' } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'primera_cuota' } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'vendido' } }),
          ]);
        return { ...p, stats: { total, disponibles, reservados, adelantos, primeras, vendidos } };
      }),
    );
    return withStats;
  }

  async reorder(projectIds: number[], actorId: number) {
    await this.projectRepo.manager.transaction(async manager => {
      const repo = manager.getRepository(ProjectEntity);
      const projects = await repo.createQueryBuilder('p').where('p.deletedAt IS NULL')
        .orderBy('p.id', 'ASC').setLock('pessimistic_write').getMany();
      const ids = new Set(projectIds);
      if (ids.size !== projectIds.length || projects.length !== projectIds.length || projects.some(p => !ids.has(p.id))) {
        throw new BadRequestException('La lista de proyectos ha cambiado. Recarga la pagina e intenta de nuevo.');
      }
      for (const [sortOrder, id] of projectIds.entries()) await repo.update(id, { sortOrder });
      await manager.getRepository(AuditLogEntity).save({ userId: actorId, action: 'ORDENAR_PROYECTOS', entity: 'projects' });
    });
    return { ok: true };
  }

  async getOne(id: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    return project;
  }

  async update(id: number, dto: CreateProjectDto, actorId: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    let lat = dto.latitude ?? Number(project.latitude);
    let lng = dto.longitude ?? Number(project.longitude);
    const wantsGeo = (lat == null || isNaN(lat) || lng == null || isNaN(lng));
    if (wantsGeo && !dto.latitude && !dto.longitude) {
      const g = await this.geocode(dto.location || project.location || '');
      if (g.latitude != null && g.longitude != null) { lat = g.latitude; lng = g.longitude; }
    }

    Object.assign(project, { ...dto, latitude: undefined, longitude: undefined });
    project.name = dto.name ?? project.name;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.location !== undefined) project.location = dto.location;
    if (dto.status !== undefined) project.status = dto.status;
    if (dto.referencePrice != null) project.referencePrice = String(dto.referencePrice);
    if (lat != null && !isNaN(lat)) project.latitude = String(lat);
    if (lng != null && !isNaN(lng)) project.longitude = String(lng);
    const saved = await this.projectRepo.save(project);
    await this.audit(actorId, 'EDITAR_PROYECTO', 'projects', id);
    return saved;
  }

  async setStatus(id: number, status: 'active' | 'inactive', actorId: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    project.status = status;
    await this.projectRepo.save(project);
    await this.audit(actorId, 'ESTADO_PROYECTO', 'projects', id);
    return { ok: true };
  }

  async updateCover(id: number, coverImageUrl: string, actorId: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    project.coverImageUrl = coverImageUrl;
    await this.projectRepo.save(project);
    await this.audit(actorId, 'SUBIR_PORTADA', 'projects', id);
    return project;
  }

  async updateLogo(id: number, logoImageUrl: string, actorId: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    project.logoImageUrl = logoImageUrl;
    await this.projectRepo.save(project);
    await this.audit(actorId, 'SUBIR_LOGO_PROYECTO', 'projects', id);
    return project;
  }

  async deleteProject(id: number, actorId: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    project.deletedAt = new Date();
    await this.projectRepo.save(project);
    await this.audit(actorId, 'ELIMINAR_PROYECTO', 'projects', id).catch(() => {});
    return { ok: true };
  }

  async history() {
    const projects = await this.projectRepo.find({
      where: { deletedAt: Not(IsNull()) },
      order: { deletedAt: 'DESC' },
    });
    const withStats = await Promise.all(
      projects.map(async (p) => {
        const [total, disponibles, reservados, adelantos, primeras, vendidos] =
          await Promise.all([
            this.lotRepo.count({ where: { projectId: p.id } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'disponible' } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'reservado' } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'adelanto' } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'primera_cuota' } }),
            this.lotRepo.count({ where: { projectId: p.id, status: 'vendido' } }),
          ]);
        return { ...p, stats: { total, disponibles, reservados, adelantos, primeras, vendidos } };
      }),
    );
    return withStats;
  }

  async restore(id: number, actorId: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    project.deletedAt = null;
    await this.projectRepo.save(project);
    await this.audit(actorId, 'RESTAURAR_PROYECTO', 'projects', id).catch(() => {});
    return project;
  }

  async purge(id: number, actorId: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    await this.projectRepo.remove(project);
    await this.audit(actorId, 'ELIMINAR_DEFINITIVO_PROYECTO', 'projects', id).catch(() => {});
    return { ok: true };
  }

  async listDocuments(projectId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const documents = await this.projectDocumentRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });

    return documents.map((doc) => ({
      id: doc.id,
      projectId: doc.projectId,
      kind: doc.kind,
      originalName: doc.originalName,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      size: Number(doc.size || 0),
      url: doc.url,
      publicId: doc.publicId,
      createdAt: doc.createdAt,
    }));
  }

  async uploadDocument(projectId: number, kind: string, file: Express.Multer.File, actorId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    if (!file) throw new NotFoundException('Archivo no recibido');

    const uploaded = await uploadToCloudinary(file.buffer, 'documents');

    const saved = await this.projectDocumentRepo.save({
      projectId,
      kind,
      originalName: file.originalname,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: String(file.size || 0),
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
    });

    await this.audit(actorId, 'SUBIR_DOCUMENTO', 'project_documents', saved.id).catch(() => {});

    return {
      id: saved.id,
      projectId: saved.projectId,
      kind: saved.kind,
      originalName: saved.originalName,
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      size: Number(saved.size || 0),
      url: saved.url,
      publicId: saved.publicId,
      createdAt: saved.createdAt,
    };
  }

  private async checkPhotoAccess(projectId: number, user: { id: number; role: string }) {
    if (user.role === 'agent' && !await this.userProjectRepo.exist({ where: { projectId, userId: user.id } })) {
      throw new ForbiddenException('No tienes acceso a este proyecto');
    }
  }

  async listPhotos(projectId: number, user: { id: number; role: string }) {
    await this.checkPhotoAccess(projectId, user);
    const project = await this.projectRepo.createQueryBuilder('p').addSelect('p.photos')
      .where('p.id = :projectId AND p.deletedAt IS NULL', { projectId }).getOne();
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    return project.photos || [];
  }

  async addPhoto(projectId: number, file: Express.Multer.File, user: { id: number; role: string }) {
    await this.checkPhotoAccess(projectId, user);
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Selecciona una foto JPG, PNG o WebP');
    }
    let uploaded: { secure_url: string; public_id: string } | undefined;
    try {
      return await this.projectRepo.manager.transaction(async manager => {
        const repo = manager.getRepository(ProjectEntity);
        const project = await repo.createQueryBuilder('p').addSelect('p.photos')
          .setLock('pessimistic_write').where('p.id = :projectId AND p.deletedAt IS NULL', { projectId }).getOne();
        if (!project) throw new NotFoundException('Proyecto no encontrado');
        if ((project.photos || []).length >= 10) throw new BadRequestException('Ya tienes 10 fotos. Para reemplazar una, elimina una foto existente y sube la nueva.');
        uploaded = await uploadProjectPhoto(file.buffer);
        project.photos = [...(project.photos || []), { id: randomUUID(), url: uploaded.secure_url, publicId: uploaded.public_id, name: file.originalname }];
        await repo.update(projectId, { photos: project.photos });
        return project.photos;
      });
    } catch (error) {
      if (uploaded) await deleteProjectPhoto(uploaded.public_id).catch(() => {});
      throw error;
    }
  }

  async removePhoto(projectId: number, photoId: string, user: { id: number; role: string }) {
    await this.checkPhotoAccess(projectId, user);
    return this.projectRepo.manager.transaction(async manager => {
      const repo = manager.getRepository(ProjectEntity);
      const project = await repo.createQueryBuilder('p').addSelect('p.photos')
        .setLock('pessimistic_write').where('p.id = :projectId AND p.deletedAt IS NULL', { projectId }).getOne();
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      const photo = (project.photos || []).find(p => p.id === photoId);
      if (!photo) throw new NotFoundException('Foto no encontrada');
      await deleteProjectPhoto(photo.publicId);
      project.photos = project.photos.filter(p => p.id !== photoId);
      await repo.update(projectId, { photos: project.photos });
      return project.photos;
    });
  }

  async dashboard(id: number) {
    const project = await this.getOne(id);
    const plan = await this.planRepo.findOne({ where: { projectId: id } });
    const streets = await this.blockRepo.find({ where: { projectId: id } });
    const lots = await this.lotRepo.find({ where: { projectId: id } });
    const lotsWithCompat = lots.map((lot) => ({ ...lot, blockId: lot.streetId }));
    return { project, plan, streets, blocks: streets, lots: lotsWithCompat };
  }
}
