'use client';

import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import ConstructionBudgetView from '@/components/features/construction-budget/ConstructionBudgetView';

export default function ProjectConstructionBudgetPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Layout title="Presupuesto de obra">
      <ConstructionBudgetView projectId={Number(id)} />
    </Layout>
  );
}
