ALTER TABLE "deal" ADD COLUMN "possible_duplicate_of_deal_id" uuid;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "submission_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "deck_etag" text;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_possible_duplicate_of_fk" FOREIGN KEY ("workspace_id","possible_duplicate_of_deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_deck_with_etag" CHECK (("submission"."deck_object_key" is null) = ("submission"."deck_etag" is null));