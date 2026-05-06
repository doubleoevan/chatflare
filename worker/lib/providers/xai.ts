// xai provider adapter.
// models normalization ported from chatwar: filter non-chat, score by version
// + reasoning + fast tokens, label transformation with grok/xai/ai casing.

import { createChatCompletionsAdapter } from "./chatCompletionsProvider";
import type { ModelListParams, ModelEntry, ProviderModelList } from "./types";

const LIMIT_MODELS = 6;

const WORD_NAME: Record<string, string> = {
    grok: "Grok",
    xai: "xAI",
    ai: "AI",
};

type XAIModel = { id: string };

type XAIModelsResponse = {
    data: XAIModel[];
};

export const streamXai = createChatCompletionsAdapter({
    providerId: "xai",
    gatewayPath: "grok/v1/chat/completions",
});

function isChatModel(model: XAIModel): boolean {
    const modelId = model.id.toLowerCase();
    if (modelId.includes("image")) {
        return false;
    }
    if (modelId.includes("vision")) {
        return false;
    }
    if (modelId.includes("code")) {
        return false;
    }
    if (modelId.includes("embedding")) {
        return false;
    }
    return true;
}

// "grok-3-fast-reasoning" → "Grok 3 Fast Reasoning", then "Grok 4 1" → "Grok 4.1"
function toLabel(modelId: string): string {
    const baseLabel = modelId
        .replace(/[-_]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((word) => {
            const knownName = WORD_NAME[word.toLowerCase()];
            if (knownName) {
                return knownName;
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
    return baseLabel.replace(/\b(Grok)\s+(\d+)\s+(\d+)\b/g, "$1 $2.$3");
}

function toMajorVersion(modelId: string): number {
    const match = modelId.toLowerCase().match(/\bgrok-(\d+)\b/);
    if (!match) {
        return -1;
    }
    return Number.parseInt(match[1]!, 10);
}

function toMinorVersion(modelId: string): number {
    const match = modelId.toLowerCase().match(/\bgrok-\d+-(\d+)\b/);
    if (!match) {
        return 0;
    }
    const value = Number.parseInt(match[1]!, 10);
    return value <= 20 ? value : 0;
}

function hasToken(modelId: string, token: string): boolean {
    return modelId.toLowerCase().includes(token);
}

function rankModel(model: XAIModel): number {
    const modelId = model.id;
    const major = Math.max(toMajorVersion(modelId), 0) * 1_000_000;
    const minor = toMinorVersion(modelId) * 10_000;
    const reasoning = hasToken(modelId, "reason") && !hasToken(modelId, "non") ? 1_000 : 0;
    const fast = hasToken(modelId, "fast") ? 100 : 0;
    return major + minor + reasoning + fast;
}

function normalizeXaiModels(payload: XAIModelsResponse): ProviderModelList {
    const topModels = payload.data
        .filter(isChatModel)
        .sort((firstModel, secondModel) => {
            const rank = rankModel(secondModel) - rankModel(firstModel);
            if (rank !== 0) {
                return rank;
            }
            return secondModel.id.localeCompare(firstModel.id);
        })
        .slice(0, LIMIT_MODELS);

    const models: ModelEntry[] = topModels.map((model) => {
        return {
            id: model.id,
            label: toLabel(model.id),
            contextWindow: 131072,
            capabilities: { tools: true, streaming: true },
        };
    });

    return {
        providerId: "xai",
        defaultModelId: models[0]?.id ?? "",
        models,
    };
}

export async function fetchXaiModels(params: ModelListParams): Promise<ProviderModelList> {
    const { apiKey, env } = params;

    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/grok/v1/models`;

    const response = await fetch(gatewayUrl, {
        method: "GET",
        headers: { "authorization": `Bearer ${ apiKey }` },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`xAI models returned ${ response.status }: ${ errorBody.slice(0, 300) }`);
    }

    const payload = await response.json<XAIModelsResponse>();
    return normalizeXaiModels(payload);
}
