CREATE TABLE `llm_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer,
	`stage` text NOT NULL,
	`model_ref_id` integer,
	`provider_name` text NOT NULL,
	`model_id` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real,
	`latency_ms` integer NOT NULL,
	`status` text NOT NULL,
	`is_fallback` integer DEFAULT false NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` integer NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text,
	`max_output_tokens` integer DEFAULT 32000 NOT NULL,
	`price_input` real,
	`price_output` real,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `llm_models_provider_model` ON `llm_models` (`provider_id`,`model_id`);--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `preset` text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `enabled` integer DEFAULT true NOT NULL;