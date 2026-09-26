import { notFound } from 'next/navigation';
import { RequestsScreen } from '@/components/mobile/screens/RequestsScreen';
import { MOBILE_DEMO_SCREENS_ENABLED } from '@/lib/constants/feature-flags';

export const metadata = { title: 'Requests' };

export default function MobileRequestsPage() {
  if (!MOBILE_DEMO_SCREENS_ENABLED) notFound();
  return <RequestsScreen />;
}
