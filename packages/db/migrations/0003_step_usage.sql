ALTER TABLE "run_step" ADD COLUMN "tokens_in" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "run_step" ADD COLUMN "tokens_out" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "run_step" ADD COLUMN "cost_micros" bigint NOT NULL;