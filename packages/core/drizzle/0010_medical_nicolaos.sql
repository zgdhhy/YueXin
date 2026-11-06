CREATE TABLE `digest_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digest_id` integer NOT NULL,
	`run_id` integer NOT NULL,
	`title_zh` text NOT NULL,
	`one_liner` text NOT NULL,
	`content_md` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`requirements_version_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requirement_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stage` text NOT NULL,
	`number` integer NOT NULL,
	`content` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_versions_stage_number` ON `requirement_versions` (`stage`,`number`);--> statement-breakpoint
CREATE TABLE `trials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`stage` text NOT NULL,
	`version_id` integer NOT NULL,
	`target` text NOT NULL,
	`output` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `digests` ADD `revision_id` integer;--> statement-breakpoint
ALTER TABLE `storyboards` ADD `requirements_version_id` integer;--> statement-breakpoint
ALTER TABLE `trend_reports` ADD `requirements_version_id` integer;
