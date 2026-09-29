-- 0252 — member.merge_members(): fold one member into another in ONE transaction, and
-- member.member_fk_children(): the tables that point at a member, read from the catalog.
--
-- Why (owner, 2026-09-29): Serene's member list must match the Subscription Manager one to one
-- (573 clients). The clean-up merges 21 records into the member they belong to (9 duplicates of
-- the same client, 12 second persons listed on someone else's membership). A merge touches many
-- tables, so it is one database function, never a sequence of calls from a script: it either
-- finishes whole or changes nothing. The same function serves any later duplicate (the
-- merge_vendors precedent, 0227).
--
-- merge_members(keep, drop, vault) does, in one transaction:
--   1. Locks both rows (in id order). Refuses when they are the same or missing, or when any
--      foreign key to member.members is not a single-column reference to its id (the loop below
--      could not move it, and the delete would drop its rows silently).
--   2. Takes the drop's vault items: they are sealed to the member id (utils/vault-crypto.ts), so
--      the caller re-seals each for the keeper and passes {id, ciphertext, nonce, key_version};
--      they are written here, and the merge refuses if any vault item of the drop was not passed.
--   3. Stamps every moved fact, anticipation and health event with where it came from
--      (evidence.merged_from = {member_id, full_name}): a second person's birthday or dietary note
--      stays recognisably theirs on the keeper.
--   4. Folds the drop's relations the keeper already holds into the keeper's row (evidence,
--      counts, strength, first and last seen) instead of dropping them; re-points relations whose
--      entity is the drop member to the keeper; clears the drop's snapshot when the keeper has one.
--   5. Points every row in every table with a foreign key to member.members at the keeper. The
--      tables are read from the catalog, so a table added later (the Jokers tables) is covered:
--      WhatsApp groups and contacts, Freshdesk contacts and tickets, facts, people, relations,
--      anticipations, health events, documents, intake cards, tickets, deals, the vendor ledger
--      (moving a ledger row's member on a merge is the merge_vendors precedent; the row itself is
--      unchanged). The keeper's own WhatsApp group stays its group when it still is.
--   6. Gives the keeper the drop's numbers as "Other numbers" (alt_phones; the keeper's main phone
--      never changes) and the drop's Freshdesk / Zoho / app / WhatsApp-invite identifiers where the
--      keeper has none; the drop's WHOLE row is kept on the keeper in import_raw.merged_from.
--   7. Deletes the drop.
-- The append-only logs that carry a member id without a foreign key (member_events,
-- member_access_log, member_vault_access, extraction_runs, ticket_events, elaya_alerts) are left
-- exactly as written (Rule 08): they stay the history of the old id.
--
-- member_fk_children() lets the clean-up script prove its backup covers every table a merge or a
-- removal changes (and see which ones block a delete) before it writes anything.
--
-- Both are service role only; nothing in the app calls them.

-- An earlier draft had a two-argument signature; make sure only this one exists.
DROP FUNCTION IF EXISTS member.merge_members(uuid, uuid);

CREATE OR REPLACE FUNCTION member.member_fk_children()
RETURNS TABLE (schema_name text, table_name text, column_name text, on_delete text, single_column_to_id boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT n.nspname::text, cl.relname::text, a.attname::text,
         CASE c.confdeltype WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null' WHEN 'r' THEN 'restrict'
                            WHEN 'a' THEN 'no action' WHEN 'd' THEN 'set default' END,
         (array_length(c.conkey, 1) = 1 AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
            WHERE attrelid = 'member.members'::regclass AND attname = 'id')])
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype = 'f' AND c.confrelid = 'member.members'::regclass AND c.conparentid = 0
   ORDER BY 1, 2, 3;
$$;

COMMENT ON FUNCTION member.member_fk_children() IS
  'Every table with a foreign key to member.members, with its ON DELETE rule: the clean-up script checks its backup covers each one and that none blocks a removal before it writes (0252). Service role only.';

