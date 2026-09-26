// Skeleton for /m/tasks/[agentId], in AgentTasksScreen's own frame: the detail app bar, the
// agent row (initials disc, name, the open count), a section label and a list card of six rows.

import { Shimmer, skeletonStagger } from '@/components/ui/PageSkeletons';

const TILE = 'var(--neu-radius-tile)';

export default function MobileAgentTasksLoading() {
  return (
    <div
      className="min-h-dvh flex flex-col gap-3.5 px-5 pb-8"
      style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center justify-between">
        <Shimmer w={44} h={44} r="var(--radius-full)" />
        <Shimmer w={140} h={10} r="var(--radius-xs)" />
        <span className="w-11 h-11 shrink-0" aria-hidden />
      </div>

      <div className="flex items-center gap-3 px-1">
        <Shimmer w={42} h={42} r="var(--radius-full)" style={{ flexShrink: 0 }} />
        <div className="flex flex-col gap-1.5">
          <Shimmer w={140} h={16} />
          <Shimmer w={80} h={10} r="var(--radius-xs)" delay={skeletonStagger(1)} />
        </div>
      </div>

      <Shimmer w={80} h={10} r="var(--radius-xs)" className="ml-1" />
      <div
        className="flex flex-col bg-(--neu-surface-high) border border-(--neu-edge) px-3.5"
        style={{ borderRadius: '24px', boxShadow: 'var(--neu-shadow-raised-sm)' }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 min-h-[56px] py-2.5"
            style={i < 5 ? { borderBottom: '1px solid var(--neu-m-hairline)' } : undefined}
          >
            <Shimmer w={36} h={36} r={TILE} delay={skeletonStagger(i)} style={{ flexShrink: 0 }} />
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <Shimmer w="60%" h={12} r="var(--radius-xs)" delay={skeletonStagger(i)} />
              <Shimmer w="35%" h={10} r="var(--radius-xs)" delay={skeletonStagger(i)} />
            </div>
            <Shimmer w={44} h={10} r="var(--radius-xs)" delay={skeletonStagger(i)} />
          </div>
        ))}
      </div>
    </div>
  );
}
