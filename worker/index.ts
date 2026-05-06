import { Hono } from "hono";
import { cors } from "hono/cors";

import { healthRoutes } from "./routes/health";
import { modelsRoutes } from "./routes/models";
import { votesRoutes } from "./routes/votes";
import { chatRoutes } from "./routes/chat";

// hono app typed to our cloudflare bindings
const app = new Hono<{ Bindings: Env }>();

// permissive cors for /v1/*; tighten in phase 8
app.use(
    "/v1/*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["content-type", "x-provider-api-key", "cache-control"],
        maxAge: 86400,
    }),
);

// each route module owns its full /v1/* path
app.route("/", healthRoutes);
app.route("/", modelsRoutes);
app.route("/", votesRoutes);
app.route("/", chatRoutes);

export default {
    async fetch(request, env, ctx): Promise<Response> {
        const url = new URL(request.url);
        // hono handles /v1/*; everything else falls through to static assets
        if (url.pathname.startsWith("/v1/")) {
            return app.fetch(request, env, ctx);
        }
        // defensive: with run_worker_first /v1/*, this branch shouldn't fire
        return env.ASSETS.fetch(request);
    },
} satisfies ExportedHandler<Env>;
