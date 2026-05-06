// google gemini provider adapter.
// models normalization ported from chatwar: filter chat-capable + stable,
// score by family/tier/streaming/version, dedupe by group, slice to 6.

import { parseSseEvents } from "./sseStream";
import type { StreamParams, ModelListParams, ModelEntry, ProviderModelList } from "./types";

const LIMIT_MODELS = 6;

type GeminiModel = {
    name: string;
    displayName?: string;
    version?: string;
    baseModelId?: string;
    supportedGenerationMethods?: string[];
    inputTokenLimit?: number;
};

type GeminiModelsResponse = {
    models?: GeminiModel[];
};

type GeminiEvent = {
    error?: { message?: unknown };
    candidates?: Array<{
        content?: { parts?: Array<{ text?: unknown }> };
    }>;
};

// === models ===

function toModelName(name: string): string {
    return name.replace(/^models\//, "");
}

// removes -001 / -latest / -preview / -experimental for grouping
function toModelId(rawId: string): string {
    return toModelName(rawId)
        .toLowerCase()
        .replace(/-\d{3}$/, "")
        .replace(/-latest$/, "")
        .replace(/-preview$/, "")
        .replace(/-experimental$/, "");
}

function toGroupId(model: GeminiModel): string {
    const groupId = model.baseModelId
        ? toModelName(model.baseModelId)
        : toModelName(model.name);
    return toModelId(groupId);
}

// chat-capable: generateContent in supported methods (gemini api stopped
// listing streamGenerateContent on stable models in 2026 even though
// streaming still works). filter out preview/experimental and image-gen.
function isChatModel(model: GeminiModel): boolean {
    const modelId = toModelName(model.name).toLowerCase();
    const isChatCapable = model.supportedGenerationMethods?.includes("generateContent") ?? false;
    if (!isChatCapable) {
        return false;
    }
    const isStable = !modelId.includes("preview") && !modelId.includes("experimental");
    if (!isStable) {
        return false;
    }
    if (modelId.includes("image")) {
        return false;
    }
    return true;
}

// streaming flag for capabilities — gemini supports streaming on all chat
// models even when not listed; default to true for stable chat models.
function isStreaming(model: GeminiModel): boolean {
    return model.supportedGenerationMethods?.includes("streamGenerateContent")
        ?? model.supportedGenerationMethods?.includes("generateContent")
        ?? false;
}

function toVersionNumber(version: string | undefined): number {
    const value = Number(version);
    return Number.isFinite(value) ? value : 0;
}

// "2.5" → 205 (so 2.5 > 2.0 > 1.5)
function toNameVersionNumber(modelName: string): number {
    const name = modelName.toLowerCase();
    const hyphenated = name.match(/gemini-(\d+)(?:\.(\d+))?/);
    if (hyphenated) {
        const major = Number(hyphenated[1]);
        const minor = Number(hyphenated[2] ?? 0);
        if (Number.isFinite(major) && Number.isFinite(minor)) {
            return major * 100 + minor;
        }
    }
    const spaced = name.match(/gemini\s+(\d+)(?:\.(\d+))?/);
    if (spaced) {
        const major = Number(spaced[1]);
        const minor = Number(spaced[2] ?? 0);
        if (Number.isFinite(major) && Number.isFinite(minor)) {
            return major * 100 + minor;
        }
    }
    return 0;
}

function rankModel(model: GeminiModel): number {
    let score = 0;
    const modelName = toModelName(model.name);
    const family = Math.max(
        toNameVersionNumber(modelName),
        toNameVersionNumber(model.displayName ?? ""),
    );
    score += family * 10;

    const modelId = toModelId(modelName);
    if (modelId.includes("pro")) {
        score += 300;
    }
    if (modelId.includes("flash")) {
        score += 200;
    }
    if (modelId.includes("lite")) {
        score -= 10;
    }
    if (modelId.includes("nano")) {
        score -= 20;
    }
    if (isStreaming(model)) {
        score += 25;
    }
    score += toVersionNumber(model.version) * 10;
    return score;
}

function dedupeModels(models: ModelEntry[]): ModelEntry[] {
    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();
    const unique: ModelEntry[] = [];
    for (const model of models) {
        const baseId = toModelId(model.id);
        const baseLabel = model.label.trim().toLowerCase();
        if (seenIds.has(baseId)) {
            continue;
        }
        if (seenLabels.has(baseLabel)) {
            continue;
        }
        seenIds.add(baseId);
        seenLabels.add(baseLabel);
        unique.push(model);
    }
    return unique;
}

function normalizeGeminiModels(payload: GeminiModelsResponse): ProviderModelList {
    const responseModels = payload.models ?? [];
    const chatModels = responseModels.filter(isChatModel);

    const groupModels = new Map<string, GeminiModel>();
    for (const model of chatModels) {
        const groupId = toGroupId(model);
        const current = groupModels.get(groupId);
        if (!current || rankModel(model) > rankModel(current)) {
            groupModels.set(groupId, model);
        }
    }

    const topModels = [...groupModels.values()].sort((firstModel, secondModel) => {
        const score = rankModel(secondModel) - rankModel(firstModel);
        if (score !== 0) {
            return score;
        }
        return toModelName(secondModel.name).localeCompare(toModelName(firstModel.name));
    });

    const candidateModels: ModelEntry[] = topModels.map((model) => {
        const id = toModelName(model.name);
        return {
            id,
            label: model.displayName ?? id,
            contextWindow: model.inputTokenLimit,
            capabilities: { vision: true, tools: true, streaming: isStreaming(model) },
        };
    });
    const models = dedupeModels(candidateModels).slice(0, LIMIT_MODELS);

    const fallbackName = chatModels[0]?.name ?? responseModels[0]?.name ?? "gemini-2.5-flash";
    const defaultModelId = models[0]?.id ?? toModelName(fallbackName);

    return {
        providerId: "gemini",
        defaultModelId,
        models,
    };
}

export async function fetchGeminiModels(params: ModelListParams): Promise<ProviderModelList> {
    const { apiKey, env } = params;

    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/google-ai-studio/v1beta/models?pageSize=200`;

    const response = await fetch(gatewayUrl, {
        method: "GET",
        headers: { "x-goog-api-key": apiKey },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini models returned ${ response.status }: ${ errorBody.slice(0, 300) }`);
    }

    const payload = await response.json<GeminiModelsResponse>();
    return normalizeGeminiModels(payload);
}

