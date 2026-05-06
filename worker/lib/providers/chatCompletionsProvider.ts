// generic adapter factory for any provider that implements the openai
// chat completions wire format: POST /chat/completions, bearer auth,
// { model, messages, stream } body, SSE response with text deltas in
// choices[0].delta.content. used by openai, deepseek, xai, perplexity
// and any future provider that conforms to this de-facto-standard spec.

import { parseSseEvents } from "./sseStream";

type Message = { role: string; content: string };

type StreamParams = {
    apiKey: string;
    modelId: string;
    messages: Message[];
    env: Env;
    executionCtx: ExecutionContext;
};

type ProviderConfig = {
    providerId: string;
    gatewayPath: string;
};

type ChatCompletionsChunk = {
    choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
        text?: string;
    }>;
};

async function pipeChatCompletionsToNdjson(
    upstream: Response,
    writer: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
    const encoder = new TextEncoder();

    try {
        for await (const event of parseSseEvents(upstream)) {
            if (typeof event !== "object" || event === null) {
                continue;
            }
            // primary path: choices[0].delta.content
            // fallback: message.content or text (some providers vary)
            const parsed = event as ChatCompletionsChunk;
            const choice = parsed.choices?.[0];
            const chunk = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
            if (typeof chunk === "string" && chunk.length > 0) {
                await writer.write(
                    encoder.encode(JSON.stringify({ chunk }) + "\n"),
                );
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

export function createChatCompletionsAdapter(config: ProviderConfig) {
    return async function streamProvider(params: StreamParams): Promise<Response> {
        const { apiKey, modelId, messages, env, executionCtx } = params;

        const gatewayUrl =
            `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/${ config.gatewayPath }`;

        const upstream = await fetch(gatewayUrl, {
            method: "POST",
            headers: {
                "authorization": `Bearer ${ apiKey }`,
                "content-type": "application/json",
                "accept": "text/event-stream",
            },
            body: JSON.stringify({
                model: modelId,
                messages,
                stream: true,
            }),
        });

        if (!upstream.ok || !upstream.body) {
            const errorBody = await upstream.text();
            return new Response(
                JSON.stringify({
                    code: "UPSTREAM_UNAVAILABLE",
                    message: `${ config.providerId } returned ${ upstream.status }: ${ errorBody.slice(0, 500) }`,
                }),
                { status: 502, headers: { "content-type": "application/json" } },
            );
        }

        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();

        executionCtx.waitUntil(pipeChatCompletionsToNdjson(upstream, writer));

        return new Response(readable, {
            headers: {
                "content-type": "application/x-ndjson; charset=utf-8",
                "cache-control": "no-cache, no-transform",
                "x-accel-buffering": "no",
            },
        });
    };
}
