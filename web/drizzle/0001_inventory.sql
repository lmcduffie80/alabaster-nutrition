CREATE TYPE "public"."inventory_count_status" AS ENUM('open', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."inventory_item_type" AS ENUM('ingredient', 'supply');--> statement-breakpoint
CREATE TABLE "inventory_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "inventory_count_status" DEFAULT 'open' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"started_by" uuid NOT NULL,
	"finished_at" timestamp with time zone,
	"finished_by" uuid,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_count_line" (
	"count_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(10, 2),
	"entered_by" uuid,
	"entered_at" timestamp with time zone,
	CONSTRAINT "inventory_count_line_count_id_item_id_pk" PRIMARY KEY("count_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "inventory_item_type" NOT NULL,
	"unit" text NOT NULL,
	"spot_id" uuid NOT NULL,
	"supplier_id" uuid,
	"supplier_code" text,
	"pack_size" numeric(10, 2) DEFAULT 1 NOT NULL,
	"reorder_at" numeric(10, 2) NOT NULL,
	"order_up_to" numeric(10, 2) NOT NULL,
	"default_unit_cost" numeric(10, 2),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_spot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business" ADD COLUMN "count_weekday" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_count" ADD CONSTRAINT "inventory_count_started_by_employee_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count" ADD CONSTRAINT "inventory_count_finished_by_employee_id_fk" FOREIGN KEY ("finished_by") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_line" ADD CONSTRAINT "inventory_count_line_count_id_inventory_count_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."inventory_count"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_line" ADD CONSTRAINT "inventory_count_line_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_line" ADD CONSTRAINT "inventory_count_line_entered_by_employee_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_spot_id_storage_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."storage_spot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_count_one_open" ON "inventory_count" USING btree ("status") WHERE "inventory_count"."status" = 'open';--> statement-breakpoint
CREATE INDEX "inventory_count_finished" ON "inventory_count" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "inventory_count_line_item" ON "inventory_count_line" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_name_unique" ON "inventory_item" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_supplier_code_unique" ON "inventory_item" USING btree ("supplier_id","supplier_code");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_spot_name_unique" ON "storage_spot" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_name_unique" ON "supplier" USING btree (lower("name"));