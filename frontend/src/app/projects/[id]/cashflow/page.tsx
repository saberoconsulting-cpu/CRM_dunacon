'use client';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import CashflowExcelTestView from '@/components/features/finances/CashflowExcelTestView';

export default function ProjectCashflowPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Flujo de caja"><CashflowExcelTestView projectId={Number(id)} /></Layout>;
}