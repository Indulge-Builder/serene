-- Backfill leads.utm_campaign to the account-bearing naming convention.
--
-- Context (2026-06-24): campaign keys gain a third segment carrying the Meta ad
-- ACCOUNT (april/gmr/dubai) — TG_<Domain>_<Account>_<Type>_<Date> — so the budget
-- page can attribute spend via resolveAccountFromCampaign (lib/constants/ad-accounts.ts,
-- index-2 segment). Meta campaigns were renamed IN PLACE, so new leads already arrive
-- with the new names; this migration rewrites EXISTING leads (active AND archived) to
-- the SAME new name so old + new leads merge into one campaign on /campaigns and /budget.
--
-- Source of truth: the reviewed mapping in final.csv (root), validated row-by-row against
-- live data 2026-06-24. Mappings where old = new are no-ops (campaigns already renamed).
-- Several old names map to ONE new name = intentional merges (e.g. the Goa Resort typo'd
-- name + the canonical one; the 6 Bogey golf rows; the 4 Meta ad-set-id leaks the user
-- verified against Meta as belonging to the named campaigns).
--
-- Non-Meta traffic (Organic, '/', Google Search 'TG-(Leads|Search)-*', 'Google Ads',
-- 'meta_luxury_new') is deliberately left WITHOUT an account segment → resolves to
-- "Unattributed" on the budget page, which is the honest result.
--
-- Isolated write: utm_campaign has no FK, no generated-column dependency (search_text
-- excludes it), and the only UPDATE trigger is updated_at. trg_lead_slug is INSERT-only,
-- so slugs are untouched. Safe to bulk-update.
--
-- NOT idempotent by design: re-running is a no-op only because each WHERE keys off the
-- OLD name, which no longer exists after the first run. The post-update DO block asserts
-- zero old names survive.

BEGIN;

