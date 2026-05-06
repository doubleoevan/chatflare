import { createChatCompletionsAdapter } from "./chatCompletionsProvider";

// xai uses 'grok' as the AI Gateway provider id
export const streamXai = createChatCompletionsAdapter({
    providerId: "xai",
    gatewayPath: "grok/v1/chat/completions",
});
