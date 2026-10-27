import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { DataSource, In } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserProjectEntity } from '../entities/user-project.entity';
import { getAllowedOrigins } from '../config/cors-origins';

const eventModules: Record<string, string[]> = {
  lot: ['dashboard', 'lots', 'plan'],
  payment: ['dashboard', 'payments', 'finances'],
  sale: ['dashboard', 'sales', 'plan'],
  quote: ['quotes', 'sales'],
  expense: ['dashboard', 'finances'],
  financial: ['finances'],
};

@WebSocketGateway({ cors: { origin: getAllowedOrigins(), credentials: true } })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly sessions = new WeakMap<Socket, { userId: number; expiresAt: number }>();

  constructor(private readonly jwtService: JwtService, private readonly db: DataSource) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error();
      const claims = this.jwtService.verify(token);
      if (!Number.isSafeInteger(claims.sub) || claims.sub <= 0 || !Number.isFinite(claims.exp)) throw new Error();
      const user = await this.db.getRepository(UserEntity).findOne({
        where: { id: claims.sub }, select: { id: true, role: true, status: true },
      });
      if (!user || user.status !== 'active' || !['superadmin', 'admin', 'agent'].includes(user.role)) throw new Error();
      this.sessions.set(client, { userId: user.id, expiresAt: claims.exp * 1000 });
      // Browser-supplied project IDs never grant access. Delivery checks
      // current permissions, including changes after login.
    } catch {
      client.disconnect(true);
    }
  }

  async emitToAll(event: string, payload: unknown): Promise<void> {
    await this.deliver(event, payload);
  }

  async emitToProject(event: string, payload: unknown, projectId: number): Promise<void> {
    await this.deliver(event, payload, projectId);
  }

  private async deliver(event: string, payload: unknown, explicitProjectId?: number): Promise<void> {
    try {
      if (!this.server) return;
      const group = event.split('.')[0];
      const modules = eventModules[group];
      if (!modules) return;
      const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      let projectId = Number(explicitProjectId ?? row.projectId);
      if (!Number.isSafeInteger(projectId) || projectId <= 0) {
        const entities: Record<string, string> = { lot: 'LotEntity', sale: 'SaleEntity', quote: 'QuoteEntity', expense: 'ExpenseEntity' };
        if (entities[group] && Number.isSafeInteger(row.id) && Number(row.id) > 0) {
          const record = await this.db.getRepository(entities[group]).findOne({
            where: { id: row.id }, select: { projectId: true },
          });
          projectId = Number(record?.projectId);
        }
      }
      const scoped = Number.isSafeInteger(projectId) && projectId > 0;
      // UI listeners reload via REST. Never broadcast financial entities.
      const notice: Record<string, unknown> = {};
      if (scoped) {
        notice.projectId = projectId;
        for (const key of ['id', 'lotId']) {
          if (Number.isSafeInteger(row[key]) && Number(row[key]) > 0) notice[key] = row[key];
        }
        if (row.deleted === true) notice.deleted = true;
      }
      const clients = Array.from(this.server.sockets.sockets.values());
      const userIds = [...new Set(clients.map(client => this.sessions.get(client)?.userId).filter((id): id is number => id !== undefined))];
      if (!userIds.length) return;
      // Batch reads: permission checks must not add two queries per socket.
      const users = new Map((await this.db.getRepository(UserEntity).find({
        where: { id: In(userIds) }, select: { id: true, role: true, status: true },
      })).map(user => [user.id, user]));
      const memberships = new Map((scoped ? await this.db.getRepository(UserProjectEntity).find({
        where: { projectId, userId: In(userIds) },
      }) : []).map(membership => [membership.userId, membership]));
      for (const client of clients) {
        const session = this.sessions.get(client);
        if (!session) continue;
        if (session.expiresAt <= Date.now()) { client.disconnect(true); continue; }
        const user = users.get(session.userId);
        if (!user || user.status !== 'active' || !['superadmin', 'admin', 'agent'].includes(user.role)) {
          client.disconnect(true);
          continue;
        }
        if (user.role !== 'superadmin') {
          const membership = memberships.get(user.id);
          if (user.role === 'agent' && !membership) continue;
          if (Array.isArray(membership?.allowedModules) && !modules.some(module => membership.allowedModules!.includes(module))) continue;
        }
        if (client.connected) client.emit(event, notice);
      }
    } catch {
      // Do not turn successful writes into apparent failures or log SQL/data.
      this.logger.error('No se pudo entregar una notificacion en tiempo real');
    }
  }
}
