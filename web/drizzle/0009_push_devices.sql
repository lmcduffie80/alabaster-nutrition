CREATE TABLE "push_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" integer DEFAULT nullif(current_setting('app.business_id', true), '')::int NOT NULL,
	"employee_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_employee_fk" FOREIGN KEY ("business_id","employee_id") REFERENCES "public"."employee"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_device_token_unique" ON "push_device" USING btree ("business_id","token");--> statement-breakpoint
CREATE INDEX "push_device_employee" ON "push_device" USING btree ("business_id","employee_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "push_device" TO tenant_app;
--> statement-breakpoint
ALTER TABLE "push_device" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "push_device" USING (business_id = nullif(current_setting('app.business_id', true), '')::int) WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::int);
