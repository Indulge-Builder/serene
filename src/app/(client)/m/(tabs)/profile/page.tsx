import { notFound } from 'next/navigation';
import { ProfileScreen } from '@/components/mobile/screens/ProfileScreen';
import { MOBILE_DEMO_SCREENS_ENABLED } from '@/lib/constants/feature-flags';

export const metadata = { title: 'Profile' };

export default function MobileProfilePage() {
  if (!MOBILE_DEMO_SCREENS_ENABLED) notFound();
  return <ProfileScreen />;
}
