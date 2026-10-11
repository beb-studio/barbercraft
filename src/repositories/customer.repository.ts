import { db } from "@/db";
import { customers, appointments, businessMembers, users } from "@/db/schema";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { CustomerDomainError } from "@/lib/customer-domain-errors";
import { customerPhoneComparisonKey } from "@/lib/phone";
import {
  getCustomerFamily,
  resolveCanonicalCustomer,
} from "@/services/customer-resolution.service";

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

    let whereClause = and(
      eq(customers.businessId, filters.businessId),
      isNull(customers.mergedIntoCustomerId)
    )!;

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      whereClause = and(whereClause, sql<boolean>`EXISTS (
        SELECT 1
        FROM customers identity
        WHERE identity.business_id = ${customers.businessId}
          AND (identity.id = ${customers.id} OR identity.merged_into_customer_id = ${customers.id})
          AND (
            identity.first_name ILIKE ${searchPattern}
            OR identity.last_name ILIKE ${searchPattern}
            OR concat_ws(' ', identity.first_name, identity.last_name) ILIKE ${searchPattern}
            OR identity.phone ILIKE ${searchPattern}
            OR identity.normalized_phone ILIKE ${searchPattern}
          )
      )`)!;
    }

    // CTE or subqueries
    // Drizzle doesn't support complex correlated subqueries easily in select(), so we'll use raw SQL or specialized subqueries.
    // We can just use sql`` blocks for the aggregates.
    
    const familyCustomerIds = sql`(
      SELECT family.id
      FROM customers family
      WHERE family.business_id = ${customers.businessId}
        AND (family.id = ${customers.id} OR family.merged_into_customer_id = ${customers.id})
    )`;
    const countSq = sql<number>`(
      SELECT count(*)::int FROM ${appointments}
      WHERE ${appointments.businessId} = ${customers.businessId}
        AND ${appointments.customerId} IN ${familyCustomerIds}
    )`;
    
    const lastAppointmentSq = sql<Date | null>`(
      SELECT start_time FROM ${appointments} 
      WHERE business_id = ${customers.businessId}
        AND customer_id IN ${familyCustomerIds}
        AND start_time <= CURRENT_TIMESTAMP 
      ORDER BY start_time DESC 
      LIMIT 1
    )`;

    const nextAppointmentSq = sql<Date | null>`(
      SELECT start_time FROM ${appointments} 
      WHERE business_id = ${customers.businessId}
        AND customer_id IN ${familyCustomerIds}
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
    const family = await getCustomerFamily(db, businessId, customerId);
    if (!family) return null;

    const [stats] = await db
      .select({
        appointmentCount: sql<number>`count(*)::int`,
        firstAppointmentDate: sql<Date | null>`min(${appointments.startTime})`,
        lastAppointmentDate: sql<Date | null>`max(${appointments.startTime}) FILTER (WHERE ${appointments.startTime} <= CURRENT_TIMESTAMP)`,
        nextAppointmentDate: sql<Date | null>`min(${appointments.startTime}) FILTER (WHERE ${appointments.startTime} > CURRENT_TIMESTAMP AND ${appointments.status} NOT IN ('CANCELLED', 'NO_SHOW'))`,
        cancelledCount: sql<number>`count(*) FILTER (WHERE ${appointments.status} IN ('CANCELLED', 'NO_SHOW'))::int`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, businessId),
          inArray(appointments.customerId, family.customerIds)
        )
      );
    
    return {
      customer: family.canonical,
      stats,
      requestedCustomerId: customerId,
      familyCustomerIds: family.customerIds,
    };
  },
  
  async getCustomerAppointmentHistory(businessId: string, customerId: string) {
    const family = await getCustomerFamily(db, businessId, customerId);
    if (!family) return [];
    const history = await db
      .select({
        appointment: appointments,
        staffFirstName: sql<string>`staff_profiles.first_name`,
        staffLastName: sql<string | null>`staff_profiles.last_name`,
      })
      .from(appointments)
      .leftJoin(sql`staff_profiles`, sql`appointments.staff_id = staff_profiles.id`)
      .where(
        and(
          eq(appointments.businessId, businessId),
          inArray(appointments.customerId, family.customerIds)
        )
      )
      .orderBy(desc(appointments.startTime));
      
    return history.map(row => ({
      ...row.appointment,
      staff: {
        firstName: row.staffFirstName,
        lastName: row.staffLastName,
      }
    }));
  },

  async getCustomerLineage(businessId: string, canonicalCustomerId: string) {
    return db
      .select({
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        mergedAt: customers.mergedAt,
        mergedByName: users.name,
      })
      .from(customers)
      .leftJoin(
        businessMembers,
        and(
          eq(businessMembers.businessId, customers.businessId),
          eq(businessMembers.id, customers.mergedByBusinessMemberId)
        )
      )
      .leftJoin(users, eq(users.id, businessMembers.userId))
      .where(
        and(
          eq(customers.businessId, businessId),
          eq(customers.mergedIntoCustomerId, canonicalCustomerId)
        )
      )
      .orderBy(desc(customers.mergedAt), desc(customers.createdAt));
  },

  async updateProfile(businessId: string, customerId: string, data: { firstName: string; lastName: string | null; phone: string; normalizedPhone: string }) {
    try {
      return await db.transaction(async (tx) => {
        const comparisonKey = customerPhoneComparisonKey(data.normalizedPhone);
        if (!comparisonKey) throw new CustomerDomainError("CUSTOMER_PHONE_INVALID");

        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${businessId}:${comparisonKey}`}, 0)
          )
        `);

        const candidates = await tx.execute(sql`
          SELECT id
          FROM customers
          WHERE business_id = ${businessId}
            AND (id = ${customerId} OR phone_comparison_key = ${comparisonKey})
          ORDER BY id
        `);
        const ids = candidates.rows.map((row) => String(row.id)).sort();
        for (const id of ids) {
          await tx.execute(sql`
            SELECT id FROM customers
            WHERE business_id = ${businessId} AND id = ${id}
            FOR UPDATE
          `);
        }

        const [lockedCustomer] = await tx
          .select({
            id: customers.id,
            normalizedPhone: customers.normalizedPhone,
            mergedIntoCustomerId: customers.mergedIntoCustomerId,
          })
          .from(customers)
          .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
          .limit(1);

        if (!lockedCustomer) return undefined;
        if (lockedCustomer.mergedIntoCustomerId !== null) {
          throw new CustomerDomainError("CUSTOMER_ALIAS_MUTATION_FORBIDDEN");
        }

        if (lockedCustomer.normalizedPhone !== data.normalizedPhone) {
          const overlaps = await tx
            .select({
              id: customers.id,
              normalizedPhone: customers.normalizedPhone,
              rootId: sql<string>`COALESCE(${customers.mergedIntoCustomerId}, ${customers.id})`,
            })
            .from(customers)
            .where(
              and(
                eq(customers.businessId, businessId),
                eq(customers.phoneComparisonKey, comparisonKey)
              )
            );
          const foreignFamily = overlaps.find((row) => row.rootId !== customerId);
          if (foreignFamily) {
            if (foreignFamily.normalizedPhone === data.normalizedPhone) {
              throw new Error("CUSTOMER_PHONE_CONFLICT");
            }
            throw new CustomerDomainError("CUSTOMER_PHONE_AMBIGUOUS");
          }
        }

        const [updated] = await tx
          .update(customers)
          .set({
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            normalizedPhone: data.normalizedPhone,
            phoneComparisonKey: comparisonKey,
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
    const family = await getCustomerFamily(db, businessId, customerId);
    if (!family) return [];
    return db
      .select({
        id: customerNotes.id,
        customerId: customerNotes.customerId,
        content: customerNotes.content,
        createdAt: customerNotes.createdAt,
        updatedAt: customerNotes.updatedAt,
        authorName: sql<string>`business_members_users.name`,
      })
      .from(customerNotes)
      .leftJoin(sql`business_members`, sql`customer_notes.created_by_business_member_id = business_members.id`)
      .leftJoin(sql`users AS business_members_users`, sql`business_members.user_id = business_members_users.id`)
      .where(
        and(
          eq(customerNotes.businessId, businessId),
          inArray(customerNotes.customerId, family.customerIds)
        )
      )
      .orderBy(desc(customerNotes.createdAt));
  },

  async addNote(businessId: string, customerId: string, content: string, memberId: string) {
    const { customerNotes } = await import("@/db/schema/customer_notes");
    return db.transaction(async (tx) => {
      const canonical = await resolveCanonicalCustomer(tx, businessId, customerId, {
        lock: true,
      });
      if (!canonical) return undefined;
      const [note] = await tx
        .insert(customerNotes)
        .values({
          businessId,
          customerId: canonical.id,
          content,
          createdByBusinessMemberId: memberId,
        })
        .returning();
      return note;
    });
  },

  async updateNote(businessId: string, customerId: string, noteId: string, content: string) {
    const { customerNotes } = await import("@/db/schema/customer_notes");
    const family = await getCustomerFamily(db, businessId, customerId);
    if (!family) return undefined;
    const [updated] = await db
      .update(customerNotes)
      .set({
        content,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customerNotes.businessId, businessId),
          inArray(customerNotes.customerId, family.customerIds),
          eq(customerNotes.id, noteId)
        )
      )
      .returning();
    return updated;
  },

  async deleteNote(businessId: string, customerId: string, noteId: string) {
    const { customerNotes } = await import("@/db/schema/customer_notes");
    const family = await getCustomerFamily(db, businessId, customerId);
    if (!family) return false;
    const deleted = await db
      .delete(customerNotes)
      .where(
        and(
          eq(customerNotes.businessId, businessId),
          inArray(customerNotes.customerId, family.customerIds),
          eq(customerNotes.id, noteId)
        )
      )
      .returning({ id: customerNotes.id });
    return deleted.length > 0;
  },

  async searchCustomersForBooking(businessId: string, query?: string, limit: number = 10) {
    let whereClause = and(
      eq(customers.businessId, businessId),
      isNull(customers.mergedIntoCustomerId)
    )!;

    if (query && query.trim()) {
      const searchPattern = `%${query.trim()}%`;
      whereClause = and(whereClause, sql<boolean>`EXISTS (
        SELECT 1 FROM customers identity
        WHERE identity.business_id = ${customers.businessId}
          AND (identity.id = ${customers.id} OR identity.merged_into_customer_id = ${customers.id})
          AND (
            identity.first_name ILIKE ${searchPattern}
            OR identity.last_name ILIKE ${searchPattern}
            OR concat_ws(' ', identity.first_name, identity.last_name) ILIKE ${searchPattern}
            OR identity.phone ILIKE ${searchPattern}
            OR identity.normalized_phone ILIKE ${searchPattern}
          )
      )`)!;
    }

    const countSq = sql<number>`(
      SELECT count(*)::int FROM ${appointments}
      WHERE ${appointments.businessId} = ${customers.businessId}
        AND ${appointments.customerId} IN (
          SELECT family.id FROM customers family
          WHERE family.business_id = ${customers.businessId}
            AND (family.id = ${customers.id} OR family.merged_into_customer_id = ${customers.id})
        )
    )`;
    const lastAppointmentSq = sql<Date | null>`(
      SELECT start_time FROM ${appointments} 
      WHERE business_id = ${customers.businessId}
        AND customer_id IN (
          SELECT family.id FROM customers family
          WHERE family.business_id = ${customers.businessId}
            AND (family.id = ${customers.id} OR family.merged_into_customer_id = ${customers.id})
        )
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
    // Keep every correlation explicit. Reusing Drizzle's `customers` table
    // object inside nested raw subqueries can shadow the outer relation and
    // accidentally produce whole-candidate-group aggregates for every row.
    const result = await db.execute(sql`
      SELECT
        candidate.id,
        candidate.first_name,
        candidate.last_name,
        candidate.phone,
        candidate.normalized_phone,
        candidate.phone_comparison_key,
        candidate.created_at,
        (
          SELECT count(*)::int
          FROM appointments appointment_metrics
          JOIN customers family_metrics
            ON family_metrics.business_id = appointment_metrics.business_id
           AND family_metrics.id = appointment_metrics.customer_id
          WHERE appointment_metrics.business_id = candidate.business_id
            AND (
              family_metrics.id = candidate.id
              OR family_metrics.merged_into_customer_id = candidate.id
            )
        ) AS appointment_count,
        (
          SELECT appointment_metrics.start_time
          FROM appointments appointment_metrics
          JOIN customers family_metrics
            ON family_metrics.business_id = appointment_metrics.business_id
           AND family_metrics.id = appointment_metrics.customer_id
          WHERE appointment_metrics.business_id = candidate.business_id
            AND (
              family_metrics.id = candidate.id
              OR family_metrics.merged_into_customer_id = candidate.id
            )
            AND appointment_metrics.start_time <= CURRENT_TIMESTAMP
          ORDER BY appointment_metrics.start_time DESC
          LIMIT 1
        ) AS last_appointment_date
      FROM customers candidate
      WHERE candidate.business_id = ${businessId}
        AND candidate.merged_into_customer_id IS NULL
        AND candidate.phone_comparison_key <> ''
        AND EXISTS (
          SELECT 1
          FROM customers other
          WHERE other.business_id = candidate.business_id
            AND other.merged_into_customer_id IS NULL
            AND other.phone_comparison_key = candidate.phone_comparison_key
            AND other.id <> candidate.id
        )
      ORDER BY candidate.created_at DESC
    `);

    const customerRows = result.rows.map((row) => ({
      id: String(row.id),
      firstName: String(row.first_name),
      lastName: row.last_name === null ? null : String(row.last_name),
      phone: String(row.phone),
      normalizedPhone: String(row.normalized_phone),
      phoneComparisonKey: String(row.phone_comparison_key),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at
          : new Date(String(row.created_at)),
      appointmentCount: Number(row.appointment_count),
      lastAppointmentDate:
        row.last_appointment_date === null
          ? null
          : row.last_appointment_date instanceof Date
            ? row.last_appointment_date
            : new Date(String(row.last_appointment_date)),
    }));

    // Only independent canonical families with a real candidate are loaded;
    // already merged aliases never appear as review rows.
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
