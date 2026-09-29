# Finance module, step 1: the invoice for a reimbursed request

> Status: plan, written 2026-09-28 from the founder's brief and a read of the live data.
> Nothing is built. The first slice is one pain point: the invoice a member gets when a
> concierge agent paid for something on their behalf, and the Freshdesk ticket that waits
> for it. The finance team keeps Zoho Books for everything else. Freshdesk stays the
> concierge desk. Serene becomes the place this one invoice is born.

## 1. The idea in one paragraph

A genie books something and pays for it. They write a note on the Freshdesk ticket in the
team's template (client, description, cost price, selling price, vendor, how it was paid) and
move the ticket to **Invoice Due**. Today a finance person has to notice that, open Zoho
Books, retype the note as an invoice on the member, apply the member's credit, paste the
invoice number back into the ticket, fill the billable field, and then wait for a genie to
move the ticket to Resolved. Serene already holds the ticket, the note, the attachments and
the member's Zoho id within a minute of the note being written. So the plan is: the note is
the button. Serene reads it, shows the finance person a ready invoice on `/finance`, and on
one click creates the invoice in Zoho, applies the member's credit, writes the invoice number
and a note back to the ticket, sets billable to Yes, tags the ticket `invoiced`, and tells the
genie. Serene does NOT move the status: only a genie may resolve a ticket, after checking the
request is truly done. Finance stops watching Freshdesk, and never sees an invoiced ticket
again, because their queue is Serene's own list and a row leaves it the moment its invoice
exists, whatever the Freshdesk status says.

## 2. What the data says (read 2026-09-28, production mirror and Zoho, read only)

| Fact | Number |
| --- | --- |
| Tickets sitting in Invoice Due right now | 133 |
| Tickets that entered Invoice Due in the last 90 days | 518 (about 6 a day) |
| Time a ticket waits in Invoice Due before anyone moves it | median 24 hours, one in ten waits over 95 hours |
| Billable tickets (last 90 days) that carry a template note | 2,239 of 2,258 (99%) |
| Template notes with no payment mode filled | 1,126 of 2,417 (47%) |
| Template notes whose attachment Elaya's eyes have already read | 2,452 of 3,037 (81%) |
| Zoho users | 6 shared logins; no finance person has their own |
| The invoice-number field on billable tickets (180 days) | 3,105 digits only ("012784"), 67 the full number ("INV26/27-013522"), 788 free text |

What this tells us:

- The template is followed almost every time, so a deterministic reader works for the
  common case. It is not followed perfectly: the payment mode is missing half the time, the
  empty scaffold is sometimes posted as a note, amounts arrive as "Rs 11,798.17", "129 AED",
  "EURO 130" or "400,000 INR + 248,975 INR + 100 INR", and the date sometimes sits inside
  the description. The reader needs a fallback (section 6B).
- Four of five template notes already have a bill or screenshot read by Elaya's eyes. The
  amount on the bill can cross-check the amount in the note before anyone approves.
- Finance does not have Zoho logins of their own, so "the invoice is created by Vishal"
  cannot mean a Zoho login. It means the salesperson field on the invoice, which is exactly
  what happens today (the live invoices carry the concierge person's name there).
- The invoice-number field on the ticket is filled three different ways. Serene will write
  the full number every time, so the field becomes searchable.

## 3. How a real invoice looks in Zoho today

Read from the two newest invoices (2026-09-28):

- Customer: the member (their `zoho_customer_id`, which `member.members` already holds).
- One line item, always the item **Reimbursement Of Expenses** (item id `1204503000003268193`,
  no tax). The line's account is **Reimbursement Of Expenses** (account id
  `1204503000003273043`, type other current asset), which is the "head" the founder
  described; the item's default account is Sales, so the line must name the account.
