import { db } from "@/db";
import { auth } from "@/lib/auth/auth";
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
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface QACredentials {
  superAdminEmail: string;
  superAdminPassword: string;
  ownerEmail: string;
  ownerPassword: string;
  adminEmail: string;
  adminPassword: string;
  staffEmail: string;
  staffPassword: string;
}

export interface QABootstrapResult {
  business: {
    id: string;
    slug: string;
    name: string;
  };
  users: {
    superAdmin: { id: string; email: string };
    owner: { id: string; email: string };
    admin: { id: string; email: string };
    staff: { id: string; email: string };
  };
  staffProfiles: {
    ownerStaffId: string;
    staffStaffId: string;
  };
  services: Array<{ id: string; name: string }>;
}

/**
 * Creates or retrieves a Better Auth user safely and idempotently.
 * Uses official Better Auth signUpEmail mechanism for credential generation.
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

  // Use official Better Auth account creation mechanism
  const res = await auth.api.signUpEmail({
    body: {
      email: normalizedEmail,
      password,
      name,
    },
    asResponse: false,
  });

  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, res.user.id));

  return { id: res.user.id, email: res.user.email, name: res.user.name };
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

  // 1. Create or retrieve the 4 required Better Auth users
  const superAdminUser = await getOrCreateUser(
    credentials.superAdminEmail,
    credentials.superAdminPassword,
    "QA Süper Admin"
  );

  const ownerUser = await getOrCreateUser(
    credentials.ownerEmail,
    credentials.ownerPassword,
    "QA İşletme Sahibi"
  );

  const adminUser = await getOrCreateUser(
    credentials.adminEmail,
    credentials.adminPassword,
    "QA İşletme Yöneticisi"
  );

  const staffUser = await getOrCreateUser(
    credentials.staffEmail,
    credentials.staffPassword,
    "QA Personel"
  );

  // 2. Ensure PLATFORM SUPER_ADMIN record
  const [existingPlatformAdmin] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, superAdminUser.id));

  if (existingPlatformAdmin) {
    await db
      .update(platformAdmins)
      .set({ role: "SUPER_ADMIN", active: true, updatedAt: new Date() })
      .where(eq(platformAdmins.id, existingPlatformAdmin.id));
  } else {
    await db.insert(platformAdmins).values({
      userId: superAdminUser.id,
      role: "SUPER_ADMIN",
      active: true,
    });
  }

  // 3. Ensure QA BUSINESS (slug: qa-berber)
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
        active: true,
        onboardingCompletedAt: new Date(),
      })
      .returning();
    businessId = createdBiz.id;
  }

  // 4. Ensure Business Memberships
  // OWNER
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

  // ADMIN
  const [adminForThisUser] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, adminUser.id)
      )
    );

  if (adminForThisUser) {
    await db
      .update(businessMembers)
      .set({ role: "ADMIN", active: true, updatedAt: new Date() })
      .where(eq(businessMembers.id, adminForThisUser.id));
  } else {
    const [existingAdmin] = await db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessId),
          eq(businessMembers.role, "ADMIN")
        )
      );

    if (existingAdmin) {
      await db
        .update(businessMembers)
        .set({ userId: adminUser.id, active: true, updatedAt: new Date() })
        .where(eq(businessMembers.id, existingAdmin.id));
    } else {
      await db.insert(businessMembers).values({
        businessId,
        userId: adminUser.id,
        role: "ADMIN",
        active: true,
      });
    }
  }

  // STAFF
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

  // 5. Ensure Staff Profiles (2 bookable staff: Owner + Staff)
  // Profile 1: Owner as staff
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

  // Profile 2: Dedicated Staff
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

  // 6. Ensure Business Working Hours (all 7 days, 09:00 - 19:00)
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

  // 7. Ensure Staff Working Hours (for custom hours fallback)
  const staffProfileIds = [ownerStaffId, staffStaffId];
  for (const sId of staffProfileIds) {
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

  // 8. Ensure Services
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

  // 9. Assign Services to Staff Profiles
  for (const sId of staffProfileIds) {
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

  // 10. Sample Customer and Initial Appointment for Dashboard Testing
  const customerPhone = "+905551234567";
  const normalizedPhone = "905551234567";

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
      })
      .returning();
    customerId = createdCust.id;
  }

  // Check if appointments already exist for this business
  const [existingAppt] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(eq(appointments.businessId, businessId))
    .limit(1);

  if (!existingAppt && seededServices.length > 0) {
    // Create one sample future appointment
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

  return {
    business: {
      id: businessId,
      slug: businessSlug,
      name: "QA Berber",
    },
    users: {
      superAdmin: { id: superAdminUser.id, email: superAdminUser.email },
      owner: { id: ownerUser.id, email: ownerUser.email },
      admin: { id: adminUser.id, email: adminUser.email },
      staff: { id: staffUser.id, email: staffUser.email },
    },
    staffProfiles: {
      ownerStaffId,
      staffStaffId,
    },
    services: seededServices,
  };
}
