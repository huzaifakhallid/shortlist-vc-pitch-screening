ALTER TABLE "event" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "dispatch_error" text;