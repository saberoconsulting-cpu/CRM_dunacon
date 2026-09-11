'use client';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import PaymentsView from '@/components/features/payments/PaymentsView';

export default function ProjectPaymentsPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Pago de Lotes"><PaymentsView lockedProjectId={Number(id)} /></Layout>;
}
