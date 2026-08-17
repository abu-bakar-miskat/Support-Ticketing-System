# Manager "My projects" Visibility — Design

**Date:** 2026-07-07
**Status:** Approved

## Problem

The Projects page's "My projects" list (`fetchProjectsList(profile, "mine")` in `src/lib/projects-list-data.ts`) only matches explicit `ProjectMember` rows. Project creation does not add the creator as a member, so managers see their department's projects under "All projects" but not under "My projects".

## Change

In `fetchProjectsList`, broaden the "mine" clause for users with managed departments:

```ts
const managedDeptIds = profile.managedDepartmentIds ?? [];
const mineWhere = managedDeptIds.length
  ? {
      OR: [
        memberWhere,
        { departmentId: { in: managedDeptIds } },
        { team: { departmentId: { in: managedDeptIds } } },
      ],
    }
  : memberWhere;
```

`mineWhere` replaces `memberWhere` in the three `scope === "mine"` branches only:
- no dept scope → `mineWhere`
- hub view → `mineWhere`
- specific dept view → `{ AND: [mineWhere, buildProjectDeptWhere(deptScope)] }`

The department-or-team OR mirrors `buildProjectDeptWhere` semantics so `teamId`-only projects (null `departmentId`) are included.

## Unchanged on purpose

- Cross-access branch stays member-only (visitors to a granted dept must not see managed projects from elsewhere).
- Staff/leads have empty `managedDepartmentIds` → behavior identical.
- `scope === "all"` untouched.

## Testing

New colocated `src/lib/projects-list-data.test.ts` (mock `@/lib/db` and `@/lib/dept-scope`) asserting the `where` passed to `prisma.project.findMany` for: staff "mine" (member-only), manager "mine" hub view (OR with both managed-dept arms), manager "mine" scoped to a dept (AND with dept filter), cross-access visitor (member-only), and manager "all" (unchanged dept filter).