-- One mapping table, applied as a single UPDATE ... FROM (set-based, atomic).
WITH mapping(old_name, new_name) AS (VALUES
  -- ── CLEAN: insert account segment (april/gmr/dubai) ───────────────────────────
  ('TG_Shop_APxSwatch_15 May',                              'TG_Shop_April_APxSwatch_15 May'),
  ('TG_Global_LP_27th April',                               'TG_Global_April_LP_27th April'),
  ('TG_Global_Lead Gen_30 April',                           'TG_Global_April_Lead Gen_30 April'),
  ('TG_Global_Lead Gen_7th May_GMR 1',                      'TG_Global_GMR_Lead Gen_7th May_GMR 1'),
  ('TG_Global_New LP_TOFU_5th March',                       'TG_Global_April_New LP_TOFU_5th March'),
  ('TG_Global_Lead Gen Lookalike_26th Nov',                 'TG_Global_April_Lead Gen Lookalike_26th Nov'),
  ('TG_Global_New LP_TOFU_24th Nov',                        'TG_Global_April_New LP_TOFU_24th Nov'),
  ('TG_Global_Lead Gen_7th May_GMR 2',                      'TG_Global_GMR_Lead Gen_7th May_GMR 2'),
  ('TG_Global_LP_24 March',                                 'TG_Global_April_LP_24 March'),
  ('TG_Global_Lead Gen_8 June',                             'TG_Global_April_Lead Gen_8 June'),
  ('TG_Global_LP_12th May',                                 'TG_Global_April_LP_12th May'),
  ('TG_Global_9/Jan_Lead Gen_New Reel',                     'TG_Global_April_9/Jan_Lead Gen_New Reel'),
  ('TG_Dubai_Lead Gen_21 April',                            'TG_Global_Dubai_Lead Gen_21 April'),
  ('TG_Global_Lead Gen_29 April',                           'TG_Global_April_Lead Gen_29 April'),
  ('TG_Global_LP_30 April',                                 'TG_Global_April_LP_30 April'),
  ('TG_Global_LP_Rich Kids of India_13 May',               'TG_Global_April_LP_Rich Kids of India_13 May'),
  ('TG_Global_9/Jan_ Landing page (CEO-Static)',           'TG_Global_April_9/Jan_ Landing page (CEO-Static)'),
  ('TG_Global_Lead_BOFU_20 April',                          'TG_Global_April_Lead_BOFU_20 April'),
  ('TG_Global_Lead Gen_23 April',                           'TG_Global_April_Lead Gen_23 April'),
  ('TG_Shop_Lead_Gen_Indulge Shop (21 April)',             'TG_Shop_April_Lead_Gen_Indulge Shop (21 April)'),
  ('TG_Global_Advantage+_14th May',                         'TG_Global_April_Advantage+_14th May'),
  ('TG_Global_Dubai AIDA BOFU_8 April',                     'TG_Global_Dubai_AIDA BOFU_8 April'),
  ('TG_Global_Lead gen_BOFU_15th April',                    'TG_Global_April_Lead gen_BOFU_15th April'),
  ('TG_House_Meta Leads_Indulge House_Pickle ball_1st Oct','TG_House_April_Meta Leads_Indulge House_Pickle ball_1st Oct'),
  ('TG_Global_Lead Gen_7th May_GMR 3',                      'TG_Global_GMR_Lead Gen_7th May_GMR 3'),
  ('TG_Legacy_Lead Gen 19 January',                         'TG_Legacy_April_Lead Gen 19 January'),
  ('TG_Global_Lead Gen_26 May',                             'TG_Global_April_Lead Gen_26 May'),
  ('TG_Global_LP_4th May (Thank you page tracking)',       'TG_Global_April_LP_4th May (Thank you page tracking)'),
  ('TG_Shop_Lead_12th May',                                 'TG_Shop_April_Lead_12th May'),
  ('TG_Global_Lead Gen_24 April(Pin code+Interest)',       'TG_Global_April_Lead Gen_24 April(Pin code+Interest)'),
  ('TG_Global_Lead Gen_5 June',                             'TG_Global_April_Lead Gen_5 June'),
  ('TG_Global_Lead Gen_17 June',                            'TG_Global_April_Lead Gen_17 June'),
  ('TG_Global_Dubai- 18 March',                             'TG_Global_Dubai_18 March'),
  ('TG_Global_ LP_25th Feb',                                'TG_Global_April_LP_25th Feb'),
  ('TG_Dubai_Lead Gen_16 June',                             'TG_Global_Dubai_Lead Gen_16 June'),
  ('TG_Global_Advantage +',                                 'TG_Global_April_Advantage +'),
  ('TG_Global_Lead Gen_7th May',                            'TG_Global_April_Lead Gen_7th May'),
  ('TG_Global_LP_5th March',                                'TG_Global_April_LP_5th March'),
  ('TG_Global_Members LP_Mumbai_31 March',                 'TG_Global_April_Members LP_Mumbai_31 March'),
  ('TG_Global_9/Jan_ LP (CEO-Static)',                     'TG_Global_April_9/Jan_ LP (CEO-Static)'),
  ('TG_Global_Lead form_19th May (Job Titles Interest)',   'TG_Global_April_Lead form_19th May (Job Titles Interest)'),
  ('TG_Global_AIDA BOFU_13th April',                        'TG_Global_April_AIDA BOFU_13th April'),
  ('TG_Global_Lead Gen_20th May',                           'TG_Global_April_Lead Gen_20th May'),
  ('TG_Dubai_Advantage+_21 April',                          'TG_Global_Dubai_April_Advantage+_21 April'),
  ('TG_Global_LP_AIDA BOFU_15th April',                    'TG_Global_April_LP_AIDA BOFU_15th April'),
  ('TG_Global_LP_22 April – Copy',                          'TG_Global_April_LP_22 April – Copy'),
  ('TG_Global_LP_6th March',                                'TG_Global_April_LP_6th March'),
  ('TG_Global_New',                                         'TG_Global_April_New'),
  ('TG_Global_Lead Gen_24 April( HNI codes)',              'TG_Global_April_Lead Gen_24 April( HNI codes)'),
  ('TG_Global_Members LP_Mumbai_17th April',               'TG_Global_April_Members LP_Mumbai_17th April'),

  -- ── IRREGULAR: structure corrected to TG_<Domain>_<Account>_... ───────────────
  -- Goa Resort: the typo'd 'TG_Meta Leads_...' (160) + canonical 'TG_House_Meta Leads_...'
  -- (84) both map to ONE name → 244 leads merge into one campaign.
  ('TG_Meta Leads_Goa Resort_Indulge House_15th Sept',     'TG_House_April_Meta Leads_Goa Resort_15th Sept'),
  ('TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept','TG_House_April_Meta Leads_Goa Resort_15th Sept'),
  ('TG_Meta Leads_Indulge House_Pickle ball_1st Oct',      'TG_House_April_Meta Leads_Indulge House_Pickle ball_1st Oct'),
  ('TG_Lead_Gen_Indulge Shop (6 Jan)',                     'TG_Shop_April_Lead_Gen_Indulge Shop (6 Jan)'),
  ('TG_Lead_Gen_Indulge Shop (21 April)',                  'TG_Shop_April_Lead_Gen_Indulge Shop (21 April)'),
  ('TG_Indulge Legacy_Lead Gen 19 January',                'TG_Legacy_April_Lead Gen 19 January'),
  ('TG_LP_Indulge Shop (10 April)',                        'TG_Shop_April_LP_Indulge Shop (10 April)'),

  -- ── Meta ad-set-id leaks (user verified each id IS the named campaign) ────────
  ('120247313999430079',                                   'TG_Global_April_Lead Gen_24 April(Pin code+Interest)'),
  ('120246752842820079',                                   'TG_Global_April_Lead gen_BOFU_15th April'),
  ('120247034422660079',                                   'TG_Global_April_Lead_BOFU_20 April'),
  ('120249458503190079',                                   'TG_Global_April_Lead Gen_26 May'),

  -- ── '/' folded into Organic; 'Advantage + Pro' → April per the reviewed file ──
  ('/',                                                    'Organic'),
  ('Advantage + Pro',                                      'TG_Global_April_Advantage + Pro'),
  ('Google Ads',                                           'Google_Ads'),

  -- ── Bogey golf events: 6 rows → ONE name (intentional merge) ──────────────────
  ('Bogey Buddies , Golf Awards, 12 th April , DLF Golf Pavilion Club, Gurgaon',     'Bogey Buddies_Golf Awards_12th April_DLF Golf Pavilion Club_Gurgaon'),
  ('Bogey Buddies , Season 2, Golf Tournament',                                      'Bogey Buddies_Golf Awards_12th April_DLF Golf Pavilion Club_Gurgaon'),
  ('Bogey Buddies Golf Tournament - DLF Golf Club, Gurgaon',                         'Bogey Buddies_Golf Awards_12th April_DLF Golf Pavilion Club_Gurgaon'),
  ('Bogey Buddies Golf Tournament Awards, DLF Golf Pavilion Club, 12 th April -Sunday','Bogey Buddies_Golf Awards_12th April_DLF Golf Pavilion Club_Gurgaon'),
  ('Bogey Buddies Season 2- Golf Tournament',                                        'Bogey Buddies_Golf Awards_12th April_DLF Golf Pavilion Club_Gurgaon'),
  ('Bogey Golf Tournament Awards, DLF Golf Pavilion Club, 12 th April, Sunday , Gurgaon','Bogey Buddies_Golf Awards_12th April_DLF Golf Pavilion Club_Gurgaon')

  -- NOTE: deliberately NOT remapped (left as-is → Unattributed, the honest result):
  --   Organic, TG-Leads-Search-Brand-Indulge, TG-Leads-Search-Indulge,
  --   TG-Remarketing-Dec25, TG-Search-Leads-indulge, TG-Search-Leads-Brand-indulge,
  --   meta_luxury_new
  -- and every row whose old name already equals its new name (campaign already renamed).
)
UPDATE public.leads l
SET utm_campaign = m.new_name
FROM mapping m
WHERE l.utm_campaign = m.old_name
  AND l.utm_campaign IS DISTINCT FROM m.new_name;  -- skip no-op self-maps

