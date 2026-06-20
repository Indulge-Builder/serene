// Maps a normalised campaign key to the Meta ad account that paid for it.
//
// Naming convention (locked 2026-06-20, mirrors CAMPAIGN_DOMAIN_MAP's role for
// the domain segment): campaign keys are TG_<Domain>_<Account>_<Type>_<Date>,
// normalised lowercase (normalizeCampaignKey). The AD ACCOUNT is the THIRD
// _-delimited segment — index 2 after splitting on "_":
//
//   tg_global_april_lead gen_17 june
//   └0─┘ └─1──┘ └─2─┘ └──3───┘ └─4──┘
//                ▲ account
//
// This is the SAME shape as resolveDomainFromCampaign (which keys off the
// prefix / index-1 domain segment) — account attribution is the index-2 twin.
//
// IMPORTANT — this is finance data. A misattributed recharge is a real-money
// error. So the resolver NEVER guesses: an unknown / missing / malformed
// account segment falls back to the visible "Unattributed" bucket (mirrors
// resolveDomainFromCampaign's DEFAULT fallback), never another account, never a
// silent drop. "Unattributed" rendering visibly is what makes the post-ship
// campaign-rename pass self-auditing.
//
// ad_spend_daily has NO account column — account is DERIVED here, never stored
// on spend. Existing pre-convention campaign names will be renamed after this
// ships; ad_spend_daily is empty today, so index-2 parsing is correct for every
// row that will ever land in the table.

/** The four-account key space. The CHECK on ad_account_recharges.ad_account
 *  mirrors this list — adding an account = one entry here + a CHECK-extending
 *  migration (the themes.ts / app-icons.ts precedent). */
export type AdAccountKey = 'april' | 'gmr' | 'dubai';

export type AdAccount = {
  /** The index-2 campaign-key segment AND the stored ad_account value. */
  key:           AdAccountKey;
  /** What finance sees in the UI + the recharge dropdown. */
  displayName:   string;
  /** The Meta Ads Manager account id (documentation / cross-reference only —
   *  attribution is by `key`, never by this id). */
  metaAccountId: string;
};

// Ship exactly these three live accounts. "Indulge New Gen" is intentionally a
// documented placeholder, NOT shipped: the Meta account does not exist yet, so
// its key + id are TBD. Promoting it later is a ONE-LINE edit here plus a CHECK-
// extending migration (no other code change) — designed for exactly that:
//   { key: 'newgen', displayName: 'Indulge New Gen', metaAccountId: '<TBD>' }
export const AD_ACCOUNTS: readonly AdAccount[] = [
  { key: 'april', displayName: 'Indulge Global April 2023', metaAccountId: '1364122324409409' },
  { key: 'gmr',   displayName: 'Indulge GMR',               metaAccountId: '1300197968477104' },
  { key: 'dubai', displayName: 'Indulge Global Dubai',      metaAccountId: '944666504816724'  },
];

/** The visible bucket for any campaign whose account segment can't be resolved.
 *  Not an AdAccountKey — it never reaches the DB CHECK (recharges always pick a
 *  real account from AD_ACCOUNTS); it exists only on the read/report side. */
export const UNATTRIBUTED_ACCOUNT_KEY = 'unattributed' as const;
export const UNATTRIBUTED_ACCOUNT_LABEL = 'Unattributed';

export type AccountKeyOrUnattributed = AdAccountKey | typeof UNATTRIBUTED_ACCOUNT_KEY;

const AD_ACCOUNT_KEYS = new Set<string>(AD_ACCOUNTS.map((a) => a.key));

/** All four valid stored values for the recharge CHECK / Zod enum (NOT the
 *  Unattributed bucket — that is read-side only). */
export const AD_ACCOUNT_KEY_VALUES: readonly AdAccountKey[] = AD_ACCOUNTS.map((a) => a.key);

/** key → AdAccount lookup (display name resolution for report blocks). */
export const AD_ACCOUNT_MAP: Record<AdAccountKey, AdAccount> = AD_ACCOUNTS.reduce(
  (acc, a) => {
    acc[a.key] = a;
    return acc;
  },
  {} as Record<AdAccountKey, AdAccount>,
);

/**
 * Resolve the ad account that owns a campaign key.
 *
 * Splits the normalised key on "_" and matches index 2 against AD_ACCOUNTS.
 * No match (too few segments, unknown account token, null) → 'unattributed'.
 * Never throws, never guesses a real account.
 *
 * The input is expected to be already normalised (lowercase+trim) — every
 * stored campaign_key is, by the ad_spend_daily CHECK. We lowercase defensively
 * anyway so a raw display key can't slip an uppercase token past the match.
 */
export function resolveAccountFromCampaign(
  campaignKey: string | null,
): AccountKeyOrUnattributed {
  if (!campaignKey) return UNATTRIBUTED_ACCOUNT_KEY;
  const segment = campaignKey.toLowerCase().split('_')[2]?.trim();
  if (segment && AD_ACCOUNT_KEYS.has(segment)) {
    return segment as AdAccountKey;
  }
  return UNATTRIBUTED_ACCOUNT_KEY;
}

/** Display label for any resolved bucket (including Unattributed). */
export function accountLabel(key: AccountKeyOrUnattributed): string {
  if (key === UNATTRIBUTED_ACCOUNT_KEY) return UNATTRIBUTED_ACCOUNT_LABEL;
  return AD_ACCOUNT_MAP[key]?.displayName ?? key;
}
