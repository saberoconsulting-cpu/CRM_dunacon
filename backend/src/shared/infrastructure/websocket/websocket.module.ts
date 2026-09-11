// shared/infrastructure/websocket/websocket.module.ts
// Módulo único para NotificationsGateway: antes cada módulo (finances,
// payments, plan, sales) declaraba su propio provider de la gateway,
// creando 4 instancias independientes (con sus propios listeners de
// conexión) en vez de un singleton compartido.
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationsGateway } from './notifications.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => {
        const secret = cs.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET no está definido. Configúralo en el .env antes de arrancar la API.');
        }
        return { secret };
      },
    }),
  ],
  providers: [NotificationsGateway],
  exports: [NotificationsGateway],
})
export class WebsocketModule {}
