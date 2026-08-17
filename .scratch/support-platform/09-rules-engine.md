# 09 — Rules engine (conditions/actions + dry-run + log)

**Type:** AFK · **Triage:** ready-for-agent · **Phase:** 3

## Parent
PRD: PlanetEducationNetworks/PEN-Ticketing-System#96

## What to build
Per-department rules whose conditions evaluate submitted form field values with equals/not-equals/contains/greater-than/less-than/is-empty combined with AND/OR (RE-01). Actions (RE-02, OQ-06): assign to agent/group, set priority, set category/tag, apply an SLA policy, change column, send a notification. Rules run in a configurable order with a per-rule "stop processing further rules" flag (RE-03). Provide a dry-run test against sample values reporting matched conditions and would-fire actions without mutating any ticket (RE-04). Log each rule execution against the affected ticket (RE-05).

## Acceptance criteria
- [ ] Conditions evaluate form values with all listed operators and AND/OR grouping.
- [ ] All listed actions apply correctly; the stop-processing flag halts further rules.
- [ ] Rules execute in the configured order.
- [ ] Dry-run reports matched conditions + would-fire actions and mutates nothing.
- [ ] Each execution is logged against the ticket.

## Blocked by
- 08 — Dynamic forms: versioned fields + conditional visibility + public URL
