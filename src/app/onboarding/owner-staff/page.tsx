import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { getOnboardingStep } from "@/lib/auth/onboarding";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getServices } from "@/services/service.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnerStaffForm } from "./owner-staff-form";

export default async function OwnerStaffPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const step = await getOnboardingStep();
  if (step === "NO_BUSINESS") {
    redirect("/onboarding");
  }
  if (step === "BUSINESS_HOURS") {
    redirect("/onboarding/business-hours");
  }
  if (step === "FIRST_SERVICE") {
    redirect("/onboarding/first-service");
  }
  if (step === "COMPLETED") {
    redirect("/dashboard");
  }

  const memberships = await getMemberships();
  const ownerMembership = memberships.find((m) => m.role === "OWNER");

  // Only OWNER can complete owner staff onboarding
  if (!ownerMembership) {
    redirect("/dashboard");
  }

  const [biz] = await db
    .select({
      id: businesses.id,
      currency: businesses.currency,
    })
    .from(businesses)
    .where(eq(businesses.id, ownerMembership.business_id));

  if (!biz) {
    redirect("/onboarding");
  }

  const allServices = await getServices(biz.id);
  const activeServices = allServices.filter((s) => s.active);

  return (
    <div className="w-full max-w-[390px] mx-auto py-2">
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="text-center space-y-1 pb-3">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Berber Rolünüz
          </CardTitle>
          <CardDescription className="text-xs">
            İşletme sahibi olarak siz de müşterilere hizmet veriyor musunuz?
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <OwnerStaffForm services={activeServices} currency={biz.currency} />
        </CardContent>
      </Card>
    </div>
  );
}
