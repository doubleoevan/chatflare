import { createChatCompletionsAdapter } from "./chatCompletionsProvider";

// deepseek's api endpoint is /chat/completions (no /v1 prefix in their api)
export const streamDeepSeek = createChatCompletionsAdapter({
    providerId: "deepseek",
    gatewayPath: "deepseek/chat/completions",
});
