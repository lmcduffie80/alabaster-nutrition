ALTER TABLE "employee" ADD COLUMN "notify_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_week" ADD COLUMN "notified_snapshot" jsonb;