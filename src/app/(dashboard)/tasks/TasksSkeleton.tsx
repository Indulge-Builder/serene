/**
 * TasksSkeleton — <Suspense> fallback for the tasks page.
 *
 * Two variants driven by the active tab:
 *   personal — 3 priority-section headers + 5 task row skeletons each
 *   group    — 4 group card skeletons
 *
 * Skeleton rules (§11.3, §11.4, V-08):
 *   - Stagger delays: 0 / 80 / 160 / 240 / 320ms
 *   - Background: var(--theme-paper-subtle) — no hardcoded colours
 *   - Minimum display time enforced by Suspense boundary (≥150ms, V-08)
 */

// ─── Personal skeleton (two-column: calendar left + date list right) ─────────

const ROW_STAGGER = [0, 80, 160, 240, 320];

function TaskRowSkeleton({ delay }: { delay: number }) {
  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-3)',
        padding:      'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--theme-paper-border)',
        background:   'var(--theme-paper)',
      }}
    >
      <div className="skeleton" style={{ width: 'var(--space-6)', height: 'var(--space-6)', borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${delay}ms` }} />
      <div className="skeleton" style={{ flex: 1, height: '14px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }} />
      <div className="skeleton" style={{ width: '60px', height: '12px', borderRadius: 'var(--radius-xs)', flexShrink: 0, animationDelay: `${delay}ms` }} />
      <div className="skeleton" style={{ width: 'var(--space-6)', height: 'var(--space-6)', borderRadius: 'var(--radius-xs)', flexShrink: 0, animationDelay: `${delay}ms` }} />
    </div>
  );
}

function DateSectionSkeleton({ sectionDelay, rowCount = 3 }: { sectionDelay: number; rowCount?: number }) {
  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', background: 'var(--theme-paper-subtle)', borderBottom: '1px solid var(--theme-paper-border)' }}>
        <div className="skeleton" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${sectionDelay}ms` }} />
        <div className="skeleton" style={{ width: '80px', height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${sectionDelay}ms` }} />
        <div className="skeleton" style={{ width: '20px', height: '16px', borderRadius: 'var(--radius-full)', marginLeft: 'auto', animationDelay: `${sectionDelay}ms` }} />
      </div>
      {Array.from({ length: rowCount }).map((_, i) => (
        <TaskRowSkeleton key={i} delay={sectionDelay + (ROW_STAGGER[i] ?? 0)} />
      ))}
    </div>
  );
}

function PersonalTabSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
      {/* Left: calendar */}
      <div style={{ flexShrink: 0, width: 280, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* Calendar card */}
        <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-1)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Month header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="skeleton" style={{ width: '100px', height: '14px', borderRadius: 'var(--radius-xs)' }} />
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)' }} />
              <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)' }} />
            </div>
          </div>
          {/* Day labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 'var(--space-1)' }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${i * 20}ms` }} />
            ))}
          </div>
          {/* Calendar grid — 5 rows × 7 cols */}
          {Array.from({ length: 5 }).map((_, row) => (
            <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 'var(--space-1)' }}>
              {Array.from({ length: 7 }).map((_, col) => (
                <div key={col} className="skeleton" style={{ height: '32px', borderRadius: 'var(--radius-xs)', animationDelay: `${(row * 7 + col) * 15}ms` }} />
              ))}
            </div>
          ))}
        </div>
        {/* Stats strip */}
        <div style={{ background: 'var(--theme-paper)', border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-1)', padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {[0, 80, 160].map((delay, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div className="skeleton" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${delay}ms` }} />
              <div className="skeleton" style={{ flex: 1, height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }} />
              <div className="skeleton" style={{ width: '20px', height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }} />
            </div>
          ))}
        </div>
        {/* Quick-add button */}
        <div className="skeleton" style={{ height: '34px', borderRadius: 'var(--radius-md)' }} />
      </div>

      {/* Right: date sections */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ border: '1px solid var(--theme-paper-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-1)' }}>
          <DateSectionSkeleton sectionDelay={0} rowCount={3} />
          <div style={{ borderTop: '1px solid var(--theme-paper-border)' }}>
            <DateSectionSkeleton sectionDelay={80} rowCount={2} />
          </div>
          <div style={{ borderTop: '1px solid var(--theme-paper-border)' }}>
            <DateSectionSkeleton sectionDelay={160} rowCount={2} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Group skeleton ───────────────────────────────────────────────────────────

const GROUP_STAGGER = [0, 80, 160, 240];

