-- 0236 — The member vault: card and identity-document details, encrypted, revealed on record.
--
-- Why: the concierge team books on members' behalf with the member's own card, passport, Aadhaar
-- or PAN. Today those sit as PLAIN TEXT notes on Freshdesk contacts (114 such notes in the
-- 2026-09-24 export, some with the CVV). Serene is replacing Freshdesk, so the same ability has
-- to exist here, and it has to be safer than where it is now (founder, 2026-09-24).
--
-- How it is safer:
--   1. The secret is encrypted in the APP (AES-256-GCM, src/lib/utils/vault-crypto.ts) with a key
--      that lives only in the app's environment (MEMBER_VAULT_KEY). This database, its backups and
--      its dumps hold ciphertext only; the service role alone cannot read a card number.
--   2. Row level security with NO policy for signed-in users: a session client, Elaya's read door
--      and every export see nothing. Only the service role, behind the gated actions, touches rows.
--   3. Every reveal, add and delete is an append-only row in member_vault_access with who and why.
--   4. Nothing here is ever loaded into a member dossier, a tool result or a model prompt.
--
-- The plain columns (label, hint = last four digits, expires_on) are what staff need to pick
-- the right card without opening it. A last-four and an expiry are not sensitive authentication
-- data; the number and the CVV are, and they live only inside the ciphertext.
--
-- Also here: member_facts.source gains 'freshdesk_note' for the contact-notes import.

CREATE TABLE member.member_vault (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid        NOT NULL REFERENCES member.members(id) ON DELETE CASCADE,
  kind         text        NOT NULL CHECK (kind IN ('card', 'aadhaar', 'passport', 'pan', 'driving_licence', 'other_id', 'other')),
  label        text        NOT NULL,              -- "HDFC Visa", "Passport", the Freshdesk note title: never the number
  hint         text,                              -- last four digits, or nothing
  expires_on   date,                              -- a card's expiry month (stored as its first day); allowed in the clear
  ciphertext   text        NOT NULL,              -- base64, AES-256-GCM (the tag appended)
  nonce        text        NOT NULL,              -- base64, 12 bytes, unique per row
  key_version  integer     NOT NULL DEFAULT 1,
  source       text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'freshdesk_note')),
  source_ref   text,                              -- the Freshdesk note id, so a re-import never doubles a row
  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_vault_source_ref_unique UNIQUE (source, source_ref)
);
CREATE INDEX idx_member_vault_member ON member.member_vault (member_id, created_at DESC);
CREATE TRIGGER member_vault_updated_at BEFORE UPDATE ON member.member_vault
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE member.member_vault IS
  'Encrypted card and identity-document details. ciphertext/nonce are AES-256-GCM under MEMBER_VAULT_KEY (app env, never in the database). '
  'No RLS policy for authenticated on purpose: only the service role reads, behind the gated actions, and every reveal is logged.';

CREATE TABLE member.member_vault_access (
  id          bigserial   PRIMARY KEY,
  item_id     uuid        NOT NULL,               -- soft: the log outlives the item
  member_id   uuid        NOT NULL,
  actor_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      text        NOT NULL CHECK (action IN ('reveal', 'add', 'delete', 'import')),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_member_vault_access_member ON member.member_vault_access (member_id, created_at DESC);
CREATE INDEX idx_member_vault_access_actor  ON member.member_vault_access (actor_id, created_at DESC);

ALTER TABLE member.member_vault        ENABLE ROW LEVEL SECURITY;
ALTER TABLE member.member_vault_access ENABLE ROW LEVEL SECURITY;

-- The vault itself: no policy at all for signed-in users. The access trail: admin and founder read it.
CREATE POLICY member_vault_access_select ON member.member_vault_access FOR SELECT TO authenticated
  USING ((SELECT get_user_role()) IN ('admin', 'founder'));

REVOKE ALL ON member.member_vault FROM authenticated, anon;
GRANT SELECT ON member.member_vault_access TO authenticated;
GRANT ALL ON member.member_vault, member.member_vault_access TO service_role;
GRANT USAGE, SELECT ON SEQUENCE member.member_vault_access_id_seq TO service_role;

-- member_facts.source: the contact-notes import is its own source, so it can be told apart,
-- measured and, if ever needed, retired as one set.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'member.member_facts'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%source%agent_note%'
  LOOP EXECUTE format('ALTER TABLE member.member_facts DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE member.member_facts ADD CONSTRAINT member_facts_source_check CHECK (source IN (
  'agent_note', 'typeform', 'atlas', 'freshdesk_contact', 'freshdesk_ticket', 'freshdesk_note',
  'whatsapp_group', 'ticket', 'app_taste', 'app_behaviour', 'import'));

NOTIFY pgrst, 'reload schema';
