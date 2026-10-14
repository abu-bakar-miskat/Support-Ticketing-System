// Isolated PostgreSQL trigger regression; never connects to DATABASE_URL.
// Install @electric-sql/pglite in a temporary prefix and set PGLITE_MODULE to
// that module path, or run with the package installed locally.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');const fs=require('fs');const assert=require('assert/strict');
(async()=>{const db=new PGlite();await db.exec(`
CREATE TABLE "Ticket" (id text primary key, "tenantId" text, "teamId" text);
CREATE TABLE "Team" (id text primary key, "departmentId" text);
CREATE TABLE "ActivityLog" (id text primary key, "ticketId" text REFERENCES "Ticket", action text, metadata jsonb);
CREATE TABLE "TicketMessage" (id text primary key, "ticketId" text REFERENCES "Ticket", direction text, status text, "fromName" text, "fromEmail" text, "bodyHtml" text, "providerMessageId" text, "rawPayload" jsonb);
CREATE TABLE "Profile" (id uuid primary key, "notificationPrefs" jsonb);
CREATE TABLE "DepartmentManager" ("departmentId" text, "userId" uuid);
CREATE TABLE "TenantMembership" ("tenantId" text, "userId" uuid, role text, "isActive" boolean);
CREATE TABLE "MailboxConnection" (id text, "departmentId" text, "tenantId" text, address text);
CREATE TABLE "Notification" (id text primary key, "recipientId" uuid, type text, "ticketId" text REFERENCES "Ticket", message text);
INSERT INTO "Team" VALUES ('team','dept');
INSERT INTO "Profile" VALUES ('00000000-0000-0000-0000-000000000001',NULL),('00000000-0000-0000-0000-000000000002',NULL),('00000000-0000-0000-0000-000000000003','{"intakeManagerAlert":false}');
INSERT INTO "DepartmentManager" VALUES ('dept','00000000-0000-0000-0000-000000000001'),('dept','00000000-0000-0000-0000-000000000003');
INSERT INTO "TenantMembership" VALUES ('tenant','00000000-0000-0000-0000-000000000001','manager',true),('tenant','00000000-0000-0000-0000-000000000002','admin',true);
`);
// PGlite is single-session; preserve production's real advisory lock while
// using a no-op only if the isolated engine doesn't expose this PG primitive.
const available=await db.query("SELECT to_regprocedure('pg_advisory_xact_lock(integer)') AS fn");
if(!available.rows[0].fn)await db.exec('CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE sql AS $$ SELECT $$');
await db.exec(fs.readFileSync(process.cwd()+'/prisma/migrations/20261012083000_mailbox_receipt_guard/migration.sql','utf8'));
const audit=(t,id,legacy=false)=>db.query(`INSERT INTO "ActivityLog" VALUES ($1,$2,'TICKET_CREATED',$3::jsonb)`,['audit-'+t,t,JSON.stringify({source:'email',fromEmail:'c@example.test',...(!legacy?{providerMessageId:id}:{})})]);
await db.exec(`INSERT INTO "Ticket" VALUES ('modern','tenant','team')`);await audit('modern','<id@example.test>');
assert.equal((await db.query(`SELECT * FROM "TicketMessage" WHERE "ticketId"='modern'`)).rows.length,1);
assert.equal((await db.query(`SELECT * FROM "Notification" WHERE "ticketId"='modern'`)).rows.length,2);
assert.equal((await db.query(`SELECT "bodyHtml" FROM "TicketMessage" WHERE "ticketId"='modern'`)).rows[0].bodyHtml,'');
await db.exec('BEGIN');await db.exec(`INSERT INTO "Ticket" VALUES ('old-duplicate','tenant','team')`);await audit('old-duplicate',null,true);
await assert.rejects(db.exec(`INSERT INTO "TicketMessage" VALUES ('old-msg','old-duplicate','inbound','trusted','C','c@example.test','Body','id@example.test','{}')`),e=>e.code==='23505');await db.exec('ROLLBACK');
assert.equal((await db.query(`SELECT * FROM "Ticket" WHERE id='old-duplicate'`)).rows.length,0);
assert.equal((await db.query(`SELECT * FROM "Notification" WHERE "ticketId"='old-duplicate'`)).rows.length,0);
await db.exec(`INSERT INTO "Ticket" VALUES ('old-first','tenant','team')`);await audit('old-first',null,true);
await db.exec(`INSERT INTO "TicketMessage" VALUES ('old-first-msg','old-first','inbound','trusted','C','c@example.test','Body','second@example.test','{}')`);
await db.exec('BEGIN');await db.exec(`INSERT INTO "Ticket" VALUES ('new-duplicate','tenant','team')`);
await assert.rejects(audit('new-duplicate','<second@example.test>'),e=>e.code==='23505');await db.exec('ROLLBACK');
assert.equal((await db.query(`SELECT * FROM "Ticket" WHERE id='new-duplicate'`)).rows.length,0);
await db.exec(`INSERT INTO "Ticket" VALUES ('distinct','tenant','team')`);await audit('distinct','different@example.test');
assert.equal((await db.query(`SELECT * FROM "Ticket"`)).rows.length,3);
console.log('PASS: both storage orders reject duplicates and roll back tickets/alerts; distinct emails succeed; receipts are body-free; tenant admins/manager overlap is deduplicated; notification preferences respected.');await db.close()})().catch(e=>{console.error(e.message);process.exitCode=1});
