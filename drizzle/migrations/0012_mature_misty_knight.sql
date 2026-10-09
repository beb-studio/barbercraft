ALTER TABLE "customer_notes" DROP CONSTRAINT "customer_notes_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_notes" DROP CONSTRAINT "customer_notes_created_by_business_member_id_business_members_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customer_fkey" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_business_member_fkey" FOREIGN KEY ("business_id","created_by_business_member_id") REFERENCES "public"."business_members"("business_id","id") ON DELETE restrict ON UPDATE no action;