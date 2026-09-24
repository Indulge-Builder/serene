/** A quiet, named loading state. Keep existing content visible during refreshes. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="serene-loading-state" role="status" aria-live="polite"><span className="serene-loading-dot" aria-hidden="true" />{label}</div>;
}
