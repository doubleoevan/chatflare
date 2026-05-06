import { createChatCompletionsAdapter } from "./chatCompletionsProvider";

export const streamOpenAI = createChatCompletionsAdapter({
    providerId: "openai",
    gatewayPath: "openai/v1/chat/completions",
});
