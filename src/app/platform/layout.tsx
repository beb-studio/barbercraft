import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requirePlatformAdmin, UnauthorizedError, ForbiddenError } from "@/lib/auth/guards";
import { PlatformAccessDenied } from "./_components/access-denied";
import { PlatformShell } from "@/components/layout/platform-shell";
import { getPlatformRoleLabel } from "@/lib/presentation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  let adminContext;
  try {
    adminContext = await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirect=/platform");
    }
    if (error instanceof ForbiddenError) {
      return <PlatformAccessDenied />;
    }
    throw error;
  }

  const roleLabel = getPlatformRoleLabel(adminContext.platformRole);
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  if (user.forcePasswordChange) {
    redirect("/force-password-change");
  }

  const [userRow] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return (
    <PlatformShell
      userRoleLabel={roleLabel}
      userName={userRow?.name || "Yönetici"}
      userEmail={user.email || ""}
    >
      {children}
    </PlatformShell>
  );
}
