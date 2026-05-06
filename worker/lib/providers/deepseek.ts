// deepseek provider adapter.
// models normalization ported from chatwar: list all, pretty-label, slice to 6.

import { createChatCompletionsAdapter } from "./chatCompletionsProvider";
import type { ModelListParams, ModelEntry, ProviderModelList } from "./types";

const LIMIT_MODELS = 6;

type DeepSeekModelsResponse = {
    data: Array<{ id: string }>;
};

export const streamDeepSeek = createChatCompletionsAdapter({
    providerId: "deepseek",
    gatewayPath: "deepseek/chat/completions",
});

// "deepseek-chat" → "Deepseek Chat"
function toLabel(modelId: string): string {
    return modelId
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (firstLetter) => {
            return firstLetter.toUpperCase();
        });
}

function normalizeDeepSeekModels(payload: DeepSeekModelsResponse): ProviderModelList {
    const models: ModelEntry[] = payload.data
        .map((model) => {
            return {
                id: model.id,
                label: toLabel(model.id),
                contextWindow: 64000,
                capabilities: { tools: true, streaming: true },
            };
        })
        .slice(0, LIMIT_MODELS);

    return {
        providerId: "deepseek",
        defaultModelId: models[0]?.id ?? "",
        models,
    };
}

export async function fetchDeepSeekModels(params: ModelListParams): Promise<ProviderModelList> {
    const { apiKey, env } = params;

    // deepseek's actual api is /models (no /v1 prefix); their chat endpoint
    // also lives at /chat/completions without /v1
    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/deepseek/models`;

    const response = await fetch(gatewayUrl, {
        method: "GET",
        headers: { "authorization": `Bearer ${ apiKey }` },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DeepSeek models returned ${ response.status }: ${ errorBody.slice(0, 300) }`);
    }

    const payload = await response.json<DeepSeekModelsResponse>();
    return normalizeDeepSeekModels(payload);
}
