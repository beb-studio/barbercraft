import { db, DbTransaction } from "../db";
import { appointments, NewAppointment } from "../db/schema/appointments";
import { customers } from "../db/schema/customers";
import { sql, and, inArray, eq, not, gte, lt } from "drizzle-orm";
import { customerPhoneComparisonKey, normalizePhone } from "@/lib/phone";

export const AppointmentRepository = {
  /**
   * Run a callback inside a Drizzle/PostgreSQL transaction.
   */
  async transaction<T>(callback: (tx: DbTransaction) => Promise<T>): Promise<T> {
    return db.transaction(callback);
  },

  /**
   * Acquires a row-level lock on the staff profile for the duration of the transaction.
   * This serializes concurrent appointment creations and time-block creations for the same staff member.
   */
  async lockStaffProfileForUpdate(tx: DbTransaction, businessId: string, staffId: string): Promise<void> {
    const result = await tx.execute(
      sql`
        SELECT id FROM staff_profiles 
        WHERE id = ${staffId} AND business_id = ${businessId}
        FOR UPDATE
      `
    );

    if (result.rows.length === 0) {
      throw new Error("Staff profile not found or does not belong to the business");
    }
  },

  /**
   * Acquires row-level locks on multiple staff profiles deterministically to prevent deadlocks.
   * It sorts the IDs lexically and locks them one by one.
   */
  async lockStaffProfilesForUpdate(tx: DbTransaction, businessId: string, staffIds: string[]): Promise<void> {
    const uniqueStaffIds = Array.from(new Set(staffIds));
    if (uniqueStaffIds.length === 0) return;

    uniqueStaffIds.sort();

    for (const id of uniqueStaffIds) {
      const result = await tx.execute(
        sql`
          SELECT id FROM staff_profiles 
          WHERE id = ${id} AND business_id = ${businessId}
          FOR UPDATE
        `
      );
      if (result.rows.length === 0) {
        throw new Error(`Staff profile ${id} not found or does not belong to the business`);
      }
    }
  },

  /**
   * Calculates the number of non-cancelled appointments for the given staff IDs on a specific UTC day range.
   */
  async getDailyWorkloads(
    tx: DbTransaction,
    businessId: string,
    staffIds: string[],
    localDayStartUtc: Date,
    nextLocalDayStartUtc: Date
  ): Promise<Record<string, number>> {
    if (staffIds.length === 0) return {};
    
    const result = await tx
      .select({
        staffId: appointments.staffId,
        count: sql<number>`count(*)::int`
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, businessId),
          inArray(appointments.staffId, staffIds),
          not(eq(appointments.status, 'CANCELLED')),
          gte(appointments.startTime, localDayStartUtc),
          lt(appointments.startTime, nextLocalDayStartUtc)
        )
      )
      .groupBy(appointments.staffId);
      
    const workloadMap: Record<string, number> = {};
    for (const id of staffIds) {
      workloadMap[id] = 0;
    }
    
    for (const row of result) {
      workloadMap[row.staffId] = row.count;
    }
    
    return workloadMap;
  },

  /**
   * Upserts a customer based on (business_id, normalized_phone) constraint.
   */
  async upsertCustomer(
    tx: DbTransaction,
    businessId: string,
    customerData: { firstName: string; lastName?: string; phone: string; notes?: string }
  ) {
    const normalizedPhone = normalizePhone(customerData.phone);
    const phoneComparisonKey = customerPhoneComparisonKey(normalizedPhone);

    const [customer] = await tx
      .insert(customers)
      .values({
        businessId,
        firstName: customerData.firstName,
        lastName: customerData.lastName || null,
        phone: customerData.phone,
        normalizedPhone,
        phoneComparisonKey,
        notes: customerData.notes || null,
      })
      .onConflictDoUpdate({
        target: [customers.businessId, customers.normalizedPhone],
        set: {
          firstName: customerData.firstName,
          lastName: customerData.lastName || sql`customers.last_name`,
          phone: customerData.phone,
          phoneComparisonKey,
          updatedAt: new Date(),
        },
      })
      .returning();

    return customer;
  },

  /**
   * Creates the final appointment record.
   */
  async createAppointmentRecord(tx: DbTransaction, data: NewAppointment) {
    const [appointment] = await tx
      .insert(appointments)
      .values(data)
      .returning();

    return appointment;
  }
};
