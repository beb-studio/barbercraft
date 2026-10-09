CREATE TYPE "public"."business_member_role" AS ENUM('OWNER', 'ADMIN', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."time_block_type" AS ENUM('BREAK', 'VACATION', 'BUSINESS_CLOSURE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."appointment_source" AS ENUM('PUBLIC_WEB', 'MANUAL_ADMIN', 'MANUAL_STAFF');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"phone" text,
	"address" text,
	"logo_url" text,
	"timezone" text NOT NULL,
	"currency" text NOT NULL,
	"booking_interval_minutes" integer DEFAULT 15 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "business_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "business_member_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_members_business_user_key" UNIQUE("business_id","user_id"),
	CONSTRAINT "business_members_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"business_member_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"profile_image_url" text,
	"public_booking_enabled" boolean DEFAULT true NOT NULL,
	"uses_business_hours" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_business_member_id_unique" UNIQUE("business_member_id"),
	CONSTRAINT "staff_profiles_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "staff_services" (
	"business_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_services_staff_id_service_id_pk" PRIMARY KEY("staff_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"phone" text NOT NULL,
	"normalized_phone" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_business_phone_key" UNIQUE("business_id","normalized_phone"),
	CONSTRAINT "customers_business_id_id_key" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "business_working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_working_hours_business_day_key" UNIQUE("business_id","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "staff_working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_working" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_working_hours_business_staff_day_key" UNIQUE("business_id","staff_id","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"staff_id" uuid,
	"block_type" time_block_type DEFAULT 'OTHER' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'PENDING' NOT NULL,
	"source" "appointment_source" DEFAULT 'PUBLIC_WEB' NOT NULL,
	"service_name_snapshot" text NOT NULL,
	"service_duration_snapshot" integer NOT NULL,
	"service_price_snapshot" numeric(10, 2) NOT NULL,
	"cancellation_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_member_fkey" FOREIGN KEY ("business_id","business_member_id") REFERENCES "public"."business_members"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staff_fkey" FOREIGN KEY ("business_id","staff_id") REFERENCES "public"."staff_profiles"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_service_fkey" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_working_hours" ADD CONSTRAINT "business_working_hours_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_working_hours" ADD CONSTRAINT "staff_working_hours_staff_fkey" FOREIGN KEY ("business_id","staff_id") REFERENCES "public"."staff_profiles"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_staff_fkey" FOREIGN KEY ("business_id","staff_id") REFERENCES "public"."staff_profiles"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_fkey" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_fkey" FOREIGN KEY ("business_id","staff_id") REFERENCES "public"."staff_profiles"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_fkey" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_business_time_idx" ON "appointments" USING btree ("business_id","start_time","end_time");--> statement-breakpoint
CREATE INDEX "appointments_business_staff_time_idx" ON "appointments" USING btree ("business_id","staff_id","start_time");--> statement-breakpoint
CREATE INDEX "appointments_business_customer_idx" ON "appointments" USING btree ("business_id","customer_id");

--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_business_members_updated_at BEFORE UPDATE ON business_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_staff_profiles_updated_at BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_business_working_hours_updated_at BEFORE UPDATE ON business_working_hours FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_staff_working_hours_updated_at BEFORE UPDATE ON staff_working_hours FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_time_blocks_updated_at BEFORE UPDATE ON time_blocks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_valid_timezone(tz text)
RETURNS boolean AS $$
BEGIN
  PERFORM now() AT TIME ZONE tz;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

--> statement-breakpoint
ALTER TABLE businesses ADD CONSTRAINT check_valid_timezone CHECK (is_valid_timezone(timezone));
--> statement-breakpoint
ALTER TABLE businesses ADD CONSTRAINT check_booking_interval CHECK (booking_interval_minutes IN (5, 10, 15, 20, 30, 60));

--> statement-breakpoint
CREATE UNIQUE INDEX "business_members_one_owner_idx" ON "business_members" ("business_id") WHERE role = 'OWNER';

--> statement-breakpoint
ALTER TABLE services ADD CONSTRAINT check_duration_positive CHECK (duration_minutes > 0);
--> statement-breakpoint
ALTER TABLE services ADD CONSTRAINT check_price_non_negative CHECK (price >= 0);

--> statement-breakpoint
ALTER TABLE business_working_hours ADD CONSTRAINT check_bwh_day_of_week CHECK (day_of_week BETWEEN 0 AND 6);
--> statement-breakpoint
ALTER TABLE business_working_hours ADD CONSTRAINT check_bwh_hours CHECK (is_closed = true OR start_time < end_time);

--> statement-breakpoint
ALTER TABLE staff_working_hours ADD CONSTRAINT check_swh_day_of_week CHECK (day_of_week BETWEEN 0 AND 6);
--> statement-breakpoint
ALTER TABLE staff_working_hours ADD CONSTRAINT check_swh_hours CHECK (is_working = false OR start_time < end_time);

--> statement-breakpoint
ALTER TABLE time_blocks ADD CONSTRAINT check_time_blocks_time CHECK (start_time < end_time);

--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT check_appointments_time CHECK (start_time < end_time);

--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_appointment_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  svc RECORD;
BEGIN
  IF NEW.service_name_snapshot IS NULL OR NEW.service_duration_snapshot IS NULL OR NEW.service_price_snapshot IS NULL THEN
    SELECT name, duration_minutes, price INTO svc
    FROM services
    WHERE id = NEW.service_id AND business_id = NEW.business_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service not found for appointment snapshot';
    END IF;

    NEW.service_name_snapshot := COALESCE(NEW.service_name_snapshot, svc.name);
    NEW.service_duration_snapshot := COALESCE(NEW.service_duration_snapshot, svc.duration_minutes);
    NEW.service_price_snapshot := COALESCE(NEW.service_price_snapshot, svc.price);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE TRIGGER enforce_appointment_snapshot_trigger BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION enforce_appointment_snapshot();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_appointment_column_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.business_id <> NEW.business_id THEN
    RAISE EXCEPTION 'Cannot change business_id of an existing appointment';
  END IF;
  IF OLD.customer_id <> NEW.customer_id THEN
    RAISE EXCEPTION 'Cannot change customer_id of an existing appointment';
  END IF;

  IF OLD.service_id <> NEW.service_id THEN
    RAISE EXCEPTION 'Cannot change service_id of an existing appointment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE TRIGGER prevent_appointment_column_change_trigger BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION prevent_appointment_column_change();