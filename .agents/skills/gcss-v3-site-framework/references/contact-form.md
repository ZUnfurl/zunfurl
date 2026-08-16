# Contact Form Contract

The Contact form is a lightweight mail handoff, not a CRM, ticket system, order lookup, or message database.

## Flow

1. Validate fields in the browser.
2. Execute Turnstile after submit.
3. POST a bounded JSON body to `/api/contact`.
4. Verify origin, size, fields, honeypot, Turnstile, and limits in Worker.
5. Atomically update only short-lived HMAC counters in the Worker Durable Object coordinator.
6. Send through Resend to the configured business inbox.
7. Use the visitor email as `Reply-To`, never as `From`.

## Required Security

- No public mailto fallback.
- No attachment upload or automatic user reply in the base module.
- No message body in Sanity, Shopify, Durable Object storage, KV, D1, or R2.
- Bound body size, field lengths, link count, hourly/day limits, and per-IP/email limits.
- Treat `CONTACT_FORM_ENABLED=false` as the highest-priority emergency operational switch for every Contact-enabled profile.
- Use the SQLite-backed `GCSS_COORDINATOR` binding for atomic multi-bucket limits; do not replace it with an eventually consistent KV `get` then `put` counter.
- Display generic user errors; log only operational metadata without message content.

## Legal Copy

Editors may maintain the pre-submit legal notice and links. Field labels, abuse controls, and status behavior remain system-owned.
