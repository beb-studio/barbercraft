import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { applyMigrationFile, startDatabase } from "./db.mjs";

const uuid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ids = {
  userA: uuid(1),
  userB: uuid(2),
  businessA: uuid(10),
  businessB: uuid(11),
  memberA: uuid(20),
  memberB: uuid(21),
  canonicalA: uuid(30),
  aliasA: uuid(31),
  secondAliasA: uuid(32),
  customerB: uuid(33),
  duplicateKeyA: uuid(34),
};

let database;

async function query(sql, params = []) {
  try {
    const result = await database.pool.query(sql, params);
    return { result, error: null };
  } catch (error) {
    return { result: null, error };
  }
}

before(async () => {
  database = await startDatabase({ throughMigration: "0012_mature_misty_knight.sql" });
  const pool = database.pool;

  await pool.query(
    `INSERT INTO users (id, email, name, email_verified) VALUES
      ($1, 'merge-a@test.local', 'Merge A', true),
      ($2, 'merge-b@test.local', 'Merge B', true)`,
    [ids.userA, ids.userB]
  );
  await pool.query(
    `INSERT INTO businesses (id, name, slug, timezone, currency) VALUES
      ($1, 'Merge A', 'merge-a', 'Europe/Istanbul', 'TRY'),
      ($2, 'Merge B', 'merge-b', 'Europe/Istanbul', 'TRY')`,
    [ids.businessA, ids.businessB]
  );
  await pool.query(
    `INSERT INTO business_members (id, business_id, user_id, role) VALUES
      ($1, $2, $3, 'OWNER'),
      ($4, $5, $6, 'OWNER')`,
    [ids.memberA, ids.businessA, ids.userA, ids.memberB, ids.businessB, ids.userB]
  );
  await pool.query(
    `INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES
      ($1, $2, 'Canonical', '+90 555 111 22 33', '+905551112233'),
      ($3, $2, 'Alias', '0555 111 22 33', '05551112233'),
      ($4, $2, 'Second Alias', '555 111 22 33', '5551112233'),
      ($5, $6, 'Other Tenant', '+90 555 111 22 33', '+905551112233')`,
    [
      ids.canonicalA,
      ids.businessA,
      ids.aliasA,
      ids.secondAliasA,
      ids.customerB,
      ids.businessB,
    ]
  );

  const beforeCount = await pool.query(`SELECT count(*)::int AS count FROM customers`);
  assert.equal(beforeCount.rows[0].count, 4);

  const migration = database.allMigrationFiles.find(
    (file) => path.basename(file) === "0013_customer_logical_merge_foundation.sql"
  );
  assert.ok(migration);
  await applyMigrationFile(pool, migration);
});

after(async () => {
  await database?.stop();
});

describe("TASK 013C.2A customer logical-merge schema", () => {
  it("backfills comparison keys without automatically merging customers", async () => {
    const rows = await database.pool.query(
      `SELECT phone_comparison_key, merged_into_customer_id FROM customers ORDER BY id`
    );
    assert.equal(rows.rowCount, 4);
    assert.ok(rows.rows.every((row) => row.phone_comparison_key === "+905551112233"));
    assert.ok(rows.rows.every((row) => row.merged_into_customer_id === null));
  });

  it("rejects a cross-business merged-into reference", async () => {
    const { error } = await query(
      `UPDATE customers SET merged_into_customer_id = $1, merged_at = now(), merged_by_business_member_id = $2 WHERE id = $3`,
      [ids.customerB, ids.memberA, ids.aliasA]
    );
    assert.equal(error?.code, "23503");
  });

  it("rejects a cross-business merge author", async () => {
    const { error } = await query(
      `UPDATE customers SET merged_into_customer_id = $1, merged_at = now(), merged_by_business_member_id = $2 WHERE id = $3`,
      [ids.canonicalA, ids.memberB, ids.aliasA]
    );
    assert.equal(error?.code, "23503");
  });

  it("rejects self-merge", async () => {
    const { error } = await query(
      `UPDATE customers SET merged_into_customer_id = id, merged_at = now(), merged_by_business_member_id = $1 WHERE id = $2`,
      [ids.memberA, ids.aliasA]
    );
    assert.equal(error?.code, "23514");
  });

  it("accepts a valid same-business alias relation", async () => {
    const { error } = await query(
      `UPDATE customers SET merged_into_customer_id = $1, merged_at = now(), merged_by_business_member_id = $2 WHERE id = $3`,
      [ids.canonicalA, ids.memberA, ids.aliasA]
    );
    assert.equal(error, null);
  });

  it("rejects multi-hop lineage and cycles at commit", async () => {
    const multiHop = await query(
      `UPDATE customers SET merged_into_customer_id = $1, merged_at = now(), merged_by_business_member_id = $2 WHERE id = $3`,
      [ids.aliasA, ids.memberA, ids.secondAliasA]
    );
    assert.equal(multiHop.error?.code, "23514");

    const cycle = await query(
      `UPDATE customers SET merged_into_customer_id = $1, merged_at = now(), merged_by_business_member_id = $2 WHERE id = $3`,
      [ids.aliasA, ids.memberA, ids.canonicalA]
    );
    assert.equal(cycle.error?.code, "23514");
  });

  it("restricts deleting a canonical customer with aliases", async () => {
    const { error } = await query(`DELETE FROM customers WHERE id = $1`, [ids.canonicalA]);
    assert.ok(["23001", "23503"].includes(error?.code));
  });

  it("restricts deleting the recorded merge author", async () => {
    const { error } = await query(`DELETE FROM business_members WHERE id = $1`, [ids.memberA]);
    assert.ok(["23001", "23503"].includes(error?.code));
  });

  it("allows duplicate phone comparison keys", async () => {
    const { error } = await query(
      `INSERT INTO customers (id, business_id, first_name, phone, normalized_phone) VALUES ($1, $2, 'Duplicate Key', $3, $3)`,
      [ids.duplicateKeyA, ids.businessA, "905551112233"]
    );
    assert.equal(error, null);
    const count = await database.pool.query(
      `SELECT count(*)::int AS count FROM customers WHERE business_id = $1 AND phone_comparison_key = '+905551112233'`,
      [ids.businessA]
    );
    assert.ok(count.rows[0].count >= 4);
  });

  it("defaults mergedIntoCustomerId to NULL", async () => {
    const row = await database.pool.query(`SELECT merged_into_customer_id FROM customers WHERE id = $1`, [ids.duplicateKeyA]);
    assert.equal(row.rows[0].merged_into_customer_id, null);
  });

  it("defaults mergedAt to NULL", async () => {
    const row = await database.pool.query(`SELECT merged_at FROM customers WHERE id = $1`, [ids.duplicateKeyA]);
    assert.equal(row.rows[0].merged_at, null);
  });

  it("defaults mergedByBusinessMemberId to NULL", async () => {
    const row = await database.pool.query(`SELECT merged_by_business_member_id FROM customers WHERE id = $1`, [ids.duplicateKeyA]);
    assert.equal(row.rows[0].merged_by_business_member_id, null);
  });
});
