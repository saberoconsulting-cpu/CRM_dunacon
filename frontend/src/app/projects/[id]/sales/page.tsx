'use client';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SalesView from '@/components/features/sales/SalesView';

export default function ProjectSalesPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Ventas"><SalesView lockedProjectId={Number(id)} /></Layout>;
}
