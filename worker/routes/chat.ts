import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// POST /v1/providers/:providerId/chat
// streaming endpoint deferred to phase 3 (ai gateway + transformstream)
// 501 keeps the api surface honest about what's not built yet
app.post("/v1/providers/:providerId/chat", (c) => {
    return c.json(
        {
            code: "NOT_IMPLEMENTED",
            message: "Streaming chat lands in phase 3 via AI Gateway. Use dev:mock for the streaming UI in the meantime.",
        },
        501,
    );
});

// cors middleware in worker/index.ts handles OPTIONS preflight automatically

export { app as chatRoutes };
