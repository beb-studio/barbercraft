import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { db } from "@/db";
import { appointments, staffProfiles, services, businesses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getBusinessLocalToday } from "@/lib/timezone";
import { RescheduleFlow } from "./reschedule-flow";

export default async function ReschedulePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: appointmentId } = await params;
  
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberships = await getMemberships();
  const membership = memberships[0];
  if (!membership?.business_id) redirect("/onboarding");

  // Fetch the appointment
  const apptRow = await db.select({
    id: appointments.id,
    status: appointments.status,
    startTime: appointments.startTime,
    updatedAt: appointments.updatedAt,
    staffId: appointments.staffId,
    serviceId: appointments.serviceId,
    businessId: appointments.businessId,
  })
  .from(appointments)
  .where(and(
    eq(appointments.id, appointmentId),
    eq(appointments.businessId, membership.business_id)
  ))
  .limit(1)
  .then(res => res[0]);

  if (!apptRow) {
    return <ErrorState message="Randevu bulunamadı." />;
  }

  if (apptRow.status !== "PENDING" && apptRow.status !== "CONFIRMED") {
    return <ErrorState message="Sadece bekleyen ve onaylanmış randevular yeniden planlanabilir." />;
  }

  if (apptRow.startTime.getTime() <= new Date().getTime()) {
    return <ErrorState message="Geçmişteki veya başlamış olan randevular yeniden planlanamaz." />;
  }

  // Check RBAC if STAFF
  if (membership.role === "STAFF") {
    const sp = await db.select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(and(
        eq(staffProfiles.businessMemberId, membership.id),
        eq(staffProfiles.businessId, membership.business_id)
      ))
      .limit(1)
      .then(res => res[0]);

    if (!sp || sp.id !== apptRow.staffId) {
      return <ErrorState message="Başka bir personelin randevusunu yeniden planlama yetkiniz yok." />;
    }
  }

  // Fetch related details
  const [biz, staff, svc] = await Promise.all([
    db.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, membership.business_id)).limit(1).then(r => r[0]),
    db.select({ id: staffProfiles.id, firstName: staffProfiles.firstName, lastName: staffProfiles.lastName }).from(staffProfiles).where(eq(staffProfiles.id, apptRow.staffId)).limit(1).then(r => r[0]),
    db.select({ id: services.id, name: services.name }).from(services).where(eq(services.id, apptRow.serviceId)).limit(1).then(r => r[0]),
  ]);

  if (!biz || !staff || !svc) {
    return <ErrorState message="Randevu detayları yüklenemedi." />;
  }

  const staffName = `${staff.firstName} ${staff.lastName}`;
  const businessLocalToday = getBusinessLocalToday(biz.timezone, new Date());

  // We need to fetch slots excluding THIS appointment
  const { getStaffAvailability } = await import("@/services/availability.service");
  
  const availability = await getStaffAvailability({
    businessId: membership.business_id,
    staffId: staff.id,
    serviceId: svc.id,
    localDate: businessLocalToday,
    excludeAppointmentId: appointmentId
  });

  return (
    <RescheduleFlow
      appointmentId={appointmentId}
      expectedUpdatedAt={apptRow.updatedAt.toISOString()}
      staffName={staffName}
      serviceName={svc.name}
      initialDate={businessLocalToday}
      initialSlots={availability.slots || []}
    />
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col min-h-[50vh] max-w-xl mx-auto p-4 justify-center">
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
        <h1 className="text-lg font-semibold text-foreground">
          İşlem Başarısız
        </h1>
        <p className="text-sm text-muted-foreground">
          {message}
        </p>
        <Link
          href="/dashboard/appointments"
          className={buttonVariants({ variant: "outline", className: "mt-2 inline-flex items-center" })}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Randevulara Dön
        </Link>
      </div>
    </div>
  );
}
