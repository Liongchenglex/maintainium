CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'analyzing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "codebase_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"project_metadata" jsonb,
	"file_registry" jsonb,
	"dependency_graph" jsonb,
	"dependency_inventory" jsonb,
	"api_surface" jsonb,
	"data_model" jsonb,
	"patterns" jsonb,
	"security_metadata" jsonb,
	"content_structure" jsonb,
	"llm_intelligence" jsonb,
	"analyzed_at" timestamp with time zone,
	"analysis_duration_ms" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codebase_analyses_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "codebase_analyses" ADD CONSTRAINT "codebase_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;