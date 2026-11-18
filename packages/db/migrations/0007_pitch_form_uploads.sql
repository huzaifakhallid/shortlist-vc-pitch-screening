CREATE TABLE "rate_limit_window" (
	"workspace_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_window_workspace_id_bucket_window_start_pk" PRIMARY KEY("workspace_id","bucket","window_start"),
	CONSTRAINT "rate_limit_window_hits_positive" CHECK ("rate_limit_window"."hits" > 0)
);
--> statement-breakpoint
CREATE TABLE "pending_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"etag" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_upload_object_key_key" UNIQUE("object_key"),
	CONSTRAINT "pending_upload_size_positive" CHECK ("pending_upload"."size_bytes" > 0),
	CONSTRAINT "pending_upload_confirmed_with_etag" CHECK (("pending_upload"."etag" is null) = ("pending_upload"."confirmed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "rate_limit_window" ADD CONSTRAINT "rate_limit_window_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_upload" ADD CONSTRAINT "pending_upload_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_upload_workspace_id_expires_at_idx" ON "pending_upload" USING btree ("workspace_id","expires_at");