ALTER TABLE `llm_providers` ADD `auth_type` text DEFAULT 'api_key' NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `oauth` text;