import { Hono } from "hono";
import { PROVIDER_API_KEY_HEADER } from "@chatwar/shared";

import { fetchAnthropicModels } from "../lib/providers/anthropic";
import { fetchOpenAIModels } from "../lib/providers/openai";
import { fetchDeepSeekModels } from "../lib/providers/deepseek";
import { fetchXaiModels } from "../lib/providers/xai";
import { fetchPerplexityModels } from "../lib/providers/perplexity";
import { fetchGeminiModels } from "../lib/providers/gemini";

const app = new Hono<{ Bindings: Env }>();

// GET /v1/providers/:providerId/models
// fetches live model list from the provider via AI Gateway.
// perplexity falls back to a static list (no public /models endpoint exists).
app.get("/v1/providers/:providerId/models", async (context) => {
    const apiKey = context.req.header(PROVIDER_API_KEY_HEADER);
    if (!apiKey) {
        return context.json(
            {
                code: "INVALID_API_KEY",
                message: `Missing required header: ${ PROVIDER_API_KEY_HEADER }`,
            },
            400,
        );
    }

    const providerId = context.req.param("providerId");
    const params = { apiKey, env: context.env };

    try {
        if (providerId === "anthropic") {
            return context.json(await fetchAnthropicModels(params));
        }
        if (providerId === "openai") {
            return context.json(await fetchOpenAIModels(params));
        }
        if (providerId === "deepseek") {
            return context.json(await fetchDeepSeekModels(params));
        }
        if (providerId === "xai") {
            return context.json(await fetchXaiModels(params));
        }
        if (providerId === "perplexity") {
            return context.json(await fetchPerplexityModels(params));
        }
        if (providerId === "gemini") {
            return context.json(await fetchGeminiModels(params));
        }

        return context.json(
            { code: "INVALID_PROVIDER", message: `Unknown provider: ${ providerId }` },
            400,
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch models";
        return context.json({ code: "MODELS_FETCH_FAILED", message }, 502);
    }
});

export { app as modelsRoutes };
