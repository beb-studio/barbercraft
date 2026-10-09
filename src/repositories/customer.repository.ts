import { db } from "@/db";
import { customers, appointments } from "@/db/schema";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { CustomerDomainError } from "@/lib/customer-domain-errors";
import { customerPhoneComparisonKey } from "@/lib/phone";

export interface CustomerDirectoryFilters {
  businessId: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const CustomerRepository = {
  async getCustomerDirectory(filters: CustomerDirectoryFilters) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = eq(customers.businessId, filters.businessId);

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      whereClause = and(
        whereClause,
        or(
          ilike(customers.firstName, searchPattern),
          ilike(customers.lastName, searchPattern),
          ilike(customers.phone, searchPattern),
          ilike(customers.normalizedPhone, searchPattern)
        )
      ) as typeof whereClause;
    }

    // CTE or subqueries
    // Drizzle doesn't support complex correlated subqueries easily in select(), so we'll use raw SQL or specialized subqueries.
    // We can just use sql`` blocks for the aggregates.
    
    const countSq = sql<number>`(SELECT count(*)::int FROM ${appointments} WHERE ${appointments.customerId} = ${customers.id})`;
    
    const lastAppointmentSq = sql<Date | null>`(
      SELECT start_time FROM ${appointments} 
      WHERE customer_id = ${customers.id} 
        AND start_time <= CURRENT_TIMESTAMP 
      ORDER BY start_time DESC 
      LIMIT 1
    )`;

    const nextAppointmentSq = sql<Date | null>`(
      SELECT start_time FROM ${appointments} 
      WHERE customer_id = ${customers.id} 
        AND start_time > CURRENT_TIMESTAMP 
        AND status NOT IN ('CANCELLED', 'NO_SHOW') 
      ORDER BY start_time ASC 
      LIMIT 1
    )`;

    const data = await db
      .select({
        customer: customers,
        appointmentCount: countSq,
        lastAppointmentDate: lastAppointmentSq,
        nextAppointmentDate: nextAppointmentSq,
      })
      .from(customers)
      .where(whereClause)
      .orderBy(desc(lastAppointmentSq))
      .limit(limit)
      .offset(offset);

    const [totalRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(whereClause);

    return {
      data,
      total: totalRes?.count || 0,
      page,
      limit,
    };
  },
  