- Line description is the date and the subject: `24.09.2026  Runner-Surat-Pax`.
- Quantity 1, rate = the selling price. `tax_total` 0, no custom fields, template "Grand".
- `salesperson_name` = the person who made it.
- The member's wallet is their unused Razorpay payments (`customerpayments.unused_amount`).
  Credit is applied to an invoice with `POST /invoices/{id}/credits` carrying
  `invoice_payments: [{ payment_id, amount_applied }]`. When the wallet is short the invoice
  simply stays with a balance; that is the "goes negative" the founder described
  (`outstanding_receivable_amount` on the contact).

## 4. How the Freshdesk side looks today

- Status 9 is **Invoice Due**. Resolved is 4.
- `cf_is_the_request_billable` is a Yes/No dropdown, mandatory on close. Billable tickets
  carry `cf_invoice_number` (text). There is also `cf_invoice_amount` (text, rarely used).
- The finance people are Freshdesk agents (Murtaza Ali, Riya Ramdas, Vasant Dantye linked to
  their Serene profiles; Vishal Amruskar is an agent but not yet linked, because the Serene
  account has no phone on it).
- Serene never writes to Freshdesk today (`docs/integrations/freshdesk.md`, line 18). The
  client can already POST (it registers automation rules). The 50 calls a minute are shared
  with the member app; `FD_RATE_RESERVE` = 15 is kept free.

## 5. What we reuse (nothing here is new plumbing)

| Need | Already here |
| --- | --- |
| The ticket, its notes, its attachments, within a minute | the Freshdesk mirror (`freshdesk.tickets`, `freshdesk.conversations`, the webhook + poll) |
| What the bill or screenshot says | `public.media_readings` (source `freshdesk_attachment`, class `bill_receipt` / `screenshot_app`, `fields`) |
| The member and their Zoho customer | `member.members.zoho_customer_id`; the ticket's `member_id` |
| The member's wallet right now | `getMemberFinance()` reads payments and credit notes (Redis 1 min) |
| The Zoho client, budget and token refresh | `zoho-api.ts` (gains its first writes) |
| The Freshdesk client and budget | `freshdesk-api.ts` (gains its first ticket writes) |
| Who is finance | `profiles.domain = 'finance'`; route map in `route-permissions.ts` |
| Telling people | `createNotification` (in-app + push) and the WhatsApp senders, under the per-user preferences |
| Reading a messy note | the Elaya provider at the routing tier, `maskPii`, the vendor-extract posture (fails closed) |
| The write shape | context-free cores taking a `MutationActor`, actions gated by `requireProfile`, `{ data, error }` |
| Approve / Dismiss | the proposal card shape Elaya already uses |

## 6. The build, piece by piece

### A. Schema `finance` (one migration)

