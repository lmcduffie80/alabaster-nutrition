ALTER TABLE "inventory_item" ALTER COLUMN "reorder_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "order_up_to" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "starting_quantity" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "starting_on" date;