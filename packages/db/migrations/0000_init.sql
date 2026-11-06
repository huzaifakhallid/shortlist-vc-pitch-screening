CREATE TYPE "public"."agent_key" AS ENUM('intake', 'screening', 'research', 'memo', 'comms', 'pipeline', 'diligence');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('RECEIVED', 'NEEDS_REVIEW', 'OUT_OF_MANDATE', 'SCREENED', 'FIRST_CALL', 'DILIGENCE', 'IC', 'INVESTED', 'PASSED');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('deck', 'financials', 'cap_table', 'other');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('email.received', 'form.submitted', 'deal.received', 'deal.screened', 'deal.out_of_mandate', 'deal.needs_review', 'research.completed', 'memo.completed', 'deal.stage_changed', 'document.uploaded');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('slack', 'hubspot', 'airtable', 'sheets', 'postmark_domain');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."outbound_message_kind" AS ENUM('acknowledgement', 'mandate_decline', 'pass', 'info_request', 'advance');--> statement-breakpoint
CREATE TYPE "public"."outbound_message_status" AS ENUM('DRAFTED', 'EDITED', 'APPROVED', 'DISCARDED', 'SENT');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'partner', 'analyst');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."stage_change_source" AS ENUM('dashboard', 'slack');--> statement-breakpoint
CREATE TYPE "public"."submission_channel" AS ENUM('form', 'email', 'api', 'upload');--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain_normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "company_workspace_id_domain_normalized_key" UNIQUE("workspace_id","domain_normalized")
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"stage" "deal_stage" NOT NULL,
	"profile" jsonb,
	"total_score" numeric(5, 2),
	"integrity_flag" boolean,
	"assigned_partner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_workspace_id_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"object_key" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"provider" "integration_kind" NOT NULL,
	"external_id" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_link_deal_id_provider_key" UNIQUE("deal_id","provider")
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"criterion_key" text NOT NULL,
	"ai_score" integer NOT NULL,
	"new_score" integer NOT NULL,
	"reason" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_transition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"from" "deal_stage" NOT NULL,
	"to" "deal_stage" NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "stage_change_source" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"channel" "submission_channel" NOT NULL,
	"form_data" jsonb,
	"founder_email" text NOT NULL,
	"deck_object_key" text,
	"deck_sha256" text,
	"raw_email_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid,
	"agent" "agent_key" NOT NULL,
	"trigger_event_id" uuid NOT NULL,
	"config_version_id" uuid NOT NULL,
	"prompt_version" text,
	"model" text,
	"input_hash" text,
	"status" "run_status" NOT NULL,
	"output" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micros" bigint,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_run_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "agent_run_agent_trigger_event_id_key" UNIQUE("agent","trigger_event_id")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid,
	"type" "event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "event_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "event_deal_id_matches_type" CHECK (("event"."type" in ('email.received', 'form.submitted')) = ("event"."deal_id" is null))
);
--> statement-breakpoint
CREATE TABLE "outbound_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"kind" "outbound_message_kind" NOT NULL,
	"draft" text NOT NULL,
	"final_text" text,
	"status" "outbound_message_status" NOT NULL,
	"decided_by" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "run_step_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"step" text NOT NULL,
	"output" jsonb,
	"status" "run_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by" uuid NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_agent" "agent_key",
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_event_one_actor" CHECK (("audit_event"."actor_user_id" is null) <> ("audit_event"."actor_agent" is null))
);
--> statement-breakpoint
CREATE TABLE "config_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "config_version_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "config_version_workspace_id_version_key" UNIQUE("workspace_id","version")
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"credentials" text NOT NULL,
	"status" "integration_status" NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_workspace_id_kind_key" UNIQUE("workspace_id","kind")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"intake_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workspace_intake_address_unique" UNIQUE("intake_address")
);
--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."company"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_assigned_partner_fk" FOREIGN KEY ("workspace_id","assigned_partner_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_fk" FOREIGN KEY ("workspace_id","uploaded_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_link" ADD CONSTRAINT "external_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_link" ADD CONSTRAINT "external_link_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_override" ADD CONSTRAINT "score_override_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_override" ADD CONSTRAINT "score_override_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_override" ADD CONSTRAINT "score_override_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transition" ADD CONSTRAINT "stage_transition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transition" ADD CONSTRAINT "stage_transition_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transition" ADD CONSTRAINT "stage_transition_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_trigger_event_fk" FOREIGN KEY ("workspace_id","trigger_event_id") REFERENCES "public"."event"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_config_version_fk" FOREIGN KEY ("workspace_id","config_version_id") REFERENCES "public"."config_version"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."agent_run"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_deal_fk" FOREIGN KEY ("workspace_id","deal_id") REFERENCES "public"."deal"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_decided_by_fk" FOREIGN KEY ("workspace_id","decided_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_step" ADD CONSTRAINT "run_step_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_step" ADD CONSTRAINT "run_step_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."agent_run"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_fk" FOREIGN KEY ("workspace_id","actor_user_id") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_version" ADD CONSTRAINT "config_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_version" ADD CONSTRAINT "config_version_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."membership"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_workspace_id_stage_idx" ON "deal" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE INDEX "deal_company_id_idx" ON "deal" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "deal_assigned_partner_id_idx" ON "deal" USING btree ("assigned_partner_id");--> statement-breakpoint
CREATE INDEX "document_deal_id_idx" ON "document" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "note_deal_id_idx" ON "note" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "score_override_deal_id_idx" ON "score_override" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "stage_transition_deal_id_idx" ON "stage_transition" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "submission_deal_id_idx" ON "submission" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "submission_workspace_id_founder_email_idx" ON "submission" USING btree ("workspace_id","founder_email");--> statement-breakpoint
CREATE INDEX "agent_run_workspace_id_deal_id_idx" ON "agent_run" USING btree ("workspace_id","deal_id");--> statement-breakpoint
CREATE INDEX "agent_run_trigger_event_id_idx" ON "agent_run" USING btree ("trigger_event_id");--> statement-breakpoint
CREATE INDEX "agent_run_config_version_id_idx" ON "agent_run" USING btree ("config_version_id");--> statement-breakpoint
CREATE INDEX "event_workspace_id_deal_id_idx" ON "event" USING btree ("workspace_id","deal_id");--> statement-breakpoint
CREATE INDEX "event_unprocessed_idx" ON "event" USING btree ("seq") WHERE "event"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "outbound_message_run_id_idx" ON "outbound_message" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "outbound_message_deal_id_status_idx" ON "outbound_message" USING btree ("deal_id","status");--> statement-breakpoint
CREATE INDEX "run_step_run_id_seq_idx" ON "run_step" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "api_key_workspace_id_idx" ON "api_key" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audit_event_workspace_id_created_at_idx" ON "audit_event" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "config_version_one_active_idx" ON "config_version" USING btree ("workspace_id") WHERE "config_version"."is_active";--> statement-breakpoint
CREATE INDEX "membership_user_id_idx" ON "membership" USING btree ("user_id");