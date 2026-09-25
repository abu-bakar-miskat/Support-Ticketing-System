import { describe, expect, it } from "vitest";
import { parse } from "pg-connection-string";
import { normalizePoolerUrl } from "./db";

const connection = "postgresql://postgres.test:dummy%40password@aws-0-example.pooler.supabase.com:6543/postgres";

describe("database environment URL normalization", () => {
  it.each([connection, `"${connection}"`, `'${connection}'`, `  "${connection}"\n`])(
    "keeps the real pooler host when the environment contains %s",
    (value) => {
      const parsed = parse(normalizePoolerUrl(value));
      expect(parsed.host).toBe("aws-0-example.pooler.supabase.com");
      expect(parsed.port).toBe("6543");
      expect(parsed.password).toBe("dummy@password");
    },
  );

  it("reproduces node-pg's fallback host for unnormalized quotes", () => {
    expect(parse(`"${connection}"`).host).toBe("base");
  });

  it.each([`DATABASE_URL=${connection}`, "base", "", `https://example.com`, `"${connection}`])(
    "rejects malformed configuration without exposing credentials",
    (value) => {
      expect(() => normalizePoolerUrl(value)).toThrow("DATABASE_URL must contain only an absolute");
      try {
        normalizePoolerUrl(value);
      } catch (error) {
        expect((error as Error).message).not.toContain("dummy");
      }
    },
  );

  it("still converts the session pooler to transaction mode", () => {
    expect(parse(normalizePoolerUrl(`"${connection.replace(":6543/", ":5432/")}"`)).port).toBe("6543");
  });
});
