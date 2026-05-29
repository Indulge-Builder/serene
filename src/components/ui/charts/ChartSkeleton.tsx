'use client';

import React from 'react';

export interface ChartSkeletonProps {
  width?: string | number;
  height?: number;
}

export function ChartSkeleton({ width = '100%', height = 240 }: ChartSkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: 'var(--radius-md)',
      }}
      aria-hidden="true"
    />
  );
}
