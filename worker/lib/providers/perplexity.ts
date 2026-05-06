import { createChatCompletionsAdapter } from "./chatCompletionsProvider";

// perplexity uses 'perplexity-ai' as the AI Gateway provider id
export const streamPerplexity = createChatCompletionsAdapter({
    providerId: "perplexity",
    gatewayPath: "perplexity-ai/chat/completions",
});
