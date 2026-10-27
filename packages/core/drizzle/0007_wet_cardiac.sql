ALTER TABLE `llm_models` ADD `upstream_model_id` text;--> statement-breakpoint
ALTER TABLE `llm_models` ADD `context_window` integer;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `options` text;