CREATE OR REPLACE FUNCTION member.merge_members(p_keep uuid, p_drop uuid, p_vault jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  k       member.members%ROWTYPE;
  d       member.members%ROWTYPE;
  moved   jsonb := '{}'::jsonb;
  n       bigint;
  r       record;
  v       jsonb;
  phones  text[];
  origin  jsonb;
BEGIN
  IF p_keep IS NULL OR p_drop IS NULL OR p_keep = p_drop THEN
    RAISE EXCEPTION 'merge_members: two different member ids are required';
  END IF;
  IF EXISTS (SELECT 1 FROM member.member_fk_children() WHERE NOT single_column_to_id) THEN
    RAISE EXCEPTION 'merge_members: a foreign key to member.members is not a single-column reference to id; teach this function to move it first';
  END IF;

  -- Lock in a fixed order so two merges touching the same pair cannot deadlock.
  PERFORM 1 FROM member.members WHERE id IN (p_keep, p_drop) ORDER BY id FOR UPDATE;
  SELECT * INTO k FROM member.members WHERE id = p_keep;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_members: member % (to keep) not found', p_keep; END IF;
  SELECT * INTO d FROM member.members WHERE id = p_drop;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_members: member % (to merge away) not found', p_drop; END IF;
  origin := jsonb_build_object('member_id', d.id, 'full_name', d.full_name);

  -- Vault items, re-sealed for the keeper by the caller, move inside this transaction.
  FOR v IN SELECT * FROM jsonb_array_elements(coalesce(p_vault, '[]'::jsonb)) LOOP
    UPDATE member.member_vault
       SET member_id = p_keep, ciphertext = v->>'ciphertext', nonce = v->>'nonce', key_version = (v->>'key_version')::int
     WHERE id = (v->>'id')::uuid AND member_id = p_drop;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'merge_members: vault item % is not a vault item of member %', v->>'id', p_drop; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM member.member_vault WHERE member_id = p_drop) THEN
    RAISE EXCEPTION 'merge_members: member % still holds vault items that were not re-sealed for %', p_drop, p_keep;
  END IF;

  -- Whose it was: a moved fact, anticipation or health event says so in its evidence.
  UPDATE member.member_facts        SET evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('merged_from', origin) WHERE member_id = p_drop;
  UPDATE member.member_anticipations SET evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('merged_from', origin) WHERE member_id = p_drop;
  UPDATE member.member_health_events SET evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('merged_from', origin) WHERE member_id = p_drop;

  -- Relations the keeper already holds (UNIQUE member_id, entity_kind, entity_id, relation): fold, then drop the copy.
  UPDATE member.member_relations kr
     SET evidence       = coalesce(kr.evidence, '[]'::jsonb) || coalesce(dr.evidence, '[]'::jsonb),
         evidence_count = coalesce(kr.evidence_count, 0) + coalesce(dr.evidence_count, 0),
         strength       = greatest(kr.strength, dr.strength),
         first_seen_at  = least(kr.first_seen_at, dr.first_seen_at),
         last_seen_at   = greatest(kr.last_seen_at, dr.last_seen_at)
    FROM member.member_relations dr
   WHERE dr.member_id = p_drop AND kr.member_id = p_keep
     AND kr.entity_kind = dr.entity_kind AND kr.entity_id = dr.entity_id AND kr.relation = dr.relation;
  DELETE FROM member.member_relations dr
   USING member.member_relations kr
   WHERE dr.member_id = p_drop AND kr.member_id = p_keep
     AND kr.entity_kind = dr.entity_kind AND kr.entity_id = dr.entity_id AND kr.relation = dr.relation;
  -- Relations that point AT the drop as a member entity now point at the keeper (a self-relation is dropped).
  DELETE FROM member.member_relations x
   WHERE x.entity_kind = 'member' AND x.entity_id = p_drop::text
     AND (x.member_id = p_keep OR EXISTS (SELECT 1 FROM member.member_relations y
            WHERE y.member_id = x.member_id AND y.entity_kind = 'member' AND y.entity_id = p_keep::text AND y.relation = x.relation));
  UPDATE member.member_relations SET entity_id = p_keep::text WHERE entity_kind = 'member' AND entity_id = p_drop::text;

  IF EXISTS (SELECT 1 FROM member.member_snapshot WHERE member_id = p_keep) THEN
    DELETE FROM member.member_snapshot WHERE member_id = p_drop;
  END IF;

  -- Every foreign key to member.members (parent constraints only, so a partitioned table is updated once).
  FOR r IN SELECT schema_name, table_name, column_name FROM member.member_fk_children() LOOP
    EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2', r.schema_name, r.table_name, r.column_name, r.column_name)
      USING p_keep, p_drop;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN moved := moved || jsonb_build_object(r.schema_name || '.' || r.table_name || '.' || r.column_name, n); END IF;
  END LOOP;

  -- Re-pointing a WhatsApp group recomputes the keeper's group (most recently updated wins); the
  -- keeper's own group stays its group while it is still active and still linked to it.
  IF k.wa_group_jid IS NOT NULL AND EXISTS (SELECT 1 FROM sia.wag_groups g
        WHERE g.group_jid = k.wa_group_jid AND g.member_id = p_keep AND g.is_active) THEN
    UPDATE member.members SET wa_group_jid = k.wa_group_jid WHERE id = p_keep;
  END IF;

  -- The drop's numbers become the keeper's other numbers; the keeper's main phone stays.
  SELECT coalesce(array_agg(DISTINCT p ORDER BY p), '{}')
    INTO phones
    FROM unnest(coalesce(k.alt_phones, '{}') || coalesce(d.alt_phones, '{}') || ARRAY[d.primary_phone]) AS p
   WHERE p IS NOT NULL AND btrim(p) <> '' AND p IS DISTINCT FROM k.primary_phone;

  -- Free the drop's unique values before the keeper takes them.
  UPDATE member.members SET app_member_id = NULL, primary_phone = NULL WHERE id = p_drop;

  UPDATE member.members SET
    alt_phones           = phones,
    freshdesk_contact_id = coalesce(k.freshdesk_contact_id, d.freshdesk_contact_id),
    zoho_customer_id     = coalesce(k.zoho_customer_id, d.zoho_customer_id),
    app_member_id        = coalesce(k.app_member_id, d.app_member_id),
    wa_invite_link       = coalesce(k.wa_invite_link, d.wa_invite_link),
    sources              = (SELECT coalesce(array_agg(DISTINCT s ORDER BY s), '{}')
                              FROM unnest(coalesce(k.sources, '{}') || coalesce(d.sources, '{}')) AS s),
    import_raw           = coalesce(k.import_raw, '{}'::jsonb) || jsonb_build_object(
                             'merged_from',
                             coalesce(k.import_raw -> 'merged_from', '[]'::jsonb)
                               || jsonb_build_array(jsonb_build_object('member_id', d.id, 'row', to_jsonb(d), 'merged_at', now())))
  WHERE id = p_keep;

  DELETE FROM member.members WHERE id = p_drop;

  RETURN jsonb_build_object('kept', p_keep, 'merged', p_drop, 'moved', moved, 'other_numbers', to_jsonb(phones));
END;
$$;

COMMENT ON FUNCTION member.merge_members(uuid, uuid, jsonb) IS
  'Folds member p_drop into p_keep in one transaction: moves the drop''s vault items (re-sealed for the keeper by the caller, passed in p_vault), stamps moved facts/anticipations/health events with evidence.merged_from, folds duplicate relations, re-points every foreign-keyed row (from the catalog), keeps the keeper''s own WhatsApp group, moves the drop''s phones to alt_phones and its identifiers where the keeper has none, records the whole drop row in import_raw.merged_from, deletes the drop. Append-only logs keep the old id. Service role only (0252).';

REVOKE ALL ON FUNCTION member.member_fk_children() FROM PUBLIC;
REVOKE ALL ON FUNCTION member.member_fk_children() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION member.member_fk_children() TO service_role;
REVOKE ALL ON FUNCTION member.merge_members(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION member.merge_members(uuid, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION member.merge_members(uuid, uuid, jsonb) TO service_role;
