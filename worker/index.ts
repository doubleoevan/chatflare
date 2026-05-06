// chatflare worker
// phase 1: stub /api/* responses; ASSETS handles everything else.
// phase 2 will replace this with a hono router.

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/api/")) {
            // mvp stubs so the deployed ui doesn't 500 before phase 2.
            // shapes match what the origin frontend expects.
            if (url.pathname === "/api/health") {
                return Response.json({ ok: true });
            }
            return Response.json(
                { ok: false, message: "not implemented yet (phase 2)" },
                { status: 501 },
            );
        }

        // not /api/* — let workers static assets serve the spa
        return env.ASSETS.fetch(request);
    },
} satisfies ExportedHandler<Env>;
