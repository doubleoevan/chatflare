import { createChatCompletionsAdapter } from "./chatCompletionsProvider";
import type { ModelListParams, ProviderModelList } from "./types";

export const streamPerplexity = createChatCompletionsAdapter({
    providerId: "perplexity",
    gatewayPath: "perplexity-ai/chat/completions",
});

// perplexity has no public /models endpoint as of 2026.
// maintained as a static list — refresh manually when perplexity ships new models.
// see https://docs.perplexity.ai/guides/model-cards
export async function fetchPerplexityModels(_params: ModelListParams): Promise<ProviderModelList> {
    return {
        providerId: "perplexity",
        defaultModelId: "sonar-pro",
        models: [
            {
                id: "sonar",
                label: "Sonar",
                contextWindow: 127000,
                capabilities: { streaming: true },
            },
            {
                id: "sonar-pro",
                label: "Sonar Pro",
                contextWindow: 200000,
                capabilities: { streaming: true },
            },
            {
                id: "sonar-reasoning",
                label: "Sonar Reasoning",
                contextWindow: 127000,
                capabilities: { streaming: true },
            },
            {
                id: "sonar-reasoning-pro",
                label: "Sonar Reasoning Pro",
                contextWindow: 127000,
                capabilities: { streaming: true },
            },
            {
                id: "sonar-deep-research",
                label: "Sonar Deep Research",
                contextWindow: 127000,
                capabilities: { streaming: true },
            },
        ],
    };
}
