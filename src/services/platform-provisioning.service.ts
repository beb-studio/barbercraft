import { db } from "@/db";
import { users, businesses, businessMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { generateSecurePassword } from "@/utils/password";
import { PlatformAdminRepository } from "@/repositories/platform-admin.repository";

export interface ProvisionBusinessInput {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  ownerEmail: string;
  ownerName: string;
  platformAdminId: string;
  actorUserId: string;
}

export class PlatformProvisioningService {
  static async provisionBusiness(input: ProvisionBusinessInput) {
    const { name, slug, timezone, currency, ownerEmail, ownerName, platformAdminId, actorUserId } = input;

    // Check if user exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ownerEmail.toLowerCase().trim()))
      .limit(1);

    let userId = existingUser?.id;
    let tempPassword = null;
    let createdNewUser = false;

    // 1. Create User via Better Auth if doesn't exist
    if (!userId) {
      tempPassword = generateSecurePassword(16);
      try {
        const response = await auth.api.signUpEmail({
          body: {
            email: ownerEmail.toLowerCase().trim(),
            password: tempPassword,
            name: ownerName,
          },
          asResponse: true,
        });
        
        if (!response || !response.ok) {
          throw new Error("Failed to create user via Better Auth");
        }
        
        // Fetch the newly created user from DB
        const [newUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, ownerEmail.toLowerCase().trim()))
          .limit(1);
          
        if (!newUser) {
          throw new Error("User was created but could not be found in DB");
        }
        
        userId = newUser.id;
        createdNewUser = true;

        // Force password change on next login
        await db.update(users).set({ forcePasswordChange: true }).where(eq(users.id, userId));

      } catch (error) {
        throw new Error(`User provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 2. Create Business and Membership in a transaction
    try {
      const business = await db.transaction(async (tx) => {
        const [newBusiness] = await tx
          .insert(businesses)
          .values({
            name,
            slug,
            timezone,
            currency,
            active: true, // Platform-provisioned business is active by default (platform lifecycle)
          })
          .returning();

        await tx.insert(businessMembers).values({
          businessId: newBusiness.id,
          userId: userId!,
          role: "OWNER",
        });

        return newBusiness;
      });

      // 3. Log the provisioning action
      await PlatformAdminRepository.insertAuditLog({
        platformAdminId,
        actorUserId,
        action: "PROVISION_BUSINESS",
        targetType: "business",
        targetId: business.id,
        metadata: {
          slug,
          ownerEmail,
          isNewOwner: createdNewUser,
        },
      });

      return {
        success: true,
        businessId: business.id,
        userId: userId,
        tempPassword: tempPassword,
        isNewUser: createdNewUser,
      };
    } catch (error) {
      // 4. Compensation: Safe deletion under concurrency
      if (createdNewUser && userId) {
        try {
          // Only delete if no concurrent successful operation now depends on this identity
          const members = await db.select({ id: businessMembers.id })
            .from(businessMembers)
            .where(eq(businessMembers.userId, userId))
            .limit(1);
          
          if (members.length === 0) {
            await db.delete(users).where(eq(users.id, userId));
          }
        } catch (compensationError) {
          // Prefer leaving a detectable orphan over unsafe deletion
          console.error("Compensation check failed, leaving orphan identity safely.", compensationError);
        }
      }
      throw error;
    }
  }
}
