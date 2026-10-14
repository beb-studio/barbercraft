import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { getBusinessStaffMembersService } from "@/services/staff.service";
import { StaffList } from "./staff-list";

export default async function StaffManagementPage() {
  const memberships = await getMemberships();
  const currentMembership = memberships[0];

  if (!currentMembership) {
    redirect("/onboarding");
  }

  // RBAC Boundary: STAFF is strictly forbidden from staff management
  if (currentMembership.role !== "OWNER" && currentMembership.role !== "MANAGER") {
    redirect("/dashboard");
  }

  const staffMembers = await getBusinessStaffMembersService(
    currentMembership.business_id
  );

  return (
    <div className="space-y-6 w-full">
      {/* Top navigation & header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Panele Dön</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Personel Yönetimi
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ekip üyelerini görüntüleyin, yeni personelleri davet edin ve aktiflik durumlarını yönetin.
          </p>
        </div>
      </div>

      <StaffList
        initialMembers={staffMembers}
        userRole={currentMembership.role}
      />
    </div>
  );
}
