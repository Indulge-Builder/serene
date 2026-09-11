// vendor-score.ts — pure score math for the Vendors module (the
// subscription-status.ts posture): no DB, safe on client and server.
//
// A vendor's score is COMPUTED per read from the raw signals the
// get_vendor_score_inputs rollup returns (migration 0185) — never stored on
// the vendors row — so a new review or a failed job moves the ranking
// immediately. Each component maps to a 0–1 signal; a component with NO data
// is dropped and the remaining SCORE_WEIGHTS renormalise, so a brand-new vendor
// with two completed jobs is scored on what we actually know rather than on an
// invented neutral. Every non-null component also yields one human-readable
// reason (the "8.5, matches budget and route preference" shape in the vision).
import {
  SCORE_WEIGHTS,
  SCORE_WINDOW_MONTHS,
  VOLUME_SATURATION,
  SCORE_MAX,
  REVIEW_DIMENSIONS,
  REVIEW_DIMENSION_LABELS,
  type ScoreComponent,
  type ReviewDimension,
} from "@/lib/constants/vendors";
import type { VendorScoreInputs, VendorScore } from "@/lib/types/vendor";

const MS_PER_MONTH = 30.44 * 86_400_000;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Log-saturating volume signal: 1 job ≈ 0.23, 5 ≈ 0.59, 20+ = 1. */
function volumeSignal(count: number): number {
  return clamp01(Math.log1p(count) / Math.log1p(VOLUME_SATURATION));
}

/** 1 when used this month, fading linearly to 0 at the window edge. */
function recencySignal(lastStartedAt: string | null, now: Date): number | null {
  if (!lastStartedAt) return null;
  const months = Math.max(0, (now.getTime() - new Date(lastStartedAt).getTime()) / MS_PER_MONTH);
  return clamp01(1 - months / SCORE_WINDOW_MONTHS);
}

/** Average of the dimensions the reviewers actually filled, mapped 1–5 → 0–1. */
function reviewSignal(inputs: VendorScoreInputs): { signal: number | null; avg: number | null } {
  const dims = reviewAverages(inputs).map(([, v]) => v);
  if (dims.length === 0) return { signal: null, avg: null };
  const avg = dims.reduce((a, b) => a + b, 0) / dims.length;
  return { signal: clamp01((avg - 1) / 4), avg };
}

function reviewAverages(inputs: VendorScoreInputs): [ReviewDimension, number][] {
  const byDim: Record<ReviewDimension, number | null> = {
    speed: inputs.avgSpeed,
    quality: inputs.avgQuality,
    pricing: inputs.avgPricing,
    reliability: inputs.avgReliability,
  };
  return REVIEW_DIMENSIONS.flatMap((d) => (byDim[d] == null ? [] : [[d, byDim[d]] as [ReviewDimension, number]]));
}

export type ScoreContext = {
  now: Date;
  /** When the ranker asked for a category / city, volume speaks to THAT slice. */
  category?: string | null;
  city?: string | null;
};

/**
 * Score one vendor from its rollup row. Pure and deterministic for a given
 * `now`. `reasons` are ordered the way the sidebar reads them: volume, recency,
 * reliability, reviews.
 */
