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

/** Store resized WebP originals, rather than just transforming delivery URLs. */
export async function uploadProjectPhoto(buffer: Buffer): Promise<{ secure_url: string; public_id: string }> {
  if (!cloudinaryConfigured()) throw new Error('Cloudinary no configurado');
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      resource_type: 'image', folder: 'project-photos', format: 'webp',
      transformation: [{ width: 1600, height: 1600, crop: 'limit' }, { quality: 'auto:good' }],
    }, (err, res) => {
      if (err) return reject(err);
      if (!res) return reject(new Error('No se pudo guardar la foto'));
      resolve({ secure_url: res.secure_url, public_id: res.public_id });
    }).end(buffer);
  });
}

export async function deleteProjectPhoto(publicId: string): Promise<void> {
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  if (result.result !== 'ok' && result.result !== 'not found') throw new Error('No se pudo eliminar la foto');
}
