# TODO

Open follow-up tasks for Serene. Check items off as they're done.

---

## Email / Brevo SMTP

- [ ] **Verify our sender domain on Brevo (DKIM/SPF) so auth emails stop landing in spam.**
  - Current state: custom Brevo SMTP is configured in Supabase and **emails are sending and working** (password reset, Elaya emails, etc.).
  - Problem: outgoing emails are currently delivered to the recipient's **spam/junk** folder.
  - Cause: the sender domain (`indulge.global`) is not yet fully authenticated in Brevo, so Gmail/Outlook flag the mail as untrusted.
  - Fix: in Brevo → **Senders, Domains & Dedicated IPs** → add and authenticate the `indulge.global` domain (add the **DKIM + SPF DNS records** Brevo provides). Ensure the Supabase SMTP "Sender email" exactly matches a verified Brevo sender.
  - After: send a test reset email and confirm it lands in the inbox (not spam).

Set GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID to your approved Gupshup welcome-template id. Until then it no-ops safely (no half-configured template fires at a customer). If the approved template's variables differ from {{1}} = first name, adjust templateParams in sendCustomerWelcomeTemplate.
