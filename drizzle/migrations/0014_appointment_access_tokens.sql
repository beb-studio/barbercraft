CREATE TABLE "appointment_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_access_tokens_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "appointment_access_tokens_hash_length_check" CHECK (char_length("appointment_access_tokens"."token_hash") = 64),
	CONSTRAINT "appointment_access_tokens_expiry_check" CHECK ("appointment_access_tokens"."expires_at" > "appointment_access_tokens"."created_at")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_id_key" UNIQUE("business_id","id");--> statement-breakpoint
ALTER TABLE "appointment_access_tokens" ADD CONSTRAINT "appointment_access_tokens_appointment_fkey" FOREIGN KEY ("business_id","appointment_id") REFERENCES "public"."appointments"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_access_tokens_business_appointment_idx" ON "appointment_access_tokens" USING btree ("business_id","appointment_id");
