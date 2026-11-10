CREATE TABLE "delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_number" text,
	"invoice_total" numeric(10, 2),
	"received_on" date NOT NULL,
	"on_shelf_for_count" boolean DEFAULT false NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"line_total" numeric(10, 2),
	"invoice_code" text,
	"invoice_description" text
);
--> statement-breakpoint
CREATE TABLE "inventory_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_line" ADD CONSTRAINT "delivery_line_delivery_id_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_line" ADD CONSTRAINT "delivery_line_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_received_on" ON "delivery" USING btree ("received_on");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_invoice_unique" ON "delivery" USING btree ("supplier_id",lower("invoice_number")) WHERE "delivery"."deleted_at" is null and "delivery"."invoice_number" is not null;--> statement-breakpoint
CREATE INDEX "delivery_line_delivery" ON "delivery_line" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_line_item" ON "delivery_line" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_audit_entity" ON "inventory_audit" USING btree ("entity","entity_id");