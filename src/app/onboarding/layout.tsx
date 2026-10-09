import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/auth/onboarding";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = await getOnboardingState();
  if (state === "UNAUTHENTICATED") {
    redirect("/login");
  }

  const { getCurrentUser } = await import("@/lib/auth/session");
  const user = await getCurrentUser();
  if (user?.forcePasswordChange) {
    redirect("/force-password-change");
  }

  if (state === "COMPLETED" || state === "NOT_APPLICABLE") {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <main className="flex-1 flex items-center justify-center p-4">
        {children}
      </main>
    </div>
  );
}
