-- SubDepartment (Team) ids are CUIDs, not UUIDs, but Ticket.transferredFromSubDepartmentId
-- was typed @db.Uuid. Writing a CUID into a uuid column made every ticket transfer 500
-- ("invalid input syntax for type uuid"). Widen the column to text. Safe: nullable,
-- no foreign key, and uuid→text always casts.
ALTER TABLE "Ticket" ALTER COLUMN "transferredFromSubDepartmentId" TYPE text USING "transferredFromSubDepartmentId"::text;
