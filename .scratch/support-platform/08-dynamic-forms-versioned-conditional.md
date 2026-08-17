# 08 — Dynamic forms: versioned fields + conditional visibility + public URL

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Extend the existing intake forms into SRS `Form`/`FormField`: multiple forms per department; field types text/textarea/dropdown/checkbox/radio/date/number/file; per-field validation (required, min/max, numeric range, email) enforced server- and client-side; add/remove/reorder. Add **versioned field definitions** so historical submissions stay readable after edits (DAT-04), and **conditional field visibility** driven by another field's value (hidden fields excluded from required validation, FM-05). Each form publishes at an unguessable public URL requiring no auth, rendered with the department's branding; a submission creates a ticket linking the submission values (FM-07). Rate-limit + bot-mitigate public endpoints (FM-08).

## Acceptance criteria
- [ ] Forms support all listed field types with server-side validation matching client-side.
- [ ] Editing a form versions field definitions; prior submissions render against the version they were captured under.
- [ ] Conditional visibility hides/shows fields by another field's value; hidden fields are not required.
- [ ] A public unguessable URL renders the branded form without auth and a submission creates a ticket linked to its values.
- [ ] Public form endpoints are rate-limited/bot-mitigated.

## Blocked by
- 04 — Department board + status-typed columns
