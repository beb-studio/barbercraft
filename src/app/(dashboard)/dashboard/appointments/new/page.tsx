import { redirect } from "next/navigation";
import { getMemberships, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db";
import { staffProfiles, services, staffServices, businesses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ManualBookingFlow } from "./manual-booking-flow";
import { getBusinessLocalToday } from "@/lib/timezone";

export default async function NewAppointmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberships = await getMemberships();
  const membership = memberships[0];
  
  if (!membership?.business_id) redirect("/onboarding");

  const bizRow = await db.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, membership.business_id)).limit(1).then(r => r[0]);
  const businessLocalToday = getBusinessLocalToday(bizRow?.timezone || "Europe/Istanbul", new Date());

  const allServices = await db.select({
    id: services.id,
    name: services.name,
    durationMinutes: services.durationMinutes,
    price: services.price,
  })
  .from(services)
  .where(and(eq(services.businessId, membership.business_id), eq(services.active, true)));

  let targetStaffId: string | null = null;
  if (membership.role === "STAFF") {
    const sp = await db.select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(and(
        eq(staffProfiles.businessMemberId, membership.id),
        eq(staffProfiles.businessId, membership.business_id),
        eq(staffProfiles.active, true)
      ))
      .limit(1)
      .then(r => r[0]);

    if (!sp) {
      return (
        <div className="p-8 text-center text-destructive font-medium">
          Personel profiliniz bulunamadığı veya aktif olmadığı için randevu ekleyemezsiniz.
        </div>
      );
    }
    targetStaffId = sp.id;
  }

  const allStaff = await db.select({
    id: staffProfiles.id,
    firstName: staffProfiles.firstName,
    lastName: staffProfiles.lastName,
  })
  .from(staffProfiles)
  .where(and(
    eq(staffProfiles.businessId, membership.business_id),
    eq(staffProfiles.active, true)
  ));

  const filteredStaff = targetStaffId ? allStaff.filter(s => s.id === targetStaffId) : allStaff;

  const assignments = await db.select({
    staffId: staffServices.staffId,
    serviceId: staffServices.serviceId,
  })
  .from(staffServices)
  .where(eq(staffServices.businessId, membership.business_id));

  return (
    <div className="w-full">
      <ManualBookingFlow
        role={membership.role}
        targetStaffId={targetStaffId}
        services={allServices}
        staff={filteredStaff}
        assignments={assignments}
        initialDate={businessLocalToday}
      />
    </div>
  );
}
