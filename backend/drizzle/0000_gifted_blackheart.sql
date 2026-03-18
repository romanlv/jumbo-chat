CREATE TABLE `documents` (
	`rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chunk_id` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` F32_BLOB(1536),
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_chunk_id_unique` ON `documents` (`chunk_id`);--> statement-breakpoint
CREATE INDEX `idx_documents_source_url` ON `documents` (`source_url`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`sources` text,
	`tool_calls` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`escalated_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
