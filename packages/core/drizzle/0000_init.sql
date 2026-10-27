CREATE TABLE `candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`paper_id` text NOT NULL,
	`notable` integer DEFAULT false NOT NULL,
	`rule_score` real NOT NULL,
	`role` text,
	`reason` text
);
--> statement-breakpoint
CREATE TABLE `digest_tags` (
	`digest_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`digest_id`, `tag_id`)
);
--> statement-breakpoint
CREATE TABLE `digests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`paper_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`title_zh` text NOT NULL,
	`one_liner` text NOT NULL,
	`content_md` text NOT NULL,
	`notable` integer DEFAULT false NOT NULL,
	`pick_reason` text,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digests_paper_id_unique` ON `digests` (`paper_id`);--> statement-breakpoint
CREATE TABLE `figures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`paper_id` text NOT NULL,
	`label` text NOT NULL,
	`caption` text NOT NULL,
	`path` text NOT NULL,
	`width` integer,
	`height` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `figures_paper_label` ON `figures` (`paper_id`,`label`);--> statement-breakpoint
CREATE TABLE `llm_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`protocol` text NOT NULL,
	`base_url` text,
	`api_key` text NOT NULL,
	`model` text NOT NULL,
	`max_tokens` integer DEFAULT 16000 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `music_tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notify_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`abstract` text NOT NULL,
	`authors` text NOT NULL,
	`organization` text,
	`published_at` text NOT NULL,
	`upvotes` integer DEFAULT 0 NOT NULL,
	`citations` integer,
	`keywords` text DEFAULT '[]' NOT NULL,
	`arxiv_categories` text DEFAULT '[]' NOT NULL,
	`github_url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`name` text NOT NULL,
	`paper_id` text,
	`status` text NOT NULL,
	`log` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`trigger` text NOT NULL,
	`schedule_id` integer,
	`params` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'digest' NOT NULL,
	`cron` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`picks_per_run` integer DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storyboards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digest_id` integer NOT NULL,
	`scenes` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storyboards_digest_id_unique` ON `storyboards` (`digest_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`arxiv_categories` text NOT NULL,
	`keywords` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trend_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`title` text NOT NULL,
	`content_md` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trend_reports_month_unique` ON `trend_reports` (`month`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digest_id` integer NOT NULL,
	`path` text NOT NULL,
	`duration_sec` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `videos_digest_id_unique` ON `videos` (`digest_id`);