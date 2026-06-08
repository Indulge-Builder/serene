// Skeleton — admin/users (Team) page.
// UsersTable renders: filter bar (paper strip) + card list (one card per member).
// Each UserCard is a flex row: avatar+name/email | job-title | domain pill | status | edit link.
// Mirrors the motion.div card shape with gap --space-4, padding --space-4 --space-5.

export default function AdminUsersLoading() {
  return (
    <main className="flex-1 p-8">
      {/* Page header */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            'var(--space-4)',
          marginBottom:   'var(--space-6)',
        }}
      >
        <div
          className="skeleton"
          style={{ width: '72px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
        <div
          className="skeleton"
          style={{ width: '120px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
      </div>

      {/* Filter bar — matches UsersTable filter strip */}
      <div
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
          padding:      'var(--space-4) var(--space-5)',
          marginBottom: 'var(--space-4)',
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow:    'var(--shadow-1)',
          flexWrap:     'wrap',
        }}
      >
        {/* Sliders icon placeholder */}
        <div
          className="skeleton"
          style={{ width: '16px', height: '16px', borderRadius: 'var(--radius-xs)', flexShrink: 0 }}
        />
        {/* Search bar */}
        <div
          className="skeleton"
          style={{ flex: '1 1 200px', height: '34px', borderRadius: 'var(--radius-sm)', minWidth: '160px' }}
        />
        {/* Role filter select */}
        <div
          className="skeleton"
          style={{ width: '96px', height: '34px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
        {/* Domain filter select */}
        <div
          className="skeleton"
          style={{ width: '88px', height: '34px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
        {/* Member count */}
        <div
          className="skeleton"
          style={{ width: '64px', height: '12px', borderRadius: 'var(--radius-xs)', marginLeft: 'auto', flexShrink: 0 }}
        />
      </div>

      {/* Member card list — 6 cards matching UserCard flex structure */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {[0, 80, 160, 240, 320, 320].map((delay, i) => (
          <div
            key={i}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          'var(--space-4)',
              flexWrap:     'wrap',
              padding:      'var(--space-4) var(--space-5)',
              background:   'var(--theme-paper)',
              border:       '1px solid var(--theme-paper-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow:    'var(--shadow-1)',
            }}
          >
            {/* Avatar + name/email — flex: 1 1 220px */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: '1 1 220px', minWidth: 0 }}>
              <div
                className="skeleton"
                style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', flexShrink: 0, animationDelay: `${delay}ms` }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
                <div
                  className="skeleton"
                  style={{ width: '130px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
                <div
                  className="skeleton"
                  style={{ width: '160px', height: '10px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
                />
              </div>
            </div>

            {/* Job title — flex: 2 1 200px */}
            <div
              className="skeleton"
              style={{ flex: '2 1 200px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
            />

            {/* Domain pill — flex: 0 0 auto */}
            <div
              className="skeleton"
              style={{ width: '80px', height: '22px', borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${delay}ms` }}
            />

            {/* Status — flex: 0 0 120px */}
            <div
              className="skeleton"
              style={{ width: '72px', height: '22px', borderRadius: 'var(--radius-full)', flexShrink: 0, animationDelay: `${delay}ms` }}
            />

            {/* Edit link — flex: 0 0 auto */}
            <div
              className="skeleton"
              style={{ width: '48px', height: '13px', borderRadius: 'var(--radius-xs)', flexShrink: 0, animationDelay: `${delay}ms` }}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
