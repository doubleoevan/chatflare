import { Hono } from "hono";
import { desc } from "drizzle-orm";

import { createDb } from "../db/client";
import { providerVotes } from "../db/schema";

const app = new Hono<{ Bindings: Env }>();

// GET /v1/provider-votes?limit=N
// returns most-recent votes; default limit 50, capped at 100.
app.get("/v1/provider-votes", async (context) => {
    const limitParam = context.req.query("limit");
    const requestedLimit = limitParam ? Number(limitParam) : 50;
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 100)
        : 50;

    const db = createDb(context.env.DB);
    const rows = await db
        .select()
        .from(providerVotes)
        .orderBy(desc(providerVotes.createdAt))
        .limit(limit);

    return context.json(rows);
});

// POST /v1/provider-votes
// inserts a new vote and echoes it back. cf-derived geo is captured at vote time
// from request.cf; body lat/lng overrides cf data if explicitly provided.
app.post("/v1/provider-votes", async (context) => {
    const body = await context.req.json<{
        winnerProviderId: string;
        winnerModelId: string;
        winnerModelLabel: string;
        competitors: Array<{ providerId: string; modelId: string; modelLabel: string }>;
        message: string;
        latitude?: number;
        longitude?: number;
    }>();

    // workers attaches geo info to every request for free
    const cloudflareGeo = context.req.raw.cf;
    const country = cloudflareGeo?.country as string | undefined;
    const region = cloudflareGeo?.region as string | undefined;
    const city = cloudflareGeo?.city as string | undefined;
    const cloudflareLatitude = typeof cloudflareGeo?.latitude === "string"
        ? Number(cloudflareGeo.latitude)
        : undefined;
    const cloudflareLongitude = typeof cloudflareGeo?.longitude === "string"
        ? Number(cloudflareGeo.longitude)
        : undefined;

    // body lat/lng wins over cf data if explicitly provided
    const latitude = body.latitude ?? cloudflareLatitude;
    const longitude = body.longitude ?? cloudflareLongitude;

    const vote = {
        id: crypto.randomUUID(),
        winnerProviderId: body.winnerProviderId,
        winnerModelId: body.winnerModelId,
        winnerModelLabel: body.winnerModelLabel,
        competitors: body.competitors,
        message: body.message,
        createdAt: new Date(),
        country: country ?? null,
        region: region ?? null,
        city: city ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
    };

    const db = createDb(context.env.DB);
    await db.insert(providerVotes).values(vote);

    return context.json(vote, 201);
});

export { app as votesRoutes };
