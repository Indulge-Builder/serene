// VendorIdentityCard — who the vendor is and how to reach them.
//
// The left card of the vendor page's top row; VendorScoreCard sits beside it.
// The two were one card until 2026-09-05 — split so the score column could be
// short and level rather than a tall panel running past the contact fields.
//
// Display-only (A-06) and server-component-safe, with ONE exception: the
// category chip is <VendorCategoryPicker>, a client child that writes the one
// field a human has to be able to correct (4,082 vendors import as
// Unclassified). Everything else here stays read-only.

import { User, Phone, Mail, MapPin, Tags, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { getRequestCategoryLabel } from '@/lib/constants/vendors';
import { VendorCategoryPicker } from './VendorCategoryPicker';
import { VENDOR_STATUS_LABELS, type VendorStatus } from '@/lib/constants/vendors';
import type { VendorDetail, VendorContact } from '@/lib/types/vendor';

const STATUS_STYLE: Record<VendorStatus, { bg: string; fg: string }> = {
  active:      { bg: 'var(--color-success-light)', fg: 'var(--color-success-text)' },
  paused:      { bg: 'var(--color-warning-light)', fg: 'var(--color-warning-text)' },
  blacklisted: { bg: 'var(--color-danger-light)',  fg: 'var(--color-danger-text)'  },
};

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The first named contact is the point of contact; unnamed entries are the
 *  vendor's general lines (the 0183 `contacts` contract). */
function resolvePoc(contacts: VendorContact[]): VendorContact | null {
  return contacts.find((c) => c.name) ?? null;
}

function Chip({ label, count, lead }: { label: string; count?: number; lead?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '4px var(--space-3)',
        borderRadius: 'var(--neu-radius-chip)',
        background: lead ? 'var(--theme-accent-surface)' : 'var(--theme-paper)',
        border: `1px solid ${lead ? 'var(--theme-accent-muted)' : 'var(--theme-paper-border)'}`,
        boxShadow: lead ? undefined : 'var(--neu-shadow-raised-sm)',
        fontSize: 'var(--text-xs)',
        color: lead ? 'var(--neu-accent-deep)' : 'var(--theme-text-primary)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {count != null && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            color: lead ? 'var(--neu-accent-deep)' : 'var(--theme-text-tertiary)',
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}

/** The labelled-datum row from the design system: icon · micro label · value. */
function Field({
  icon: Icon,
  label,
  children,
  full,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', gridColumn: full ? '1 / -1' : undefined }}>
      <Icon
        style={{
          width: '1rem',
          height: '1rem',
          color: 'var(--theme-text-tertiary)',
          strokeWidth: 1.5,
          flexShrink: 0,
          marginTop: '2px',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <span
          className="label-micro"
          style={{
            display: 'block',
            color: 'var(--theme-text-tertiary)',
            marginBottom: 'var(--space-1)',
          }}
        >
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}

function Value({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      style={{
        fontSize: mono ? 'var(--text-xs)' : 'var(--text-sm)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        color: 'var(--theme-text-primary)',
        wordBreak: 'break-word',
      }}
    >
      {children}
    </span>
  );
}

const DASH = <span style={{ color: 'var(--theme-text-tertiary)' }}>—</span>;

const ITALIC: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontStyle: 'italic',
  fontSize: 'var(--text-sm)',
  color: 'var(--theme-text-tertiary)',
};

export function VendorIdentityCard({
  vendor,
  capabilities,
  categoriesUsed,
  topAgents,
  categoriesInUse = [],
}: Pick<VendorDetail, 'vendor' | 'capabilities' | 'categoriesUsed' | 'topAgents'> & {
  /** Categories already in the database — so one added by hand is offered next time. */
  categoriesInUse?: string[];
}) {
  const poc = resolvePoc(vendor.contacts);
  const pocPhone = poc?.phones[0] ?? null;
  const pocEmail = poc?.emails[0] ?? null;
  // The general line is the vendor's own number when it differs from the POC's.
  const generalPhone =
    vendor.primary_phone && vendor.primary_phone !== pocPhone ? vendor.primary_phone : null;

  // Cities served come from the capability rows; the spine's home_city is where
  // they are based, and is included so a vendor with no capabilities still says
  // something true.
  const cities = [
    ...new Set(
      capabilities.flatMap((c) => c.cities).concat(vendor.home_city ? [vendor.home_city] : []),
    ),
  ];

  const statusStyle = STATUS_STYLE[vendor.status];

  return (
    <div
      style={{
        background: 'var(--theme-paper)',
        border: '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--neu-radius-card)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* Identity */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-5)',
          flexWrap: 'wrap',
          padding: 'var(--space-6)',
        }}
      >
        <Avatar name={vendor.name} size="xl" />
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontWeight: 'var(--weight-normal)',
              fontSize: 'var(--text-lg)',
              letterSpacing: 'var(--tracking-tight)',
              lineHeight: 'var(--leading-tight)',
              color: 'var(--theme-text-primary)',
            }}
          >
            {vendor.name}
          </h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--theme-text-secondary)',
            }}
          >
            {vendor.subcategory && <span>{vendor.subcategory}</span>}
            {/* Always rendered, even when the category is null — an
                unclassified vendor is exactly the one that needs setting, so
                hiding the control on the rows that need it would be backwards. */}
            <VendorCategoryPicker
              vendorId={vendor.id}
              category={vendor.category}
              categoriesInUse={categoriesInUse}
            />
            <span
              style={{
                padding: '3px var(--space-3)',
                borderRadius: 'var(--radius-full)',
                background: statusStyle.bg,
                color: statusStyle.fg,
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-medium)',
              }}
            >
              {VENDOR_STATUS_LABELS[vendor.status]}
            </span>
          </div>
        </div>
      </div>

      {/* Contact + history */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          columnGap: 'var(--space-6)',
          rowGap: 'var(--space-5)',
          padding: 'var(--space-5) var(--space-6) var(--space-6)',
          borderTop: '1px solid var(--theme-paper-border)',
        }}
      >
        <Field icon={User} label="Point of contact">
          <Value>{poc?.name ?? DASH}</Value>
        </Field>

        <Field icon={Phone} label="Phone">
          {pocPhone || generalPhone ? (
            <>
              <Value mono>{pocPhone ?? generalPhone}</Value>
              {pocPhone && generalPhone && (
                <span
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--theme-text-tertiary)',
                    marginTop: '2px',
                  }}
                >
                  {generalPhone} · general
                </span>
              )}
            </>
          ) : (
            DASH
          )}
        </Field>

        <Field icon={Mail} label="Email">
          <Value>{pocEmail ?? DASH}</Value>
        </Field>

        {/* full — a chip list needs the whole row; in one auto-fit column the
            chips wrap two per line and strand the rest of the card empty. */}
        <Field icon={MapPin} label="Service cities" full>
          {cities.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {cities.map((c) => (
                <Chip key={c} label={titleCase(c)} />
              ))}
            </div>
          ) : (
            DASH
          )}
        </Field>

        <Field icon={Tags} label="Ticket categories handled" full>
          {categoriesUsed.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {categoriesUsed.map((c) => (
                <Chip key={c.category} label={getRequestCategoryLabel(c.category)} count={c.count} />
              ))}
            </div>
          ) : (
            <span style={ITALIC}>Not used for anything yet.</span>
          )}
        </Field>

        <Field icon={Users} label="Used most by" full>
          {topAgents.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {topAgents.map((a, i) => (
                <Chip key={a.agentId} label={a.name} count={a.count} lead={i === 0} />
              ))}
            </div>
          ) : (
            <span style={ITALIC}>Nobody has booked them yet.</span>
          )}
        </Field>
      </div>
    </div>
  );
}