// === chat streaming ===

function messagesToGeminiContents(messages: { role: string; content: string }[]) {
    return messages
        .filter((message) => {
            return message.role !== "system";
        })
        .map((message) => {
            return {
                role: message.role === "assistant" ? "model" : "user",
                parts: [{ text: message.content }],
            };
        });
}

async function pipeGeminiToNdjson(
    upstream: Response,
    writer: WritableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
    const encoder = new TextEncoder();

    try {
        for await (const event of parseSseEvents(upstream)) {
            if (typeof event !== "object" || event === null) {
                continue;
            }
            const streamEvent = event as GeminiEvent;

            const errorMessage = streamEvent.error?.message;
            if (typeof errorMessage === "string" && errorMessage.length > 0) {
                throw new Error(`Gemini error: ${ errorMessage }`);
            }

            const parts = streamEvent.candidates?.[0]?.content?.parts;
            if (!Array.isArray(parts)) {
                continue;
            }
            for (const part of parts) {
                const text = part?.text;
                if (typeof text !== "string" || text.length === 0) {
                    continue;
                }
                await writer.write(
                    encoder.encode(JSON.stringify({ chunk: text }) + "\n"),
                );
            }
        }
        await writer.write(encoder.encode(JSON.stringify({ done: true }) + "\n"));
    } catch (error) {
        const message = error instanceof Error ? error.message : "Stream parse failed";
        await writer.write(
            encoder.encode(JSON.stringify({
                error: { code: "STREAM_PARSE_ERROR", message },
            }) + "\n"),
        );
        await writer.write(encoder.encode(JSON.stringify({ done: true }) + "\n"));
    } finally {
        await writer.close();
    }
}

export async function streamGemini(params: StreamParams): Promise<Response> {
    const { apiKey, modelId, messages, env, executionCtx } = params;

    const gatewayUrl =
        `https://gateway.ai.cloudflare.com/v1/${ env.CF_ACCOUNT_ID }/${ env.AI_GATEWAY_ID }/google-ai-studio/v1beta/models/${ modelId }:streamGenerateContent?alt=sse`;

    const upstream = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
            "x-goog-api-key": apiKey,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            contents: messagesToGeminiContents(messages),
        }),
    });

    if (!upstream.ok || !upstream.body) {
        const errorBody = await upstream.text();
        return new Response(
            JSON.stringify({
                code: "UPSTREAM_UNAVAILABLE",
                message: `gemini returned ${ upstream.status }: ${ errorBody.slice(0, 500) }`,
            }),
            { status: 502, headers: { "content-type": "application/json" } },
        );
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    executionCtx.waitUntil(pipeGeminiToNdjson(upstream, writer));

    return new Response(readable, {
        headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
        },
    });
}
