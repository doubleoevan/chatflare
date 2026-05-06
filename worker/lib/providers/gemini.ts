// google gemini provider adapter.
// gemini does not match openai's wire format, so it gets its own adapter.

import { parseSseEvents } from "./sseStream";

type Message = { role: string; content: string };

type StreamParams = {
    apiKey: string;
    modelId: string;
    messages: Message[];
    env: Env;
    executionCtx: ExecutionContext;
};

type GeminiEvent = {
    error?: { message?: unknown };
    candidates?: Array<{
        content?: { parts?: Array<{ text?: unknown }> };
    }>;
};

function messagesToGeminiContents(messages: Message[]) {
    return messages
        .filter((message) => {
            return message.role !== "system";
        })
        .map((message) => {
            return {
                role: message.role === "assistant" ? "model" : "user",
                parts: [{ text: message.content }],
            };
        });
}

async function pipeGeminiToNdjson(
    upstream: Response,
    writer: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
    const encoder = new TextEncoder();

    try {
        for await (const event of parseSseEvents(upstream)) {
            if (typeof event !== "object" || event === null) {
                continue;
            }
            const streamEvent = event as GeminiEvent;

            // surface provider errors mid-stream
            const errorMessage = streamEvent.error?.message;
            if (typeof errorMessage === "string" && errorMessage.length > 0) {
                throw new Error(`Gemini error: ${ errorMessage }`);
            }

            // gemini puts text in candidates[0].content.parts[].text
            // important: parts is an ARRAY; iterate ALL parts (origin does this too)
            const parts = streamEvent.candidates?.[0]?.content?.parts;
            if (!Array.isArray(parts)) {
                continue;
            }
            for (const part of parts) {
                const text = part?.text;
                if (typeof text !== "string" || text.length === 0) {
                    continue;
                }
                await writer.write(
                    encoder.encode(JSON.stringify({ chunk: text }) + "\n"),
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

export async function streamGemini(params: StreamParams): Promise<Response> {
    const { apiKey, modelId, messages, env, executionCtx } = params;

    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/google-ai-studio/v1beta/models/${ modelId }:streamGenerateContent?alt=sse`;

    const upstream = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
            "x-goog-api-key": apiKey,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            contents: messagesToGeminiContents(messages),
        }),
    });

    if (!upstream.ok || !upstream.body) {
        const errorBody = await upstream.text();
        return new Response(
            JSON.stringify({
                code: "UPSTREAM_UNAVAILABLE",
                message: `gemini returned ${ upstream.status }: ${ errorBody.slice(0, 500) }`,
            }),
            { status: 502, headers: { "content-type": "application/json" } },
        );
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    executionCtx.waitUntil(pipeGeminiToNdjson(upstream, writer));

    return new Response(readable, {
        headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
        },
    });
}
