ALTER TABLE "business" ADD COLUMN "late_grace_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "shift" ADD COLUMN "called_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shift" ADD COLUMN "called_in_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shift" ADD COLUMN "called_in_by" text;