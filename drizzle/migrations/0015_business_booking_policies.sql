ALTER TABLE "businesses" ADD COLUMN "minimum_booking_lead_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "maximum_advance_booking_days" integer;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "cancellation_notice_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "reschedule_notice_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_minimum_booking_lead_minutes_check" CHECK ("businesses"."minimum_booking_lead_minutes" BETWEEN 0 AND 525600);--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_maximum_advance_booking_days_check" CHECK ("businesses"."maximum_advance_booking_days" IS NULL OR "businesses"."maximum_advance_booking_days" BETWEEN 1 AND 730);--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_cancellation_notice_minutes_check" CHECK ("businesses"."cancellation_notice_minutes" BETWEEN 0 AND 525600);--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_reschedule_notice_minutes_check" CHECK ("businesses"."reschedule_notice_minutes" BETWEEN 0 AND 525600);