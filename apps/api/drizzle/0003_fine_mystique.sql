CREATE TYPE "public"."finding_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'scanning', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."scan_trigger" AS ENUM('manual', 'auto', 'scheduled');--> statement-breakpoint
CREATE TABLE "monitor_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "scan_status" DEFAULT 'pending' NOT NULL,
	"trigger" "scan_trigger" DEFAULT 'manual' NOT NULL,
	"scanners_run" text[],
	"total_findings" integer DEFAULT 0,
	"new_findings" integer DEFAULT 0,
	"resolved_findings" integer DEFAULT 0,
	"duration_ms" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scan_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"scanner" text NOT NULL,
	"fingerprint" text NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"details" jsonb,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_findings_project_fingerprint_unique" UNIQUE("project_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "production_url" text;--> statement-breakpoint
ALTER TABLE "monitor_scans" ADD CONSTRAINT "monitor_scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_findings" ADD CONSTRAINT "scan_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_findings" ADD CONSTRAINT "scan_findings_scan_id_monitor_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."monitor_scans"("id") ON DELETE no action ON UPDATE no action;