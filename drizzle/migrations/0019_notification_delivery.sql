CREATE TYPE "public"."notification_delivery_channel" AS ENUM('SMS');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "notification_plans" ADD CONSTRAINT "notification_plans_business_id_id_key" UNIQUE("business_id","id");--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"channel" "notification_delivery_channel" DEFAULT 'SMS' NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"recipient" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_plan_channel_key" UNIQUE("plan_id","channel"),
	CONSTRAINT "notification_deliveries_business_id_id_key" UNIQUE("business_id","id"),
	CONSTRAINT "notification_deliveries_attempt_count_check" CHECK ("notification_deliveries"."attempt_count" >= 0 AND "notification_deliveries"."attempt_count" <= 8),
	CONSTRAINT "notification_deliveries_recipient_length_check" CHECK (char_length("notification_deliveries"."recipient") >= 3),
	CONSTRAINT "notification_deliveries_error_code_length_check" CHECK ("notification_deliveries"."last_error_code" IS NULL OR char_length("notification_deliveries"."last_error_code") <= 64),
	CONSTRAINT "notification_deliveries_lock_state_check" CHECK ((
        ("notification_deliveries"."status" = 'PROCESSING' AND "notification_deliveries"."locked_at" IS NOT NULL AND "notification_deliveries"."locked_by" IS NOT NULL)
        OR
        ("notification_deliveries"."status" <> 'PROCESSING' AND "notification_deliveries"."locked_at" IS NULL AND "notification_deliveries"."locked_by" IS NULL)
      )),
	CONSTRAINT "notification_deliveries_sent_state_check" CHECK ((
        ("notification_deliveries"."status" = 'SENT' AND "notification_deliveries"."sent_at" IS NOT NULL)
        OR
        ("notification_deliveries"."status" <> 'SENT')
      )),
	CONSTRAINT "notification_deliveries_failed_state_check" CHECK ((
        ("notification_deliveries"."status" = 'FAILED' AND "notification_deliveries"."failed_at" IS NOT NULL)
        OR
        ("notification_deliveries"."status" <> 'FAILED')
      ))
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_plan_fkey" FOREIGN KEY ("business_id","plan_id") REFERENCES "public"."notification_plans"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_claim_idx" ON "notification_deliveries" USING btree ("available_at","created_at","id") WHERE "notification_deliveries"."status" IN ('PENDING', 'FAILED');--> statement-breakpoint
CREATE INDEX "notification_deliveries_processing_lease_idx" ON "notification_deliveries" USING btree ("locked_at") WHERE "notification_deliveries"."status" = 'PROCESSING';--> statement-breakpoint
CREATE INDEX "notification_deliveries_business_plan_idx" ON "notification_deliveries" USING btree ("business_id","plan_id","status");--> statement-breakpoint
CREATE TRIGGER set_notification_deliveries_updated_at
BEFORE UPDATE ON notification_deliveries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
