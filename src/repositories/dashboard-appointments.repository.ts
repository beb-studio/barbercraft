import { db } from "@/db";
import { appointments, customers, staffProfiles, businessMembers } from "@/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import type { Appointment } from "@/db/schema";

export async function getStaffProfileByUserId(businessId: string, userId: string) {
  const [profile] = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .innerJoin(businessMembers, eq(staffProfiles.businessMemberId, businessMembers.id))
    .where(and(
      eq(businessMembers.businessId, businessId),
      eq(businessMembers.userId, userId)
    ))
    .limit(1);
  return profile || null;
}

export interface DashboardAppointmentDTO {
  id: string;
  startAt: Date;
  endAt: Date;
  customer: {
    firstName: string;
    lastName: string | null;
    phone: string;
  };
  service: {
    nameSnapshot: string;
    durationSnapshot: number;
    priceSnapshot: string;
  };
  staff: {
    id: string;
    displayName: string | null;
  };
  status: Appointment["status"];
  source: Appointment["source"];
  notes: string | null;
}

export async function getDashboardAppointmentsForDate(
  businessId: string,
  localDayStart: Date,
  nextLocalDayStart: Date,
  staffIdFilter?: string
): Promise<DashboardAppointmentDTO[]> {
  const conditions = [
    eq(appointments.businessId, businessId),
    gte(appointments.startTime, localDayStart),
    lt(appointments.startTime, nextLocalDayStart),
  ];

  if (staffIdFilter) {
    conditions.push(eq(appointments.staffId, staffIdFilter));
  }

  const rows = await db
    .select({
      appointment: appointments,
      customer: customers,
      staff: staffProfiles,
    })
    .from(appointments)
    .innerJoin(customers, and(eq(appointments.customerId, customers.id), eq(appointments.businessId, customers.businessId)))
    .innerJoin(staffProfiles, and(eq(appointments.staffId, staffProfiles.id), eq(appointments.businessId, staffProfiles.businessId)))
    .where(and(...conditions))
    .orderBy(appointments.startTime);

  return rows.map(({ appointment, customer, staff }) => ({
    id: appointment.id,
    startAt: appointment.startTime,
    endAt: appointment.endTime,
    customer: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
    },
    service: {
      nameSnapshot: appointment.serviceNameSnapshot,
      durationSnapshot: appointment.serviceDurationSnapshot,
      priceSnapshot: appointment.servicePriceSnapshot,
    },
    staff: {
      id: staff.id,
      displayName: `${staff.firstName} ${staff.lastName || ""}`.trim(),
    },
    status: appointment.status,
    source: appointment.source,
    notes: appointment.notes,
  }));
}
