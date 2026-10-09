import { getDashboardAppointmentsForDate, DashboardAppointmentDTO, getStaffProfileByUserId } from "@/repositories/dashboard-appointments.repository";
import { getBusinessById } from "@/repositories/business.repository";
import { getLocalDayBounds, getBusinessLocalToday } from "@/lib/timezone";

import { formatInstantInBusinessTimezone } from "@/lib/timezone";

export interface FormattedDashboardAppointment extends DashboardAppointmentDTO {
  localStartTime: string;
  localEndTime: string;
}

export async function getDashboardDailyAgenda(
  businessId: string,
  userId: string,
  userRole: string,
  dateStr?: string,
  staffFilterId?: string
): Promise<{
  appointments: FormattedDashboardAppointment[];
  businessTimezone: string;
  selectedDate: string;
}> {
  // Validate Role
  if (!["OWNER", "ADMIN", "STAFF"].includes(userRole)) {
    throw new Error(`Forbidden: Role ${userRole} is not authorized.`);
  }

  const business = await getBusinessById(businessId);
  const businessTimezone = business?.timezone || "Europe/Istanbul";

  // Resolve staff filter and tenant scoping
  let effectiveStaffFilter = staffFilterId;
  
  if (userRole === "STAFF") {
    // For STAFF, completely ignore staffFilterId and forcefully apply their own profile ID
    const myProfile = await getStaffProfileByUserId(businessId, userId);
    if (!myProfile) {
      // If a staff member has no staff profile, they cannot view any appointments
      return { appointments: [], businessTimezone, selectedDate: dateStr || getBusinessLocalToday(businessTimezone) };
    }
    effectiveStaffFilter = myProfile.id;
  }

  // Resolve date
  const selectedDate = dateStr || getBusinessLocalToday(businessTimezone);
  const { start, end } = getLocalDayBounds(selectedDate, businessTimezone);

  const rawAppointments = await getDashboardAppointmentsForDate(
    businessId,
    start,
    end,
    effectiveStaffFilter
  );

  const appointments = rawAppointments.map((app) => ({
    ...app,
    localStartTime: formatInstantInBusinessTimezone(app.startAt, businessTimezone).timeStr,
    localEndTime: formatInstantInBusinessTimezone(app.endAt, businessTimezone).timeStr,
  }));

  return {
    appointments,
    businessTimezone,
    selectedDate,
  };
}
