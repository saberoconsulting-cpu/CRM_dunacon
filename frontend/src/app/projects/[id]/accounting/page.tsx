'use client';

import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import AccountingView from '@/components/features/accounting/AccountingView';

export default function ProjectAccountingPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Contabilidad"><AccountingView projectId={Number(id)} /></Layout>;
}
