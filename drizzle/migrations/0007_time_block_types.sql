ALTER TABLE "time_blocks" ALTER COLUMN "block_type" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "time_blocks" ALTER COLUMN "block_type" TYPE text;
--> statement-breakpoint
DROP TYPE "time_block_type";
--> statement-breakpoint
CREATE TYPE "time_block_type" AS ENUM('TIME_OFF', 'BREAK', 'BLOCKED');
--> statement-breakpoint
ALTER TABLE "time_blocks" ALTER COLUMN "block_type" TYPE "time_block_type" USING "block_type"::"time_block_type";
--> statement-breakpoint
ALTER TABLE "time_blocks" ALTER COLUMN "block_type" SET DEFAULT 'BLOCKED';