- `finance.reimbursements`: one row per ticket that needs an invoice. `ticket_id`,
  `member_id`, `zoho_customer_id`, `queendom_id`, `agent_profile_id` (the genie),
  `source_note_id` (the template note), `status` (`due` | `drafted` | `invoiced` |
  `dismissed` | `failed`), `parsed` (jsonb: the reader's fields plus confidence),
  `evidence` (the attachment reading ids), `draft` (jsonb: the invoice we will send),
  `invoice_id`, `invoice_number`, `invoice_total`, `credit_applied`, `balance_after`,
  `invoiced_by`, `invoiced_at`, `dismiss_reason`, timestamps. RLS: finance, admin and
  founder read; writes through the service role only.
- `finance.reimbursement_items`: the line items (description, amount in INR, the original
  amount and currency as written, vendor name, payment mode). A ticket with a flower and a
  delivery is two rows and one invoice with two lines.
- `finance.invoice_log`: append-only. Every call Serene makes to Zoho or Freshdesk for a
  reimbursement, with who clicked, request summary, response code, ids returned. This is
  the trail when a member asks "why was I charged".
- Idempotency: `UNIQUE (source_note_id)` on reimbursements, and the Zoho create carries the
  note id as `reference_number`, so a double click or a retried run can never make two
  invoices for one note.

### B. The note reader (`finance-note-reader.ts`)

Two passes, the second only when the first is unsure.

1. **Deterministic.** Split on the template labels (`Client name`, `Description`, `Date`,
   `Subject`, `Location`, `Pax`, `Cost Price`, `Selling Price`, `Name & Bill of vendor`,
   `Payment done via`, `Note`), tolerant of spacing, case, a missing hyphen and a missing
   field. Amounts: strip `Rs`, `INR`, commas; keep a foreign currency as written and mark the
   row `needs_conversion`; a `+` chain becomes several items. An empty scaffold (every field
   blank) is not a reimbursement and is ignored. The invoice line takes the **selling
   price**; the cost price is kept for the margin report later.
2. **Model fallback.** When a required field (selling price, description) is missing or the
   text does not match, one routing-tier call (the vendor-extract posture: masked, no tools,
   plain-text fields, fails closed) reads the note and the attachment readings. A model read
   never approves anything; it fills the draft and lowers the confidence.

Cross-check: when an attachment reading of class `bill_receipt` or `screenshot_app` carries
an amount, it is compared with the note's selling price. Match = a green tick on the card.
Mismatch = a warning the finance person must clear. No reading = "not checked".

Which note: the newest private note on the ticket that reads as a template, not the newest
note (the newest is often "paid" or "please update").

### C. The trigger: a ticket enters Invoice Due

`runReimbursementIntake()` on the minute schedule (the freshdesk-sync task already runs
every minute; this hangs off the same cycle or a sibling task): every ticket whose status is
9 and has no reimbursement row gets one, read through B. A ticket that leaves status 9
without an invoice from Serene (someone did it by hand in Zoho) is marked `dismissed` with
reason `handled_outside`, so the queue stays honest. The 133 tickets waiting today are the
first run.

A "Send to finance" button on the ticket page and an Elaya tool stay as the fallback for a
note that never matched.

### D. Zoho, the first writes (`zoho-api.ts` + `finance-mutations.ts`)

`createReimbursementInvoiceCore(reimbursementId, actor)`:

1. Re-read the member's wallet (`unused_amount` per payment, newest first).
2. `POST /invoices`: `customer_id`, `date` (today), `salesperson_name` (the actor's full
   name), `reference_number` (the note id), one `line_items[]` entry per item with
   `item_id` 1204503000003268193, `account_id` 1204503000003273043, `description`
   (`dd.mm.yyyy  Subject`), `rate`, `quantity` 1. No tax, no custom fields. Notes and terms
   are left to the template defaults (they are on every invoice today).
3. Mark sent (`POST /invoices/{id}/status/sent`) so credit can be applied.
4. `POST /invoices/{id}/credits` with `invoice_payments` walking the wallet oldest-first
   until the total is covered or the wallet is empty. What is not covered stays as balance.
5. Every call logged in `finance.invoice_log`; a failure after step 2 leaves the row
   `failed` with the Zoho invoice id saved, never a second create.

Rate: writes take their own slice of the Zoho budget (`ZOHO_WRITE_MAX_CALLS`, 6 per
invoice), never below the daily reserve.

### E. Freshdesk, the first writes (`freshdesk-api.ts` + the same core)

After D succeeds, in this order, each logged:

1. `POST /tickets/{id}/notes` (private): "Invoice INV26/27-0135xx for ₹3,000 created in Zoho
   Books by Vishal. Credit applied ₹3,000, balance ₹0." plus the Zoho link.
2. `PUT /tickets/{id}`: `custom_fields.cf_is_the_request_billable` = "Yes",
   `custom_fields.cf_invoice_number` = the full invoice number, `cf_invoice_amount` = the
   total, and the tag `invoiced` added to the ticket's tags. **The status is not touched**
   (founder, 2026-09-29): a genie resolves, after checking the request is truly done. The
   two mandatory close fields are already filled, so the genie's close is one click.
3. Notify the genie (in-app, and WhatsApp under their preference): "Ticket #1234 is
   invoiced. Check it is done and resolve it."
4. The nudge ladder: a ticket still in Invoice Due 24 hours after its invoice reminds the
   genie once more; at 48 hours the bishop and the queen of that queendom are told. Nobody
   in finance is involved again.

Why a tag as well as our own queue: anyone still filtering in Freshdesk can use "Invoice
Due and not tagged invoiced" and see only real work. The tag is for Freshdesk eyes; Serene's
queue never needed it.

A Freshdesk failure after a Zoho success is shown on the card as "invoice made, ticket not
updated" with a Retry; it never creates a second invoice. Writes take a slice of the
Freshdesk budget (`FD_WRITE_MAX_CALLS`, 3 per ticket) inside the existing reserve.

### F. The page, `/finance`

The finance domain's home. Route map gains `/finance` for finance, admin and founder.

- **Queue.** Every `due` and `drafted` reimbursement, oldest first, with the member, the
  queendom, the genie, the amount, how long it has waited, and the cross-check tick. Filters:
  queendom, waited more than a day, needs a look (low confidence, mismatch, foreign
  currency).
- **Card.** The ticket subject, the template note as written, the attachments through the
  existing `FreshdeskAttachments` strip with their readings, the parsed items as editable
  rows (description, amount, vendor, mode), the member's wallet right now and what the
  balance will be after, and one primary button: **Create invoice**. Below it, Dismiss with
  a reason. Every edit a finance person makes to a parsed row is kept as a correction (the
  draft-review posture), so the reader can be taught later.
- **Done list.** Invoiced rows with the invoice number, who did it, when, and the ticket.
- **Ticket page.** For a ticket in Invoice Due, a Finance card shows the reimbursement state
  and a link to the card. Concierge sees it; only finance acts.

### G. Identity and access

- Finance people sign into Serene with their own account, `domain = finance`. Four exist
  (Murtaza Ali, Vishal V. Amruskar, Riya Mayekar, Vasant Dantye).
- **Zoho:** the organisation token we hold; the person's name goes in `salesperson_name` and
  in our own `invoiced_by`. This matches today's practice and is the only option: finance has
  no Zoho logins of their own.
- **Freshdesk:** each finance person's own API key. Read 2026-09-29: the key Serene holds
  for the mirror belongs to a real person (Advita Bihani), so a write with it would show in
  Freshdesk as written by her. No new seat is needed: Murtaza, Riya, Vasant and Vishal are
  already Freshdesk agents, and every agent has a personal API key on their Freshdesk profile
  page. Each pastes it once on `/profile` in Serene (stored with `vault-crypto`, never shown
  again, removable). From then on the note and the field changes appear in Freshdesk under
  their own name. A finance person with no key saved cannot create an invoice from Serene;
  the card says so and links the profile page. The mirror keeps reading with the company key.
- Gates: `requireProfile(['agent','manager','admin','founder'])` plus `domain === 'finance'`
  (or admin / founder) on every write action; reads the same. No queendom scoping: finance
  sees every queendom, as it does in Freshdesk today.

### H. Notifications

- To finance when a reimbursement lands in the queue: in-app; WhatsApp once a day as a digest
  ("9 invoices waiting, oldest 3 days") rather than one ping per ticket, under the existing
  preference categories (one new key `finance_invoice_due`).
- To the genie when their ticket is invoiced and moved (`finance_invoice_done`).
- To finance when a Zoho or Freshdesk write failed and needs a hand.

### I. Elaya (after F)

Read tools `list_invoice_queue` and `get_reimbursement` for finance, admin and founder;
a propose-only `create_reimbursement_invoice` that the resolver executes on a yes, through
the same core. Never built before the page has run for two weeks.

## 7. Trust ladder

Same shape as Hands. A setting per queendom, default L0.

- **L0 draft.** Serene prepares; a finance person reviews and clicks. Ships first.
- **L1 auto when certain.** When the deterministic reader parsed every field, the bill
  reading matches the selling price, the currency is INR, the total is under a cap, and the
  wallet covers it, the invoice is created without a click; the card shows as done and can
  be voided from the page. Everything else waits for a human.
- **L2 auto with balance.** As L1 but also when the wallet does not cover it.

Move a queendom up only after a clean month at the level below.

## 8. Order of work and what each step proves

1. **Migration + reader + intake + page, no writes.** The queue fills from the 133 waiting
   tickets. The card shows the ready invoice and a "Open in Zoho" link. Finance stops
   scanning Freshdesk. Proves the reader on real notes; measure how many cards need a hand.
   About three days.
2. **Zoho writes.** Create + credit application behind the button. Decision Log entry: the
   first sanctioned Zoho writes, only through `finance-mutations.ts`. Test on one real
   ticket with finance watching. Two days.
3. **Freshdesk writes.** Note + billable + invoice number + the `invoiced` tag (never the
   status), the key field on `/profile`, then the genie's notification and the nudge ladder. Decision Log entry: the first sanctioned Freshdesk ticket writes, only
   through the same core. One day.
4. **Corrections and the reader's second pass.** The edits finance made in step 1 to 3 shape
   the model fallback prompt. Notifications digest. Two days.
5. **L1 auto** for one queendom, then the rest.

## 9. Risks, said plainly

- **A wrong invoice reaches a member.** L0 keeps a human between the reader and Zoho. The
  cross-check and the confidence flag make the risky cards obvious. Idempotency stops the
  double invoice. Void from the page undoes a mistake in Zoho; the note on the ticket says so.
- **Foreign currency.** A note in AED or EUR cannot become an INR invoice without a rate.
  The card asks for the INR amount; L1 never touches those.
- **A genie writes the invoice number by hand, or finance does it in Zoho as before.** The
  intake sees the ticket leave status 9 and marks the row handled outside. Nothing breaks;
  the row just is not ours.
- **Two writers on one ticket.** Serene writes only to a ticket in status 9 with a `due` or
  `drafted` row, in one short sequence; a genie moving the ticket at the same second is
  caught by the status re-read before the PUT.
- **Rate limits.** Six Zoho and three Freshdesk calls per invoice, six invoices a day today.
  Far under both budgets; both writes still run behind the existing reserves.
- **Wrong member.** The member comes from the ticket's `member_id` and their
  `zoho_customer_id`, never from the name in the note. A ticket with no linked member cannot
  be invoiced from Serene; the card says so and links the member page.

## 10. Decisions

Decided by the founder, 2026-09-28:

- Serene only; Freshdesk stays the desk and must be updated from here. Yes.
- One invoice per ticket, one line per item, always the item Reimbursement Of Expenses on
  the Reimbursement Of Expenses account, on the member's name, no tax.
- The wallet may go negative: apply what credit exists, leave the rest as balance.
- The finance person who clicks is the identity on the invoice (`salesperson_name`).
- Finance accounts exist for Murtaza, Vishal, Riya and Vasant; they use the finance domain.

Open, the founder to answer:

Decided by the founder, 2026-09-29:

- **Status.** Serene never moves it. The genie resolves. Serene tags `invoiced`, fills the
  billable and invoice-number fields, and nudges the genie, then the bishop and queen.
- **Freshdesk identity.** Each finance person's own key (section 6G).
- **Cost price.** Left alone for now. The template carries one cost price and one selling
  price and the team writes the same amount in both; the invoice takes the selling price.
- **Backlog.** Every ticket in Invoice Due is queued on the first run.

Open, none of them blocks step 1:

1. **Auto cap for L1**, in rupees per invoice. Only matters when auto mode is switched on.
2. **Foreign currency.** Who converts, and at which rate: the finance person types the INR
   amount on the card, or we convert at the day's rate and they confirm.
