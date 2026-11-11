CREATE TABLE "business_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"business_id" integer,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "business_invite" ADD CONSTRAINT "business_invite_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_invite_token" ON "business_invite" USING btree ("token_digest");--> statement-breakpoint
ALTER TABLE "business_invite" ENABLE ROW LEVEL SECURITY;