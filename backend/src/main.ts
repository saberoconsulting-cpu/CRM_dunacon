// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureCloudinary, cloudinaryConfigured } from './shared/infrastructure/upload/cloudinary.util';

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

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS: origenes autorizados (local y produccion)
  const allowedOrigins: string[] = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://crm.saberoconsulting.com',
    'https://crm.dunacon.pe',
  ];
  // Si el entorno define FRONTEND_URL (u origenes extra), se agregan
  const extraFromEnv = process.env.FRONTEND_URL;
  const extra = extraFromEnv ? extraFromEnv.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const origins = Array.from(new Set([...allowedOrigins, ...extra]));

  app.enableCors({
    origin: origins,
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