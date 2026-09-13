'use client';

import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import IncomeStatementView from '@/components/features/income-statement/IncomeStatementView';

export default function ProjectIncomeStatementPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Layout title="Estado de resultados">
      <IncomeStatementView projectId={Number(id)} />
    </Layout>
  );
}
