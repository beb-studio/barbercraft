import { db } from "@/db";
import { appointments, staffProfiles, businesses, customers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { formatInstantInBusinessTimezone } from "@/lib/timezone";
import { ReassignFlow } from "./reassign-flow";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function ReassignAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const appointmentId = resolvedParams.id;
  const user = await getCurrentUser();
  if (!user) return <ErrorState message="Oturum süresi dolmuş." />;

  const memberships = await getMemberships();
  const membership = memberships[0];
  if (!membership?.business_id) return <ErrorState message="İşletme bulunamadı." />;
  
  if (membership.role === "STAFF") {
    return <ErrorState message="Yetkisiz işlem. Sadece yöneticiler randevuyu başka personele atayabilir." />;
  }

  const biz = await db.select().from(businesses).where(eq(businesses.id, membership.business_id)).limit(1).then(r => r[0]);
  if (!biz) return <ErrorState message="İşletme bulunamadı." />;

  const apptRow = await db.select({
    appt: appointments,
    customer: customers,
    staff: staffProfiles
  })
    .from(appointments)
    .innerJoin(customers, eq(appointments.customerId, customers.id))
    .innerJoin(staffProfiles, eq(appointments.staffId, staffProfiles.id))
    .where(and(
      eq(appointments.id, appointmentId),
      eq(appointments.businessId, membership.business_id)
    ))
    .limit(1)
    .then(r => r[0]);

  if (!apptRow) {
    return <ErrorState message="Randevu bulunamadı." />;
  }

  const { appt, customer, staff } = apptRow;

  if (appt.status !== "PENDING" && appt.status !== "CONFIRMED") {
    return <ErrorState message="Sadece bekleyen ve onaylanmış randevular yeniden atanabilir." />;
  }

  if (appt.startTime.getTime() <= new Date().getTime()) {
    return <ErrorState message="Geçmişteki veya başlamış olan randevular yeniden atanamaz." />;
  }

  const currentStaffName = `${staff.firstName} ${staff.lastName}`;
  const customerName = `${customer.firstName} ${customer.lastName || ""}`.trim();
  
  const { dateStr, timeStr: startLocalTime } = formatInstantInBusinessTimezone(appt.startTime, biz.timezone);
  const { timeStr: endLocalTime } = formatInstantInBusinessTimezone(appt.endTime, biz.timezone);

  return (
    <ReassignFlow
      appointmentId={appointmentId}
      expectedUpdatedAt={appt.updatedAt.toISOString()}
      currentStaffName={currentStaffName}
      serviceName={appt.serviceNameSnapshot}
      localDate={dateStr}
      startLocalTime={startLocalTime}
      endLocalTime={endLocalTime}
      customerName={customerName}
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
