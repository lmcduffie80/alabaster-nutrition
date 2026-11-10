CREATE TABLE "invoice_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid,
	"pathname" text NOT NULL,
	"page" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_scan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_photo" ADD CONSTRAINT "invoice_photo_delivery_id_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_photo_delivery" ON "invoice_photo" USING btree ("delivery_id");