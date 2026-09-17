-- 0204 — sia.wag_contacts.participant_role learns 'joker'.
--
-- Why: 0201 gave profiles the Sia position vocabulary queen / bishop / genie / joker, but the
-- WhatsApp contacts table (0169) still checks the older list without joker. Shruti Lunkad,
-- head of the Jokers, sits in 465 client groups and would otherwise stay 'unknown' in every
-- one of them — and an unknown member blocks profiling (plan-whatsapp §8).

ALTER TABLE sia.wag_contacts DROP CONSTRAINT wag_contacts_participant_role_check;
ALTER TABLE sia.wag_contacts ADD CONSTRAINT wag_contacts_participant_role_check
  CHECK (participant_role IN
    ('client','genie','bishop','queen','joker','founder','vendor','watcher','unknown'));

COMMENT ON COLUMN sia.wag_contacts.participant_role IS
  'OUR vocabulary (checked): who this JID is for Indulge. joker added 0204 to match the '
  'profile positions of 0201. unknown = unmapped; a group with unknown members stays '
  'BLOCKED from profiling (plan-whatsapp §8, the meaning layer).';
