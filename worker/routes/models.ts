import { Hono } from "hono";
import { PROVIDER_API_KEY_HEADER } from "@chatwar/shared";

import { stubModels } from "../lib/stubModels";

const app = new Hono<{ Bindings: Env }>();

// GET /v1/providers/:providerId/models
// origin called each provider sdk; phase 2 returns stubbed lists
// real provider calls return in phase 3 via ai gateway
app.get("/v1/providers/:providerId/models", (c) => {
    // mirror origin's api key header check for parity
    const apiKey = c.req.header(PROVIDER_API_KEY_HEADER);
    if (!apiKey) {
        return c.json(
            {
                code: "INVALID_API_KEY",
                message: `Missing required header: ${ PROVIDER_API_KEY_HEADER }`,
            },
            400,
        );
    }

    // look up stubbed model list for the provider
    const providerId = c.req.param("providerId");
    const models = stubModels[providerId];
    if (!models) {
        return c.json(
            {
                code: "INVALID_PROVIDER",
                message: `Unknown provider: ${ providerId }`,
            },
            400,
        );
    }

    return c.json(models);
});

export { app as modelsRoutes };
