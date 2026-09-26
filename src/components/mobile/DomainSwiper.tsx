'use client';

import { Carousel } from '@/components/ui/Carousel';
import { DOMAIN_VERTICALS } from '@/lib/constants/mobile-rooms';
import type { GiaDomain } from '@/lib/constants/domains';

/**
 * DomainSwiper — THE domain-paging wrapper every mobile room composes
 * (mobile-ops.md §6). One swipe engine: composes the existing
 * ui/Carousel (controlled, transform-based, axis-locked) with
 * hideControls and supplies its own neu-token domain header + dot
 * indicator. Never fork a second transform track.
 *
 * Single-domain callers (a pinned manager) get the header with no
 * swipe affordance and the pane rendered directly.
 */

function DomainHeader({
  domain,
  domains,
  onDomainChange,
}: {
  domain: GiaDomain;
  domains: GiaDomain[];
  onDomainChange: (domain: GiaDomain) => void;
}) {
  const vertical = DOMAIN_VERTICALS[domain];
  const Icon = vertical.icon;
  return (
    <div className="flex items-center gap-3 px-1">
      <span
        className="w-9 h-9 shrink-0 rounded-[13px] bg-(--neu-surface-high) flex items-center justify-center"
        style={{ color: vertical.iconToken, boxShadow: 'var(--neu-shadow-raised-sm)' }}
      >
        <Icon size={15} strokeWidth={1.7} />
      </span>
      <span
        className="flex-1 text-[17px] font-semibold text-(--neu-text-primary)"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {vertical.label}
      </span>
      {domains.length > 1 && (
        <span className="flex items-center gap-1.5" role="group" aria-label="Choose domain">
          {domains.map((d) => (
            <button
              key={d}
              type="button"
              aria-label={DOMAIN_VERTICALS[d].label}
              aria-pressed={d === domain}
              onClick={() => onDomainChange(d)}
              className="neu-m-touch-quiet serene-touch-hit rounded-full border-none p-0"
              style={{
                width: d === domain ? 16 : 6,
                height: 6,
                background:
                  d === domain ? 'var(--neu-accent)' : 'var(--neu-text-disabled)',
                transition: 'width 200ms var(--ease-out-expo, ease-out)',
              }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

export function DomainSwiper({
  domains,
  activeDomain,
  onDomainChange,
  renderDomain,
}: {
  domains: GiaDomain[];
  activeDomain: GiaDomain;
  onDomainChange: (domain: GiaDomain) => void;
  renderDomain: (domain: GiaDomain) => React.ReactNode;
}) {
  if (domains.length === 0) return null;

  if (domains.length === 1) {
    return (
      <div className="flex flex-col gap-3.5">
        <DomainHeader domain={domains[0]} domains={domains} onDomainChange={onDomainChange} />
        {renderDomain(domains[0])}
      </div>
    );
  }

  const index = Math.max(domains.indexOf(activeDomain), 0);

  return (
    <div className="flex flex-col gap-3.5">
      <DomainHeader domain={activeDomain} domains={domains} onDomainChange={onDomainChange} />
      <Carousel
        items={domains}
        index={index}
        onIndexChange={(i) => {
          const next = domains[i];
          if (next && next !== activeDomain) onDomainChange(next);
        }}
        getKey={(d) => d}
        ariaLabel="Domains"
        hideDots
        hideControls
        renderItem={(d) => (
          <div className="flex flex-col gap-3.5 min-h-full px-0.5 pb-1">{renderDomain(d)}</div>
        )}
      />
    </div>
  );
}
