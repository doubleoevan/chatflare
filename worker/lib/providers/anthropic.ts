// anthropic provider adapter.
// constructs the AI Gateway URL for anthropic, forwards user's api key
// (byok), parses anthropic's SSE format (content_block_delta events),
// re-emits as ndjson { chunk } lines + { done: true } sentinel.

type Message = { role: string; content: string };

type StreamParams = {
    apiKey: string;
    modelId: string;
    messages: Message[];
    env: Env;
    executionCtx: ExecutionContext;
};

// reads anthropic SSE from upstream, writes ndjson chunks to writer,
// closes writer when done. errors mid-stream emit a structured error frame.
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

// public adapter entry point. returns a Response — either an error
// response if upstream failed, or a streaming Response that begins
// emitting ndjson the moment it's returned.
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

    // headline pattern: TransformStream + waitUntil. response begins
    // streaming the moment we return; pipe runs concurrently.
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
