CREATE TABLE `explainer_scripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digest_id` integer NOT NULL,
	`style_id` integer,
	`style_reason` text,
	`title` text NOT NULL,
	`shots` text NOT NULL,
	`requirements_version_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `explainer_scripts_digest_id_unique` ON `explainer_scripts` (`digest_id`);--> statement-breakpoint
CREATE TABLE `video_styles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`guide` text DEFAULT '' NOT NULL,
	`tokens` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sample_path` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_styles_slug_unique` ON `video_styles` (`slug`);--> statement-breakpoint
ALTER TABLE `videos` ADD `style_id` integer;