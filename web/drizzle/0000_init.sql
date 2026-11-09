CREATE TYPE "public"."employee_role" AS ENUM('manager', 'employee');--> statement-breakpoint
CREATE TYPE "public"."punch_audit_action" AS ENUM('add', 'edit', 'remove');--> statement-breakpoint
CREATE TYPE "public"."punch_kind" AS ENUM('clockIn', 'clockOut', 'breakStart', 'breakEnd');--> statement-breakpoint
CREATE TYPE "public"."punch_source" AS ENUM('kiosk', 'manager');--> statement-breakpoint
CREATE TABLE "business" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'Alabaster Nutrition' NOT NULL,
	"time_zone" text DEFAULT 'America/New_York' NOT NULL,
	"pay_period_anchor" date NOT NULL,
	"pay_period_days" integer DEFAULT 7 NOT NULL,
	"missing_clock_out_hours" integer DEFAULT 12 NOT NULL,
	"kiosk_auto_return_seconds" integer DEFAULT 10 NOT NULL,
	"manager_pin_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"role" "employee_role" DEFAULT 'employee' NOT NULL,
	"color_index" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"email" text,
	"pin_digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kiosk_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"token_digest" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kiosk_device_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
CREATE TABLE "punch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "punch_kind" NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone,
	"voided" boolean DEFAULT false NOT NULL,
	"source" "punch_source" NOT NULL,
	"kiosk_device_id" uuid,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "punch_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "punch_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"punch_id" uuid NOT NULL,
	"action" "punch_audit_action" NOT NULL,
	"previous_at" timestamp with time zone,
	"new_at" timestamp with time zone,
	"reason" text NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_week" (
	"week_start" date PRIMARY KEY NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "punch" ADD CONSTRAINT "punch_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punch" ADD CONSTRAINT "punch_kiosk_device_id_kiosk_device_id_fk" FOREIGN KEY ("kiosk_device_id") REFERENCES "public"."kiosk_device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punch_audit" ADD CONSTRAINT "punch_audit_punch_id_punch_id_fk" FOREIGN KEY ("punch_id") REFERENCES "public"."punch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_approval" ADD CONSTRAINT "timesheet_approval_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_email_unique" ON "employee" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_active_pin_unique" ON "employee" USING btree ("pin_digest") WHERE "employee"."active" and "employee"."pin_digest" is not null;--> statement-breakpoint
CREATE INDEX "punch_employee_at" ON "punch" USING btree ("employee_id","at");--> statement-breakpoint
CREATE INDEX "shift_week" ON "shift" USING btree ("week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_approval_unique" ON "timesheet_approval" USING btree ("employee_id","period_start");