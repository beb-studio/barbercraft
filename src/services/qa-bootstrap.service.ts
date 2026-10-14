import { db } from "@/db";
import { auth } from "@/lib/auth/auth";
import { createAdministrativeUser } from "@/lib/auth/admin-user";
import {
  users,
  platformAdmins,
  businesses,
  businessMembers,
  staffProfiles,
  services,
  staffServices,
  businessWorkingHours,
  staffWorkingHours,
  customers,
  appointments,
  businessNotificationSettings,
  businessNotificationReminderRules,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface QACredentials {
  superAdminEmail?: string;
  superAdminPassword?: string;
  platformAdminEmail?: string;
  platformAdminPassword?: string;
  ownerEmail?: string;
  ownerPassword?: string;
  managerEmail?: string;
  managerPassword?: string;
  // Legacy alias for manager
  adminEmail?: string;
  adminPassword?: string;
  staffEmail?: string;
  staffPassword?: string;
  staff2Email?: string;
  staff2Password?: string;
  owner2Email?: string;
  owner2Password?: string;
  staff3Email?: string;
  staff3Password?: string;
}

export interface QABootstrapResult {
  business: {
    id: string;
    slug: string;
    name: string;
  };
  secondBusiness: {
    id: string;
    slug: string;
    name: string;
  };
  users: {
    superAdmin: { id: string; email: string };
    platformAdmin: { id: string; email: string };
    owner: { id: string; email: string };
    manager: { id: string; email: string };
    admin: { id: string; email: string }; // Backward-compatible alias
    staff: { id: string; email: string };
    staff2: { id: string; email: string };
    owner2: { id: string; email: string };
    staff3: { id: string; email: string };
  };
  staffProfiles: {
    ownerStaffId: string;
    staffStaffId: string;
    staff2StaffId: string;
    owner2StaffId: string;
    staff3StaffId: string;
  };
  services: Array<{ id: string; name: string }>;
}

/**
 * Creates or retrieves a Better Auth user safely and idempotently.
 * Uses trusted administrative account creation for credential generation.
 */
async function getOrCreateUser(
  email: string,
  password: string,
  name: string
): Promise<{ id: string; email: string; name: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail));

  if (existing) {
    if (!existing.emailVerified) {
      await db
        .update(users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
    }

    // Synchronize password via Better Auth internal adapter
    const ctx = await auth.$context;
    const passwordHash = await ctx.password.hash(password);
    const credentialAccount = await ctx.internalAdapter.findCredentialAccount(existing.id);
    if (credentialAccount) {
      await ctx.internalAdapter.updatePassword(existing.id, passwordHash);
    } else {
      await ctx.internalAdapter.createAccount({
        userId: existing.id,
        accountId: existing.id,
        providerId: "credential",
        password: passwordHash,
      });
    }

    return { id: existing.id, email: existing.email, name: existing.name };
  }

  // Use trusted Better Auth administrative account creation mechanism
  const created = await createAdministrativeUser({
    email: normalizedEmail,
    password,
    name,
    emailVerified: true,
  });

  return { id: created.id, email: created.email, name: created.name };
}

/**
 * Idempotently executes local QA data bootstrap.
 * Refuses execution if NODE_ENV === "production".
 */
