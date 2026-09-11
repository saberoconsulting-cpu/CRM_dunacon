'use client';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import CampaignsView from '@/components/features/campaigns/CampaignsView';

export default function ProjectCampaignsPage() {
  const { id } = useParams<{ id: string }>();
  return <Layout title="Campañas y fuentes"><CampaignsView lockedProjectId={Number(id)} /></Layout>;
}
