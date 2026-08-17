// Vitest stand-in for the `server-only` marker package. The real package
// throws outside Next.js server bundles, which would fail any unit test that
// imports server-side libs. The marker has no runtime behaviour to preserve.
export {};
