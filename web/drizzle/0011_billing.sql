ALTER TABLE "business" ADD COLUMN "billing_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "plan_status" text;--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "plan_renews_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "business_stripe_customer_unique" ON "business" USING btree ("stripe_customer_id");--> statement-breakpoint
UPDATE "business" SET "billing_exempt" = true WHERE "id" IN (1, 4);--> statement-breakpoint
UPDATE "business" SET "trial_ends_at" = now() + interval '14 days' WHERE NOT "billing_exempt";--> statement-breakpoint
REVOKE UPDATE ON "business" FROM tenant_app;--> statement-breakpoint
GRANT UPDATE ("name", "time_zone", "pay_period_anchor", "pay_period_days", "missing_clock_out_hours", "late_grace_minutes", "kiosk_auto_return_seconds", "manager_pin_digest", "count_weekday") ON "business" TO tenant_app;
