'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FiArrowLeft } from 'react-icons/fi';
import Layout from '@/components/layout/Layout';
import ProjectPhotos from '@/components/features/projects/ProjectPhotos';
import { Toaster } from '@/components/ui/ui';
import { api } from '@/lib/api';

export default function ProjectPhotosPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const [name, setName] = useState('Proyecto');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ name: string }>(`/projects/${projectId}`).then(project => setName(project.name))
      .catch(e => setError(e.message));
  }, [projectId]);

  return (
    <Layout title="Fotos del proyecto">
      <Toaster />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/projects" className="btn-neutral"><FiArrowLeft /> Volver a proyectos</Link>
        <Link href={`/projects/${projectId}`} className="btn-neutral">Ir al proyecto</Link>
      </div>
      {error ? <p role="alert" className="text-red-600">{error}</p> : <ProjectPhotos projectId={projectId} name={name} />}
    </Layout>
  );
}
