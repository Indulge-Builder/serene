'use client';

import { useEffect, useRef } from 'react';

/**
 * Opens a create modal only when createTrigger increments — not when a tab
 * mounts with a stale trigger left over from a prior header-button click.
 */
export function useCreateTriggerModal(
  createTrigger: number,
  onOpen: () => void,
): void {
  const prev = useRef(createTrigger);

  useEffect(() => {
    if (createTrigger > prev.current) {
      onOpen();
    }
    prev.current = createTrigger;
  }, [createTrigger, onOpen]);
}
