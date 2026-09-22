'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { linkStaffWhatsAppNowAction } from '@/lib/actions/sia-staff-link';

export function LinkNowButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="xs" variant="secondary" iconLeft={RefreshCw} loading={pending} loadingLabel="Linking…" onClick={() => start(async () => {
      const r = await linkStaffWhatsAppNowAction({ profileId });
      if (r.error || !r.data) { toast.danger(r.error ?? 'Could not link.'); return; }
      toast.success(`Linked ${r.data.linked + r.data.viaHiddenId} contact${r.data.linked + r.data.viaHiddenId === 1 ? '' : 's'}; ${r.data.relinked} refreshed.`);
      router.refresh();
    })}>Link now</Button>
  );
}
