// openai provider adapter.
// models normalization ported from chatwar: exclude non-chat tokens, prefer
// system-owned + newest, dedupe dated variants by alias, slice to LIMIT_MODELS.

import { createChatCompletionsAdapter } from "./chatCompletionsProvider";
import type { ModelListParams, ModelEntry, ProviderModelList } from "./types";

const LIMIT_MODELS = 6;

// model id substrings that mean "not a chat model"
const NON_CHAT_TOKENS = [
    "embedding",
    "moderation",
    "dall-e",
    "image",
    "audio",
    "tts",
    "transcribe",
    "whisper",
    "realtime",
    "search",
    "codex",
    "sora",
    "osb-",
] as const;

type OpenAIModel = {
    id: string;
    object?: string;
    created: number;
    owned_by?: string;
};

type OpenAIModelsResponse = {
    data: OpenAIModel[];
};

export const streamOpenAI = createChatCompletionsAdapter({
    providerId: "openai",
    gatewayPath: "openai/v1/chat/completions",
});

function isChatModel(model: OpenAIModel): boolean {
    return !NON_CHAT_TOKENS.some((token) => {
        return model.id.includes(token);
    });
}

// "GPT 4o Mini" from "gpt-4o-mini"
function toLabel(modelId: string): string {
    return modelId.replace(/^gpt/i, "GPT").replaceAll("-", " ");
}

// collapse "gpt-5.2-2025-12-11" to "gpt-5.2" so dated snapshots dedupe
function toAliasId(modelId: string): string {
    return modelId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

function normalizeOpenAIModels(payload: OpenAIModelsResponse): ProviderModelList {
    const chatModels = payload.data
        .filter(isChatModel)
        .sort((firstModel, secondModel) => {
            // system-owned first, then newest
            const systemRank =
                Number(secondModel.owned_by === "system") - Number(firstModel.owned_by === "system");
            if (systemRank !== 0) {
                return systemRank;
            }
            return secondModel.created - firstModel.created;
        });

    const aliasModels = new Map<string, OpenAIModel>();
    for (const model of chatModels) {
        const aliasId = toAliasId(model.id);
        if (!aliasModels.has(aliasId)) {
            aliasModels.set(aliasId, model);
        }
    }

    const topModels = [...aliasModels.values()].slice(0, LIMIT_MODELS);
    const models: ModelEntry[] = topModels.map((model) => {
        return {
            id: model.id,
            label: toLabel(model.id),
            contextWindow: 128000,
            capabilities: { tools: true, streaming: true },
        };
    });

    return {
        providerId: "openai",
        defaultModelId: models[0]?.id ?? "gpt-4o-mini",
        models,
    };
}

export async function fetchOpenAIModels(params: ModelListParams): Promise<ProviderModelList> {
    const { apiKey, env } = params;

    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/openai/v1/models`;

    const response = await fetch(gatewayUrl, {
        method: "GET",
        headers: { "authorization": `Bearer ${ apiKey }` },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI models returned ${ response.status }: ${ errorBody.slice(0, 300) }`);
    }

    const payload = await response.json<OpenAIModelsResponse>();
    return normalizeOpenAIModels(payload);
}
