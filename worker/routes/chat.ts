import { Hono } from "hono";
import { PROVIDER_API_KEY_HEADER } from "@chatwar/shared";

import { streamAnthropic } from "../lib/providers/anthropic";
import { streamOpenAI } from "../lib/providers/openai";
import { streamDeepSeek } from "../lib/providers/deepseek";
import { streamXai } from "../lib/providers/xai";
import { streamPerplexity } from "../lib/providers/perplexity";
import { streamGemini } from "../lib/providers/gemini";

const app = new Hono<{ Bindings: Env }>();

// POST /v1/providers/:providerId/chat
// streams an llm response as ndjson via cloudflare ai gateway.
// dispatches to per-provider adapter in worker/lib/providers/.
app.post("/v1/providers/:providerId/chat", async (context) => {
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

    const { modelId, messages } = await context.req.json<{
        modelId: string;
        messages: Array<{ role: string; content: string }>;
    }>();

    const providerId = context.req.param("providerId");
    const params = {
        apiKey,
        modelId,
        messages,
        env: context.env,
        executionCtx: context.executionCtx,
    };

    if (providerId === "anthropic") {
        return streamAnthropic(params);
    }
    if (providerId === "openai") {
        return streamOpenAI(params);
    }
    if (providerId === "deepseek") {
        return streamDeepSeek(params);
    }
    if (providerId === "xai") {
        return streamXai(params);
    }
    if (providerId === "perplexity") {
        return streamPerplexity(params);
    }
    if (providerId === "gemini") {
        return streamGemini(params);
    }

    return context.json(
        {
            code: "NOT_SUPPORTED",
            message: `Unknown provider: ${ providerId }`,
        },
        400,
    );
});

export { app as chatRoutes };
