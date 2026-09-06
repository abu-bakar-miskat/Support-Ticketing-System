// Read-only diagnostic: node --env-file=.env scripts/check-db-latency.cjs
// Uses one connection and SELECT 1; never prints credentials or ticket data.
const { Client } = require("pg");

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith("pooler.supabase.com")) url.port = "6543";
  url.searchParams.delete("connection_limit");
  url.searchParams.delete("pool_timeout");
  const client = new Client({
    connectionString: url.toString(), ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000, statement_timeout: 5000,
    application_name: "pen-latency-check",
  });
  try {
    const start = performance.now();
    await client.connect();
    console.log(JSON.stringify({ connectMs: Math.round(performance.now() - start) }));
    for (let sample = 1; sample <= 3; sample++) {
      const start = performance.now();
      await client.query("SELECT 1");
      console.log(JSON.stringify({ sample, queryMs: Math.round(performance.now() - start) }));
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: "Database latency check failed", code: error.code ?? "CONNECTION_FAILED" }));
  process.exitCode = 1;
});
