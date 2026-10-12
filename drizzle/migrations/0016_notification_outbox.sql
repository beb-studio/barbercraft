CREATE TYPE "public"."appointment_notification_event_type" AS ENUM('APPOINTMENT_CREATED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."notification_outbox_status" AS ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"event_type" "appointment_notification_event_type" NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "notification_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"processed_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_idempotency_key_key" UNIQUE("idempotency_key"),
	CONSTRAINT "notification_outbox_payload_version_check" CHECK ("notification_outbox"."payload_version" > 0),
	CONSTRAINT "notification_outbox_payload_object_check" CHECK (jsonb_typeof("notification_outbox"."payload") = 'object'),
	CONSTRAINT "notification_outbox_idempotency_key_check" CHECK (char_length("notification_outbox"."idempotency_key") = 64),
	CONSTRAINT "notification_outbox_attempt_count_check" CHECK ("notification_outbox"."attempt_count" >= 0 AND "notification_outbox"."attempt_count" <= 8),
	CONSTRAINT "notification_outbox_lock_state_check" CHECK ((
        ("notification_outbox"."status" = 'PROCESSING' AND "notification_outbox"."locked_at" IS NOT NULL AND "notification_outbox"."locked_by" IS NOT NULL)
        OR
        ("notification_outbox"."status" <> 'PROCESSING' AND "notification_outbox"."locked_at" IS NULL AND "notification_outbox"."locked_by" IS NULL)
      )),
	CONSTRAINT "notification_outbox_processed_state_check" CHECK ((
        ("notification_outbox"."status" = 'PROCESSED' AND "notification_outbox"."processed_at" IS NOT NULL)
        OR
        ("notification_outbox"."status" <> 'PROCESSED' AND "notification_outbox"."processed_at" IS NULL)
      )),
	CONSTRAINT "notification_outbox_error_code_check" CHECK ("notification_outbox"."last_error_code" IS NULL OR char_length("notification_outbox"."last_error_code") BETWEEN 1 AND 64)
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_appointment_fkey" FOREIGN KEY ("business_id","appointment_id") REFERENCES "public"."appointments"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_outbox_claim_idx" ON "notification_outbox" USING btree ("available_at","created_at","id") WHERE "notification_outbox"."status" IN ('PENDING', 'FAILED');--> statement-breakpoint
CREATE INDEX "notification_outbox_processing_lease_idx" ON "notification_outbox" USING btree ("locked_at") WHERE "notification_outbox"."status" = 'PROCESSING';--> statement-breakpoint
CREATE INDEX "notification_outbox_business_appointment_idx" ON "notification_outbox" USING btree ("business_id","appointment_id","created_at");--> statement-breakpoint
CREATE TRIGGER set_notification_outbox_updated_at
BEFORE UPDATE ON notification_outbox
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
