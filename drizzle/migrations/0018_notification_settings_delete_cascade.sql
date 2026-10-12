ALTER TABLE "business_notification_reminder_rules" DROP CONSTRAINT "business_notification_reminder_rules_business_fkey";
--> statement-breakpoint
ALTER TABLE "business_notification_settings" DROP CONSTRAINT "business_notification_settings_business_fkey";
--> statement-breakpoint
ALTER TABLE "business_notification_reminder_rules" ADD CONSTRAINT "business_notification_reminder_rules_business_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_notification_settings" ADD CONSTRAINT "business_notification_settings_business_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;