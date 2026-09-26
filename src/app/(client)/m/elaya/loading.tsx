// Skeleton for /m/elaya, in the chat screen's own frame: back knob, the mark and her name, the
// day chip, three bubbles taking turns, then the composer pill and the send knob at the bottom.
// The Elaya bubble radius is the screen's own (20px, a 6px inner corner on the speaking side).

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

const ELAYA_RADIUS = '20px 20px 20px 6px';
const USER_RADIUS  = '20px 20px 6px 20px';

export default function MobileElayaLoading() {
  return (
    <div
      className="h-dvh flex flex-col gap-3 px-5 min-h-0"
      style={{
        paddingTop:    'max(14px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center justify-between">
        <Shimmer w={44} h={44} r="var(--radius-full)" />
        <div className="flex flex-col items-center gap-[3px]">
          <Shimmer w={38} h={38} r="var(--radius-full)" />
          <Shimmer w={34} h={8} r="var(--radius-xs)" />
        </div>
        <span className="w-11 h-11 shrink-0" aria-hidden />
      </div>

      <Shimmer w={64} h={24} r="var(--radius-full)" style={{ alignSelf: 'center' }} />

      <div className="flex-1 min-h-0 flex flex-col gap-2.5">
        <Shimmer w="76%" h={64} r={ELAYA_RADIUS} style={{ alignSelf: 'flex-start' }} />
        <Shimmer w="58%" h={44} r={USER_RADIUS} delay={skeletonStagger(1)} style={{ alignSelf: 'flex-end' }} />
        <Shimmer w="70%" h={84} r={ELAYA_RADIUS} delay={skeletonStagger(2)} style={{ alignSelf: 'flex-start' }} />
      </div>

      <div className="flex items-center gap-2.5">
        <Shimmer h={50} r="var(--radius-full)" style={{ flex: 1 }} />
        <Shimmer w={50} h={50} r="var(--radius-full)" style={{ flexShrink: 0 }} />
      </div>
    </div>
  );
}
