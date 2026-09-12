// shared/infrastructure/upload/cloudinary.util.ts
// Subida de imágenes a Cloudinary. Para uso local sin credenciales se
// mantiene esquema opcional; en producción usa vars de entorno.
import { v2 as cloudinary } from 'cloudinary';

export interface UploadConf {
  cloud_name: string;
  api_key: string;
  api_secret: string;
}

export function configureCloudinary(c: UploadConf): void {
  cloudinary.config(c);
}

export function cloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/** Sube un buffer/image y devuelve URL segura pública. */
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: 'covers' | 'plans' | 'uploads' | 'documents' | 'project-logos',
): Promise<{ secure_url: string; public_id: string }> {
  if (!cloudinaryConfigured()) {
    throw new Error(
      'Cloudinary no configurado (CLOUDINARY_CLOUD_NAME/API_KEY/API_KEY/API_SECRET).',
    );
  }
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ resource_type: 'auto', folder }, (err, res) => {
        if (err) return reject(err);
        if (!res) return reject(new Error('Cloudinary sin resultado'));
        resolve({ secure_url: res.secure_url, public_id: res.public_id });
      })
      .end(buffer);
  });
}
