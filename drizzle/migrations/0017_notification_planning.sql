CREATE TYPE "public"."notification_plan_status" AS ENUM('PENDING', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."notification_plan_type" AS ENUM('APPOINTMENT_CREATED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_REMINDER');--> statement-breakpoint
CREATE TABLE "business_notification_reminder_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"minutes_before" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_notification_reminder_rules_business_minutes_key" UNIQUE("business_id","minutes_before"),
	CONSTRAINT "business_notification_reminder_rules_minutes_check" CHECK ("business_notification_reminder_rules"."minutes_before" BETWEEN 5 AND 43200)
);
--> statement-breakpoint
CREATE TABLE "business_notification_settings" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"customer_notifications_enabled" boolean DEFAULT false NOT NULL,
	"appointment_created_enabled" boolean DEFAULT true NOT NULL,
	"appointment_rescheduled_enabled" boolean DEFAULT true NOT NULL,
	"appointment_cancelled_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"source_outbox_id" uuid,
	"type" "notification_plan_type" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"reminder_offset_minutes" integer,
	"idempotency_key" text NOT NULL,
	"status" "notification_plan_status" DEFAULT 'PENDING' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_plans_idempotency_key_key" UNIQUE("idempotency_key"),
	CONSTRAINT "notification_plans_idempotency_key_check" CHECK (char_length("notification_plans"."idempotency_key") = 64),
	CONSTRAINT "notification_plans_reminder_shape_check" CHECK ((
        ("notification_plans"."type" = 'APPOINTMENT_REMINDER' AND "notification_plans"."reminder_offset_minutes" BETWEEN 5 AND 43200 AND "notification_plans"."source_outbox_id" IS NULL)
        OR
        ("notification_plans"."type" <> 'APPOINTMENT_REMINDER' AND "notification_plans"."reminder_offset_minutes" IS NULL AND "notification_plans"."source_outbox_id" IS NOT NULL)
      )),
	CONSTRAINT "notification_plans_cancelled_state_check" CHECK ((
        ("notification_plans"."status" = 'CANCELLED' AND "notification_plans"."cancelled_at" IS NOT NULL)
        OR
        ("notification_plans"."status" = 'PENDING' AND "notification_plans"."cancelled_at" IS NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "business_notification_reminder_rules" ADD CONSTRAINT "business_notification_reminder_rules_business_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_notification_settings" ADD CONSTRAINT "business_notification_settings_business_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_plans" ADD CONSTRAINT "notification_plans_appointment_fkey" FOREIGN KEY ("business_id","appointment_id") REFERENCES "public"."appointments"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_business_id_id_key" UNIQUE("business_id","id");--> statement-breakpoint
ALTER TABLE "notification_plans" ADD CONSTRAINT "notification_plans_source_outbox_fkey" FOREIGN KEY ("business_id","source_outbox_id") REFERENCES "public"."notification_outbox"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Preserve compatibility: current tenants get an inert notification policy and
-- no retroactive plans or reminder rules.
INSERT INTO "business_notification_settings" ("business_id")
SELECT "id" FROM "businesses"
ON CONFLICT ("business_id") DO NOTHING;--> statement-breakpoint
CREATE INDEX "business_notification_reminder_rules_business_idx" ON "business_notification_reminder_rules" USING btree ("business_id","enabled","minutes_before");--> statement-breakpoint
CREATE INDEX "notification_plans_due_idx" ON "notification_plans" USING btree ("scheduled_for","created_at","id") WHERE "notification_plans"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "notification_plans_appointment_idx" ON "notification_plans" USING btree ("business_id","appointment_id","status","type","scheduled_for");--> statement-breakpoint
CREATE INDEX "notification_plans_business_reminder_idx" ON "notification_plans" USING btree ("business_id","scheduled_for") WHERE "notification_plans"."status" = 'PENDING' AND "notification_plans"."type" = 'APPOINTMENT_REMINDER';--> statement-breakpoint
CREATE TRIGGER set_business_notification_settings_updated_at
BEFORE UPDATE ON "business_notification_settings"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_business_notification_reminder_rules_updated_at
BEFORE UPDATE ON "business_notification_reminder_rules"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER set_notification_plans_updated_at
BEFORE UPDATE ON "notification_plans"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE FUNCTION create_business_notification_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO business_notification_settings (business_id)
  VALUES (NEW.id)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER create_business_notification_settings_after_insert
AFTER INSERT ON "businesses"
FOR EACH ROW EXECUTE FUNCTION create_business_notification_settings();