function GroupCardSkeleton({ delay }: { delay: number }) {
  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-4)',
        padding:      'var(--space-4) var(--space-5)',
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      {/* Left: title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="skeleton"
          style={{
            width:          '180px',
            height:         '14px',
            borderRadius:   'var(--radius-xs)',
            marginBottom:   'var(--space-2)',
            animationDelay: `${delay}ms`,
          }}
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <div
            className="skeleton"
            style={{
              width:          '60px',
              height:         '18px',
              borderRadius:   'var(--radius-full)',
              animationDelay: `${delay}ms`,
            }}
          />
          <div
            className="skeleton"
            style={{
              width:          '44px',
              height:         '18px',
              borderRadius:   'var(--radius-full)',
              animationDelay: `${delay}ms`,
            }}
          />
        </div>
      </div>

      {/* Right: progress + avatars */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexShrink: 0 }}>
        <div
          className="skeleton"
          style={{
            width:          '80px',
            height:         '6px',
            borderRadius:   'var(--radius-full)',
            animationDelay: `${delay}ms`,
          }}
        />
        {/* Avatar stack placeholders */}
        <div style={{ display: 'flex', gap: -4 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{
                width:          '24px',
                height:         '24px',
                borderRadius:   'var(--radius-full)',
                animationDelay: `${delay}ms`,
                marginLeft:     i > 0 ? '-8px' : 0,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupTabSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {GROUP_STAGGER.map((delay, i) => (
        <GroupCardSkeleton key={i} delay={delay} />
      ))}
    </div>
  );
}

// ─── Gia skeleton (date-grouped rows) ─────────────────────────────────────────

function GiaRowSkeleton({ delay, width }: { delay: number; width: string }) {
  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        'var(--space-3)',
        padding:    'var(--space-3) 0',
      }}
    >
      {/* completion circle */}
      <div
        className="skeleton"
        style={{
          width:          '24px',
          height:         '24px',
          borderRadius:   'var(--radius-full)',
          flexShrink:     0,
          animationDelay: `${delay}ms`,
        }}
      />
      {/* task type icon */}
      <div
        className="skeleton"
        style={{
          width:          '16px',
          height:         '16px',
          borderRadius:   'var(--radius-sm)',
          flexShrink:     0,
          animationDelay: `${delay}ms`,
        }}
      />
      {/* lead name + label */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div
          className="skeleton"
          style={{
            width:          width,
            height:         '14px',
            borderRadius:   'var(--radius-full)',
            animationDelay: `${delay}ms`,
          }}
        />
        <div
          className="skeleton"
          style={{
            width:          '60px',
            height:         '10px',
            borderRadius:   'var(--radius-full)',
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
      {/* due time */}
      <div
        className="skeleton"
        style={{
          width:          '48px',
          height:         '12px',
          borderRadius:   'var(--radius-full)',
          animationDelay: `${delay}ms`,
        }}
      />
    </div>
  );
}

function GiaDaySectionSkeleton({ delay, widths }: { delay: number; widths: string[] }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      {/* date label */}
      <div
        className="skeleton"
        style={{
          width:          '80px',
          height:         '10px',
          borderRadius:   'var(--radius-full)',
          marginBottom:   'var(--space-2)',
          animationDelay: `${delay}ms`,
        }}
      />
      {widths.map((w, i) => (
        <GiaRowSkeleton key={i} delay={delay + i * 80} width={w} />
      ))}
    </div>
  );
}

function GiaTabSkeleton() {
  return (
    <div
      style={{
        background:   'var(--theme-paper)',
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-1)',
        padding:      'var(--space-5)',
      }}
    >
      <GiaDaySectionSkeleton delay={0}   widths={['80%', '60%']} />
      <GiaDaySectionSkeleton delay={160} widths={['75%']} />
      <GiaDaySectionSkeleton delay={240} widths={['65%', '50%']} />
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

interface TasksSkeletonProps {
  tab: 'personal' | 'group' | 'gia';
}

export function TasksSkeleton({ tab }: TasksSkeletonProps) {
  return (
    <div>
      {/* Header row skeleton: tab selector + button */}
      <div
        style={{
          display:       'flex',
          alignItems:    'center',
          justifyContent: 'space-between',
          marginBottom:  'var(--space-6)',
        }}
      >
        {/* Tab selector skeleton */}
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {[72, 84].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{
                width:        `${w}px`,
                height:       '32px',
                borderRadius: 'var(--radius-full)',
              }}
            />
          ))}
        </div>
        {/* Button skeleton */}
        <div
          className="skeleton"
          style={{
            width:        '100px',
            height:       '36px',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      </div>

      {tab === 'gia'
        ? <GiaTabSkeleton />
        : tab === 'personal'
          ? <PersonalTabSkeleton />
          : <GroupTabSkeleton />}
    </div>
  );
}
