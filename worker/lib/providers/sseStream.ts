// shared sse parser for all providers.
// uses eventsource-parser to robustly handle line ending differences,
// multi-line data fields, and other sse format edge cases that bit us
// with perplexity and gemini (the origin chatwar code uses this too).

import { createParser, type EventSourceMessage } from "eventsource-parser";

// async generator: yields each parsed JSON event from an SSE response body.
// returns when stream ends or [DONE] sentinel is seen.
// silently ignores non-JSON keepalives.
export async function* parseSseEvents(response: Response): AsyncGenerator<unknown> {
    if (!response.body) {
        throw new Error("Missing response body");
    }

    const eventBuffer: string[] = [];
    const decoder = new TextDecoder();
    const parser = createParser({
        onEvent: (event: EventSourceMessage) => {
            if (event.data) {
                eventBuffer.push(event.data);
            }
        },
    });

    const reader = response.body.getReader();
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            parser.feed(decoder.decode(value, { stream: true }));

            while (eventBuffer.length > 0) {
                const dataString = eventBuffer.shift()!.trim();
                if (!dataString) {
                    continue;
                }
                if (dataString === "[DONE]") {
                    return;
                }
                try {
                    yield JSON.parse(dataString);
                } catch {
                    // ignore non-json keepalives
                }
            }
        }
    } finally {
        try {
            await reader.cancel();
        } catch {
            // ignore
        }
    }
}
