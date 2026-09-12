'use client';

// AddVendorModal — add a supplier by hand.
//
// The other way in stays exactly as it is: a vendor that turns up while working
// a ticket gets created from that flow. This is the direct route, for the
// vendor someone met at a hotel opening on Tuesday.
//
// Deliberately six fields. Name and Category are required; what they do, phone,
// email and city are optional, because half the time a vendor is added mid-call
// with a name and a number and nothing else, and a form that blocks that gets
// worked around instead of used.
//
// "Ticket category" is optional but load-bearing: the ranker searches
// CAPABILITIES, not the vendor row, so a vendor created without one never
// appears in Find a vendor until someone adds it from the dossier.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { createVendorAction, upsertCapabilityAction } from '@/lib/actions/vendors';
import {
  REQUEST_CATEGORY_OPTIONS,
  SERVICES_BY_REQUEST_CATEGORY,
  VENDOR_SERVICE_LABELS,
  vendorCategoryOptions,
  VENDORS_PATH,
  type RequestCategory,
  type VendorService,
} from '@/lib/constants/vendors';

const FIELD: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--theme-paper-border)',
  background: 'var(--theme-paper)',
  color: 'var(--theme-text-primary)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'inherit',
};

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span
      className="label-micro"
      style={{ display: 'block', color: 'var(--theme-text-tertiary)', marginBottom: 'var(--space-2)' }}
    >
      {children}
      {required && <span style={{ color: 'var(--color-danger-text)' }}> *</span>}
    </span>
  );
}

export function AddVendorModal({
  open,
  onClose,
  categoriesInUse,
}: {
  open: boolean;
  onClose: () => void;
  categoriesInUse: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [doesCategory, setDoesCategory] = useState<RequestCategory | ''>('');
  const [doesService, setDoesService] = useState<VendorService | ''>('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');

  const options = vendorCategoryOptions(categoriesInUse);
  const services = doesCategory ? (SERVICES_BY_REQUEST_CATEGORY[doesCategory] ?? []) : [];
  const chosenCategory = addingCategory ? newCategory.trim() : category;
  const canSubmit = name.trim().length > 0 && chosenCategory.length > 0 && !pending;

  function reset() {
    setName(''); setCategory(''); setNewCategory(''); setAddingCategory(false);
    setDoesCategory(''); setDoesService(''); setPhone(''); setEmail(''); setCity('');
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      // One contact entry holds whatever reach details were given — the 0183
      // contract's unnamed "general lines" row.
      const contacts =
        phone.trim() || email.trim()
          ? [{ name: null, phones: phone.trim() ? [phone.trim()] : [], emails: email.trim() ? [email.trim()] : [] }]
          : [];

      const created = await createVendorAction({
        name: name.trim(),
        category: chosenCategory,
        home_city: city.trim() || null,
        primary_phone: phone.trim() || null,
        contacts,
      });
      if (created.error || !created.data) {
        setError(created.error ?? 'Could not add the vendor.');
        return;
      }

      // The capability is a SECOND write and is allowed to fail on its own: the
      // vendor already exists by this point, so losing it would be worse than
      // an unfindable vendor the user can fix from the vendor page.
      if (doesCategory) {
        const cap = await upsertCapabilityAction({
          vendor_id: created.data.id,
          category: doesCategory,
          service: doesService || null,
          stance: 'offers',
          cities: city.trim() ? [city.trim()] : [],
        });
        if (cap.error) console.error('[AddVendorModal] capability failed:', cap.error);
      }

      reset();
      onClose();
      router.push(`${VENDORS_PATH}/${created.data.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Add a vendor"
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button variant="ghost" type="button" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {pending ? 'Adding…' : 'Add vendor'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div>
          <Label required>Name</Label>
          <input
            style={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="LuxDrovia"
            autoFocus
          />
        </div>

        <div>
          <Label required>Category</Label>
          {addingCategory ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                style={FIELD}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Automotive"
                autoFocus
              />
              <Button
                variant="ghost"
                type="button"
                onClick={() => { setAddingCategory(false); setNewCategory(''); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <select
              style={FIELD}
              value={category}
              onChange={(e) => {
                if (e.target.value === '__new__') { setAddingCategory(true); return; }
                setCategory(e.target.value);
              }}
            >
              <option value="">Choose a category…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
              <option value="__new__">+ Add a new category…</option>
            </select>
          )}
        </div>

        <div>
          <Label>Ticket category</Label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <select
              style={FIELD}
              value={doesCategory}
              onChange={(e) => { setDoesCategory(e.target.value as RequestCategory | ''); setDoesService(''); }}
            >
              <option value="">Choose…</option>
              {REQUEST_CATEGORY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {services.length > 0 && (
              <select
                style={FIELD}
                value={doesService}
                onChange={(e) => setDoesService(e.target.value as VendorService | '')}
              >
                <option value="">Any service</option>
                {services.map((s) => (
                  <option key={s} value={s}>{VENDOR_SERVICE_LABELS[s]}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div>
            <Label>Phone</Label>
            <input style={FIELD} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <Label>City</Label>
            <input style={FIELD} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
          </div>
        </div>

        <div>
          <Label>Email</Label>
          <input style={FIELD} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="bookings@vendor.com" />
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-danger-light)',
              color: 'var(--color-danger-text)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}
