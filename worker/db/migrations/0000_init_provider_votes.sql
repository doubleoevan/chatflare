CREATE TABLE `provider_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`winner_provider_id` text NOT NULL,
	`winner_model_id` text NOT NULL,
	`winner_model_label` text NOT NULL,
	`competitors` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	`country` text,
	`region` text,
	`city` text,
	`latitude` real,
	`longitude` real
);
