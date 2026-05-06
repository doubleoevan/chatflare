// drizzle schema for chatflare's d1 database.
// phase 5: provider_votes only (replaces in-memory stub from phase 2).
// future phases: users, conversations (metadata), shared_links.
// per-conversation message history goes to ChatRoom DO SQLite, NOT here.

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

type Competitor = {
    providerId: string;
    modelId: string;
    modelLabel: string;
};

export const providerVotes = sqliteTable("provider_votes", {
    id: text("id").primaryKey(),
    winnerProviderId: text("winner_provider_id").notNull(),
    winnerModelId: text("winner_model_id").notNull(),
    winnerModelLabel: text("winner_model_label").notNull(),
    // sqlite has no native array; store as json text and assert the type
    competitors: text("competitors", { mode: "json" }).$type<Competitor[]>().notNull(),
    message: text("message").notNull(),
    // unix epoch seconds; sqlite has no native datetime
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    // optional cf-derived geo (request.cf at vote time)
    country: text("country"),
    region: text("region"),
    city: text("city"),
    latitude: real("latitude"),
    longitude: real("longitude"),
});

export type ProviderVote = typeof providerVotes.$inferSelect;
export type ProviderVoteInsert = typeof providerVotes.$inferInsert;
