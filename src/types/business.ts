// Domain types are thin aliases over the GENERATED database types
// (./database.types.ts, produced by `pnpm db:types`). Do not redefine columns
// by hand here.
import type { Enums, Tables } from "./database.types";

export type Business = Tables<"businesses">;
export type BusinessMember = Tables<"business_members">;
export type BusinessWorkingHours = Tables<"business_working_hours">;

/** Authenticated membership roles. A public customer is NOT a role. */
export type BusinessMemberRole = Enums<"business_member_role">;
export type BusinessRole = BusinessMemberRole;
