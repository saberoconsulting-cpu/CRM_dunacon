'use client';

import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import BankAccountsView from '@/components/features/bank-accounts/BankAccountsView';

export default function ProjectBankAccountsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Layout title="Cuentas y bancos">
      <BankAccountsView projectId={Number(id)} />
    </Layout>
  );
}
