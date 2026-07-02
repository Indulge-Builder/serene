'use client';

import { useEffect, useState } from 'react';

export interface ChartTokens {
  /** 6-colour series palette in order: accent, info, success, warning, danger, accent-muted */
  series: [string, string, string, string, string, string];
  grid: string;
  axisLabel: string;
  tooltipBg: string;
  tooltipBorder: string;
}

/** Default fallback (Earth theme) — resolved before paint if possible, prevents flash. */
const FALLBACK: ChartTokens = {
  series:       ['#c9a553', '#2860a0', '#3a7d52', '#b87a10', '#b83a28', '#665739'],
  grid:         '#e7e2d4',
  axisLabel:    '#b5a99a',
  tooltipBg:    '#fcfbf6',
  tooltipBorder:'#e7e2d4',
};

function resolveVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resolveTokens(): ChartTokens {
  return {
    series: [
      resolveVar('--theme-accent')        || FALLBACK.series[0],
      resolveVar('--color-info')          || FALLBACK.series[1],
      resolveVar('--color-success')       || FALLBACK.series[2],
      resolveVar('--color-warning')       || FALLBACK.series[3],
      resolveVar('--color-danger')        || FALLBACK.series[4],
      resolveVar('--theme-accent-muted')  || FALLBACK.series[5],
    ],
    grid:         resolveVar('--theme-paper-border')  || FALLBACK.grid,
    axisLabel:    resolveVar('--theme-text-tertiary') || FALLBACK.axisLabel,
    tooltipBg:    resolveVar('--theme-paper')         || FALLBACK.tooltipBg,
    tooltipBorder:resolveVar('--theme-paper-border')  || FALLBACK.tooltipBorder,
  };
}

/**
 * Resolves all CSS variable strings in a Record<string, string> to their
 * computed hex/rgb values at mount time.
 *
 * SVG `fill` and `stroke` attributes do not resolve CSS custom properties in
 * all browsers (notably older Safari). This is the same pattern used by
 * useChartTokens internally — call getComputedStyle once, cache the result.
 *
 * Usage:
 *   const resolved = resolveColorMap(STATUS_COLORS);
 *   // resolved['new'] === '#2860a0'  (resolved from var(--color-info))
 */
export function resolveColorMap(map: Record<string, string>): Record<string, string> {
  if (typeof window === 'undefined') return map;
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => {
      const varMatch = value.match(/^var\((--[\w-]+)\)$/);
      if (!varMatch) return [key, value];
      const resolved = style.getPropertyValue(varMatch[1]).trim();
      return [key, resolved || value];
    }),
  );
}

/**
 * Resolves chart CSS tokens at runtime and re-resolves whenever the active
 * theme changes.
 *
 * Theme switches work by writing a new value to the `data-theme` attribute on
 * `document.documentElement` (see ThemeSelector.tsx). A MutationObserver on
 * that element fires on every attribute mutation and triggers a re-resolve.
 * This means callers do NOT need to pass a `themeKey` prop — the hook is
 * self-contained and always in sync with the active theme.
 *
 * The optional `themeKey` prop is kept for backward compat and as an escape
 * hatch for SSR-rendered contexts where the MutationObserver cannot run.
 */
export function useChartTokens(themeKey?: string): ChartTokens {
  const [tokens, setTokens] = useState<ChartTokens>(FALLBACK);

  useEffect(() => {
    // Initial resolve after mount (getComputedStyle is only available client-side)
    setTokens(resolveTokens());

    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-theme'
        ) {
          setTokens(resolveTokens());
          break;
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes:      true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  // themeKey kept as dep for SSR/test overrides; MutationObserver handles the
  // runtime case so production callers don't need to pass it.
   
  }, [themeKey]);

  return tokens;
}
