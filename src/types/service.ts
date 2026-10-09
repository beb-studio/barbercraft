import type { Tables } from "./database.types";

/** A dynamic, business-defined service. Never hardcode names/prices/durations. */
export type Service = Tables<"services">;
