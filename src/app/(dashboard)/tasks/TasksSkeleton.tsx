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

// ─── Personal skeleton ────────────────────────────────────────────────────────

const PERSONAL_STAGGER = [0, 80, 160, 240, 320];
const PRIORITY_SECTION_STAGGER = [0, 80, 160];

function TaskRowSkeleton({ delay }: { delay: number }) {
  return (
    <div
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         'var(--space-3)',
        padding:     'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--theme-paper-border)',
        background:   'var(--theme-paper)',
      }}
    >
      {/* Completion circle */}
      <div
        className="skeleton"
        style={{
          width:          'var(--space-6)',
          height:         'var(--space-6)',
          borderRadius:   'var(--radius-full)',
          flexShrink:     0,
          animationDelay: `${delay}ms`,
        }}
      />
      {/* Title */}
      <div
        className="skeleton"
        style={{
          flex:           1,
          height:         '14px',
          borderRadius:   'var(--radius-xs)',
          animationDelay: `${delay}ms`,
        }}
      />
      {/* Due date chip */}
      <div
        className="skeleton"
        style={{
          width:          '60px',
          height:         '12px',
          borderRadius:   'var(--radius-xs)',
          flexShrink:     0,
          animationDelay: `${delay}ms`,
        }}
      />
      {/* Arrow button */}
      <div
        className="skeleton"
        style={{
          width:          'var(--space-6)',
          height:         'var(--space-6)',
          borderRadius:   'var(--radius-xs)',
          flexShrink:     0,
          animationDelay: `${delay}ms`,
        }}
      />
    </div>
  );
}

function PrioritySectionSkeleton({ sectionDelay }: { sectionDelay: number }) {
  return (
    <div
      style={{
        border:       '1px solid var(--theme-paper-border)',
        borderRadius: 'var(--radius-md)',
        overflow:     'hidden',
        boxShadow:    'var(--shadow-1)',
      }}
    >
      {/* Section header */}
      <div
        style={{
          display:     'flex',
          alignItems:  'center',
          gap:         'var(--space-2)',
          padding:     'var(--space-2) var(--space-4)',
          background:  'var(--theme-paper-subtle)',
          borderBottom: '1px solid var(--theme-paper-border)',
        }}
      >
        <div
          className="skeleton"
          style={{
            width:          '60px',
            height:         '10px',
            borderRadius:   'var(--radius-xs)',
            animationDelay: `${sectionDelay}ms`,
          }}
        />
        <div
          className="skeleton"
          style={{
            width:          '24px',
            height:         '18px',
            borderRadius:   'var(--radius-full)',
            marginLeft:     'auto',
            animationDelay: `${sectionDelay}ms`,
          }}
        />
      </div>

      {/* Task rows */}
      {PERSONAL_STAGGER.map((rowDelay, i) => (
        <TaskRowSkeleton key={i} delay={sectionDelay + rowDelay} />
      ))}
    </div>
  );
}

function PersonalTabSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {PRIORITY_SECTION_STAGGER.map((delay, i) => (
        <PrioritySectionSkeleton key={i} sectionDelay={delay} />
      ))}
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

// ─── Public export ────────────────────────────────────────────────────────────

interface TasksSkeletonProps {
  tab: 'personal' | 'group';
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

      {tab === 'personal' ? <PersonalTabSkeleton /> : <GroupTabSkeleton />}
    </div>
  );
}
