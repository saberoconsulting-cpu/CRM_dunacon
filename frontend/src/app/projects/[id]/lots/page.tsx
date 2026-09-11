'use client';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import LotsView from '@/components/features/lots/LotsView';

export default function ProjectLotsPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Lotes"><LotsView lockedProjectId={Number(id)} /></Layout>;
}
