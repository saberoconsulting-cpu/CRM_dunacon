// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureCloudinary, cloudinaryConfigured } from './shared/infrastructure/upload/cloudinary.util';
import { getAllowedOrigins } from './shared/infrastructure/config/cors-origins';

async function bootstrap() {
  // Configurar Cloudinary si las credenciales están en el entorno
  if (cloudinaryConfigured()) {
    configureCloudinary({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
      api_key: process.env.CLOUDINARY_API_KEY as string,
      api_secret: process.env.CLOUDINARY_API_SECRET as string,
    });
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Cabeceras de seguridad HTTP. CSP se desactiva porque esta API no sirve HTML
  // (rompería sin aportar nada) y el CORP se abre a cross-origin para que el
  // frontend (otro dominio) pueda seguir cargando /uploads (planos, vouchers).
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS: origenes autorizados (local y produccion)
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  // Servir archivos estáticos (imágenes de planos en ./uploads)
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 Backend CRM Inmobiliario corriendo en http://localhost:${port}/api`);
}
bootstrap();