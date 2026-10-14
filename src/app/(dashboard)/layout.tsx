import { redirect } from "next/navigation";
import { getOnboardingStep } from "@/lib/auth/onboarding";
import { getMemberships, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db";
import { businesses, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const step = await getOnboardingStep();
  
  if (step === "UNAUTHENTICATED") {
    redirect("/login");
  }
  
  if (step === "NO_BUSINESS") {
    redirect("/onboarding");
  }
  
  if (step === "BUSINESS_HOURS") {
    redirect("/onboarding/business-hours");
  }

  if (step === "FIRST_SERVICE") {
    redirect("/onboarding/first-service");
  }

  if (step === "OWNER_STAFF") {
    redirect("/onboarding/owner-staff");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.forcePasswordChange) {
    redirect("/force-password-change");
  }

  const memberships = await getMemberships();
  const currentMembership = memberships[0];
  if (!currentMembership?.business_id) {
    redirect("/onboarding");
  }

  const currentRole = (currentMembership.role as "OWNER" | "MANAGER" | "STAFF") || "STAFF";

  const [biz] = await db
    .select({
      name: businesses.name,
      slug: businesses.slug,
    })
    .from(businesses)
    .where(eq(businesses.id, currentMembership.business_id))
    .limit(1);

  const { getCurrentPlatformAdmin } = await import("@/lib/auth/guards");
  const platformAdmin = await getCurrentPlatformAdmin();

  const [userRow] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <DashboardShell
      businessName={biz?.name || "İşletme"}
      businessSlug={biz?.slug || ""}
      userRole={currentRole}
      userName={userRow?.name || (user.email ? user.email.split("@")[0] : "Kullanıcı")}
      userEmail={user.email || ""}
      isPlatformAdmin={Boolean(platformAdmin)}
    >
      {children}
    </DashboardShell>
  );
}
