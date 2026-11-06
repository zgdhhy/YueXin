CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`paper_id` text NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_paper_section` ON `notes` (`paper_id`,`section`);--> statement-breakpoint
CREATE TABLE `paper_marks` (
	`paper_id` text PRIMARY KEY NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`not_interested` integer DEFAULT false NOT NULL,
	`read_state` text DEFAULT 'unread' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
-- 原先“下线”的解读改记为“不感兴趣”
INSERT INTO `paper_marks` (`paper_id`, `not_interested`) SELECT `paper_id`, 1 FROM `digests` WHERE `status` = 'hidden';--> statement-breakpoint
ALTER TABLE `digests` DROP COLUMN `status`;