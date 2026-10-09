import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships } from "@/lib/auth/session";
import { getOnboardingStep } from "@/lib/auth/onboarding";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FirstServiceForm } from "./first-service-form";

export default async function FirstServicePage() {
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
  if (step === "OWNER_STAFF") {
    redirect("/onboarding/owner-staff");
  }
  if (step === "COMPLETED") {
    redirect("/dashboard");
  }

  const memberships = await getMemberships();
  const ownerMembership = memberships.find((m) => m.role === "OWNER");

  // Only OWNER can configure services during onboarding
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

  return (
    <div className="w-full max-w-[390px] mx-auto py-2">
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="text-center space-y-1 pb-3">
          <CardTitle className="text-2xl font-bold tracking-tight">
            İlk Hizmetinizi Ekleyin
          </CardTitle>
          <CardDescription className="text-xs">
            Müşterilerinizin randevu alabileceği ilk hizmeti tanımlayın.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <FirstServiceForm currency={biz.currency} />
        </CardContent>
      </Card>
    </div>
  );
}
