import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { getOnboardingStep } from "@/lib/auth/onboarding";
import { getWorkingHours } from "@/services/working-hours.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkingHoursForm } from "./working-hours-form";

export default async function BusinessHoursPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const step = await getOnboardingStep();
  if (step === "NO_BUSINESS") {
    redirect("/onboarding");
  }
  if (step === "COMPLETED") {
    redirect("/dashboard");
  }

  const memberships = await getMemberships();
  const ownerMembership = memberships.find((m) => m.role === "OWNER");

  // Only OWNER can configure business working hours
  if (!ownerMembership) {
    redirect("/dashboard");
  }

  const existingHours = await getWorkingHours(ownerMembership.business_id);

  return (
    <div className="w-full max-w-[390px] mx-auto py-2">
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="text-center space-y-1 pb-3">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Çalışma Saatleri
          </CardTitle>
          <CardDescription className="text-xs">
            İşletmenizin haftalık çalışma gün ve saatlerini belirleyin.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <WorkingHoursForm initialHours={existingHours} />
        </CardContent>
      </Card>
    </div>
  );
}