-- Assert no mapped OLD name survives (every targeted row was rewritten).
DO $$
DECLARE
  leftover int;
BEGIN
  SELECT count(*) INTO leftover
  FROM public.leads
  WHERE utm_campaign IN (
    'TG_Shop_APxSwatch_15 May','TG_Global_LP_27th April','TG_Global_Lead Gen_30 April',
    'TG_Global_Lead Gen_7th May_GMR 1','TG_Global_New LP_TOFU_5th March',
    'TG_Global_Lead Gen Lookalike_26th Nov','TG_Global_New LP_TOFU_24th Nov',
    'TG_Global_Lead Gen_7th May_GMR 2','TG_Global_LP_24 March','TG_Global_Lead Gen_8 June',
    'TG_Global_LP_12th May','TG_Global_9/Jan_Lead Gen_New Reel','TG_Dubai_Lead Gen_21 April',
    'TG_Global_Lead Gen_29 April','TG_Global_LP_30 April','TG_Global_LP_Rich Kids of India_13 May',
    'TG_Global_9/Jan_ Landing page (CEO-Static)','TG_Global_Lead_BOFU_20 April',
    'TG_Global_Lead Gen_23 April','TG_Shop_Lead_Gen_Indulge Shop (21 April)',
    'TG_Global_Advantage+_14th May','TG_Global_Dubai AIDA BOFU_8 April',
    'TG_Global_Lead gen_BOFU_15th April','TG_House_Meta Leads_Indulge House_Pickle ball_1st Oct',
    'TG_Global_Lead Gen_7th May_GMR 3','TG_Legacy_Lead Gen 19 January','TG_Global_Lead Gen_26 May',
    'TG_Global_LP_4th May (Thank you page tracking)','TG_Shop_Lead_12th May',
    'TG_Global_Lead Gen_24 April(Pin code+Interest)','TG_Global_Lead Gen_5 June',
    'TG_Global_Lead Gen_17 June','TG_Global_Dubai- 18 March','TG_Global_ LP_25th Feb',
    'TG_Dubai_Lead Gen_16 June','TG_Global_Advantage +','TG_Global_Lead Gen_7th May',
    'TG_Global_LP_5th March','TG_Global_Members LP_Mumbai_31 March','TG_Global_9/Jan_ LP (CEO-Static)',
    'TG_Global_Lead form_19th May (Job Titles Interest)','TG_Global_AIDA BOFU_13th April',
    'TG_Global_Lead Gen_20th May','TG_Dubai_Advantage+_21 April','TG_Global_LP_AIDA BOFU_15th April',
    'TG_Global_LP_22 April – Copy','TG_Global_LP_6th March','TG_Global_New',
    'TG_Global_Lead Gen_24 April( HNI codes)','TG_Global_Members LP_Mumbai_17th April',
    'TG_Meta Leads_Goa Resort_Indulge House_15th Sept','TG_House_Meta Leads_Goa Resort_Indulge House_15th Sept',
    'TG_Meta Leads_Indulge House_Pickle ball_1st Oct','TG_Lead_Gen_Indulge Shop (6 Jan)',
    'TG_Lead_Gen_Indulge Shop (21 April)','TG_Indulge Legacy_Lead Gen 19 January',
    'TG_LP_Indulge Shop (10 April)','120247313999430079','120246752842820079',
    '120247034422660079','120249458503190079','/','Advantage + Pro','Google Ads',
    'Bogey Buddies , Golf Awards, 12 th April , DLF Golf Pavilion Club, Gurgaon',
    'Bogey Buddies , Season 2, Golf Tournament',
    'Bogey Buddies Golf Tournament - DLF Golf Club, Gurgaon',
    'Bogey Buddies Golf Tournament Awards, DLF Golf Pavilion Club, 12 th April -Sunday',
    'Bogey Buddies Season 2- Golf Tournament',
    'Bogey Golf Tournament Awards, DLF Golf Pavilion Club, 12 th April, Sunday , Gurgaon'
  );
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'campaign backfill incomplete: % leads still carry an old name', leftover;
  END IF;
END $$;

COMMIT;
