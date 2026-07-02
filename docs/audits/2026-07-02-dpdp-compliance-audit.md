# DPDP Compliance Audit — Serene vs the Digital Personal Data Protection Act, 2023 + DPDP Rules, 2025

**Date:** 2026-07-02 · **Audience:** Founder + engineering · **Scope:** entire Serene codebase (ingestion, storage, external data flows, security, retention, rights) mapped against the DPDP Act, 2023 (22 of 2023) and the DPDP Rules, 2025 (G.S.R. 846(E), gazetted 13/14 Nov 2025) + the PIB backgrounder of 17 Nov 2025

> **Method:** 4 parallel deep-readers swept the actual code — (1) personal-data inventory + ingestion points, (2) external processors + cross-border surface, (3) Rule-6 security safeguards, (4) retention/erasure/Data-Principal rights. Findings were consolidated and rule citations verified against the gazette text.
>
> **Status:** engineering compliance analysis, **not legal advice**. Two positions in particular need counsel sign-off before being relied on: the s.7(a) legitimate-use reading for Meta lead-ads ingestion, and anonymisation-as-erasure for the append-only tables.

---

## 1. Executive Summary

**Serene is not yet DPDP-compliant, but starts from a strong base.** The security architecture already satisfies most of Rule 6 (access control, input hygiene, write-audit trails, secret handling, data-minimisation instincts like PII masking before the LLM and in-memory-only audio). What is missing is essentially all of the **Data-Principal-facing statutory machinery**: consent/lawful-basis records, breach intimation, erasure capability, a rights/grievance workflow, retention schedules, processor-contract tracking, and read-access visibility.

**The clock:** Rules 3, 5–16, 22 and 23 — everything substantive for a private Data Fiduciary — come into force **18 months after gazette publication ≈ 14 May 2027** (Rule 1(4)). Rules 1, 2, 17–21 (Board machinery) are already in force; Rule 4 (Consent Manager registration — N/A to Indulge) starts ~Nov 2026. As of this audit there are **~10.5 months** to the substantive commencement.

**Penalty exposure (Act, Schedule; per PIB backgrounder):** up to **₹250 crore** for failure of reasonable security safeguards; up to **₹200 crore** each for failure to notify breaches and for children-related violations; up to **₹50 crore** for any other violation.

Severity-ordered headline gaps:

1. **Erasure is structurally impossible** — no lead delete path exists; 10 append-only tables hold PII immutably (G-01).
2. **No breach-notification capability** — no runbook, no templates, no 72-hour Board workflow (G-02).
3. **No consent / lawful-basis / opt-out records** at any ingestion point; no WhatsApp STOP handling (G-03).
4. **Rights machinery incomplete** — partial access/correction, no erasure, no grievance channel, no nomination (G-04).
5. **Rule-6 residuals** — zero read-access logging, undocumented backups/DR, no processor-contract registry (G-05…G-07).
6. **Cross-border posture unverified** — hosting regions are literally `TODO: verify` in the ops docs (G-08).

---

## 2. Legal framework applied

### 2.1 Commencement (Rule 1)

| Rules | In force |
| --- | --- |
| 1, 2, 17–21 (definitions, Board appointments/ops) | 14 Nov 2025 (already live) |
| 4 (Consent Manager registration) | ~14 Nov 2026 — **N/A to Indulge** (registration regime for consent-manager companies) |
| **3, 5–16, 22, 23** (notice, security, breach, retention, children, SDF, rights, cross-border, appeals, information calls) | **~14 May 2027** |

### 2.2 Role mapping

| DPDP role | Who |
| --- | --- |
| **Data Fiduciary** | Indulge — determines purpose/means of processing lead + customer personal data; Serene is its internal instrument |
| **Data Principals** | Leads/customers (primary exposure) and employees (lower exposure — Act s.7(i) "employment purposes" legitimate use covers most staff processing) |
| **Data Processors** | Supabase (DB/auth/storage), Vercel (hosting/lambda logs), Upstash (Redis cache), Anthropic (Elaya LLM), Deepgram (voice transcription), Gupshup (WhatsApp BSP), Trigger.dev (job queue), Pabbly (lead-form middleware), browser push services (FCM/APNs/Mozilla) |

