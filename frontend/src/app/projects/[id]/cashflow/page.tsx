'use client';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import FinancesView from '@/components/features/finances/FinancesView';

export default function ProjectCashflowPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Flujo de caja"><FinancesView lockedProjectId={Number(id)} /></Layout>;
}