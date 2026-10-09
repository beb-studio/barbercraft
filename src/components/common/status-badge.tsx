import { Badge } from "@/components/ui/badge";
import { getAppointmentStatusLabel } from "@/lib/presentation";
import type { AppointmentStatus } from "@/db/schema/appointments";

interface StatusBadgeProps {
  status: AppointmentStatus | string;
}

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "outline",
  CONFIRMED: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  NO_SHOW: "outline",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = getAppointmentStatusLabel(status);
  const variant = STATUS_VARIANTS[status] || "outline";
  return <Badge variant={variant}>{label}</Badge>;
}