### 2.3 What does NOT apply (do not over-build)

- **Third Schedule erasure clocks** (3-year auto-erasure + 48h pre-erasure notice, Rule 8(1)–(2)) — only e-commerce ≥2 crore registered users, online gaming ≥50 lakh, social media ≥2 crore. Indulge is none of these. The general storage-limitation duty (Act s.8(7)) still applies.
- **Rule 4 Consent Managers** — Indulge is not becoming one.
- **Rule 5 / Second Schedule** — State processing.
- **Rule 13 Significant Data Fiduciary duties** (annual DPIA + audit, algorithmic due-diligence report to Board, committee-specified data localisation) — only if the Central Government notifies Indulge as an SDF; unlikely at current scale, but note Elaya would fall under the 13(3) "algorithmic software" due-diligence duty if that ever happens.
- **Rules 10–12 children's provisions** — no child-directed services and no reason to process minors' data; risk is low but the position is undocumented (G-09).

### 2.4 Lawful-basis nuance for leads

A person submitting a Meta lead-ad form asking to be contacted is arguably **s.7(a) legitimate use** (personal data voluntarily provided for a specified purpose) — a consent notice is not mandatory for *that* purpose. But: (a) access/correction/erasure rights **still attach** to s.7(a) processing; (b) anything beyond the original purpose — promotional sends, long-dormant revival outreach, cross-domain reuse — drifts back into consent (s.6) territory, which requires Rule-3 notice + withdrawal-as-easy-as-giving. Today the codebase records **no lawful basis at all** for any lead.

---

## 3. Personal-data inventory (summary)

Full sweep of `src/lib/types/database.ts` + migrations. Customer/lead data is the high-sensitivity set.

| Data | Where it lives | Notes |
| --- | --- | --- |
| Lead identity: name, phone (E.164), email, city, `form_data`/`personal_details` JSONB, attribution | `leads` | Soft-archive only (`archived_at`); **no delete path anywhere**; `form_data` stored as-is beyond extracted fields |
| Raw ingestion payloads (full webhook body incl. name/phone/email/form fields) | `lead_raw_payloads` | Append-only, retained **indefinitely** (deliberate — security audit F-5); only Meta page token (`res2`) stripped |
| Lead behavioural history | `lead_activities`, `lead_notes`, `task_gia_meta`, `revival_candidates` | Append-only (activities/notes); notes may quote customer context verbatim |
| WhatsApp conversations | `whatsapp_conversations`, `whatsapp_messages` (+ `whatsapp-media` private bucket) | Full transcript retained indefinitely; append-only (narrow delivery-receipt UPDATE exception) |
| Deal contacts | `deals` (`contact_name/phone/email`) | May differ from lead identity |
| Notification audit | `whatsapp_notification_logs` | Phone stored **last-4 only** (good); `lead_name`/`agent_name` plaintext |
| Employee identity | `profiles`, `profile_audit_log` | Never deleted — deactivate only (`is_active`) |
| Elaya transcripts + action ledger | `elaya_conversations`, `elaya_messages`, `elaya_actions` | 24h *session* expiry, but messages persist forever **unmasked** (masking is applied at the model boundary, not at rest) |
| Device push endpoints | `push_subscriptions` | Owner-deletable; dead endpoints (404/410) auto-pruned |
| Staff presence telemetry | `usage_heartbeats` (pruned at 30 days), `usage_daily` (forever) | Minimal PII (user_id + timestamps) |

**Ephemeral layer:** Upstash Redis caches lead rows/lists/notes/activities/tasks in plaintext JSON with 30s–120s TTLs (helpdesk 1hr, presence ~150s) — working memory, not a system of record.

---

## 4. Ingestion points × lawful basis

