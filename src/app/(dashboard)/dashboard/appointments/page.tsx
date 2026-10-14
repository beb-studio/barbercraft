import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { getStaffMembersWithProfilesByBusiness } from "@/repositories/staff.repository";
import { getDashboardDailyAgenda } from "@/services/dashboard-appointments.service";
import { DailyAgendaView } from "./_components/daily-agenda-view";

export const metadata: Metadata = {
  title: "Randevular",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardAppointmentsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const memberships = await getMemberships();
  const membership = memberships[0];
  
  if (!membership?.business_id) {
    redirect("/onboarding");
  }

  const { business_id: businessId, role } = membership;

  const params = await searchParams;
  
  const dateStr = typeof params.date === "string" ? params.date : undefined;
  const staffFilterId = typeof params.staff === "string" ? params.staff : undefined;

  const { appointments, selectedDate } = await getDashboardDailyAgenda(
    businessId,
    user.id,
    role,
    dateStr,
    staffFilterId
  );

  let staffList: { id: string; name: string }[] = [];
  if (role === "OWNER" || role === "MANAGER") {
    const rawStaffList = await getStaffMembersWithProfilesByBusiness(businessId);
    staffList = rawStaffList
      .filter((s) => s.staffProfileId)
      .map((s) => ({
        id: s.staffProfileId as string,
        name: `${s.staffFirstName} ${s.staffLastName || ""}`.trim() || s.userName || "İsimsiz",
      }));
  }

  return (
    <div className="w-full">
      <DailyAgendaView 
        appointments={appointments}
        selectedDate={selectedDate}
        staffList={staffList}
        role={role}
        selectedStaffFilter={staffFilterId}
      />
    </div>
  );
}
