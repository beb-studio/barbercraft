import type { Enums, Tables } from "./database.types";

export type StaffProfile = Tables<"staff_profiles">;
export type StaffService = Tables<"staff_services">;
export type StaffWorkingHours = Tables<"staff_working_hours">;
export type TimeBlock = Tables<"time_blocks">;
export type TimeBlockType = Enums<"time_block_type">;
