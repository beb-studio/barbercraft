import { AppointmentManagementClient } from "./appointment-management-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AppointmentManagementPage() {
  return <AppointmentManagementClient />;
}
