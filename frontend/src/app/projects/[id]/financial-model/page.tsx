import Layout from '@/components/layout/Layout';
import CashflowExcelTestView from '@/components/features/finances/CashflowExcelTestView';

export default function CashflowExcelTestPage({ params }: { params: { id: string } }) {
  return (
    <Layout title="Modelo financiero">
      <CashflowExcelTestView projectId={Number(params.id)} />
    </Layout>
  );
}
