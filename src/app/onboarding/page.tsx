import { redirect } from "next/navigation";
import { getOnboardingStep } from "@/lib/auth/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/auth/logout-button";

export default async function OnboardingPage() {
  const step = await getOnboardingStep();
  
  if (step === "BUSINESS_HOURS") {
    redirect("/onboarding/business-hours");
  }
  if (step === "FIRST_SERVICE") {
    redirect("/onboarding/first-service");
  }
  if (step === "OWNER_STAFF") {
    redirect("/onboarding/owner-staff");
  }
  if (step === "COMPLETED" || step === "NOT_APPLICABLE") {
    redirect("/dashboard");
  }

  // Handle NO_BUSINESS
  return (
    <div className="w-full max-w-[390px] mx-auto">
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">İşletme Bulunamadı</CardTitle>
          <CardDescription>
            Hesabınıza tanımlı bir işletme yöneticiliği bulunmuyor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-center text-muted-foreground">
            Lütfen platform yöneticisi ile iletişime geçerek işletme kaydınızın tamamlanmasını talep edin.
          </p>
          <div className="flex justify-center pt-4">
            <LogoutButton className="w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
