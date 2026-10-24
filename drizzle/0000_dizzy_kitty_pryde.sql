CREATE TABLE `library_import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`error` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_import_fingerprint` ON `library_import_jobs` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `library_books` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`metadata` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created` integer NOT NULL
);