| Entry point | Fields captured | Hygiene | Lawful basis / consent recorded |
| --- | --- | --- | --- |
| `POST /api/webhooks/leads` (Meta/Pabbly) | name, phone, email, city, `form_data`, UTM/attribution, interests | Zod + `normalizeToE164` + `sanitizeText`; rate-limited 100/60s; timing-safe bearer secret | **None** — no consent flag parsed from Meta forms, no basis stamped |
| `POST /api/webhooks/whatsapp` (Gupshup inbound) | phone, sender name, message text, media | E.164 + `sanitizeText`; media re-stored durably; 300/60s; secret header | Implicit (customer-initiated) — but **no STOP/opt-out handling**, no `do_not_contact` flag exists |
| Manual lead creation (`createManualLead`) | name, phone, email, domain | Zod + E.164 + sanitize | **None** — staff-entered without the person's knowledge |
| Walk-in deal (`recordDeal` / walk-in) | contact name/phone/email | Zod + E.164 | Implied (transactional) |
| Admin user creation / profile edit | email, name, phone, role | Zod + sanitize | s.7(i) employment — acceptable |
| Voice dictation (`transcribeAudioAction`) | audio → Deepgram → text draft | In-memory only; audio never persisted (D-01) | No disclosure that audio goes to a third party |
| Elaya chat (in-app SSE + WhatsApp staff channel) | staff prompts + tool results carrying lead PII | `maskPii()` before every model call | No processor disclosure; transcripts persist unmasked |

---

## 5. Data-Processor map (Act s.8(2) + Rule 6(f) + Rule 15 surface)

| Processor | Personal data received | Minimisation applied | Region evidence | DPA tracked? |
| --- | --- | --- | --- | --- |
| **Supabase** | Everything (system of record + auth + media) | RLS; at-rest encryption assumed (provider) | **Unknown** — not recorded | ❌ |
| **Vercel** | All HTTP traffic incl. webhook lead payloads; lambda logs | None (framework logging not PII-filtered) | Unknown (multi-region default) | ❌ |
| **Anthropic** | Masked lead rows/notes/tasks per turn | `maskPii()` — but default depth `light`: **names pass through**, phone last-4, email partially masked; strict depth still shows names (vault deferred) | US assumed | ❌ |
| **Deepgram** | Raw voice audio (biometric-adjacent; cannot be pre-masked) | In-memory transcribe-and-discard; zero-retention vendor terms **asserted in comments, not verified** | Unknown | ❌ |
| **Gupshup** | Full lead name + phone in template params and free-form sends | Log table stores phone last-4 (write-time truncation) | India assumed (BSP) | ❌ |
| **Upstash Redis** | Plaintext lead rows/notes/activities (30–120s TTL) | Short TTLs; explicit invalidation | Unknown | ❌ |
| **Trigger.dev** | IDs + timestamps only in payloads (good); PII flows at fire-time via Gupshup callbacks | Payload minimisation by design | Unknown | ❌ |
| **Pabbly** | Full lead form submissions (inbound middleman) | — | Unknown | ❌ |
| **Push services** | Device endpoints + notification titles/bodies | Owner-scoped; dead-endpoint pruning | Browser-dependent | n/a |

`docs/operations/deployment.md` contains an explicit `TODO: verify` for Vercel/Supabase/Upstash regions. `.env.example` is also incomplete vs the real env surface (flagged in `docs/operations/environments.md`) — the processor list cannot currently be derived from the repo.

---

## 6. Rule-by-rule findings

### Rule 3 — Notice ❌
No notice text, consent record, privacy-policy route, or withdrawal mechanism exists anywhere (grep: zero hits for consent/opt-in/opt-out/DND across `src/`). Required whenever processing rests on consent: standalone, itemised description of the personal data, specified purpose, and links to withdraw consent / exercise rights / complain to the Board — withdrawal as easy as the giving.

### Rule 6 — Reasonable security safeguards (₹250cr tier)

| Sub-rule | Status | Evidence |
| --- | --- | --- |
| 6(a) security measures | ✅ partial | TLS everywhere; Supabase at-rest (provider); secrets server-only + timing-safe compares (`src/lib/utils/webhook.ts`); `sanitizeText`/E.164; **no field-level encryption; CSV exports not redacted** |
| 6(b) access control | ✅ strong | `requireProfile()` on every action (`src/lib/actions/_auth.ts`); RLS on all ~43 tables with `get_user_role()`/`get_user_domain()`; admin-client bypass surface enumerated and confined to webhooks/jobs/fan-out |
| 6(c) access **visibility** | ❌ absent | Writes fully audited (actor + timestamp, append-only); **reads never logged** — no record of who viewed a lead/dossier/conversation; no monitoring/alerting |
| 6(d) continuity/backups | ❌ undocumented | Supabase PITR assumed; no backup window, RPO/RTO, or restore procedure anywhere in `docs/operations/` |
| 6(e) 1-year log retention | ✅ de facto | Everything is retained indefinitely (exceeds the floor) — but no written policy prevents a future pruning job from violating it |
| 6(f) processor-contract provisions | ❌ | No DPA registry; vendor terms invisible to the repo |
| 6(g) tech + org measures | ⚠️ | Strong technical set; missing incident-response and processor-oversight procedures |

