import { Hono } from "hono";
import { PROVIDER_API_KEY_HEADER } from "@chatwar/shared";

const app = new Hono<{ Bindings: Env }>();

// parse anthropic SSE stream, emit ndjson { chunk } lines as text deltas arrive,
// then a final { done: true } line. closes the writer when done.
async function streamAnthropicAsNdjson(
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

            // sse events are separated by blank lines (\n\n)
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const event of events) {
                // each event has 'event: x' and 'data: {...}' lines
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
                // anthropic emits content_block_delta events for streamed text
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
        // signal stream completion to the client
        await writer.write(encoder.encode(JSON.stringify({ done: true }) + "\n"));
    } catch (error) {
        // mid-stream failures: emit error frame so the ui shows something
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

// POST /v1/providers/:providerId/chat
// streams an llm response as ndjson via cloudflare ai gateway.
// phase 3: anthropic only. phase 4 adds the other 5 providers.
app.post("/v1/providers/:providerId/chat", async (context) => {
    // mirror origin's api key header check
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
    // phase 3 only implements anthropic; other providers land in phase 4
    if (providerId !== "anthropic") {
        return context.json(
            {
                code: "NOT_SUPPORTED",
                message: `${ providerId } lands in phase 4. Anthropic is the only working provider in phase 3.`,
            },
            501,
        );
    }

    const { modelId, messages } = await context.req.json<{
        modelId: string;
        messages: Array<{ role: string; content: string }>;
    }>();

    // construct ai gateway url for anthropic. byok pattern: user's api key
    // is forwarded; gateway adds caching/observability/retries on top.
    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ context.env.CF_ACCOUNT_ID }/${ context.env.AI_GATEWAY_ID }/anthropic/v1/messages`;

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
        return context.json(
            {
                code: "UPSTREAM_UNAVAILABLE",
                message: `Anthropic returned ${ upstream.status }: ${ errorBody.slice(0, 500) }`,
            },
            502,
        );
    }

    // the headline pattern: TransformStream returned directly; pipe runs in
    // background via waitUntil. response starts streaming the moment we
    // return - workers stay alive while the client connection is open.
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    context.executionCtx.waitUntil(streamAnthropicAsNdjson(upstream, writer));

    return new Response(readable, {
        headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
        },
    });
});

export { app as chatRoutes };
