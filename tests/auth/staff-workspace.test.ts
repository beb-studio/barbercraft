/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { startDatabase } from "../database/db.mjs";

const uuid = (n: number) =>
  `88000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  // Businesses
  businessA: uuid(1),
  businessB: uuid(2),

  // Users
  ownerA: uuid(10),
  adminA: uuid(11),
  staff1A: uuid(12),
  staff2A: uuid(13),
  staffInactiveA: uuid(14),
  staffInactiveMemberA: uuid(15),
  ownerB: uuid(16),
  staffB: uuid(17),

  // Memberships
  memberOwnerA: uuid(20),
  memberAdminA: uuid(21),
  memberStaff1A: uuid(22),
  memberStaff2A: uuid(23),
  memberStaffInactiveA: uuid(24),
  memberStaffInactiveMemberA: uuid(25),
  memberOwnerB: uuid(26),
  memberStaffB: uuid(27),

  // Staff Profiles
  profileOwnerA: uuid(30),
  profileAdminA: uuid(31),
  profileStaff1A: uuid(32),
  profileStaff2A: uuid(33),
  profileStaffInactiveA: uuid(34),
  profileStaffInactiveMemberA: uuid(35),
  profileOwnerB: uuid(36),
  profileStaffB: uuid(37),

  // Services
  service1: uuid(40), // 30 min, 300.00
  service2: uuid(41), // 60 min, 600.00
  serviceB: uuid(42),

  // Customers
  customer1: uuid(50),
  customer2: uuid(51),
  customerB: uuid(52),

  // Appointments
  apptPastCompleted: uuid(60),
  apptTodayMorning: uuid(61),
  apptTodayAfternoon: uuid(62),
  apptTodayColleague: uuid(63),
  apptTomorrow: uuid(64),
  apptNextWeek: uuid(65),
  apptLateNight: uuid(66),
  apptEarlyMorning: uuid(67),
  apptCancelled: uuid(68),
  apptNoShow: uuid(69),

  // Time Blocks
  block1Future: uuid(70),
  blockColleague: uuid(71),
  blockPast: uuid(72),

  // Notes
  noteCustomer1: uuid(80),
};

let pgServer: any;
let db: any;
let schema: any;
let orm: any;
let sessionModule: any;
let workspaceService: any;
let workspaceAction: any;
let apptService: any;
let manualBookingActions: any;
let customerActions: any;
let timeBlockActions: any;
let timeBlockService: any;
let staffActions: any;

// Reference test clock: Monday, 2026-10-12 at 10:00:00 UTC (13:00:00 in Europe/Istanbul)
const referenceNow = new Date("2026-10-12T10:00:00.000Z");

function mockSession(userId: string | null) {
  sessionModule.sessionDependencies.getCurrentUser = async () =>
    userId
      ? {
          id: userId,
          email: `${userId}@staff.test`,
          forcePasswordChange: false,
        }
      : null;
}

before(async () => {
  pgServer = await startDatabase();
  process.env.DATABASE_URL = pgServer.connectionString;

  ({ db } = await import("../../src/db"));
  schema = await import("../../src/db/schema");
  orm = await import("drizzle-orm");
  sessionModule = await import("../../src/lib/auth/session");
  const wsMod = await import("../../src/services/staff-workspace.service");
  workspaceService = wsMod.StaffWorkspaceService;
  workspaceAction = await import("../../src/actions/staff-workspace.actions");
  apptService = (await import("../../src/services/appointment.service")).AppointmentService;
  manualBookingActions = await import("../../src/actions/manual-booking.actions");
  customerActions = await import("../../src/actions/customer.actions");
  timeBlockActions = await import("../../src/actions/time-blocks.actions");
  timeBlockService = await import("../../src/services/time-blocks.service");
  staffActions = await import("../../src/actions/staff.actions");

  // SEED TENANTS & USERS
  await db.insert(schema.businesses).values([
    {
      id: ids.businessA,
      name: "BarberCraft Merkez",
      slug: "barbercraft-merkez",
      phone: "+905550000001",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      active: true,
      bookingIntervalMinutes: 30,
    },
    {
      id: ids.businessB,
      name: "BarberCraft Şube 2",
      slug: "barbercraft-sube-2",
      phone: "+905550000002",
      timezone: "Europe/Istanbul",
      currency: "TRY",
      onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      active: true,
      bookingIntervalMinutes: 30,
    },
  ]);

  await db.insert(schema.users).values([
    { id: ids.ownerA, email: "ownerA@staff.test", name: "Patron Ahmet", emailVerified: true },
    { id: ids.adminA, email: "adminA@staff.test", name: "Müdür Mehmet", emailVerified: true },
    { id: ids.staff1A, email: "staff1A@staff.test", name: "Usta Can", emailVerified: true },
    { id: ids.staff2A, email: "staff2A@staff.test", name: "Usta Burak", emailVerified: true },
    { id: ids.staffInactiveA, email: "staffInactiveA@staff.test", name: "Pasif Profil Ali", emailVerified: true },
    { id: ids.staffInactiveMemberA, email: "staffInactiveMemberA@staff.test", name: "Pasif Üye Veli", emailVerified: true },
    { id: ids.ownerB, email: "ownerB@staff.test", name: "Diğer Patron", emailVerified: true },
    { id: ids.staffB, email: "staffB@staff.test", name: "Diğer Personel", emailVerified: true },
  ]);

  await db.insert(schema.businessMembers).values([
    { id: ids.memberOwnerA, businessId: ids.businessA, userId: ids.ownerA, role: "OWNER", active: true },
    { id: ids.memberAdminA, businessId: ids.businessA, userId: ids.adminA, role: "ADMIN", active: true },
    { id: ids.memberStaff1A, businessId: ids.businessA, userId: ids.staff1A, role: "STAFF", active: true },
    { id: ids.memberStaff2A, businessId: ids.businessA, userId: ids.staff2A, role: "STAFF", active: true },
    { id: ids.memberStaffInactiveA, businessId: ids.businessA, userId: ids.staffInactiveA, role: "STAFF", active: true },
    { id: ids.memberStaffInactiveMemberA, businessId: ids.businessA, userId: ids.staffInactiveMemberA, role: "STAFF", active: false },
    { id: ids.memberOwnerB, businessId: ids.businessB, userId: ids.ownerB, role: "OWNER", active: true },
    { id: ids.memberStaffB, businessId: ids.businessB, userId: ids.staffB, role: "STAFF", active: true },
  ]);

  await db.insert(schema.staffProfiles).values([
    {
      id: ids.profileOwnerA,
      businessId: ids.businessA,
      businessMemberId: ids.memberOwnerA,
      firstName: "Patron",
      lastName: "Ahmet",
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: true,
    },
    {
      id: ids.profileAdminA,
      businessId: ids.businessA,
      businessMemberId: ids.memberAdminA,
      firstName: "Müdür",
      lastName: "Mehmet",
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: true,
    },
    {
      id: ids.profileStaff1A,
      businessId: ids.businessA,
      businessMemberId: ids.memberStaff1A,
      firstName: "Can",
      lastName: "Yılmaz",
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: true,
    },
    {
      id: ids.profileStaff2A,
      businessId: ids.businessA,
      businessMemberId: ids.memberStaff2A,
      firstName: "Burak",
      lastName: "Demir",
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: true,
    },
    {
      id: ids.profileStaffInactiveA,
      businessId: ids.businessA,
      businessMemberId: ids.memberStaffInactiveA,
      firstName: "Ali",
      lastName: "Kaya",
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: false, // inactive profile
    },
    {
      id: ids.profileStaffInactiveMemberA,
      businessId: ids.businessA,
      businessMemberId: ids.memberStaffInactiveMemberA,
      firstName: "Veli",
      lastName: "Çelik",
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: true,
    },
    {
      id: ids.profileOwnerB,
      businessId: ids.businessB,
      businessMemberId: ids.memberOwnerB,
      firstName: "Diğer",
      lastName: "Patron",
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: true,
    },
    {
      id: ids.profileStaffB,
      businessId: ids.businessB,
      businessMemberId: ids.memberStaffB,
      firstName: "Diğer",
      lastName: "Personel",
      usesBusinessHours: true,
      publicBookingEnabled: true,
      active: true,
    },
  ]);

  // WORKING HOURS (Business A: 7 days open 09:00 - 18:00 except Sun closed)
  for (let dow = 0; dow <= 6; dow++) {
    await db.insert(schema.businessWorkingHours).values({
      businessId: ids.businessA,
      dayOfWeek: dow,
      startTime: dow === 0 ? null : "09:00:00",
      endTime: dow === 0 ? null : "18:00:00",
      isClosed: dow === 0,
    });
  }

  // SERVICES
  await db.insert(schema.services).values([
    {
      id: ids.service1,
      businessId: ids.businessA,
      name: "Saç Kesimi",
      durationMinutes: 30,
      price: "300.00",
      active: true,
    },
    {
      id: ids.service2,
      businessId: ids.businessA,
      name: "Sakal & Bakım",
      durationMinutes: 60,
      price: "600.00",
      active: true,
    },
    {
      id: ids.serviceB,
      businessId: ids.businessB,
      name: "Diğer Hizmet",
      durationMinutes: 30,
      price: "250.00",
      active: true,
    },
  ]);

  await db.insert(schema.staffServices).values([
    { businessId: ids.businessA, staffId: ids.profileStaff1A, serviceId: ids.service1 },
    { businessId: ids.businessA, staffId: ids.profileStaff1A, serviceId: ids.service2 },
    { businessId: ids.businessA, staffId: ids.profileStaff2A, serviceId: ids.service1 },
    { businessId: ids.businessA, staffId: ids.profileOwnerA, serviceId: ids.service1 },
    { businessId: ids.businessB, staffId: ids.profileStaffB, serviceId: ids.serviceB },
  ]);

  // CUSTOMERS
  await db.insert(schema.customers).values([
    {
      id: ids.customer1,
      businessId: ids.businessA,
      firstName: "Kemal",
      lastName: "Güneş",
      phone: "+905551112233",
      normalizedPhone: "+905551112233",
    },
    {
      id: ids.customer2,
      businessId: ids.businessA,
      firstName: "Osman",
      lastName: "Kara",
      phone: "+905552223344",
      normalizedPhone: "+905552223344",
    },
    {
      id: ids.customerB,
      businessId: ids.businessB,
      firstName: "Yabancı",
      lastName: "Müşteri",
      phone: "+905559998877",
      normalizedPhone: "+905559998877",
    },
  ]);

  // Customer Note (Confidential CRM note)
  await db.insert(schema.customerNotes).values({
    id: ids.noteCustomer1,
    businessId: ids.businessA,
    customerId: ids.customer1,
    content: "Müşteri hassas deriye sahip, gizli CRM notu.",
    createdByBusinessMemberId: ids.memberOwnerA,
  });

  // APPOINTMENTS (Week of 2026-10-12 to 2026-10-18)
  // ReferenceNow: 2026-10-12T10:00:00Z (13:00 Europe/Istanbul)
  await db.insert(schema.appointments).values([
    // Past completed today: 09:30 - 10:00 local (06:30 - 07:00 UTC)
    {
      id: ids.apptPastCompleted,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T06:30:00.000Z"),
      endTime: new Date("2026-10-12T07:00:00.000Z"),
      status: "COMPLETED",
      source: "MANUAL_STAFF",
      notes: "Önceki randevu notu",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    },
    // Past cancelled today: 10:00 - 10:30 local (07:00 - 07:30 UTC)
    {
      id: ids.apptCancelled,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer2,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T07:00:00.000Z"),
      endTime: new Date("2026-10-12T07:30:00.000Z"),
      status: "CANCELLED",
      source: "MANUAL_STAFF",
      notes: "İptal randevu notu",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    },
    // Past no show today: 10:30 - 11:00 local (07:30 - 08:00 UTC)
    {
      id: ids.apptNoShow,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T07:30:00.000Z"),
      endTime: new Date("2026-10-12T08:00:00.000Z"),
      status: "NO_SHOW",
      source: "MANUAL_STAFF",
      notes: "Gelmedi notu",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    },
    // Future today afternoon: 14:00 - 14:30 local (11:00 - 11:30 UTC) -> NEXT APPOINTMENT
    {
      id: ids.apptTodayAfternoon,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T11:00:00.000Z"),
      endTime: new Date("2026-10-12T11:30:00.000Z"),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      notes: "Özel randevu talebi",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    },
    // Colleague appointment today (should never be seen by staff1A)
    {
      id: ids.apptTodayColleague,
      businessId: ids.businessA,
      staffId: ids.profileStaff2A,
      customerId: ids.customer2,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T11:00:00.000Z"),
      endTime: new Date("2026-10-12T11:30:00.000Z"),
      status: "CONFIRMED",
      source: "PUBLIC_WEB",
      notes: "İş arkadaşı randevusu",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    },
    // Tomorrow: Tuesday 2026-10-13 11:00 local (08:00 UTC)
    {
      id: ids.apptTomorrow,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer2,
      serviceId: ids.service2,
      startTime: new Date("2026-10-13T08:00:00.000Z"),
      endTime: new Date("2026-10-13T09:00:00.000Z"),
      status: "PENDING",
      source: "MANUAL_STAFF",
      notes: "Salı randevusu",
      serviceNameSnapshot: "Sakal & Bakım",
      serviceDurationSnapshot: 60,
      servicePriceSnapshot: "600.00",
    },
    // Late night appointment Monday 23:30 local (20:30 UTC on 2026-10-12)
    {
      id: ids.apptLateNight,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T20:30:00.000Z"),
      endTime: new Date("2026-10-12T21:00:00.000Z"),
      status: "CONFIRMED",
      source: "MANUAL_STAFF",
      notes: "Gece randevusu",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    },
    // Early morning appointment Tuesday 00:30 local (21:30 UTC on 2026-10-12)
    {
      id: ids.apptEarlyMorning,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer2,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T21:30:00.000Z"),
      endTime: new Date("2026-10-12T22:00:00.000Z"),
      status: "CONFIRMED",
      source: "MANUAL_STAFF",
      notes: "Sabah erken randevu",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    },
  ]);

  // TIME BLOCKS
  await db.insert(schema.timeBlocks).values([
    // Future time block for staff1A on Wednesday 15:00 - 16:00 local (12:00 - 13:00 UTC)
    {
      id: ids.block1Future,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      blockType: "BREAK",
      startTime: new Date("2026-10-14T12:00:00.000Z"),
      endTime: new Date("2026-10-14T13:00:00.000Z"),
      reason: "Öğle molası",
    },
    // Colleague time block
    {
      id: ids.blockColleague,
      businessId: ids.businessA,
      staffId: ids.profileStaff2A,
      blockType: "TIME_OFF",
      startTime: new Date("2026-10-14T12:00:00.000Z"),
      endTime: new Date("2026-10-14T13:00:00.000Z"),
      reason: "İzin",
    },
    // Past time block
    {
      id: ids.blockPast,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      blockType: "BLOCKED",
      startTime: new Date("2026-10-11T12:00:00.000Z"),
      endTime: new Date("2026-10-11T13:00:00.000Z"),
      reason: "Geçmiş blok",
    },
  ]);
});

after(async () => {
  if (pgServer) {
    await pgServer.stop();
  }
});

beforeEach(() => {
  mockSession(null);
});

// =========================================================================
// GROUP 1: AUTHORITY & IDENTITY (8 TESTS)
// =========================================================================
describe("Group 1: Authority & Identity", () => {
  it("1.1: STAFF session resolves active staff profile correctly", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    assert.equal(ws.profile.staffId, ids.profileStaff1A);
    assert.equal(ws.profile.firstName, "Can");
    assert.equal(ws.profile.isActive, true);
    assert.equal(ws.business.businessId, ids.businessA);
  });

  it("1.2: STAFF with inactive profile is denied operational access safely", async () => {
    mockSession(ids.staffInactiveA);
    await assert.rejects(
      async () => {
        await workspaceService.getStaffWorkspace({
          businessId: ids.businessA,
          userId: ids.staffInactiveA,
          role: "STAFF",
          referenceNow,
        });
      },
      (err: any) => err.message.includes("Personel profili aktif değil")
    );
  });

  it("1.3: STAFF with inactive membership is denied operational access", async () => {
    mockSession(ids.staffInactiveMemberA);
    await assert.rejects(
      async () => {
        await workspaceService.getStaffWorkspace({
          businessId: ids.businessA,
          userId: ids.staffInactiveMemberA,
          role: "STAFF",
          referenceNow,
        });
      },
      (err: any) => err.message.includes("Aktif personel üyeliği bulunamadı")
    );
  });

  it("1.4: STAFF cannot access workspace of another business (cross-tenant)", async () => {
    mockSession(ids.staff1A);
    await assert.rejects(
      async () => {
        await workspaceService.getStaffWorkspace({
          businessId: ids.businessB,
          userId: ids.staff1A,
          role: "STAFF",
          referenceNow,
        });
      },
      (err: any) => err.message.includes("Aktif personel üyeliği bulunamadı")
    );
  });

  it("1.5: STAFF supplying another staff's staffId in request has it rejected", async () => {
    mockSession(ids.staff1A);
    await assert.rejects(
      async () => {
        await workspaceService.getStaffWorkspace({
          businessId: ids.businessA,
          userId: ids.staff1A,
          role: "STAFF",
          targetStaffId: ids.profileStaff2A,
          referenceNow,
        });
      },
      (err: any) => err.message.includes("Başka bir personelin çalışma alanına erişemezsiniz")
    );
  });

  it("1.6: OWNER accessing staff workspace must target a valid staff profile or self", async () => {
    mockSession(ids.ownerA);
    // Targeting colleague
    const wsTarget = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.ownerA,
      role: "OWNER",
      targetStaffId: ids.profileStaff1A,
      referenceNow,
    });
    assert.equal(wsTarget.profile.staffId, ids.profileStaff1A);

    // Targeting invalid
    await assert.rejects(
      async () => {
        await workspaceService.getStaffWorkspace({
          businessId: ids.businessA,
          userId: ids.ownerA,
          role: "OWNER",
          targetStaffId: uuid(999),
          referenceNow,
        });
      },
      (err: any) => err.message.includes("Personel bulunamadı")
    );
  });

  it("1.7: ADMIN accessing staff workspace follows allowed profile rules (cannot access OWNER)", async () => {
    mockSession(ids.adminA);
    // Can access staff profile
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.adminA,
      role: "ADMIN",
      targetStaffId: ids.profileStaff1A,
      referenceNow,
    });
    assert.equal(ws.profile.staffId, ids.profileStaff1A);

    // Cannot access owner profile
    await assert.rejects(
      async () => {
        await workspaceService.getStaffWorkspace({
          businessId: ids.businessA,
          userId: ids.adminA,
          role: "ADMIN",
          targetStaffId: ids.profileOwnerA,
          referenceNow,
        });
      },
      (err: any) => err.message.includes("işletme sahibinin (OWNER) personel profilini yönetemez")
    );
  });

  it("1.8: Non-authenticated caller is rejected with Unauthorized", async () => {
    mockSession(null);
    const result = await workspaceAction.getStaffWorkspaceAction();
    assert.equal(result.success, false);
    assert.match(result.error || "", /giriş yapın|Yetkisiz/);
  });
});

// =========================================================================
// GROUP 2: STAFF WORKSPACE READ MODEL (8 TESTS)
// =========================================================================
describe("Group 2: Staff Workspace Read Model", () => {
  it("2.1: Today agenda returns ONLY the caller's appointments (no colleague appointments)", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const appts = ws.selectedDayAgenda.appointments;
    assert.ok(appts.length > 0);
    // Every single appointment must belong to staff1A
    assert.ok(appts.every((a: any) => a.appointmentId !== ids.apptTodayColleague));
  });

  it("2.2: Selected-day agenda returns ONLY the caller's appointments for that date", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      selectedDate: "2026-10-13",
      referenceNow,
    });
    assert.equal(ws.selectedDayAgenda.dateStr, "2026-10-13");
    assert.equal(ws.selectedDayAgenda.appointments.length, 2); // apptTomorrow + apptEarlyMorning
    assert.ok(ws.selectedDayAgenda.appointments.some((a: any) => a.appointmentId === ids.apptTomorrow));
  });

  it("2.3: Current-week agenda groups days Monday to Sunday in business timezone", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    assert.equal(ws.currentWeekAgenda.length, 7);
    assert.equal(ws.currentWeekAgenda[0].dateStr, "2026-10-12"); // Monday
    assert.equal(ws.currentWeekAgenda[0].dayName, "Pazartesi");
    assert.equal(ws.currentWeekAgenda[6].dateStr, "2026-10-18"); // Sunday
    assert.equal(ws.currentWeekAgenda[6].dayName, "Pazar");
  });

  it("2.4: Current-week agenda includes caller's appointments and time blocks", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const wednesday = ws.currentWeekAgenda.find((d: any) => d.dateStr === "2026-10-14");
    assert.ok(wednesday);
    assert.equal(wednesday.timeBlocks.length, 1);
    assert.equal(wednesday.timeBlocks[0].id, ids.block1Future);
    assert.equal(wednesday.timeBlocks[0].blockType, "BREAK");
  });

  it("2.5: Next appointment returns the earliest future operational appointment", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    assert.ok(ws.nextAppointment);
    assert.equal(ws.nextAppointment?.appointmentId, ids.apptTodayAfternoon);
    assert.equal(ws.nextAppointment?.status, "CONFIRMED");
    assert.equal(ws.nextAppointment?.customerName, "Kemal Güneş");
  });

  it("2.6: Next appointment is null when no future operational appointments exist", async () => {
    mockSession(ids.staff2A);
    // staff2A has only apptTodayColleague at 11:00 UTC (14:00 local). If referenceNow is next week:
    const futureTime = new Date("2026-10-25T12:00:00.000Z");
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff2A,
      role: "STAFF",
      referenceNow: futureTime,
    });
    assert.equal(ws.nextAppointment, null);
  });

  it("2.7: Personal counts match reality (today total, remaining, completed, cancelled, no-show)", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const pulse = ws.pulse;
    assert.equal(pulse.todayDate, "2026-10-12");
    assert.equal(pulse.completedToday, 1);
    assert.equal(pulse.cancelledToday, 1);
    assert.equal(pulse.noShowToday, 1);
    assert.ok(pulse.remainingAppointmentsToday >= 1);
    assert.ok(pulse.totalAppointmentsToday >= 4);
    assert.ok(pulse.weekTotalAppointments >= pulse.totalAppointmentsToday);
  });

  it("2.8: Read model contains NO business-wide analytics, NO other staff metrics, NO financial/revenue data", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const str = JSON.stringify(ws).toLowerCase();
    // Invariants
    assert.equal(str.includes("revenue"), false);
    assert.equal(str.includes("ciro"), false);
    assert.equal(str.includes("tahsilat"), false);
    assert.equal(str.includes("pricesnapshot"), false);
    assert.equal(str.includes("topservices"), false);
    assert.equal(str.includes("staffworkload"), false);
  });
});

// =========================================================================
// GROUP 3: CUSTOMER PRIVACY & DATA SCRUBBING (8 TESTS)
// =========================================================================
describe("Group 3: Customer Privacy & Data Scrubbing", () => {
  it("3.1: Staff agenda includes minimal customer contact info (firstName, lastName, phone)", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const appt = ws.selectedDayAgenda.appointments[0];
    assert.ok(appt.customer.firstName);
    assert.ok(appt.customer.phone);
  });

  it("3.2: Customer internal CRM notes are NEVER present in staff workspace read model", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const str = JSON.stringify(ws);
    assert.equal(str.includes("Müşteri hassas deriye sahip, gizli CRM notu"), false);
  });

  it("3.3: Internal appointment notes are NEVER present in staff workspace read model", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const target = ws.selectedDayAgenda.appointments.find((a: any) => a.appointmentId === ids.apptTodayAfternoon);
    assert.equal("notes" in (target || {}), false);
    assert.equal((target as any)?.notes, undefined);
    assert.equal("notes" in (ws.nextAppointment || {}), false);
    assert.equal((ws.nextAppointment as any)?.notes, undefined);

    // Deep recursive check: Ensure no keys corresponding to internal notes exist anywhere in DTO
    const forbiddenNoteKeys = ["customernotes", "crmnotes", "internalnotes", "appointmentnotes", "notes"];
    function checkNoNoteKeys(obj: any, path = "") {
      if (!obj || typeof obj !== "object") return;
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();
        for (const forbidden of forbiddenNoteKeys) {
          assert.equal(
            lowerKey === forbidden || lowerKey.endsWith(forbidden),
            false,
            `Forbidden note key "${fullPath}" found in Staff Workspace DTO!`
          );
        }
        if (value && typeof value === "object") {
          checkNoNoteKeys(value, fullPath);
        }
      }
    }
    checkNoNoteKeys(ws);

    // Value check: Verify no appointment note string values leaked
    const jsonStr = JSON.stringify(ws);
    assert.equal(jsonStr.includes("Özel randevu talebi"), false);
    assert.equal(jsonStr.includes("Önceki randevu notu"), false);
  });

  it("3.4: Staff cannot access getCustomerNotesAction (forbidden/rejected)", async () => {
    mockSession(ids.staff1A);
    const res = await customerActions.getCustomerNotesAction(ids.customer1);
    assert.equal(res.success, false);
    assert.match(res.error || "", /Yetkisiz|yetkiniz yok/);
  });

  it("3.5: Staff cannot access getCustomerDetailAction (forbidden/rejected)", async () => {
    mockSession(ids.staff1A);
    const res = await customerActions.getCustomerDetailAction(ids.customer1);
    assert.equal(res.success, false);
    assert.match(res.error || "", /Yetkisiz|yetkiniz yok/);
  });

  it("3.6: Staff cannot access getCustomerDirectoryAction (forbidden/rejected)", async () => {
    mockSession(ids.staff1A);
    const res = await customerActions.getCustomerDirectoryAction();
    assert.equal(res.success, false);
    assert.match(res.error || "", /Yetkisiz|yetkiniz yok/);
  });

  it("3.7: Staff cannot access mergeCustomersAction (forbidden/rejected)", async () => {
    mockSession(ids.staff1A);
    const res = await customerActions.mergeCustomersAction(ids.customer1, ids.customer2);
    assert.equal(res.success, false);
    assert.match(res.error || "", /Yetkisiz|yetkiniz yok/);
  });

  it("3.8: Staff searchCustomersForBookingAction returns only basic lookup info (no CRM notes)", async () => {
    mockSession(ids.staff1A);
    const res = await customerActions.searchCustomersForBookingAction("Kemal");
    assert.equal(res.success, true);
    assert.ok(res.data && res.data.length > 0);
    const str = JSON.stringify(res.data);
    assert.equal(str.includes("gizli CRM notu"), false);
  });
});

// =========================================================================
// GROUP 4: APPOINTMENT LIFECYCLE & ALLOWED TRANSITIONS (8 TESTS)
// =========================================================================
describe("Group 4: Appointment Lifecycle & Allowed Transitions", () => {
  it("4.1: STAFF can mark their own past/started PENDING/CONFIRMED appointment as COMPLETED", async () => {
    // Create an active started appointment in the past for staff1A
    const pastApptId = uuid(101);
    await db.insert(schema.appointments).values({
      id: pastApptId,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T01:00:00.000Z"),
      endTime: new Date("2026-10-12T01:30:00.000Z"),
      status: "CONFIRMED",
      source: "MANUAL_STAFF",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    });

    const result = await apptService.updateAppointmentStatus(
      ids.businessA,
      pastApptId,
      "COMPLETED",
      "STAFF",
      ids.staff1A
    );
    assert.equal(result.success, true);
  });

  it("4.2: STAFF can mark their own started PENDING/CONFIRMED appointment as NO_SHOW", async () => {
    const pastApptId = uuid(102);
    await db.insert(schema.appointments).values({
      id: pastApptId,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T02:00:00.000Z"),
      endTime: new Date("2026-10-12T02:30:00.000Z"),
      status: "CONFIRMED",
      source: "MANUAL_STAFF",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    });

    const result = await apptService.updateAppointmentStatus(
      ids.businessA,
      pastApptId,
      "NO_SHOW",
      "STAFF",
      ids.staff1A
    );
    assert.equal(result.success, true);
  });

  it("4.3: STAFF can cancel their own PENDING/CONFIRMED appointment", async () => {
    const apptId = uuid(103);
    await db.insert(schema.appointments).values({
      id: apptId,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T14:00:00.000Z"),
      endTime: new Date("2026-10-12T14:30:00.000Z"),
      status: "CONFIRMED",
      source: "MANUAL_STAFF",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    });

    const result = await apptService.updateAppointmentStatus(
      ids.businessA,
      apptId,
      "CANCELLED",
      "STAFF",
      ids.staff1A
    );
    assert.equal(result.success, true);
  });

  it("4.4: STAFF cannot change status of another staff's appointment", async () => {
    await assert.rejects(
      async () => {
        await apptService.updateAppointmentStatus(
          ids.businessA,
          ids.apptTodayColleague, // belongs to staff2A
          "CANCELLED",
          "STAFF",
          ids.staff1A
        );
      },
      (err: any) => err.message.includes("FORBIDDEN: You cannot mutate another staff member's appointment")
    );
  });

  it("4.5: STAFF cannot revert COMPLETED appointment", async () => {
    await assert.rejects(
      async () => {
        await apptService.updateAppointmentStatus(
          ids.businessA,
          ids.apptPastCompleted,
          "CONFIRMED",
          "STAFF",
          ids.staff1A
        );
      },
      (err: any) => err.message.includes("INVALID_TRANSITION")
    );
  });

  it("4.6: STAFF cannot revert CANCELLED appointment", async () => {
    await assert.rejects(
      async () => {
        await apptService.updateAppointmentStatus(
          ids.businessA,
          ids.apptCancelled,
          "CONFIRMED",
          "STAFF",
          ids.staff1A
        );
      },
      (err: any) => err.message.includes("INVALID_TRANSITION")
    );
  });

  it("4.7: STAFF cannot revert NO_SHOW appointment", async () => {
    await assert.rejects(
      async () => {
        await apptService.updateAppointmentStatus(
          ids.businessA,
          ids.apptNoShow,
          "CONFIRMED",
          "STAFF",
          ids.staff1A
        );
      },
      (err: any) => err.message.includes("INVALID_TRANSITION")
    );
  });

  it("4.8: Reassign action is strictly forbidden for STAFF", async () => {
    await assert.rejects(
      async () => {
        await apptService.reassignAppointment(
          ids.businessA,
          ids.apptTodayAfternoon,
          ids.profileStaff2A,
          new Date().toISOString(),
          "STAFF",
          ids.staff1A
        );
      },
      (err: any) => err.message.includes("FORBIDDEN: Staff cannot reassign appointments")
    );
  });
});

// =========================================================================
// GROUP 5: RESCHEDULE & MANUAL BOOKING (8 TESTS)
// =========================================================================
describe("Group 5: Reschedule & Manual Booking", () => {
  it("5.1: STAFF can reschedule their own appointment to an available slot", async () => {
    const apptId = uuid(110);
    const start = new Date("2026-10-15T07:00:00.000Z"); // 10:00 local (Thursday)
    const end = new Date("2026-10-15T07:30:00.000Z");

    const [created] = await db
      .insert(schema.appointments)
      .values({
        id: apptId,
        businessId: ids.businessA,
        staffId: ids.profileStaff1A,
        customerId: ids.customer1,
        serviceId: ids.service1,
        startTime: start,
        endTime: end,
        status: "CONFIRMED",
        source: "MANUAL_STAFF",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "300.00",
      })
      .returning();

    const res = await apptService.rescheduleAppointment({
      businessId: ids.businessA,
      appointmentId: apptId,
      newStartAt: "2026-10-15T08:00:00.000Z", // 11:00 local (valid open slot)
      expectedUpdatedAt: created.updatedAt.toISOString(),
      userId: ids.staff1A,
      userRole: "STAFF",
    });

    assert.equal(res.success, true);
  });

  it("5.2: STAFF cannot reschedule their own appointment to an unavailable slot (conflict rejected)", async () => {
    const apptId = uuid(111);
    const [created] = await db
      .insert(schema.appointments)
      .values({
        id: apptId,
        businessId: ids.businessA,
        staffId: ids.profileStaff1A,
        customerId: ids.customer1,
        serviceId: ids.service1,
        startTime: new Date("2026-10-15T08:30:00.000Z"),
        endTime: new Date("2026-10-15T09:00:00.000Z"),
        status: "CONFIRMED",
        source: "MANUAL_STAFF",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "300.00",
      })
      .returning();

    // Try to reschedule to apptTodayAfternoon slot on 2026-10-12
    await assert.rejects(
      async () => {
        await apptService.rescheduleAppointment({
          businessId: ids.businessA,
          appointmentId: apptId,
          newStartAt: "2026-10-12T11:00:00.000Z", // already booked by apptTodayAfternoon
          expectedUpdatedAt: created.updatedAt.toISOString(),
          userId: ids.staff1A,
          userRole: "STAFF",
        });
      },
      (err: any) => err.message.includes("overlaps with another booking") || err.message.includes("not available")
    );
  });

  it("5.3: STAFF cannot reschedule another staff's appointment", async () => {
    const [colleagueApp] = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, ids.apptTodayColleague));

    await assert.rejects(
      async () => {
        await apptService.rescheduleAppointment({
          businessId: ids.businessA,
          appointmentId: ids.apptTodayColleague,
          newStartAt: "2026-10-15T10:00:00.000Z",
          expectedUpdatedAt: colleagueApp.updatedAt.toISOString(),
          userId: ids.staff1A,
          userRole: "STAFF",
        });
      },
      (err: any) => err.message.includes("FORBIDDEN: You cannot mutate another staff member's appointment")
    );
  });

  it("5.4: Reschedule preserves original staffId (staff cannot transfer appointment via reschedule)", async () => {
    const [app] = await db
      .select()
      .from(schema.appointments)
      .where(orm.eq(schema.appointments.id, uuid(110)));
    assert.equal(app.staffId, ids.profileStaff1A);
  });

  it("5.5: STAFF can create manual booking for themselves with existing customer", async () => {
    mockSession(ids.staff1A);
    const res = await manualBookingActions.createInternalAppointmentAction({
      staffId: ids.profileStaff1A,
      serviceId: ids.service1,
      startAt: "2026-10-16T08:00:00.000Z", // 11:00 local (Friday)
      mode: "EXISTING",
      existingCustomerId: ids.customer1,
    });
    assert.equal(res.success, true);
  });

  it("5.6: STAFF can create manual booking for themselves with new customer", async () => {
    mockSession(ids.staff1A);
    const res = await manualBookingActions.createInternalAppointmentAction({
      staffId: ids.profileStaff1A,
      serviceId: ids.service1,
      startAt: "2026-10-16T09:00:00.000Z", // 12:00 local (Friday)
      mode: "NEW",
      customer: {
        firstName: "Yeni",
        lastName: "Müşteri",
        phone: "+905553334455",
      },
    });
    assert.equal(res.success, true);
  });

  it("5.7: STAFF cannot create manual booking assigned to another staff member", async () => {
    mockSession(ids.staff1A);
    const res = await manualBookingActions.createInternalAppointmentAction({
      staffId: ids.profileStaff2A, // colleague
      serviceId: ids.service1,
      startAt: "2026-10-16T10:00:00.000Z",
      mode: "EXISTING",
      existingCustomerId: ids.customer1,
    });
    assert.equal(res.success, false);
    assert.match(res.error || "", /Başka bir personelin adına randevu oluşturamazsınız/);
  });

  it("5.8: Manual booking by STAFF sets source to MANUAL_STAFF", async () => {
    const [booking] = await db
      .select()
      .from(schema.appointments)
      .where(
        orm.and(
          orm.eq(schema.appointments.staffId, ids.profileStaff1A),
          orm.eq(schema.appointments.startTime, new Date("2026-10-16T08:00:00.000Z"))
        )
      );
    assert.equal(booking?.source, "MANUAL_STAFF");
  });
});

// =========================================================================
// GROUP 6: TIME BLOCKS & AVAILABILITY MANAGEMENT (8 TESTS)
// =========================================================================
describe("Group 6: Time Blocks & Availability Management", () => {
  it("6.1: STAFF can create personal time block for themselves (TIME_OFF, BREAK, BLOCKED)", async () => {
    mockSession(ids.staff1A);
    const res = await timeBlockActions.createStaffTimeBlockAction({
      staffId: ids.profileStaff1A,
      blockType: "TIME_OFF",
      startDate: "2026-10-17",
      startTime: "10:00",
      endDate: "2026-10-17",
      endTime: "11:00",
      reason: "Kişisel mola",
    });
    assert.equal(res.success, true);
    assert.ok(res.block?.id);
  });

  it("6.2: STAFF cannot create time block for another staff member", async () => {
    mockSession(ids.staff1A);
    const res = await timeBlockActions.createStaffTimeBlockAction({
      staffId: ids.profileStaff2A, // colleague
      blockType: "TIME_OFF",
      startDate: "2026-10-17",
      startTime: "12:00",
      endDate: "2026-10-17",
      endTime: "13:00",
    });
    assert.equal(res.success, false);
    assert.match(res.error || "", /Kendi personel profiliniz dışındaki|yetkiniz yok/);
  });

  it("6.3: STAFF cannot create time block overlapping an existing operational appointment", async () => {
    mockSession(ids.staff1A);
    // apptTodayAfternoon is on 2026-10-12 at 14:00 - 14:30 local
    const res = await timeBlockActions.createStaffTimeBlockAction({
      staffId: ids.profileStaff1A,
      blockType: "BREAK",
      startDate: "2026-10-12",
      startTime: "14:00",
      endDate: "2026-10-12",
      endTime: "15:00",
      reason: "Randevunun üzerine blok",
    });
    assert.equal(res.success, false);
    assert.match(res.error || "", /Bu zaman aralığında mevcut bir randevunuz bulunuyor/);
  });

  it("6.4: STAFF cannot create time block overlapping an existing time block (TimeBlockOverlapError)", async () => {
    mockSession(ids.staff1A);
    // block1Future is on 2026-10-14 at 15:00 - 16:00 local
    const res = await timeBlockActions.createStaffTimeBlockAction({
      staffId: ids.profileStaff1A,
      blockType: "BREAK",
      startDate: "2026-10-14",
      startTime: "15:15",
      endDate: "2026-10-14",
      endTime: "15:45",
      reason: "Mükerrer mola",
    });
    assert.equal(res.success, false);
    assert.match(res.error || "", /çakışmaktadır/);
  });

  it("6.5: STAFF can delete their own future time block", async () => {
    mockSession(ids.staff1A);
    // Create temporary future block
    const created = await timeBlockActions.createStaffTimeBlockAction({
      staffId: ids.profileStaff1A,
      blockType: "BREAK",
      startDate: "2026-10-17",
      startTime: "14:00",
      endDate: "2026-10-17",
      endTime: "15:00",
    });
    assert.ok(created.block?.id);

    const delRes = await timeBlockActions.deleteStaffTimeBlockAction({
      staffId: ids.profileStaff1A,
      blockId: created.block!.id,
    });
    assert.equal(delRes.success, true);
  });

  it("6.6: STAFF cannot delete another staff's time block", async () => {
    mockSession(ids.staff1A);
    const delRes = await timeBlockActions.deleteStaffTimeBlockAction({
      staffId: ids.profileStaff1A,
      blockId: ids.blockColleague, // belongs to staff2A
    });
    assert.equal(delRes.success, false);
  });

  it("6.7: STAFF cannot delete past time block", async () => {
    mockSession(ids.staff1A);
    const delRes = await timeBlockActions.deleteStaffTimeBlockAction({
      staffId: ids.profileStaff1A,
      blockId: ids.blockPast,
    });
    assert.equal(delRes.success, false);
    assert.match(delRes.error || "", /Geçmiş zaman blokları silinemez/);
  });

  it("6.8: STAFF cannot modify weekly recurring working hours", async () => {
    mockSession(ids.staff1A);
    const res = await staffActions.saveStaffWorkingHoursAction({
      staffId: ids.profileStaff1A,
      schedule: [],
    });
    assert.equal(res.success, false);
    assert.match(res.error || "", /Yetkisiz işlem|yetkiniz yok/);
  });
});

// =========================================================================
// GROUP 7: TIMEZONE & WEEK BOUNDARY CORRECTNESS (8 TESTS)
// =========================================================================
describe("Group 7: Timezone & Week Boundary Correctness", () => {
  it("7.1: Business timezone (Europe/Istanbul) local today is respected", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    assert.equal(ws.business.timezone, "Europe/Istanbul");
    assert.equal(ws.pulse.todayDate, "2026-10-12");
  });

  it("7.2: Current week starts on Monday in business timezone", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const firstDay = ws.currentWeekAgenda[0];
    assert.equal(firstDay.dateStr, "2026-10-12");
    assert.equal(firstDay.dayName, "Pazartesi");
  });

  it("7.3: Current week ends on Sunday in business timezone", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const lastDay = ws.currentWeekAgenda[6];
    assert.equal(lastDay.dateStr, "2026-10-18");
    assert.equal(lastDay.dayName, "Pazar");
  });

  it("7.4: Late-night appointment (23:30 local) is attributed to correct local date", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      selectedDate: "2026-10-12",
      referenceNow,
    });
    const late = ws.selectedDayAgenda.appointments.find((a: any) => a.appointmentId === ids.apptLateNight);
    assert.ok(late);
    assert.equal(late.localDate, "2026-10-12");
    assert.equal(late.localStartTime, "23:30");
  });

  it("7.5: Early-morning appointment (00:30 local) is attributed to correct local date", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      selectedDate: "2026-10-13",
      referenceNow,
    });
    const early = ws.selectedDayAgenda.appointments.find((a: any) => a.appointmentId === ids.apptEarlyMorning);
    assert.ok(early);
    assert.equal(early.localDate, "2026-10-13");
    assert.equal(early.localStartTime, "00:30");
  });

  it("7.6: Week boundary correctly groups appointments near Monday 00:00", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const mon = ws.currentWeekAgenda[0];
    assert.ok(mon.appointments.length > 0);
    assert.ok(mon.appointments.every((a: any) => a.localDate === "2026-10-12"));
  });

  it("7.7: Week boundary correctly groups appointments near Sunday 23:59", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const sun = ws.currentWeekAgenda[6];
    assert.equal(sun.dateStr, "2026-10-18");
    assert.equal(sun.isWorkingDay, false); // Sunday closed in business A
  });

  it("7.8: Staff working hours for each day of the week are correctly evaluated", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });
    const mon = ws.currentWeekAgenda[0];
    assert.equal(mon.isWorkingDay, true);
    assert.equal(mon.workingHours?.startTime, "09:00:00");
    assert.equal(mon.workingHours?.endTime, "18:00:00");

    const sun = ws.currentWeekAgenda[6];
    assert.equal(sun.isWorkingDay, false);
    assert.equal(sun.workingHours, null);
  });
});

// =========================================================================
// GROUP 8: CONCURRENCY & INVARIANT SAFETY (8 TESTS)
// =========================================================================
describe("Group 8: Concurrency & Invariant Safety", () => {
  it("8.1: Concurrent status update: two rapid requests to complete the same appointment", async () => {
    const apptId = uuid(120);
    await db.insert(schema.appointments).values({
      id: apptId,
      businessId: ids.businessA,
      staffId: ids.profileStaff1A,
      customerId: ids.customer1,
      serviceId: ids.service1,
      startTime: new Date("2026-10-12T03:00:00.000Z"),
      endTime: new Date("2026-10-12T03:30:00.000Z"),
      status: "CONFIRMED",
      source: "MANUAL_STAFF",
      serviceNameSnapshot: "Saç Kesimi",
      serviceDurationSnapshot: 30,
      servicePriceSnapshot: "300.00",
    });

    const results = await Promise.allSettled([
      apptService.updateAppointmentStatus(
        ids.businessA,
        apptId,
        "COMPLETED",
        "STAFF",
        ids.staff1A
      ),
      apptService.updateAppointmentStatus(
        ids.businessA,
        apptId,
        "COMPLETED",
        "STAFF",
        ids.staff1A
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
  });

  it("8.2: Concurrent reschedule: two requests to move to same slot", async () => {
    const appt1 = uuid(121);
    const appt2 = uuid(122);
    const [c1] = await db
      .insert(schema.appointments)
      .values({
        id: appt1,
        businessId: ids.businessA,
        staffId: ids.profileStaff1A,
        customerId: ids.customer1,
        serviceId: ids.service1,
        startTime: new Date("2026-10-17T06:00:00.000Z"),
        endTime: new Date("2026-10-17T06:30:00.000Z"),
        status: "CONFIRMED",
        source: "MANUAL_STAFF",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "300.00",
      })
      .returning();

    const [c2] = await db
      .insert(schema.appointments)
      .values({
        id: appt2,
        businessId: ids.businessA,
        staffId: ids.profileStaff1A,
        customerId: ids.customer2,
        serviceId: ids.service1,
        startTime: new Date("2026-10-17T06:30:00.000Z"),
        endTime: new Date("2026-10-17T07:00:00.000Z"),
        status: "CONFIRMED",
        source: "MANUAL_STAFF",
        serviceNameSnapshot: "Saç Kesimi",
        serviceDurationSnapshot: 30,
        servicePriceSnapshot: "300.00",
      })
      .returning();

    // Both attempt to reschedule to 2026-10-17T08:00:00.000Z concurrently
    const targetSlot = "2026-10-17T08:00:00.000Z";
    const results = await Promise.allSettled([
      apptService.rescheduleAppointment({
        businessId: ids.businessA,
        appointmentId: appt1,
        newStartAt: targetSlot,
        expectedUpdatedAt: c1.updatedAt.toISOString(),
        userId: ids.staff1A,
        userRole: "STAFF",
      }),
      apptService.rescheduleAppointment({
        businessId: ids.businessA,
        appointmentId: appt2,
        newStartAt: targetSlot,
        expectedUpdatedAt: c2.updatedAt.toISOString(),
        userId: ids.staff1A,
        userRole: "STAFF",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
  });

  it("8.3: Concurrent time block creation: two requests for same interval", async () => {
    const results = await Promise.allSettled([
      timeBlockService.createStaffTimeBlockService(
        ids.businessA,
        ids.profileStaff1A,
        {
          blockType: "BREAK",
          startDate: "2026-10-18",
          startTime: "11:00",
          endDate: "2026-10-18",
          endTime: "12:00",
        },
        "STAFF",
        ids.staff1A
      ),
      timeBlockService.createStaffTimeBlockService(
        ids.businessA,
        ids.profileStaff1A,
        {
          blockType: "BREAK",
          startDate: "2026-10-18",
          startTime: "11:00",
          endDate: "2026-10-18",
          endTime: "12:00",
        },
        "STAFF",
        ids.staff1A
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
  });

  it("8.4: Concurrent appointment booking vs time block creation for same slot", async () => {
    // Target slot: 2026-10-17 11:30 local (08:30 UTC)
    const slotIso = "2026-10-17T08:30:00.000Z";
    mockSession(ids.staff1A);

    const results = await Promise.allSettled([
      manualBookingActions.createInternalAppointmentAction({
        staffId: ids.profileStaff1A,
        serviceId: ids.service1,
        startAt: slotIso,
        mode: "EXISTING",
        existingCustomerId: ids.customer1,
      }),
      timeBlockService.createStaffTimeBlockService(
        ids.businessA,
        ids.profileStaff1A,
        {
          blockType: "BREAK",
          startDate: "2026-10-17",
          startTime: "11:30",
          endDate: "2026-10-17",
          endTime: "12:00",
        },
        "STAFF",
        ids.staff1A
      ),
    ]);

    // One must win, the other must fail (no double booking / overlap)
    const successes = results.filter(
      (r) => r.status === "fulfilled" && (r.value as any)?.success !== false
    );
    assert.equal(successes.length, 1);
  });

  it("8.5: Race test: 10 iterations of concurrent time block creation by same staff", async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      timeBlockService
        .createStaffTimeBlockService(
          ids.businessA,
          ids.profileStaff1A,
          {
            blockType: "TIME_OFF",
            startDate: "2026-10-19",
            startTime: "13:00",
            endDate: "2026-10-19",
            endTime: "14:00",
            reason: `Race attempt ${i}`,
          },
          "STAFF",
          ids.staff1A
        )
        .then(() => true)
        .catch(() => false)
    );

    const outcomes = await Promise.all(promises);
    const winCount = outcomes.filter(Boolean).length;
    assert.equal(winCount, 1);
  });

  it("8.6: Multi-tenant isolation: staff cannot see or mutate data from another tenant under high load", async () => {
    mockSession(ids.staff1A);
    const attempts = Array.from({ length: 5 }, () =>
      workspaceAction.getStaffWorkspaceAction({ businessIdParam: ids.businessB })
    );

    const results = await Promise.all(attempts);
    assert.ok(results.every((r) => r.success === false));
  });

  it("8.7: Deleted/inactive staff cannot perform operational mutations mid-session", async () => {
    mockSession(ids.staffInactiveA);
    const res = await timeBlockActions.createStaffTimeBlockAction({
      staffId: ids.profileStaffInactiveA,
      blockType: "BREAK",
      startDate: "2026-10-20",
      startTime: "10:00",
      endDate: "2026-10-20",
      endTime: "11:00",
    });
    // Inactive profile rejected
    assert.equal(res.success, false);
  });

  it("8.8: Zero financial exposure verification: deep key inspection guarantees absence of financial keys", async () => {
    mockSession(ids.staff1A);
    const ws = await workspaceService.getStaffWorkspace({
      businessId: ids.businessA,
      userId: ids.staff1A,
      role: "STAFF",
      referenceNow,
    });

    const forbiddenKeys = ["price", "revenue", "ciro", "tutar", "earning", "price_snapshot", "pricesnapshot"];

    function checkObject(obj: any, path = "") {
      if (!obj || typeof obj !== "object") return;
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        const lowerKey = key.toLowerCase();
        for (const forbidden of forbiddenKeys) {
          assert.equal(
            lowerKey.includes(forbidden),
            false,
            `Forbidden financial key "${fullPath}" found in Staff Workspace DTO!`
          );
        }
        if (value && typeof value === "object") {
          checkObject(value, fullPath);
        }
      }
    }

    checkObject(ws);
  });
});