Rate limits confirmed: leads webhook 100/60s, WhatsApp 300/60s, Elaya chat 20/60s.

### Rule 7 — Breach intimation ❌ (₹200cr tier)
Required: intimate **each affected Data Principal without delay** (plain-language description, consequences, mitigation, self-protection steps, contact person) via their registered channel, and the **Board** — description without delay, full detail (facts, mitigation, culprit findings, remediation, principal-intimation report) **within 72 hours**. Nothing exists: no runbook, no templates, no affected-principal enumeration tool. The forensic raw material (append-only audit tables) and delivery rails (Gupshup/in-app) already exist — the workflow doesn't.

### Act s.8(7) + Rule 8 — Storage limitation / erasure ❌
Third Schedule clocks don't apply (see §2.3), but s.8(7) requires erasure once the purpose is no longer served unless law requires retention. Reality: leads are **retained forever** (soft-archive only), `lead_raw_payloads` keeps whole webhook bodies indefinitely, and 10 append-only tables (`lead_activities`, `lead_notes`, `lead_raw_payloads`, `whatsapp_messages`, `elaya_messages`, `task_remarks`, `task_audit_log`, `notifications`, `whatsapp_notification_logs`, `usage_heartbeats`) hold PII immutably. Lead Revival (policies: touched/in_discussion 60d, nurturing 90d silence; cap 25/agent/day) re-processes dormant people's data via an LLM gate with **no do-not-revive flag and no maximum data age** — the exact pattern storage-limitation targets. Only `usage_heartbeats` has a retention job (30-day prune).

### Rule 9 — Contact for data questions ❌
Business contact of the DPO/answerable person must be prominently published on the website/app **and quoted in every rights-response**. Absent on all surfaces (an org-level item Serene should surface in-app too).

### Rules 10–12 — Children ⚠️ low-risk, undocumented
No age fields, no verifiable-parental-consent machinery. Services are adult luxury offerings, so the pragmatic position is "not directed at children; delete if identified" — but that position is written nowhere (₹200cr tier if ever wrong).

### Rule 14 — Data-Principal rights ⚠️/❌
- **Access:** `exportLeadsAction` exports lead-table columns only — no per-person bundle across WhatsApp/Elaya/tasks/notes.
- **Correction:** decent piecemeal (lead field-edit actions, profile edits); append-only notes can only be corrected by superseding note.
- **Erasure:** none (see s.8(7) above).
- **Grievance:** the `suggestions` feature is not a DPDP channel; no published redressal period (must be ≤90 days), no SLA tracking.
- **Nomination (14(4)):** absent.

### Rule 15 — Cross-border transfer ⚠️
Transfers are *permitted* subject to Central-Government orders about making data available to foreign states — today an **inventory-and-monitor** duty, not a ban. But the inventory doesn't exist: Anthropic/Deepgram likely US, Supabase/Vercel/Upstash regions unverified. Localisation only bites if Indulge is ever notified an SDF (Rule 13(4)).

---

## 7. Gap register (severity-ordered)

