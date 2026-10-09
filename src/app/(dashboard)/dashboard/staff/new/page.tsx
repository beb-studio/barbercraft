import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { getDashboardServicesAction } from "@/actions/service.actions";
import { NewStaffForm } from "./new-staff-form";

export const metadata = {
  title: "Yeni Personel Oluştur | BarberCraft",
};

export default async function NewStaffPage() {
  const memberships = await getMemberships();
  const currentMembership = memberships[0];

  if (!currentMembership) {
    redirect("/onboarding");
  }

  // RBAC Boundary: Only OWNER can provision new credential-bearing identities
  if (currentMembership.role !== "OWNER") {
    redirect("/dashboard/staff");
  }

  const result = await getDashboardServicesAction(currentMembership.business_id);
  const activeServices = result.success && result.services
    ? result.services.filter(s => s.active)
    : [];

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-4 border-b border-border/60 pb-5">
        <Link
          href="/dashboard/staff"
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full transition-colors"
          title="Geri Dön"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Yeni Personel Oluştur
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            İşletmenize yeni bir ekip üyesi ekleyin ve verebildiği hizmetleri seçin.
          </p>
        </div>
      </div>

      <NewStaffForm availableServices={activeServices} />
    </div>
  );
}
