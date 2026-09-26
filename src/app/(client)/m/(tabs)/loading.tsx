// Skeleton for the mobile rooms (/m and the tabs): the tabs layout already draws the padded
// column and the tab bar, so this is only the room's shape. Home app bar, greeting, the ask
// pill, the domain header, four metric tiles, a section label and a list card. Mobile radii
// (card 24 / tile 18 / knob round), --neu-* tokens only, the shared shimmer.

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

const TILE = 'var(--neu-radius-tile)';
const CARD = '24px';

export default function MobileRoomLoading() {
  return (
    <>
      {/* App bar: mark knob, wordmark, bell knob */}
      <div className="flex items-center justify-between">
        <Shimmer w={44} h={44} r="var(--radius-full)" />
        <Shimmer w={80} h={12} r="var(--radius-xs)" />
        <Shimmer w={44} h={44} r="var(--radius-full)" />
      </div>

      {/* Greeting block */}
      <div className="flex flex-col gap-1.5 px-1">
        <Shimmer w={90} h={10} r="var(--radius-xs)" />
        <Shimmer w={220} h={26} delay={skeletonStagger(1)} />
        <Shimmer w={160} h={12} r="var(--radius-xs)" delay={skeletonStagger(2)} />
      </div>

      {/* Ask pill */}
      <Shimmer h={48} r="var(--radius-full)" />

      {/* Domain header: icon tile, name, the dot pager */}
      <div className="flex items-center gap-3 px-1">
        <Shimmer w={36} h={36} r={TILE} />
        <Shimmer w={120} h={16} style={{ flex: 1, maxWidth: 140 }} />
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} w={8} h={8} r="var(--radius-full)" delay={skeletonStagger(i)} />
          ))}
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Shimmer key={i} h={88} r={TILE} delay={skeletonStagger(i)} />
        ))}
      </div>

      {/* Section label and its list card */}
      <Shimmer w={70} h={10} r="var(--radius-xs)" className="ml-1" />
      <div
        className="flex flex-col bg-(--neu-surface-high) border border-(--neu-edge) px-3.5"
        style={{ borderRadius: CARD, boxShadow: 'var(--neu-shadow-raised-sm)' }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 min-h-[56px] py-2.5"
            style={i < 3 ? { borderBottom: '1px solid var(--neu-m-hairline)' } : undefined}
          >
            <Shimmer w={36} h={36} r={TILE} delay={skeletonStagger(i)} style={{ flexShrink: 0 }} />
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <Shimmer w="55%" h={12} r="var(--radius-xs)" delay={skeletonStagger(i)} />
              <Shimmer w="35%" h={10} r="var(--radius-xs)" delay={skeletonStagger(i)} />
            </div>
            <Shimmer w={28} h={16} r="var(--radius-xs)" delay={skeletonStagger(i)} />
          </div>
        ))}
      </div>
    </>
  );
}
