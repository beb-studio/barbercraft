import type { Tables } from "./database.types";

/** Business-scoped customer. Customers do not have auth accounts. */
export type Customer = Tables<"customers">;
