// shared types across all provider adapters in this directory.
// extracted so per-provider files don't have to redeclare or cross-import each other.

export type Message = { role: string; content: string };

export type StreamParams = {
    apiKey: string;
    modelId: string;
    messages: Message[];
    env: Env;
    // structural type — only need waitUntil; sidesteps tsc's two-ExecutionContext-definitions conflict
    executionCtx: { waitUntil(promise: Promise<unknown>): void };
};

export type ModelListParams = {
    apiKey: string;
    env: Env;
};

export type ModelEntry = {
    id: string;
    label: string;
    contextWindow?: number;
    capabilities?: { vision?: boolean; tools?: boolean; streaming?: boolean };
};

export type ProviderModelList = {
    providerId: string;
    models: ModelEntry[];
    defaultModelId: string;
};
