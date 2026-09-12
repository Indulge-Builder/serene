'use client';

// AddVendorButton — the /vendors primary CTA (top-right, the standard list-page
// slot). The modal and its form chain stay out of the route chunk until the
// button is first pressed (the AddLeadButton load-on-intent pattern, G-1).

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
import { MotionButton, MOTION_BUTTON_DEFAULTS } from '@/components/ui/MotionButton';
import { useMountOnFirstOpen } from '@/hooks/useMountOnFirstOpen';

const AddVendorModal = dynamic(
  () => import('@/components/vendors/AddVendorModal').then((m) => m.AddVendorModal),
  { ssr: false },
);

export function AddVendorButton({ categoriesInUse }: { categoriesInUse: string[] }) {
  const [open, setOpen] = useState(false);
  const mountModal = useMountOnFirstOpen(open);

  return (
    <>
      <MotionButton
        {...MOTION_BUTTON_DEFAULTS}
        variant="primary"
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          whiteSpace: 'nowrap',
        }}
      >
        <Plus style={{ width: '1rem', height: '1rem', strokeWidth: 1.5 }} />
        Add vendor
      </MotionButton>

      {mountModal && (
        <AddVendorModal open={open} onClose={() => setOpen(false)} categoriesInUse={categoriesInUse} />
      )}
    </>
  );
}
