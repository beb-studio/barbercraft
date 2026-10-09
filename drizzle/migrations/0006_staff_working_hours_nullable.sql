ALTER TABLE "staff_working_hours" ALTER COLUMN "start_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_working_hours" ALTER COLUMN "end_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_working_hours" DROP CONSTRAINT IF EXISTS check_swh_hours;--> statement-breakpoint
ALTER TABLE "staff_working_hours" ADD CONSTRAINT check_swh_hours CHECK (
  (is_working = false AND start_time IS NULL AND end_time IS NULL)
  OR
  (is_working = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
);
