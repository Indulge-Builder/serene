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

/** Default fallback (cream neumorphic, Earth accent) — resolved before paint if possible, prevents flash. */
const FALLBACK: ChartTokens = {
  series:       ['#c9a553', '#A3BFD6', '#A9C4A0', '#E3CB96', '#D98E85', '#B3A9D4'],
  grid:         'rgba(166, 156, 140, 0.22)',
  axisLabel:    '#ABA396',
  tooltipBg:    '#F3EFE8',
  tooltipBorder:'rgba(255, 255, 255, 0.55)',
};

function resolveVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resolveTokens(): ChartTokens {
  return {
    // Neumorphic series: theme accent leads, the pastel support family follows
    // (README §Charts — accent + pastel series, max 3 colours per chart).
    series: [
      resolveVar('--theme-accent')  || FALLBACK.series[0],
      resolveVar('--neu-powder')    || FALLBACK.series[1],
      resolveVar('--neu-sage')      || FALLBACK.series[2],
      resolveVar('--neu-butter')    || FALLBACK.series[3],
      resolveVar('--neu-danger')    || FALLBACK.series[4],
      resolveVar('--neu-lilac')     || FALLBACK.series[5],
    ],
    grid:         resolveVar('--neu-chart-grid')       || FALLBACK.grid,
    axisLabel:    resolveVar('--theme-text-tertiary')  || FALLBACK.axisLabel,
    tooltipBg:    resolveVar('--neu-surface-high')     || FALLBACK.tooltipBg,
    tooltipBorder:resolveVar('--neu-edge')             || FALLBACK.tooltipBorder,
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
      if (varMatch) {
        const resolved = style.getPropertyValue(varMatch[1]).trim();
        return [key, resolved || value];
      }
      // A colour expression that NESTS a var (a stepped shade: color-mix(in srgb, var(--theme-accent)
      // 60%, var(--theme-paper))): let the browser compute it on a probe element.
      if (value.includes('var(')) return [key, computeCssColor(value) || value];
      return [key, value];
    }),
  );
}

/** The browser's own rgb() for any CSS colour expression (vars, color-mix). */
function computeCssColor(value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
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
          (mutation.attributeName === 'data-theme' ||
            mutation.attributeName === 'data-neu')
        ) {
          setTokens(resolveTokens());
          break;
        }
      }
    });

    // data-neu = the dark-mode switch (AppearanceSelector / ThemeInitializer)
    // — grid/axis/tooltip and the pastel series all flip in the dark block,
    // so charts must re-resolve on it exactly like a theme change.
    observer.observe(document.documentElement, {
      attributes:      true,
      attributeFilter: ['data-theme', 'data-neu'],
    });

    return () => observer.disconnect();
  // themeKey kept as dep for SSR/test overrides; MutationObserver handles the
  // runtime case so production callers don't need to pass it.
   
  }, [themeKey]);

  return tokens;
}
