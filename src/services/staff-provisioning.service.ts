import { db } from "@/db";
import { users, businessMembers, staffProfiles, staffServices, services } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createAdministrativeUser } from "@/lib/auth/admin-user";
import crypto from "crypto";

export interface ProvisionStaffInput {
  businessId: string;
  actorUserId: string;
  email: string;
  name: string;
  serviceIds: string[];
}

function generateSecurePassword(length: number = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    password += charset[randomIndex];
  }
  return password;
}

export function splitStaffName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const lastSpaceIdx = trimmed.lastIndexOf(" ");
  if (lastSpaceIdx === -1) {
    return {
      firstName: trimmed || "Personel",
      lastName: "",
    };
  }
  return {
    firstName: trimmed.slice(0, lastSpaceIdx).trim(),
    lastName: trimmed.slice(lastSpaceIdx + 1).trim(),
  };
}

export class StaffProvisioningService {
  static async provisionStaff(input: ProvisionStaffInput) {
    const { businessId, actorUserId, email, name, serviceIds } = input;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Validate OWNER authority
    const [actorMember] = await db
      .select({ role: businessMembers.role, active: businessMembers.active })
      .from(businessMembers)
      .where(and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, actorUserId)
      ))
      .limit(1);

    if (!actorMember || actorMember.role !== "OWNER" || !actorMember.active) {
      throw new Error("FORBIDDEN: Only active business OWNER can provision staff.");
    }

    // 2. Check if user exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    let userId = existingUser?.id;
    let tempPassword = null;
    let createdNewUser = false;

    // 3. Create User if it doesn't exist
    if (!userId) {
      tempPassword = generateSecurePassword(16);
      try {
        const newUser = await createAdministrativeUser({
          email: normalizedEmail,
          password: tempPassword,
          name: name,
          emailVerified: true,
        });

        userId = newUser.id;
        createdNewUser = true;

        await db.update(users).set({ forcePasswordChange: true }).where(eq(users.id, userId));
      } catch (error) {
        // Concurrency Check: If user creation failed, another concurrent request might have created the identity.
        const [concurrentUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1);

        if (concurrentUser) {
          // Recovered from race! Fallback to existing identity semantics.
          userId = concurrentUser.id;
          createdNewUser = false;
          tempPassword = null;
        } else {
          throw new Error(`IDENTITY_CREATION_FAILED: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // 4. Provision in Transaction
    try {
      await db.transaction(async (tx) => {
        // A. Handle Services Validation
        let validServiceIds: string[] = [];
        if (serviceIds && serviceIds.length > 0) {
          const uniqueServiceIds = Array.from(new Set(serviceIds));
          const validServices = await tx
            .select({ id: services.id })
            .from(services)
            .where(and(
              eq(services.businessId, businessId),
              eq(services.active, true),
              inArray(services.id, uniqueServiceIds)
            ));
          
          if (validServices.length !== uniqueServiceIds.length) {
            throw new Error("INVALID_SERVICE: One or more selected services are invalid, cross-tenant, or inactive.");
          }
          validServiceIds = validServices.map(s => s.id);
        }

        // B. Handle Business Membership
        const [existingMember] = await tx
          .select()
          .from(businessMembers)
          .where(and(
            eq(businessMembers.businessId, businessId),
            eq(businessMembers.userId, userId!)
          ))
          .limit(1);

        let memberId: string;

        if (existingMember) {
          if (existingMember.role === "OWNER" || existingMember.role === "ADMIN") {
            throw new Error("MEMBER_ROLE_CONFLICT: User already exists with a higher role.");
          }
          if (existingMember.active) {
            throw new Error("STAFF_ALREADY_EXISTS: Active staff member already exists.");
          }
          
          // Reactivate inactive staff
          const [updatedMember] = await tx
            .update(businessMembers)
            .set({ active: true, updatedAt: new Date() })
            .where(eq(businessMembers.id, existingMember.id))
            .returning();
          memberId = updatedMember.id;
        } else {
          // Create new membership
          const [newMember] = await tx
            .insert(businessMembers)
            .values({
              businessId,
              userId: userId!,
              role: "STAFF",
              active: true,
            })
            .returning();
          memberId = newMember.id;
        }

        // C. Handle Staff Profile
        const [existingProfile] = await tx
          .select()
          .from(staffProfiles)
          .where(eq(staffProfiles.businessMemberId, memberId))
          .limit(1);

        let profileId: string;

        if (existingProfile) {
          profileId = existingProfile.id;
          if (!existingProfile.active) {
            await tx
              .update(staffProfiles)
              .set({ active: true, updatedAt: new Date() })
              .where(eq(staffProfiles.id, profileId));
          }
        } else {
          const { firstName, lastName } = splitStaffName(name);
          const [newProfile] = await tx
            .insert(staffProfiles)
            .values({
              businessId,
              businessMemberId: memberId,
              firstName,
              lastName,
              active: true,
              publicBookingEnabled: false,
              usesBusinessHours: true,
            })
            .returning();
          profileId = newProfile.id;
        }

        // D. Handle Staff Services
        if (validServiceIds.length > 0) {
          // Find existing mappings to avoid duplicates
          const existingMappings = await tx
            .select({ serviceId: staffServices.serviceId })
            .from(staffServices)
            .where(eq(staffServices.staffId, profileId));
          
          const existingIds = new Set(existingMappings.map(m => m.serviceId));
          const newIdsToInsert = validServiceIds.filter(id => !existingIds.has(id));

          if (newIdsToInsert.length > 0) {
            await tx.insert(staffServices).values(
              newIdsToInsert.map(sid => ({
                businessId,
                staffId: profileId,
                serviceId: sid,
              }))
            );
          }
        }
      });
    } catch (error) {
      // Safe Compensation Principle:
      // Deletion is allowed ONLY when exclusive ownership can be proven.
      // Since concurrent transactions might already rely on this global identity,
      // we leave the harmless orphan rather than risking deletion of a valid shared identity.
      const wrappedError = error as { code?: string; cause?: { code?: string } } | null;
      const postgresCode = wrappedError?.cause?.code ?? wrappedError?.code;
      if (postgresCode === "23505") {
        throw new Error("STAFF_ALREADY_EXISTS: Active staff member already exists.");
      }
      throw error;
    }
    return {
      success: true,
      userId,
      tempPassword,
      isNewUser: createdNewUser,
    };
  }
}
