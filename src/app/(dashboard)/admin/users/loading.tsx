// Skeleton — admin/users page chrome (Team page).
// Mirrors admin/users/page.tsx: p-8, header row with "Add Member" button, then user table.
// 6 user row skeletons (avatar + name/role/domain + status toggle).

export default function AdminUsersLoading() {
  return (
    <main className="flex-1 p-8">
      {/* Row 1 — Page header */}
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
          style={{ width: '120px', height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {/* Row 2 — Filter bar (search + role/domain dropdowns) */}
      <div
        style={{
          padding:      'var(--space-3) var(--space-4)',
          marginBottom: 'var(--space-4)',
          borderRadius: 'var(--radius-md)',
          border:       '1px solid var(--theme-paper-border)',
          background:   'var(--theme-paper)',
          boxShadow:    'var(--shadow-1)',
          display:      'flex',
          alignItems:   'center',
          gap:          'var(--space-3)',
        }}
      >
        <div
          className="skeleton"
          style={{ flex: 1, height: '36px', borderRadius: 'var(--radius-sm)' }}
        />
        {[80, 88].map((w, i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              width:          `${w}px`,
              height:         '36px',
              borderRadius:   'var(--radius-md)',
              flexShrink:     0,
              animationDelay: `${i * 40}ms`,
            }}
          />
        ))}
      </div>

      {/* Row 3 — Users table */}
      <div
        style={{
          background:   'var(--theme-paper)',
          border:       '1px solid var(--theme-paper-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow:    'var(--shadow-1)',
          overflow:     'hidden',
        }}
      >
        {/* Table header */}
        <div
          style={{
            display:      'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
            gap:          'var(--space-4)',
            alignItems:   'center',
            padding:      'var(--space-3) var(--space-5)',
            borderBottom: '1px solid var(--theme-paper-border)',
            background:   'var(--theme-paper-subtle)',
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: '10px', borderRadius: 'var(--radius-xs)', width: i === 4 ? '40px' : undefined }}
            />
          ))}
        </div>

        {/* User rows */}
        {[0, 80, 160, 240, 320, 320].map((delay, i) => (
          <div
            key={i}
            style={{
              display:      'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 80px',
              gap:          'var(--space-4)',
              alignItems:   'center',
              padding:      'var(--space-4) var(--space-5)',
              borderBottom: i < 5 ? '1px solid var(--theme-paper-border)' : 'none',
            }}
          >
            {/* Member cell: avatar + name/email */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div
                className="skeleton"
                style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', flexShrink: 0, animationDelay: `${delay}ms` }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
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
            {/* Role pill */}
            <div
              className="skeleton"
              style={{ width: '72px', height: '22px', borderRadius: 'var(--radius-full)', animationDelay: `${delay}ms` }}
            />
            {/* Domain pill */}
            <div
              className="skeleton"
              style={{ width: '80px', height: '22px', borderRadius: 'var(--radius-full)', animationDelay: `${delay}ms` }}
            />
            {/* Status */}
            <div
              className="skeleton"
              style={{ width: '60px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
            />
            {/* Edit link */}
            <div
              className="skeleton"
              style={{ width: '48px', height: '13px', borderRadius: 'var(--radius-xs)', animationDelay: `${delay}ms` }}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
