// drizzle-kit configuration.
// dialect: sqlite for d1 (which is sqlite-compatible).
// driver: d1-http would let us push directly via the cf api;
// we instead generate SQL and apply via `wrangler d1 migrations apply`
// which runs the same migration against local + remote and tracks state
// in d1's migrations table.

import type { Config } from "drizzle-kit";

export default {
    schema: "./worker/db/schema.ts",
    out: "./worker/db/migrations",
    dialect: "sqlite",
} satisfies Config;
