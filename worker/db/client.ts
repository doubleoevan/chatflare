// drizzle client factory for d1.
// hono routes call createDb(env.DB) once per request to get a typed query api.
// drizzle is stateless — no connection pooling, no warm-up; safe to recreate
// per request which matches workers' per-request execution model.

import { drizzle } from "drizzle-orm/d1";

export function createDb(d1: D1Database) {
    return drizzle(d1);
}
