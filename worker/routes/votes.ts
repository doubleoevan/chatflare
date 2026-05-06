import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// GET /v1/provider-votes?limit=N
// origin queried prisma; phase 2 returns empty array
// real persistence lands in phase 5 via D1
app.get("/v1/provider-votes", (context) => {
    return context.json([]);
});

// POST /v1/provider-votes
// origin saved to prisma; phase 2 echoes back with generated id + cf geo
// real persistence lands in phase 5 via D1
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

    // workers gives us request.cf for free; no geoip-lite library needed
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
        createdAt: new Date().toISOString(),
        country,
        region,
        city,
        latitude,
        longitude,
    };

    return context.json(vote, 201);
});

export { app as votesRoutes };
