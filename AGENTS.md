<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database schema changes (READ BEFORE editing prisma/schema.prisma)

The `DATABASE_URL` in `.env` points to a **shared, live** Supabase database used by the whole team. Because of pre-existing migration drift, `prisma migrate dev` will demand a **destructive reset — never run it** (nor `prisma migrate reset`).

**Every edit to `schema.prisma` MUST ship a migration file AND be applied to the shared DB before merge.** A schema-only edit deploys a Prisma client that queries columns the database doesn't have — every affected query 500s in production (this took prod down on 2026-07-29 via an unmigrated `Profile.doNotAssign` field).

Workflow:

```sh
# 1. Generate the SQL for your change (diffs live DB → your schema)
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_my_change
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
  > prisma/migrations/<that-dir>/migration.sql

# 2. REVIEW the file: it includes ALL pre-existing drift, not just your change.
#    Delete everything that isn't yours — especially DROP COLUMN / DROP TABLE
#    statements. Keep additive changes only wherever possible.

# 3. Apply to the shared DB and record it as applied
npx prisma db execute --file prisma/migrations/<that-dir>/migration.sql
npx prisma migrate resolve --applied <that-dir>

# 4. Regenerate the client so local typecheck reflects reality
npx prisma generate
```

Other shared-DB rules: teammates create real tickets in it during work hours — no destructive experiments, and don't trigger completion notifications (they email real department managers).
