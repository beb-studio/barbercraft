"use server";

import { requireSession } from "@/lib/auth/guards";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function completeForcePasswordChangeAction() {
  try {
    const user = await requireSession();
    
    await db.update(users)
      .set({ forcePasswordChange: false })
      .where(eq(users.id, user.id));

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu";
    return { success: false, error: message };
  }
}
