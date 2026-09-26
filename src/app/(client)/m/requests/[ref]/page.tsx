import { notFound } from 'next/navigation';
import { RequestDetailScreen } from '@/components/mobile/screens/RequestDetailScreen';
import { MOBILE_DEMO_SCREENS_ENABLED } from '@/lib/constants/feature-flags';

export const metadata = { title: 'Request' };

export default async function MobileRequestDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  if (!MOBILE_DEMO_SCREENS_ENABLED) notFound();
  const { ref } = await params;
  return <RequestDetailScreen reference={ref} />;
}