export function computeVendorScore(inputs: VendorScoreInputs, ctx: ScoreContext): VendorScore {
  const reasons: string[] = [];
  const breakdown: Record<ScoreComponent, number | null> = {
    volume: null,
    recency: null,
    reliability: null,
    reviews: null,
    sentiment: null,
  };

  // Volume — always present (0 is a real answer: "never used").
  const scopedCount = ctx.category ? inputs.categoryCount : inputs.engagementCount;
  breakdown.volume = volumeSignal(scopedCount);
  if (inputs.engagementCount === 0) {
    reasons.push(`No jobs on record in the last ${SCORE_WINDOW_MONTHS} months`);
  } else {
    let line = `Used ${plural(inputs.engagementCount, "time")} in the last ${SCORE_WINDOW_MONTHS} months`;
    if (ctx.category) line += `, ${inputs.categoryCount} for ${ctx.category}`;
    if (ctx.city)     line += `, ${inputs.cityCount} in ${ctx.city}`;
    reasons.push(line);
  }

  // Recency.
  breakdown.recency = recencySignal(inputs.lastStartedAt, ctx.now);
  if (inputs.lastStartedAt) {
    const months = Math.floor((ctx.now.getTime() - new Date(inputs.lastStartedAt).getTime()) / MS_PER_MONTH);
    reasons.push(months < 1 ? "Last used this month" : `Last used ${plural(months, "month")} ago`);
  }

  // Reliability — only when at least one job reached a decided outcome.
  const decided = inputs.completedCount + inputs.failedCount + inputs.cancelledCount;
  if (decided > 0) {
    breakdown.reliability = clamp01(inputs.completedCount / decided);
    let line = `${inputs.completedCount} of ${plural(decided, "job")} completed`;
    if (inputs.failedCount > 0) line += `, ${inputs.failedCount} failed`;
    reasons.push(line);
  }

  // Reviews — the manual dimensions, whichever were filled.
  const { signal: reviewSig, avg } = reviewSignal(inputs);
  if (reviewSig != null && avg != null && inputs.reviewCount > 0) {
    breakdown.reviews = reviewSig;
    const parts = reviewAverages(inputs)
      .map(([d, v]) => `${REVIEW_DIMENSION_LABELS[d].toLowerCase()} ${v.toFixed(1)}`)
      .join(" · ");
    reasons.push(`Rated ${avg.toFixed(1)}/5 across ${plural(inputs.reviewCount, "review")} (${parts})`);
  }

  // Team sentiment — preferred minus avoid, over the teammates who spoke (0191).
  // Maps -1..1 onto 0..1: everyone prefers = 1, everyone avoids = 0, an even
  // split = 0.5. Silence is not a signal: no marks, no component.
  const voices = inputs.preferredCount + inputs.avoidCount;
  if (voices > 0) {
    breakdown.sentiment = clamp01((inputs.preferredCount - inputs.avoidCount) / voices / 2 + 0.5);
    if (inputs.preferredCount > 0) reasons.push(`Preferred by ${plural(inputs.preferredCount, "teammate")}`);
    if (inputs.avoidCount > 0)     reasons.push(`${plural(inputs.avoidCount, "teammate")} avoid${inputs.avoidCount === 1 ? "s" : ""} this vendor`);
  }

  // Weighted mean over the components that had data.
  let weighted = 0;
  let weightSum = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as ScoreComponent[]) {
    const signal = breakdown[key];
    if (signal == null) continue;
    weighted += SCORE_WEIGHTS[key] * signal;
    weightSum += SCORE_WEIGHTS[key];
  }
  const ranking = weightSum === 0 ? 0 : Math.round((weighted / weightSum) * SCORE_MAX * 10) / 10;

  // Volume and recency are ACTIVITY, not quality. A vendor we called 365 times
  // last month scores 10/10 on both and would display as "9.9" having never
  // been rated by anyone — a quality verdict invented out of call frequency.
  // So the displayed score waits for an actual judgement: a review, a job that
  // reached a decided outcome. Until one of those exists the ring shows an em
  // dash and "times used" carries the usage story on its own. `ranking` still
  // orders the ranker.
  // A teammate's preferred / avoid mark shapes the RANKING and the reasons
  // (sentiment, above) but does not on its own unlock the displayed verdict:
  // with one mark and no rating, four-fifths of the number would still be
  // call frequency — the 9.9-for-an-unrated-vendor this gate exists to stop.
  const hasJudgement = breakdown.reliability != null || breakdown.reviews != null;

  return { score: hasJudgement ? ranking : null, ranking, reasons, breakdown };
}

/** Cautions the ranker surfaces WITHOUT excluding the vendor. */
export function vendorFlags(inputs: VendorScoreInputs, identityVerified: boolean): string[] {
  const flags: string[] = [];
  if (inputs.failedCount > 0) flags.push(`${plural(inputs.failedCount, "failed job")} in the last ${SCORE_WINDOW_MONTHS} months`);
  // A teammate's avoid is a caution to everyone else, never their exclusion —
  // the asking agent's OWN avoid is handled by the ranker, which removes the row.
  if (inputs.avoidCount > 0)  flags.push(`${plural(inputs.avoidCount, "teammate")} marked avoid`);
  if (!identityVerified)      flags.push("Identity not yet verified");
  return flags;
}
