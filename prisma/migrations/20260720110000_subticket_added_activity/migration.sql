-- Record sub-ticket creation on the parent's activity timeline.
-- PostgreSQL requires enum additions outside a transaction.
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SUBTICKET_ADDED';
