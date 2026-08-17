# 017 — Ops: receiving domain + MX + Resend webhook + SES investigation

> Type: HITL · Parent: docs/prd-customer-reply.md · Prerequisite (no user stories)

## What to build

Provision the mail infrastructure that makes production inbound work. This is a human/ops slice — no application code — but it is what turns the (stubbed-and-tested) inbound pipeline into a live one.

- Stand up a fresh receiving subdomain **`reply.pengroup.com`** (no existing MX), chosen to avoid colliding with the Microsoft 365 root MX and the AWS SES inbound MX already present on `mail.pengroup.com`.
- Add the Resend receiving **MX at lowest priority** on `reply.pengroup.com` via Namecheap (the DNS registrar).
- Enable Resend receiving for the subdomain and configure the `email.received` webhook to point at the inbound endpoint.
- Set the inbound domain and webhook-signing-secret environment variables in each environment.
- **Investigate the existing AWS SES inbound rule set on `mail.pengroup.com` (eu-west-1)** — confirm what it serves (bounces? another system?) so the wider mail infrastructure is understood before relying on it.

## Acceptance criteria

- [ ] `reply.pengroup.com` has the Resend MX at lowest priority; root M365 and `mail.` SES records untouched
- [ ] Resend receiving enabled; `email.received` webhook delivers to the inbound endpoint with a verifiable svix signature
- [ ] Inbound domain + webhook secret env vars set per environment; `RESEND_RECEIVING_ENABLED` derives true in production
- [ ] A real test email to `reply-<token>@reply.pengroup.com` threads into the correct ticket end-to-end
- [ ] The SES inbound rule set on `mail.pengroup.com` is documented (purpose + owner)

## Blocked by

- 011 — Inbound receive & thread (trusted path)