| # | Gap | Rule / tier | Remediation (in Serene idioms) |
| --- | --- | --- | --- |
| G-01 | Erasure structurally impossible (no lead delete; 10 append-only PII tables; raw payloads forever) | Act s.12, s.8(7) · ₹50cr | **Anonymisation core** in `lib/services/` (the `lead-mutations.ts` core pattern): tokenise name/phone/email/city across lead row + activities + notes + WhatsApp messages + raw payloads + Elaya snapshots; `invalidateLeadCaches` after; admin-gated action + erasure ledger. Keeps A-11 audit *structure*, removes identity |
| G-02 | No breach intimation workflow | Rule 7 · ₹200cr | `docs/operations/incident-response.md` (detect → contain → 72h Board clock → principal intimation); intimation templates; admin tool to enumerate affected leads from audit tables |
| G-03 | No lawful basis/consent/opt-out anywhere; no STOP handling; revival has no opt-out | Rules 3, s.5–7 · ₹50cr | Migration: `lawful_basis` (defineEnum), `consent_recorded_at`, `consent_source`, `do_not_contact_at` on `leads`; stamp basis per ingestion adapter; STOP/UNSUBSCRIBE branch in the WhatsApp webhook; gate all outbound sends + the revival sweep on `do_not_contact_at IS NULL` |
| G-04 | Rights machinery incomplete (SAR/erasure/grievance/nomination) | Rule 14 · ₹50cr | One admin "Data-Principal Request" workflow: lookup by phone/email → bundled JSON/CSV export, correction, or G-01 erasure; request ledger with ≤90-day SLA; nomination field; publish channel + Rule-9 contact |
| G-05 | Zero read-access visibility | Rule 6(c) · ₹250cr | Append-only view-log on dossier/conversation RSC loads (or pgAudit); actor + entity + timestamp; admin review surface |
| G-06 | Backups/DR undocumented | Rule 6(d) · ₹250cr | Record Supabase PITR window/RPO/RTO + tested restore procedure in `docs/operations/` |
| G-07 | No processor/DPA registry | Rule 6(f), s.8(2) · ₹250cr | `docs/operations/data-processors.md`: vendor, data categories, DPA signed date/link, sub-processors, region, review cadence — all 8+ processors |
| G-08 | Regions unverified; `.env.example` incomplete | Rule 15 | Verify + record Supabase/Vercel/Upstash/Trigger regions; prefer India/nearby where cheap; sync `.env.example` |
| G-09 | Children position undocumented | Rules 10–12 · ₹200cr | One-paragraph policy: not child-directed; delete-on-identification step in the DSR runbook |
| G-10 | LLM masking depth `light` (names cross the border); Elaya transcripts stored unmasked | Rule 6(a)/15 posture | Raise default `pii_masking_depth`; add name pseudonymisation (the deferred vault); consider masking at rest for `elaya_messages` |
| G-11 | No written retention policy (indefinite-by-default) | Rule 6(e), s.8(7) | Retention schedule doc + scheduled sweeps (the `lead-revival.ts` schedules.task pattern) for aged leads/raw payloads |

---

## 8. Roadmap to 14 May 2027

| Phase | Window | Deliverables |
| --- | --- | --- |
| **1 — Paper & decisions** | Jul–Sep 2026 | Lawful-basis map per source; retention policy; DPA + region registry (G-06/07/08); breach runbook + templates (G-02); Rule-9 contact published on Indulge's site; children position (G-09) |
| **2 — Schema & plumbing** | Oct–Dec 2026 | Consent/lawful-basis + `do_not_contact` migration; STOP handler; outbound + revival gating (G-03); anonymisation/erasure core + ledger (G-01) |
| **3 — Rights & visibility** | Jan–Mar 2027 | DSR workflow with SAR bundle export + ≤90-day SLA tracking; grievance intake; nomination (G-04); dossier read-access logging (G-05); masking depth raise (G-10); retention sweeps (G-11) |
| **4 — Drill** | Apr–May 2027 | End-to-end mock erasure request; mock breach with 72-hour Board-clock walkthrough; backup restore test |

---

## 9. Strengths to preserve (and cite in any future DPIA)

- Two-layer authz: `requireProfile()` + RLS on every table with live `profiles`-derived role/domain helpers; enumerated, justified admin-client surface.
- Inbound hardening: timing-safe webhook secrets, JSON parse guards, per-route rate limits.
- Append-only, actor-stamped write-audit trails (`lead_activities`, `task_audit_log`, `profile_audit_log`, `elaya_actions`, `whatsapp_notification_logs`) — breach-forensics raw material.
- Data-minimisation instincts: `maskPii()` gateway before every model call; audio transcribed in-memory and discarded (D-01); notification logs store phone last-4; Trigger payloads carry IDs not PII; Redis is ephemeral (30s–1hr TTLs); push endpoints owner-deletable + dead-endpoint pruning.
- House rules D-01–D-06 already encode privacy principles — the gap is statutory machinery, not philosophy.