export async function bootstrapQA(credentials: QACredentials): Promise<QABootstrapResult> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "QA bootstrap cannot be executed in production environment (NODE_ENV=production)."
    );
  }

  const defaultPassword = "BarberCraft-QA-4380!";

  // 1. Resolve Canonical QA Identities & Credentials
  const superAdminEmail = credentials.superAdminEmail || "qa.superadmin@local.test";
  const superAdminPassword = credentials.superAdminPassword || defaultPassword;

  const platformAdminEmail = credentials.platformAdminEmail || "qa.platformadmin@local.test";
  const platformAdminPassword = credentials.platformAdminPassword || defaultPassword;

  const ownerEmail = credentials.ownerEmail || "qa.owner@local.test";
  const ownerPassword = credentials.ownerPassword || defaultPassword;

  const managerEmail = credentials.managerEmail || credentials.adminEmail || "qa.manager@local.test";
  const managerPassword = credentials.managerPassword || credentials.adminPassword || defaultPassword;

  const staffEmail = credentials.staffEmail || "qa.staff@local.test";
  const staffPassword = credentials.staffPassword || defaultPassword;

  const staff2Email = credentials.staff2Email || "qa.staff2@local.test";
  const staff2Password = credentials.staff2Password || defaultPassword;

  const owner2Email = credentials.owner2Email || "qa.owner2@local.test";
  const owner2Password = credentials.owner2Password || defaultPassword;

  const staff3Email = credentials.staff3Email || "qa.staff3@local.test";
  const staff3Password = credentials.staff3Password || defaultPassword;

  // 2. Create or retrieve all 8 canonical Better Auth users
  const superAdminUser = await getOrCreateUser(superAdminEmail, superAdminPassword, "QA Süper Yönetici");
  const platformAdminUser = await getOrCreateUser(platformAdminEmail, platformAdminPassword, "QA Platform Yöneticisi");
  const ownerUser = await getOrCreateUser(ownerEmail, ownerPassword, "QA İşletme Sahibi");
  const managerUser = await getOrCreateUser(managerEmail, managerPassword, "QA İşletme Yöneticisi");
  const staffUser = await getOrCreateUser(staffEmail, staffPassword, "QA Personel");
  const staff2User = await getOrCreateUser(staff2Email, staff2Password, "QA Personel 2");
  const owner2User = await getOrCreateUser(owner2Email, owner2Password, "QA İşletme Sahibi 2");
  const staff3User = await getOrCreateUser(staff3Email, staff3Password, "QA Personel 3");

  // 3. Ensure Platform Admin Records
  // 3.1 SUPER_ADMIN
  const [existingSuperAdmin] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, superAdminUser.id));

  if (existingSuperAdmin) {
    await db
      .update(platformAdmins)
      .set({ role: "SUPER_ADMIN", active: true, updatedAt: new Date() })
      .where(eq(platformAdmins.id, existingSuperAdmin.id));
  } else {
    await db.insert(platformAdmins).values({
      userId: superAdminUser.id,
      role: "SUPER_ADMIN",
      active: true,
    });
  }

  // 3.2 PLATFORM_ADMIN
  const [existingPlatformAdmin] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, platformAdminUser.id));

  if (existingPlatformAdmin) {
    await db
      .update(platformAdmins)
      .set({ role: "PLATFORM_ADMIN", active: true, updatedAt: new Date() })
      .where(eq(platformAdmins.id, existingPlatformAdmin.id));
  } else {
    await db.insert(platformAdmins).values({
      userId: platformAdminUser.id,
      role: "PLATFORM_ADMIN",
      active: true,
    });
  }

  // 4. Ensure Primary Business: QA Berber (slug: qa-berber)
  const businessSlug = "qa-berber";
  const [existingBiz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug));

  let businessId: string;
  if (existingBiz) {
    businessId = existingBiz.id;
    await db
      .update(businesses)
      .set({
        name: "QA Berber",
        active: true,
        onboardingCompletedAt: existingBiz.onboardingCompletedAt ?? new Date(),
        timezone: "Europe/Istanbul",
        currency: "TRY",
        bookingIntervalMinutes: 15,
        minimumBookingLeadMinutes: 0,
        maximumAdvanceBookingDays: null,
        cancellationNoticeMinutes: 0,
        rescheduleNoticeMinutes: 0,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, existingBiz.id));
  } else {
    const [createdBiz] = await db
      .insert(businesses)
      .values({
        name: "QA Berber",
        slug: businessSlug,
        timezone: "Europe/Istanbul",
        currency: "TRY",
        bookingIntervalMinutes: 15,
        minimumBookingLeadMinutes: 0,
        maximumAdvanceBookingDays: null,
        cancellationNoticeMinutes: 0,
        rescheduleNoticeMinutes: 0,
        active: true,
        onboardingCompletedAt: new Date(),
      })
      .returning();
    businessId = createdBiz.id;
  }

  // Primary business notification behavior: inert and deterministic
  await db
    .insert(businessNotificationSettings)
    .values({
      businessId,
      customerNotificationsEnabled: false,
      appointmentCreatedEnabled: true,
      appointmentRescheduledEnabled: true,
      appointmentCancelledEnabled: true,
    })
    .onConflictDoUpdate({
      target: businessNotificationSettings.businessId,
      set: {
        customerNotificationsEnabled: false,
        appointmentCreatedEnabled: true,
        appointmentRescheduledEnabled: true,
        appointmentCancelledEnabled: true,
      },
    });
  await db
    .delete(businessNotificationReminderRules)
    .where(eq(businessNotificationReminderRules.businessId, businessId));

  // 5. Ensure Memberships for Primary Business (QA Berber)
  // 5.1 OWNER
  const [ownerForThisUser] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, ownerUser.id)
      )
    );

  let ownerMemberId: string;
  if (ownerForThisUser) {
    ownerMemberId = ownerForThisUser.id;
    await db
      .update(businessMembers)
      .set({ role: "OWNER", active: true, updatedAt: new Date() })
      .where(eq(businessMembers.id, ownerForThisUser.id));
  } else {
    const [existingOwner] = await db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.role, "OWNER")
        )
      );

    if (existingOwner) {
      ownerMemberId = existingOwner.id;
      await db
        .update(businessMembers)
        .set({ userId: ownerUser.id, active: true, updatedAt: new Date() })
        .where(eq(businessMembers.id, existingOwner.id));
    } else {
      const [created] = await db
        .insert(businessMembers)
        .values({
          businessId,
          userId: ownerUser.id,
          role: "OWNER",
          active: true,
        })
        .returning();
      ownerMemberId = created.id;
    }
  }

  // 5.2 Legacy qa.admin reconciliation:
  // If legacy qa.admin fixture user exists and is distinct from managerUser, remove its membership
  const [legacyAdminUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "qa.admin@local.test"));
  if (legacyAdminUser && legacyAdminUser.id !== managerUser.id) {
    await db
      .delete(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.userId, legacyAdminUser.id)
        )
      );
  }

  // 5.3 MANAGER
  const [managerForThisUser] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, managerUser.id)
      )
    );

  if (managerForThisUser) {
    await db
      .update(businessMembers)
      .set({ role: "MANAGER", active: true, updatedAt: new Date() })
      .where(eq(businessMembers.id, managerForThisUser.id));
  } else {
    const [existingManager] = await db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.role, "MANAGER")
        )
      );

    if (existingManager) {
      await db
        .update(businessMembers)
        .set({ userId: managerUser.id, active: true, updatedAt: new Date() })
        .where(eq(businessMembers.id, existingManager.id));
    } else {
      await db.insert(businessMembers).values({
        businessId,
        userId: managerUser.id,
        role: "MANAGER",
        active: true,
      });
    }
  }

  // 5.4 STAFF 1
  const [staffForThisUser] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, staffUser.id)
      )
    );

  let staffMemberId: string;
  if (staffForThisUser) {
    staffMemberId = staffForThisUser.id;
    await db
      .update(businessMembers)
      .set({ role: "STAFF", active: true, updatedAt: new Date() })
      .where(eq(businessMembers.id, staffForThisUser.id));
  } else {
    const [existingStaff] = await db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.role, "STAFF")
        )
      );

    if (existingStaff) {
      staffMemberId = existingStaff.id;
      await db
        .update(businessMembers)
        .set({ userId: staffUser.id, active: true, updatedAt: new Date() })
        .where(eq(businessMembers.id, existingStaff.id));
    } else {
      const [created] = await db
        .insert(businessMembers)
        .values({
          businessId,
          userId: staffUser.id,
          role: "STAFF",
          active: true,
        })
        .returning();
      staffMemberId = created.id;
    }
  }

  // 5.5 STAFF 2
  const [staff2ForThisUser] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, staff2User.id)
      )
    );

  let staff2MemberId: string;
  if (staff2ForThisUser) {
    staff2MemberId = staff2ForThisUser.id;
    await db
      .update(businessMembers)
      .set({ role: "STAFF", active: true, updatedAt: new Date() })
      .where(eq(businessMembers.id, staff2ForThisUser.id));
  } else {
    const [created] = await db
      .insert(businessMembers)
      .values({
        businessId,
        userId: staff2User.id,
        role: "STAFF",
        active: true,
      })
      .returning();
    staff2MemberId = created.id;
  }

  // 6. Ensure Staff Profiles for Primary Business
  // Profile 1: Owner as staff (Ahmet Usta)
  const [existingOwnerStaff] = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.businessMemberId, ownerMemberId));

  let ownerStaffId: string;
  if (existingOwnerStaff) {
    ownerStaffId = existingOwnerStaff.id;
    await db
      .update(staffProfiles)
      .set({
        firstName: "Ahmet",
        lastName: "Usta",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
        updatedAt: new Date(),
      })
      .where(eq(staffProfiles.id, existingOwnerStaff.id));
  } else {
    const [created] = await db
      .insert(staffProfiles)
      .values({
        businessId,
        businessMemberId: ownerMemberId,
        firstName: "Ahmet",
        lastName: "Usta",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
      })
      .returning();
    ownerStaffId = created.id;
  }

  // Profile 2: Dedicated Staff (Mehmet Kalfa)
  const [existingStaffStaff] = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.businessMemberId, staffMemberId));

  let staffStaffId: string;
  if (existingStaffStaff) {
    staffStaffId = existingStaffStaff.id;
    await db
      .update(staffProfiles)
      .set({
        firstName: "Mehmet",
        lastName: "Kalfa",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
        updatedAt: new Date(),
      })
      .where(eq(staffProfiles.id, existingStaffStaff.id));
  } else {
    const [created] = await db
      .insert(staffProfiles)
      .values({
        businessId,
        businessMemberId: staffMemberId,
        firstName: "Mehmet",
        lastName: "Kalfa",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
      })
      .returning();
    staffStaffId = created.id;
  }

  // Profile 3: Second Dedicated Staff (Ali Kalfa)
  const [existingStaff2] = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.businessMemberId, staff2MemberId));

  let staff2StaffId: string;
  if (existingStaff2) {
    staff2StaffId = existingStaff2.id;
    await db
      .update(staffProfiles)
      .set({
        firstName: "Ali",
        lastName: "Kalfa",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
        updatedAt: new Date(),
      })
      .where(eq(staffProfiles.id, existingStaff2.id));
  } else {
    const [created] = await db
      .insert(staffProfiles)
      .values({
        businessId,
        businessMemberId: staff2MemberId,
        firstName: "Ali",
        lastName: "Kalfa",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
      })
      .returning();
    staff2StaffId = created.id;
  }

  // 7. Ensure Working Hours for Primary Business (09:00 - 19:00 all 7 days)
  for (let day = 0; day <= 6; day++) {
    const [existingHour] = await db
      .select({ id: businessWorkingHours.id })
      .from(businessWorkingHours)
      .where(
        and(
          eq(businessWorkingHours.businessId, businessId),
          eq(businessWorkingHours.dayOfWeek, day)
        )
      );

    if (existingHour) {
      await db
        .update(businessWorkingHours)
        .set({
          isClosed: false,
          startTime: "09:00",
          endTime: "19:00",
          updatedAt: new Date(),
        })
        .where(eq(businessWorkingHours.id, existingHour.id));
    } else {
      await db.insert(businessWorkingHours).values({
        businessId,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "19:00",
        isClosed: false,
      });
    }
  }

  // 8. Ensure Staff Working Hours for Primary Business Profiles
  const primaryStaffProfileIds = [ownerStaffId, staffStaffId, staff2StaffId];
  for (const sId of primaryStaffProfileIds) {
    for (let day = 0; day <= 6; day++) {
      const [existingSwh] = await db
        .select({ id: staffWorkingHours.id })
        .from(staffWorkingHours)
        .where(
          and(
            eq(staffWorkingHours.businessId, businessId),
            eq(staffWorkingHours.staffId, sId),
            eq(staffWorkingHours.dayOfWeek, day)
          )
        );

      if (existingSwh) {
        await db
          .update(staffWorkingHours)
          .set({
            isWorking: true,
            startTime: "09:00",
            endTime: "19:00",
            updatedAt: new Date(),
          })
          .where(eq(staffWorkingHours.id, existingSwh.id));
      } else {
        await db.insert(staffWorkingHours).values({
          businessId,
          staffId: sId,
          dayOfWeek: day,
          startTime: "09:00",
          endTime: "19:00",
          isWorking: true,
        });
      }
    }
  }

  // 9. Ensure Services for Primary Business
  const defaultServices = [
    { name: "Saç Kesimi", durationMinutes: 30, price: "250.00" },
    { name: "Sakal Tıraşı", durationMinutes: 20, price: "150.00" },
    { name: "Saç & Sakal Bakımı", durationMinutes: 45, price: "350.00" },
  ];

  const seededServices: Array<{ id: string; name: string }> = [];

  for (const svcDef of defaultServices) {
    const [existingSvc] = await db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.name, svcDef.name)
        )
      );

    if (existingSvc) {
      await db
        .update(services)
        .set({
          durationMinutes: svcDef.durationMinutes,
          price: svcDef.price,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(services.id, existingSvc.id));
      seededServices.push({ id: existingSvc.id, name: existingSvc.name });
    } else {
      const [createdSvc] = await db
        .insert(services)
        .values({
          businessId,
          name: svcDef.name,
          durationMinutes: svcDef.durationMinutes,
          price: svcDef.price,
          active: true,
        })
        .returning();
      seededServices.push({ id: createdSvc.id, name: createdSvc.name });
    }
  }

  // Assign Services to Primary Staff Profiles
  for (const sId of primaryStaffProfileIds) {
    for (const svc of seededServices) {
      const [existingAssigned] = await db
        .select()
        .from(staffServices)
        .where(
          and(
            eq(staffServices.staffId, sId),
            eq(staffServices.serviceId, svc.id)
          )
        );

      if (!existingAssigned) {
        await db.insert(staffServices).values({
          businessId,
          staffId: sId,
          serviceId: svc.id,
        });
      }
    }
  }

  // 10. Sample Customer and Initial Appointment for Primary Business
  const customerPhone = "+905551234567";
  const normalizedPhone = "905551234567";
  const phoneComparisonKey = "+905551234567";

  const [existingCustomer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.businessId, businessId),
        eq(customers.normalizedPhone, normalizedPhone)
      )
    );

  let customerId: string;
  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const [createdCust] = await db
      .insert(customers)
      .values({
        businessId,
        firstName: "Can",
        lastName: "Yılmaz",
        phone: customerPhone,
        normalizedPhone,
        phoneComparisonKey,
      })
      .returning();
    customerId = createdCust.id;
  }

  const [existingAppt] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(eq(appointments.businessId, businessId))
    .limit(1);

  if (!existingAppt && seededServices.length > 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const endTomorrow = new Date(tomorrow.getTime() + 30 * 60000);

    await db.insert(appointments).values({
      businessId,
      customerId,
      staffId: ownerStaffId,
      serviceId: seededServices[0].id,
      startTime: tomorrow,
      endTime: endTomorrow,
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      serviceNameSnapshot: seededServices[0].name,
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "250.00",
    });
  }

  // 11. Ensure Second Business: QA Berber 2 (slug: qa-berber-2) for cross-tenant isolation testing
  const secondBusinessSlug = "qa-berber-2";
  const [existingBiz2] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, secondBusinessSlug));

  let secondBusinessId: string;
  if (existingBiz2) {
    secondBusinessId = existingBiz2.id;
    await db
      .update(businesses)
      .set({
        name: "QA Berber 2",
        active: true,
        onboardingCompletedAt: existingBiz2.onboardingCompletedAt ?? new Date(),
        timezone: "Europe/Istanbul",
        currency: "TRY",
        bookingIntervalMinutes: 15,
        minimumBookingLeadMinutes: 0,
        maximumAdvanceBookingDays: null,
        cancellationNoticeMinutes: 0,
        rescheduleNoticeMinutes: 0,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, existingBiz2.id));
  } else {
    const [createdBiz2] = await db
      .insert(businesses)
      .values({
        name: "QA Berber 2",
        slug: secondBusinessSlug,
        timezone: "Europe/Istanbul",
        currency: "TRY",
        bookingIntervalMinutes: 15,
        minimumBookingLeadMinutes: 0,
        maximumAdvanceBookingDays: null,
        cancellationNoticeMinutes: 0,
        rescheduleNoticeMinutes: 0,
        active: true,
        onboardingCompletedAt: new Date(),
      })
      .returning();
    secondBusinessId = createdBiz2.id;
  }

  // Inert notification settings for second business
  await db
    .insert(businessNotificationSettings)
    .values({
      businessId: secondBusinessId,
      customerNotificationsEnabled: false,
      appointmentCreatedEnabled: true,
      appointmentRescheduledEnabled: true,
      appointmentCancelledEnabled: true,
    })
    .onConflictDoUpdate({
      target: businessNotificationSettings.businessId,
      set: {
        customerNotificationsEnabled: false,
        appointmentCreatedEnabled: true,
        appointmentRescheduledEnabled: true,
        appointmentCancelledEnabled: true,
      },
    });

  // Second Business Memberships (OWNER: owner2User, STAFF: staff3User)
  // OWNER 2
  const [owner2Membership] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, secondBusinessId),
        eq(businessMembers.userId, owner2User.id)
      )
    );

  let owner2MemberId: string;
  if (owner2Membership) {
    owner2MemberId = owner2Membership.id;
    await db
      .update(businessMembers)
      .set({ role: "OWNER", active: true, updatedAt: new Date() })
      .where(eq(businessMembers.id, owner2Membership.id));
  } else {
    const [created] = await db
      .insert(businessMembers)
      .values({
        businessId: secondBusinessId,
        userId: owner2User.id,
        role: "OWNER",
        active: true,
      })
      .returning();
    owner2MemberId = created.id;
  }

  // STAFF 3
  const [staff3Membership] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, secondBusinessId),
        eq(businessMembers.userId, staff3User.id)
      )
    );

  let staff3MemberId: string;
  if (staff3Membership) {
    staff3MemberId = staff3Membership.id;
    await db
      .update(businessMembers)
      .set({ role: "STAFF", active: true, updatedAt: new Date() })
      .where(eq(businessMembers.id, staff3Membership.id));
  } else {
    const [created] = await db
      .insert(businessMembers)
      .values({
        businessId: secondBusinessId,
        userId: staff3User.id,
        role: "STAFF",
        active: true,
      })
      .returning();
    staff3MemberId = created.id;
  }

  // Staff Profile: Owner 2 (Murat Usta)
  const [existingOwner2Profile] = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.businessMemberId, owner2MemberId));

  let owner2StaffId: string;
  if (existingOwner2Profile) {
    owner2StaffId = existingOwner2Profile.id;
    await db
      .update(staffProfiles)
      .set({
        firstName: "Murat",
        lastName: "Usta",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
        updatedAt: new Date(),
      })
      .where(eq(staffProfiles.id, existingOwner2Profile.id));
  } else {
    const [created] = await db
      .insert(staffProfiles)
      .values({
        businessId: secondBusinessId,
        businessMemberId: owner2MemberId,
        firstName: "Murat",
        lastName: "Usta",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
      })
      .returning();
    owner2StaffId = created.id;
  }

  // Staff Profile: Staff 3 (Kemal Kalfa)
  const [existingStaff3Profile] = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.businessMemberId, staff3MemberId));

  let staff3StaffId: string;
  if (existingStaff3Profile) {
    staff3StaffId = existingStaff3Profile.id;
    await db
      .update(staffProfiles)
      .set({
        firstName: "Kemal",
        lastName: "Kalfa",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
        updatedAt: new Date(),
      })
      .where(eq(staffProfiles.id, existingStaff3Profile.id));
  } else {
    const [created] = await db
      .insert(staffProfiles)
      .values({
        businessId: secondBusinessId,
        businessMemberId: staff3MemberId,
        firstName: "Kemal",
        lastName: "Kalfa",
        active: true,
        publicBookingEnabled: true,
        usesBusinessHours: true,
      })
      .returning();
    staff3StaffId = created.id;
  }

  // Second Business Working Hours (all 7 days)
  for (let day = 0; day <= 6; day++) {
    const [existingHour2] = await db
      .select({ id: businessWorkingHours.id })
      .from(businessWorkingHours)
      .where(
        and(
          eq(businessWorkingHours.businessId, secondBusinessId),
          eq(businessWorkingHours.dayOfWeek, day)
        )
      );

    if (existingHour2) {
      await db
        .update(businessWorkingHours)
        .set({
          isClosed: false,
          startTime: "09:00",
          endTime: "19:00",
          updatedAt: new Date(),
        })
        .where(eq(businessWorkingHours.id, existingHour2.id));
    } else {
      await db.insert(businessWorkingHours).values({
        businessId: secondBusinessId,
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "19:00",
        isClosed: false,
      });
    }
  }

  return {
    business: {
      id: businessId,
      slug: businessSlug,
      name: "QA Berber",
    },
    secondBusiness: {
      id: secondBusinessId,
      slug: secondBusinessSlug,
      name: "QA Berber 2",
    },
    users: {
      superAdmin: { id: superAdminUser.id, email: superAdminUser.email },
      platformAdmin: { id: platformAdminUser.id, email: platformAdminUser.email },
      owner: { id: ownerUser.id, email: ownerUser.email },
      manager: { id: managerUser.id, email: managerUser.email },
      admin: { id: managerUser.id, email: managerUser.email },
      staff: { id: staffUser.id, email: staffUser.email },
      staff2: { id: staff2User.id, email: staff2User.email },
      owner2: { id: owner2User.id, email: owner2User.email },
      staff3: { id: staff3User.id, email: staff3User.email },
    },
    staffProfiles: {
      ownerStaffId,
      staffStaffId,
      staff2StaffId,
      owner2StaffId,
      staff3StaffId,
    },
    services: seededServices,
  };
}
