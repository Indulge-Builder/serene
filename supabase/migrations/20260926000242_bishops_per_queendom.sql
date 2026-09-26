-- 0242: a queendom can have more than one bishop.
--
-- Why: 0201 made queen, bishop and joker one seat each per queendom. The concierge floor runs
-- two bishops in a queendom (Anishqa and Ananyshree already have two in their WhatsApp groups),
-- so the one-bishop index refused the second: the Create form said "That seat is already held"
-- and the Authorization card failed on the same index. Decided 2026-09-26: bishops are many,
-- like genies. The queen and the joker stay one seat each.
--
-- What: drop the one-bishop partial unique index. Nothing else in the database counts bishops
-- (no trigger, function, policy or CHECK does) and the allowed sia_role values do not change.
-- The app reads bishops as a list from the same change (queendom-seats.ts, the Team roster, the
-- member dossier, the ticket sentinel, the intake notification), so the order of deploy and
-- migration does not matter: before this runs, a second bishop is still refused, with the same
-- "seat already held" message.

DROP INDEX IF EXISTS public.idx_profiles_one_bishop_per_queendom;
