import { redirect } from "next/navigation";
import { getMemberships } from "@/lib/auth/session";
import { getStaffDetailService } from "@/services/staff.service";
import { getStaffTimeBlocksService } from "@/services/time-blocks.service";
import { StaffDetailClient } from "./staff-detail-client";

interface StaffDetailPageProps {
  params: Promise<{ staffId: string }>;
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const { staffId } = await params;

  const memberships = await getMemberships();
  const currentMembership = memberships[0];

  if (!currentMembership) {
    redirect("/onboarding");
  }

  // RBAC Boundary: Only OWNER and ADMIN may access staff detail management
  if (currentMembership.role !== "OWNER" && currentMembership.role !== "ADMIN") {
    redirect("/dashboard");
  }

  let detail: Awaited<ReturnType<typeof getStaffDetailService>>;
  let timeBlocksData: Awaited<ReturnType<typeof getStaffTimeBlocksService>>;

  try {
    detail = await getStaffDetailService(
      currentMembership.business_id,
      staffId,
      currentMembership.role
    );
    timeBlocksData = await getStaffTimeBlocksService(
      currentMembership.business_id,
      staffId,
      currentMembership.role
    );
  } catch {
    // If not found or forbidden (e.g. ADMIN trying to access OWNER's staff profile)
    redirect("/dashboard/staff");
  }

  return (
    <div className="w-full">
      <StaffDetailClient
        initialStaff={detail.staff}
        availableActiveServices={detail.availableActiveServices}
        initialBookingReadiness={detail.bookingReadiness}
        businessWorkingHours={detail.businessWorkingHours}
        initialTimeBlocks={timeBlocksData.blocks}
        businessTimezone={timeBlocksData.businessTimezone}
        callerRole={currentMembership.role}
      />
    </div>
  );
}

