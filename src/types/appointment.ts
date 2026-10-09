import type { Enums, Tables } from "./database.types";

export type Appointment = Tables<"appointments">;
export type AppointmentStatus = Enums<"appointment_status">;
export type AppointmentSource = Enums<"appointment_source">;
