'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LegacyFinancialModelPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    if (id) router.replace(`/projects/${id}/cashflow`);
  }, [id, router]);

  return null;
}