  async getCustomerDetail(businessId: string, customerId: string) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)));
      
    if (!customer) return null;
    
    const countSq = sql<number>`(SELECT count(*)::int FROM ${appointments} WHERE ${appointments.customerId} = ${customers.id})`;
    const firstAppointmentSq = sql<Date | null>`(SELECT start_time FROM ${appointments} WHERE customer_id = ${customers.id} ORDER BY start_time ASC LIMIT 1)`;
    const lastAppointmentSq = sql<Date | null>`(SELECT start_time FROM ${appointments} WHERE customer_id = ${customers.id} AND start_time <= CURRENT_TIMESTAMP ORDER BY start_time DESC LIMIT 1)`;
    const nextAppointmentSq = sql<Date | null>`(SELECT start_time FROM ${appointments} WHERE customer_id = ${customers.id} AND start_time > CURRENT_TIMESTAMP AND status NOT IN ('CANCELLED', 'NO_SHOW') ORDER BY start_time ASC LIMIT 1)`;
    const cancelledCountSq = sql<number>`(SELECT count(*)::int FROM ${appointments} WHERE customer_id = ${customers.id} AND status IN ('CANCELLED', 'NO_SHOW'))`;
    
    const [stats] = await db.select({
      appointmentCount: countSq,
      firstAppointmentDate: firstAppointmentSq,
      lastAppointmentDate: lastAppointmentSq,
      nextAppointmentDate: nextAppointmentSq,
      cancelledCount: cancelledCountSq,
    }).from(customers).where(eq(customers.id, customerId));
    
    return {
      customer,
      stats,
    };
  },
  
  async getCustomerAppointmentHistory(businessId: string, customerId: string) {
    const history = await db
      .select({
        appointment: appointments,
        staffFirstName: sql<string>`staff_profiles.first_name`,
        staffLastName: sql<string | null>`staff_profiles.last_name`,
      })
      .from(appointments)
      .leftJoin(sql`staff_profiles`, sql`appointments.staff_id = staff_profiles.id`)
      .where(and(eq(appointments.businessId, businessId), eq(appointments.customerId, customerId)))
      .orderBy(desc(appointments.startTime));
      
    return history.map(row => ({
      ...row.appointment,
      staff: {
        firstName: row.staffFirstName,
        lastName: row.staffLastName,
      }
    }));
  },

  async updateProfile(businessId: string, customerId: string, data: { firstName: string; lastName: string | null; phone: string; normalizedPhone: string }) {
    try {
      return await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          SELECT merged_into_customer_id
          FROM customers
          WHERE business_id = ${businessId} AND id = ${customerId}
          FOR UPDATE
        `);
        const lockedCustomer = result.rows[0] as
          | { merged_into_customer_id: string | null }
          | undefined;

        if (!lockedCustomer) return undefined;
        if (lockedCustomer.merged_into_customer_id !== null) {
          throw new CustomerDomainError("CUSTOMER_ALIAS_MUTATION_FORBIDDEN");
        }

        const [updated] = await tx
          .update(customers)
          .set({
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            normalizedPhone: data.normalizedPhone,
            phoneComparisonKey: customerPhoneComparisonKey(data.normalizedPhone),
            updatedAt: new Date(),
          })
          .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
          .returning();

        return updated;
      });
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      const pgErr = (err?.cause || err) as Record<string, unknown>;
      if (pgErr?.code === "23505" && pgErr?.constraint === "customers_business_phone_key") {
        throw new Error("CUSTOMER_PHONE_CONFLICT");
      }
      throw error;
    }
  },

  async getNotes(businessId: string, customerId: string) {
    const { customerNotes } = await import("@/db/schema/customer_notes");
    return db
      .select({
        id: customerNotes.id,
        content: customerNotes.content,
        createdAt: customerNotes.createdAt,
        updatedAt: customerNotes.updatedAt,
        authorName: sql<string>`business_members_users.name`,
      })
      .from(customerNotes)
      .leftJoin(sql`business_members`, sql`customer_notes.created_by_business_member_id = business_members.id`)
      .leftJoin(sql`users AS business_members_users`, sql`business_members.user_id = business_members_users.id`)
      .where(and(eq(customerNotes.businessId, businessId), eq(customerNotes.customerId, customerId)))
      .orderBy(desc(customerNotes.createdAt));
  },

  async addNote(businessId: string, customerId: string, content: string, memberId: string) {
    const { customerNotes } = await import("@/db/schema/customer_notes");
    const [note] = await db
      .insert(customerNotes)
      .values({
        businessId,
        customerId,
        content,
        createdByBusinessMemberId: memberId,
      })
      .returning();
    return note;
  },

  async updateNote(businessId: string, customerId: string, noteId: string, content: string) {
    const { customerNotes } = await import("@/db/schema/customer_notes");
    const [updated] = await db
      .update(customerNotes)
      .set({
        content,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customerNotes.businessId, businessId),
          eq(customerNotes.customerId, customerId),
          eq(customerNotes.id, noteId)
        )
      )
      .returning();
    return updated;
  },

  async deleteNote(businessId: string, customerId: string, noteId: string) {
    const { customerNotes } = await import("@/db/schema/customer_notes");
    await db
      .delete(customerNotes)
      .where(
        and(
          eq(customerNotes.businessId, businessId),
          eq(customerNotes.customerId, customerId),
          eq(customerNotes.id, noteId)
        )
      );
  },

  async searchCustomersForBooking(businessId: string, query?: string, limit: number = 10) {
    let whereClause = eq(customers.businessId, businessId);

    if (query && query.trim()) {
      const searchPattern = `%${query.trim()}%`;
      whereClause = and(
        whereClause,
        or(
          ilike(customers.firstName, searchPattern),
          ilike(customers.lastName, searchPattern),
          ilike(customers.phone, searchPattern),
          ilike(customers.normalizedPhone, searchPattern)
        )
      ) as typeof whereClause;
    }

    const countSq = sql<number>`(SELECT count(*)::int FROM ${appointments} WHERE ${appointments.customerId} = ${customers.id})`;
    const lastAppointmentSq = sql<Date | null>`(
      SELECT start_time FROM ${appointments} 
      WHERE customer_id = ${customers.id} 
        AND start_time <= CURRENT_TIMESTAMP 
      ORDER BY start_time DESC 
      LIMIT 1
    )`;

    return db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        appointmentCount: countSq,
        lastAppointmentDate: lastAppointmentSq,
      })
      .from(customers)
      .where(whereClause)
      .orderBy(desc(lastAppointmentSq), desc(customers.createdAt))
      .limit(limit);
  },

  async getDuplicateCandidates(businessId: string) {
    const countSq = sql<number>`(SELECT count(*)::int FROM ${appointments} WHERE ${appointments.customerId} = ${customers.id})`;
    const lastAppointmentSq = sql<Date | null>`(
      SELECT start_time FROM ${appointments} 
      WHERE customer_id = ${customers.id} 
        AND start_time <= CURRENT_TIMESTAMP 
      ORDER BY start_time DESC 
      LIMIT 1
    )`;

    const customerRows = await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        normalizedPhone: customers.normalizedPhone,
        phoneComparisonKey: customers.phoneComparisonKey,
        createdAt: customers.createdAt,
        appointmentCount: countSq,
        lastAppointmentDate: lastAppointmentSq,
      })
      .from(customers)
      .where(eq(customers.businessId, businessId))
      .orderBy(desc(customers.createdAt));

    // Group in O(N) by the server-maintained persisted comparison key.
    const groups = new Map<string, typeof customerRows>();

    for (const c of customerRows) {
      const key = c.phoneComparisonKey;
      if (!key) continue;
      const existing = groups.get(key) || [];
      existing.push(c);
      groups.set(key, existing);
    }

    const candidateClusters: {
      comparisonKey: string;
      confidence: "HIGH" | "POSSIBLE";
      reason: string;
      customers: typeof customerRows;
    }[] = [];

    for (const [key, cluster] of groups.entries()) {
      if (cluster.length >= 2) {
        const firstCust = cluster[0];
        const allNamesMatch = cluster.every(
          (c) =>
            c.firstName.trim().toLowerCase() === firstCust.firstName.trim().toLowerCase() &&
            (c.lastName || "").trim().toLowerCase() === (firstCust.lastName || "").trim().toLowerCase()
        );

        let reason = "Telefon numaraları farklı biçimlendirilmiş olsa da aynı numarayı temsil ediyor.";
        if (allNamesMatch) {
          reason = "Telefon numaraları ve müşteri isimleri birbiriyle eşleşiyor.";
        }

        candidateClusters.push({
          comparisonKey: key,
          confidence: "HIGH",
          reason,
          customers: cluster,
        });
      }
    }

    return candidateClusters;
  }
};
