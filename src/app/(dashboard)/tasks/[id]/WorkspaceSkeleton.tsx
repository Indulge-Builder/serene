/**
 * WorkspaceSkeleton — <Suspense> fallback for /tasks/[id].
 *
 * Renders:
 *   1. Group header skeleton  — title bar + priority badge + domain pill + two action buttons
 *   2. View-toggle skeleton   — two tab buttons (List / Board)
 *   3. Five subtask row skeletons
 *
 * Skeleton rules (§11.3, §11.4, V-08):
 *   - Stagger delays: 0 / 80 / 160 / 240 / 320ms
 *   - Shimmer colour: var(--theme-paper-subtle) — no hardcoded values
 *   - The back-navigation link (← Group Tasks) is rendered in the page shell,
 *     NOT inside this skeleton — it appears immediately on navigation.
 */

const STAGGER = [0, 80, 160, 240, 320];

// ─── Subtask row skeleton ─────────────────────────────────────────────────────

function SubtaskRowSkeleton({ delay }: { delay: number }) {
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
      {/* Assignee avatar */}
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
      {/* Priority badge */}
      <div
        className="skeleton"
        style={{
          width:          '56px',
          height:         '20px',
          borderRadius:   'var(--radius-full)',
          flexShrink:     0,
          animationDelay: `${delay}ms`,
        }}
      />
      {/* Due date */}
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

// ─── Public export ────────────────────────────────────────────────────────────

export function WorkspaceSkeleton() {
  return (
    <div>
      {/* Group header skeleton */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          padding:      'var(--space-5) var(--space-6)',
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow:    'var(--shadow-1)',
          marginBottom: 'var(--space-5)',
        }}
      >
        {/* Title */}
        <div
          className="skeleton"
          style={{
            flex:         1,
            height:       '20px',
            borderRadius: 'var(--radius-xs)',
          }}
        />
        {/* Priority badge */}
        <div
          className="skeleton"
          style={{
            width:        '64px',
            height:       '24px',
            borderRadius: 'var(--radius-full)',
            flexShrink:   0,
          }}
        />
        {/* Domain pill */}
        <div
          className="skeleton"
          style={{
            width:        '80px',
            height:       '24px',
            borderRadius: 'var(--radius-full)',
            flexShrink:   0,
          }}
        />
        {/* Action button 1 */}
        <div
          className="skeleton"
          style={{
            width:        '100px',
            height:       '36px',
            borderRadius: 'var(--radius-sm)',
            flexShrink:   0,
          }}
        />
        {/* Action button 2 */}
        <div
          className="skeleton"
          style={{
            width:        '36px',
            height:       '36px',
            borderRadius: 'var(--radius-sm)',
            flexShrink:   0,
          }}
        />
      </div>

      {/* View-toggle skeleton */}
      <div
        style={{
          display:      'flex',
          gap:          'var(--space-1)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {[56, 68].map((w, i) => (
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

      {/* Subtask list skeleton */}
      <div
        style={{
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          overflow:     'hidden',
          boxShadow:    'var(--shadow-1)',
        }}
      >
        {STAGGER.map((delay, i) => (
          <SubtaskRowSkeleton key={i} delay={delay} />
        ))}
      </div>
    </div>
  );
}
