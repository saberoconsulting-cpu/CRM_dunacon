'use client';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import QuotesView from '@/components/features/quotes/QuotesView';

export default function ProjectQuotesPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Cotizaciones Lotes"><QuotesView lockedProjectId={Number(id)} /></Layout>;
}
