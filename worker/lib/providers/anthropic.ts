// anthropic provider adapter.
// exports streamAnthropic (chat) and fetchAnthropicModels (model list).

import type { StreamParams, ModelListParams, ModelEntry, ProviderModelList } from "./types";

// === models endpoint ===

type AnthropicModelsResponse = {
    data?: Array<{
        type?: string;
        id: string;
        display_name?: string;
        created_at?: string;
    }>;
};

export async function fetchAnthropicModels(params: ModelListParams): Promise<ProviderModelList> {
    const { apiKey, env } = params;

    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/anthropic/v1/models`;

    const response = await fetch(gatewayUrl, {
        method: "GET",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic models returned ${ response.status }: ${ errorBody.slice(0, 300) }`);
    }

    const payload = await response.json<AnthropicModelsResponse>();
    const rawModels = payload.data ?? [];

    const models: ModelEntry[] = rawModels.map((entry) => {
        return {
            id: entry.id,
            label: entry.display_name ?? entry.id,
            contextWindow: 200000,
            capabilities: { vision: true, tools: true, streaming: true },
        };
    });

    // prefer a sonnet variant as default; fall back to first model
    const sonnetMatch = models.find((model) => {
        return model.id.includes("sonnet");
    });
    const defaultModelId = sonnetMatch?.id ?? models[0]?.id ?? "";

    return {
        providerId: "anthropic",
        models,
        defaultModelId,
    };
}

// === chat streaming ===

async function pipeAnthropicSseToNdjson(
    upstream: Response,
    writer: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = upstream.body!.getReader();
    let buffer = "";

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const event of events) {
                const dataLine = event.split("\n").find((line) => {
                    return line.startsWith("data: ");
                });
                if (!dataLine) {
                    continue;
                }
                const dataString = dataLine.slice(6).trim();
                if (!dataString) {
                    continue;
                }

                const parsed = JSON.parse(dataString);
                if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                    const chunk = parsed.delta.text;
                    if (chunk) {
                        await writer.write(
                            encoder.encode(JSON.stringify({ chunk }) + "\n"),
                        );
                    }
                }
            }
        }
        await writer.write(encoder.encode(JSON.stringify({ done: true }) + "\n"));
    } catch (error) {
        const message = error instanceof Error ? error.message : "Stream parse failed";
        await writer.write(
            encoder.encode(JSON.stringify({
                error: { code: "STREAM_PARSE_ERROR", message },
            }) + "\n"),
        );
        await writer.write(encoder.encode(JSON.stringify({ done: true }) + "\n"));
    } finally {
        await writer.close();
    }
}

export async function streamAnthropic(params: StreamParams): Promise<Response> {
    const { apiKey, modelId, messages, env, executionCtx } = params;

    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/anthropic/v1/messages`;

    const upstream = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: modelId,
            max_tokens: 4096,
            messages,
            stream: true,
        }),
    });

    if (!upstream.ok || !upstream.body) {
        const errorBody = await upstream.text();
        return new Response(
            JSON.stringify({
                code: "UPSTREAM_UNAVAILABLE",
                message: `Anthropic returned ${ upstream.status }: ${ errorBody.slice(0, 500) }`,
            }),
            { status: 502, headers: { "content-type": "application/json" } },
        );
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    executionCtx.waitUntil(pipeAnthropicSseToNdjson(upstream, writer));

    return new Response(readable, {
        headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
        },
    });
}
