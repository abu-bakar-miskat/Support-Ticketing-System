import { describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isStalePrismaClient, prisma } from "./db";

describe("Prisma client freshness", () => {
  it("keeps the current generated client alive despite mapped database field names", async () => {
    // Construction is lazy: no connect/query and no shared database credentials.
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: "postgresql://test:test@127.0.0.1:1/test" }),
    });
    try {
      expect(isStalePrismaClient(client)).toBe(false);
      expect(isStalePrismaClient(client)).toBe(false);
    } finally {
      await client.$disconnect();
    }
  });

  it("still rejects an absent client", () => {
    expect(isStalePrismaClient(undefined)).toBe(true);
  });

  it("reuses the same client across application proxy accesses", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/test");
    try {
      // Getting delegates creates the lazy client without executing SQL.
      // Previously each access disconnected it, aborting in-flight transactions.
      const profiles = prisma.profile;
      const tickets = prisma.ticket;
      expect(prisma.profile).toBe(profiles);
      expect(prisma.ticket).toBe(tickets);
    } finally {
      await prisma.$disconnect();
      vi.unstubAllEnvs();
    }
  });
});
