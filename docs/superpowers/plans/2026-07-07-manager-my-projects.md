# Manager "My projects" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Single task; steps use checkbox syntax.

**Goal:** "My projects" includes projects in departments the user manages. Spec: `docs/superpowers/specs/2026-07-07-manager-my-projects-design.md`.

## Global Constraints

- Tests: ~24 pre-existing `npm test` failures — gate on the focused file + no NEW failures. Mock `@/lib/db`, `@/lib/dept-scope`, `@/lib/misc-project`, `@/lib/board-data` per house pattern.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

### Task 1: mineWhere broadening (TDD)

**Files:**
- Modify: `src/lib/projects-list-data.ts` (`fetchProjectsList`, lines ~94-118)
- Test: `src/lib/projects-list-data.test.ts` (new)

- [ ] **Step 1: failing tests** — mock prisma (`project.findMany` returning `[]`), `getProfileDeptScope` (controllable), `buildProjectDeptWhere` (real or mocked to a marker object — mock to `{ OR: [{ departmentId: "dept-1" }, { teamId: { in: ["team-1"] } }] }` via the real function is simpler: mock only `getProfileDeptScope`, keep `buildProjectDeptWhere` real), `dedupeMiscProjects` (identity), `avatarColorFor` (noop). Cases:
  1. staff "mine", hub scope → where = memberWhere only
  2. manager "mine", hub scope (`managedDepartmentIds: ["dept-1"]`) → where = `{ OR: [memberWhere, { departmentId: { in: ["dept-1"] } }, { team: { departmentId: { in: ["dept-1"] } } }] }`
  3. manager "mine", non-hub scope → `{ AND: [thatOR, buildProjectDeptWhere(scope)] }`
  4. cross-access visitor "mine" → memberWhere only
  5. manager "all", non-hub scope → buildProjectDeptWhere only (unchanged)
- [ ] **Step 2: run, see fail** (`npx vitest run src/lib/projects-list-data.test.ts`)
- [ ] **Step 3: implement** — insert `mineWhere` per the spec snippet; replace `memberWhere` in the three mine branches only
- [ ] **Step 4: run, all pass; `npm test` baseline only**
- [ ] **Step 5: commit** — `feat: include managed-department projects in My projects`
