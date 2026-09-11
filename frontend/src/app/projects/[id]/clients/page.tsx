'use client';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import ClientsView from '@/components/features/clients/ClientsView';

export default function ProjectClientsPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Clientes y leads"><ClientsView lockedProjectId={Number(id)} /></Layout>;
}
