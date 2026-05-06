import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// origin had GET /health and HEAD /health; we mirror at /v1/health
app.get("/v1/health", (context) => {
    return context.json({ ok: true });
});

app.on("HEAD", "/v1/health", (context) => {
    return context.body(null, 200);
});

export { app as healthRoutes };
