// hardcoded per-provider model lists for phase 2 stubs.
// shape matches @chatwar/shared providerModelsSchema.
// phase 3 replaces with real provider data fetched via ai gateway.

type StubModel = {
    id: string;
    label: string;
    contextWindow?: number;
    inputCostPer1M?: number;
    outputCostPer1M?: number;
    capabilities?: {
        vision?: boolean;
        tools?: boolean;
        streaming?: boolean;
    };
};

type ProviderModelList = {
    providerId: string;
    models: StubModel[];
    defaultModelId: string;
};

export const stubModels: Record<string, ProviderModelList> = {
    anthropic: {
        providerId: "anthropic",
        defaultModelId: "claude-sonnet-4-5",
        models: [
            {
                id: "claude-opus-4-5",
                label: "Claude Opus 4.5",
                contextWindow: 200000,
                inputCostPer1M: 15,
                outputCostPer1M: 75,
                capabilities: { vision: true, tools: true, streaming: true },
            },
            {
                id: "claude-sonnet-4-5",
                label: "Claude Sonnet 4.5",
                contextWindow: 200000,
                inputCostPer1M: 3,
                outputCostPer1M: 15,
                capabilities: { vision: true, tools: true, streaming: true },
            },
            {
                id: "claude-haiku-4-5",
                label: "Claude Haiku 4.5",
                contextWindow: 200000,
                inputCostPer1M: 1,
                outputCostPer1M: 5,
                capabilities: { vision: true, tools: true, streaming: true },
            },
        ],
    },
    openai: {
        providerId: "openai",
        defaultModelId: "gpt-5.2",
        models: [
            {
                id: "gpt-5.2",
                label: "GPT-5.2",
                contextWindow: 256000,
                inputCostPer1M: 5,
                outputCostPer1M: 20,
                capabilities: { vision: true, tools: true, streaming: true },
            },
            {
                id: "gpt-5.2-mini",
                label: "GPT-5.2 Mini",
                contextWindow: 256000,
                inputCostPer1M: 0.5,
                outputCostPer1M: 2,
                capabilities: { vision: true, tools: true, streaming: true },
            },
            {
                id: "o3",
                label: "o3",
                contextWindow: 200000,
                inputCostPer1M: 10,
                outputCostPer1M: 40,
                capabilities: { tools: true, streaming: true },
            },
        ],
    },
    gemini: {
        providerId: "gemini",
        defaultModelId: "gemini-2.5-pro",
        models: [
            {
                id: "gemini-2.5-pro",
                label: "Gemini 2.5 Pro",
                contextWindow: 2000000,
                inputCostPer1M: 1.25,
                outputCostPer1M: 10,
                capabilities: { vision: true, tools: true, streaming: true },
            },
            {
                id: "gemini-2.5-flash",
                label: "Gemini 2.5 Flash",
                contextWindow: 1000000,
                inputCostPer1M: 0.3,
                outputCostPer1M: 2.5,
                capabilities: { vision: true, tools: true, streaming: true },
            },
        ],
    },
    deepseek: {
        providerId: "deepseek",
        defaultModelId: "deepseek-chat",
        models: [
            {
                id: "deepseek-chat",
                label: "DeepSeek Chat",
                contextWindow: 64000,
                inputCostPer1M: 0.27,
                outputCostPer1M: 1.1,
                capabilities: { tools: true, streaming: true },
            },
            {
                id: "deepseek-reasoner",
                label: "DeepSeek Reasoner",
                contextWindow: 64000,
                inputCostPer1M: 0.55,
                outputCostPer1M: 2.2,
                capabilities: { streaming: true },
            },
        ],
    },
    perplexity: {
        providerId: "perplexity",
        defaultModelId: "sonar-large",
        models: [
            {
                id: "sonar-large",
                label: "Sonar Large",
                contextWindow: 127000,
                inputCostPer1M: 1,
                outputCostPer1M: 1,
                capabilities: { streaming: true },
            },
            {
                id: "sonar-small",
                label: "Sonar Small",
                contextWindow: 127000,
                inputCostPer1M: 0.2,
                outputCostPer1M: 0.2,
                capabilities: { streaming: true },
            },
        ],
    },
    xai: {
        providerId: "xai",
        defaultModelId: "grok-2",
        models: [
            {
                id: "grok-2",
                label: "Grok 2",
                contextWindow: 131072,
                inputCostPer1M: 2,
                outputCostPer1M: 10,
                capabilities: { tools: true, streaming: true },
            },
            {
                id: "grok-3",
                label: "Grok 3",
                contextWindow: 200000,
                inputCostPer1M: 5,
                outputCostPer1M: 20,
                capabilities: { vision: true, tools: true, streaming: true },
            },
        ],
    },
};
