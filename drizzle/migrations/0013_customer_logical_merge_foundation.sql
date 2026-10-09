ALTER TABLE "customers" ADD COLUMN "phone_comparison_key" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "merged_into_customer_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "merged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "merged_by_business_member_id" uuid;--> statement-breakpoint
CREATE OR REPLACE FUNCTION customer_phone_comparison_key(phone_value text)
RETURNS text AS $$
DECLARE
	trimmed_value text := trim(phone_value);
	digits_only text := regexp_replace(trim(phone_value), '[^0-9]', '', 'g');
BEGIN
	IF digits_only = '' THEN
		RETURN '';
	ELSIF length(digits_only) = 12 AND digits_only LIKE '905%' THEN
		RETURN '+90' || substring(digits_only FROM 3);
	ELSIF length(digits_only) = 11 AND digits_only LIKE '05%' THEN
		RETURN '+90' || substring(digits_only FROM 2);
	ELSIF length(digits_only) = 10 AND digits_only LIKE '5%' THEN
		RETURN '+90' || digits_only;
	ELSIF trimmed_value LIKE '+%' THEN
		RETURN '+' || digits_only;
	END IF;

	RETURN digits_only;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;--> statement-breakpoint
UPDATE "customers"
SET "phone_comparison_key" = customer_phone_comparison_key("normalized_phone");--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone_comparison_key" SET NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_customer_phone_comparison_key()
RETURNS TRIGGER AS $$
BEGIN
	NEW."phone_comparison_key" := customer_phone_comparison_key(NEW."normalized_phone");
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER sync_customer_phone_comparison_key_trigger
BEFORE INSERT OR UPDATE OF "normalized_phone" ON "customers"
FOR EACH ROW EXECUTE FUNCTION sync_customer_phone_comparison_key();--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_into_customer_fkey" FOREIGN KEY ("business_id","merged_into_customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_by_business_member_fkey" FOREIGN KEY ("business_id","merged_by_business_member_id") REFERENCES "public"."business_members"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_business_phone_comparison_idx" ON "customers" USING btree ("business_id","phone_comparison_key");--> statement-breakpoint
CREATE INDEX "customers_business_merged_into_idx" ON "customers" USING btree ("business_id","merged_into_customer_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_no_self_merge_check" CHECK ("customers"."merged_into_customer_id" IS NULL OR "customers"."merged_into_customer_id" <> "customers"."id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merge_metadata_check" CHECK (("customers"."merged_into_customer_id" IS NULL AND "customers"."merged_at" IS NULL AND "customers"."merged_by_business_member_id" IS NULL) OR ("customers"."merged_into_customer_id" IS NOT NULL AND "customers"."merged_at" IS NOT NULL AND "customers"."merged_by_business_member_id" IS NOT NULL));--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_customer_merge_one_hop()
RETURNS TRIGGER AS $$
DECLARE
	current_target_id uuid;
BEGIN
	SELECT "merged_into_customer_id"
	INTO current_target_id
	FROM "customers"
	WHERE "business_id" = NEW."business_id" AND "id" = NEW."id";

	IF current_target_id IS NOT NULL THEN
		IF EXISTS (
			SELECT 1
			FROM "customers" target
			WHERE target."business_id" = NEW."business_id"
				AND target."id" = current_target_id
				AND target."merged_into_customer_id" IS NOT NULL
		) OR EXISTS (
			SELECT 1
			FROM "customers" child
			WHERE child."business_id" = NEW."business_id"
				AND child."merged_into_customer_id" = NEW."id"
		) THEN
			RAISE EXCEPTION 'Customer aliases must point directly to a canonical root'
				USING ERRCODE = '23514';
		END IF;
	END IF;

	RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER enforce_customer_merge_one_hop_trigger
AFTER INSERT OR UPDATE OF "merged_into_customer_id" ON "customers"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_customer_merge_one_hop();
