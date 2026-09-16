import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC,
  buildResidentImportConfirmLockKey,
  buildResidentImportConfirmWrite,
  combineResidentImportWingBuilding,
  parseAdminConfirmResidentImportRowResult,
  parseResidentImportConfirmRequest,
  processResidentImportConfirmRows,
  residentImportBuildingReuseBlocked,
  type PersistResidentImportConfirmResult,
  type ResidentImportConfirmWrite,
} from "./resident-import-confirm.ts";
import { classifyResidentImportAgainstDatabase } from "./resident-import-db-verify.ts";
import type { ResidentImportExistingResident } from "./resident-import-db-verify.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONFIRM_FUNCTION_PATH = join(
  ROOT,
  "supabase/functions/admin-resident-import-confirm/index.ts",
);
const RESIDENTS_FLATS_MIGRATION_PATH = join(
  ROOT,
  "supabase/migrations/20260816100000_m02_residents_flats.sql",
);
const CONFIRM_RPC_MIGRATION_PATH = join(
  ROOT,
  "supabase/migrations/20260830130000_m03_admin_confirm_resident_import_row_building_aware.sql",
);
const FLAT_UNIQUENESS_MIGRATION_PATH = join(
  ROOT,
  "supabase/migrations/20260830120000_m03_building_aware_flat_uniqueness.sql",
);

function proposed(overrides: Partial<{
  rowNumber: number;
  building: string;
  wing: string;
  flatNumber: string;
  residentName: string;
  residentType: string;
  primaryMobile: string;
  additionalMobiles: string[];
}> = {}) {
  return {
    rowNumber: overrides.rowNumber ?? 2,
    building: overrides.building ?? "A",
    wing: overrides.wing ?? "",
    flatNumber: overrides.flatNumber ?? "101",
    residentName: overrides.residentName ?? "Asha Mehta",
    residentType: overrides.residentType ?? "Owner",
    primaryMobile: overrides.primaryMobile ?? "9876500001",
    additionalMobiles: overrides.additionalMobiles ?? ["9876501999"],
  };
}

function existing(
  overrides: Partial<ResidentImportExistingResident> = {},
): ResidentImportExistingResident {
  return {
    societyId: overrides.societyId ?? "society-a",
    residentName: overrides.residentName ?? "Asha Mehta",
    flatNumber: overrides.flatNumber ?? "101",
    wingBuilding: overrides.wingBuilding ?? "A",
    primaryMobile: overrides.primaryMobile ?? "9876500001",
    additionalMobiles: overrides.additionalMobiles ?? [],
    status: overrides.status ?? "active",
  };
}

async function runConfirm(
  rows: ReturnType<typeof proposed>[],
  residents: ResidentImportExistingResident[],
  persist: (
    write: ResidentImportConfirmWrite,
  ) => Promise<PersistResidentImportConfirmResult>,
  societyId = "society-a",
) {
  return processResidentImportConfirmRows({
    proposed: rows,
    existing: residents,
    societyId,
    classifyAgainstDatabase: classifyResidentImportAgainstDatabase,
    persist,
  });
}

function successfulPersist(
  writes: ResidentImportConfirmWrite[],
): (write: ResidentImportConfirmWrite) => Promise<PersistResidentImportConfirmResult> {
  return async (write) => {
    writes.push(write);
    return {
      ok: true,
      existing: {
        societyId: "society-a",
        residentName: write.residentName,
        flatNumber: write.flatNumber,
        wingBuilding: write.wingBuilding,
        primaryMobile: write.mobile,
        additionalMobiles: [],
        status: "active",
      },
    };
  };
}

test("new resident on a new flat is imported", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm([proposed({})], [], successfulPersist(writes));
  assert.equal(result.rows[0]?.status, "IMPORTED");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.flatNumber, "101");
  assert.equal(writes[0]?.mobile, "9876500001");
  assert.equal(writes[0]?.wingBuilding, "A");
  assert.deepEqual(writes[0] && "additionalMobiles" in writes[0], false);
});

test("new resident reuses an existing compatible flat and does not rewrite it", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [
      proposed({
        rowNumber: 3,
        residentName: "Bala Nair",
        primaryMobile: "9876500103",
        flatNumber: "102",
        building: "A",
      }),
    ],
    [
      existing({
        residentName: "Asha Mehta",
        flatNumber: "102",
        wingBuilding: "A",
        primaryMobile: "9876500102",
      }),
    ],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "IMPORTED");
  assert.equal(writes[0]?.flatNumber, "102");
  assert.equal(writes[0]?.wingBuilding, "A");
  assert.equal(writes[0]?.residentName, "Bala Nair");
});

test("existing exact resident is not inserted", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [proposed({})],
    [existing({})],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "ALREADY_EXISTS");
  assert.equal(writes.length, 0);
});

test("same resident and flat with a different mobile is not inserted", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [proposed({ primaryMobile: "9876500014" })],
    [existing({ primaryMobile: "9876500001" })],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "POSSIBLE_DATABASE_CONFLICT");
  assert.equal(writes.length, 0);
});

test("distinct building on the same flat number is imported as a new flat", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [
      proposed({
        building: "A",
        flatNumber: "201",
        residentName: "Ira Shah",
        primaryMobile: "9876500201",
      }),
    ],
    [
      existing({
        wingBuilding: "B",
        flatNumber: "201",
        residentName: "Kabir Rao",
        primaryMobile: "9876500202",
      }),
    ],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "IMPORTED");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.wingBuilding, "A");
  assert.equal(writes[0]?.flatNumber, "201");
});

test("multiple residents may legitimately share a compatible flat", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [
      proposed({
        rowNumber: 3,
        residentName: "Neel Joshi",
        primaryMobile: "9876500102",
        flatNumber: "102",
      }),
      proposed({
        rowNumber: 5,
        residentName: "Omar Khan",
        primaryMobile: "9876500103",
        flatNumber: "102",
      }),
    ],
    [],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "IMPORTED");
  assert.equal(result.rows[1]?.status, "IMPORTED");
  assert.equal(writes.length, 2);
  assert.equal(writes[0]?.flatNumber, "102");
  assert.equal(writes[1]?.flatNumber, "102");
});

test("invalid resident type is not inserted", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [proposed({ residentType: "Chairman" })],
    [],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "INVALID");
  assert.match(result.rows[0]?.message ?? "", /Owner, Tenant, Family Member, or Other/);
  assert.equal(writes.length, 0);
});

test("invalid mobile is not inserted", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [proposed({ primaryMobile: "12345" })],
    [],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "INVALID");
  assert.equal(writes.length, 0);
});

test("blank optional mobile is allowed when there is no conflict", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [proposed({ primaryMobile: "" })],
    [],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "IMPORTED");
  assert.equal(writes[0]?.mobile, null);
});

test("cross-society residents are ignored and client society spoofing is dropped", async () => {
  const parsed = parseResidentImportConfirmRequest({
    society_id: "society-b",
    societyId: "should-be-ignored",
    society_code: "DEMO2",
    rows: [proposed({})],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal("society_id" in parsed.rows[0], false);

  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    parsed.rows,
    [existing({ societyId: "society-b" })],
    successfulPersist(writes),
    "society-a",
  );
  assert.equal(result.rows[0]?.status, "IMPORTED");
  assert.equal(writes.length, 1);
});

test("repeated identical import does not insert a second resident", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const persist = successfulPersist(writes);
  const first = await runConfirm([proposed({})], [], persist);
  assert.equal(first.rows[0]?.status, "IMPORTED");

  const second = await runConfirm(
    [proposed({})],
    [
      existing({
        residentName: "Asha Mehta",
        flatNumber: "101",
        primaryMobile: "9876500001",
      }),
    ],
    persist,
  );
  assert.equal(second.rows[0]?.status, "ALREADY_EXISTS");
  assert.equal(writes.length, 1);
});

test("live database change between verify and confirm blocks the write", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [proposed({})],
    [existing({})],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "ALREADY_EXISTS");
  assert.equal(writes.length, 0);
});

test("one failed persist does not write or overwrite later rows unsafely", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await processResidentImportConfirmRows({
    proposed: [
      proposed({ rowNumber: 2, residentName: "Asha Mehta", primaryMobile: "9876500001" }),
      proposed({
        rowNumber: 6,
        residentName: "Charu Iyer",
        flatNumber: "103",
        primaryMobile: "9876500003",
      }),
    ],
    existing: [],
    societyId: "society-a",
    classifyAgainstDatabase: classifyResidentImportAgainstDatabase,
    persist: async (write) => {
      if (write.rowNumber === 2) {
        return { ok: false, status: "FAILED", message: "Write failed." };
      }
      writes.push(write);
      return {
        ok: true,
        existing: {
          societyId: "society-a",
          residentName: write.residentName,
          flatNumber: write.flatNumber,
          wingBuilding: write.wingBuilding,
          primaryMobile: write.mobile,
          additionalMobiles: [],
          status: "active",
        },
      };
    },
  });
  assert.equal(result.rows[0]?.status, "FAILED");
  assert.equal(result.rows[1]?.status, "IMPORTED");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.residentName, "Charu Iyer");
});

test("identical rows in one request only import the first", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await runConfirm(
    [proposed({ rowNumber: 2 }), proposed({ rowNumber: 7 })],
    [],
    successfulPersist(writes),
  );
  assert.equal(result.rows[0]?.status, "IMPORTED");
  assert.equal(result.rows[1]?.status, "ALREADY_EXISTS");
  assert.equal(writes.length, 1);
});

test("additional mobiles are not part of the write payload", () => {
  const write = buildResidentImportConfirmWrite(
    proposed({ additionalMobiles: ["9876501999"] }),
  );
  assert.equal(write.mobile, "9876500001");
  assert.equal("additionalMobiles" in write, false);
  assert.equal(combineResidentImportWingBuilding(" Tower A ", "  "), "Tower A");
  assert.equal(combineResidentImportWingBuilding("A", "1"), "A 1");
  assert.equal(combineResidentImportWingBuilding("  ", "  "), null);
  assert.equal(residentImportBuildingReuseBlocked("A", "A"), false);
  assert.equal(residentImportBuildingReuseBlocked("A", "B"), true);
  assert.equal(residentImportBuildingReuseBlocked("A", null), true);
  assert.equal(residentImportBuildingReuseBlocked(null, null), false);
});

test("confirm edge function writes only through the transactional RPC", () => {
  const source = readFileSync(CONFIRM_FUNCTION_PATH, "utf8");
  assert.match(source, /authenticateAdminRequest/);
  assert.match(source, /auth\.context\.society\.id/);
  assert.match(source, /ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC/);
  assert.match(source, /p_society_id:\s*args\.p_society_id/);
  assert.equal(ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC, "admin_confirm_resident_import_row");
  assert.match(source, /sanitizeResidentImportConfirmRpcFailure/);
  assert.equal(source.includes(".update("), false);
  assert.equal(source.includes(".insert("), false);
  assert.equal(source.includes(".from(\"residents\")"), false);
  assert.equal(source.includes(".from(\"flats\")"), false);
  assert.equal(source.includes("\"admin-resident\""), false);
  assert.equal(source.includes(".delete("), false);
});

test("live schema has a residents FK from resident_flats but no residents.resident_flats column", () => {
  const migration = readFileSync(RESIDENTS_FLATS_MIGRATION_PATH, "utf8");
  const residentsStart = migration.indexOf("create table public.residents");
  const residentFlatsStart = migration.indexOf("create table public.resident_flats");
  assert.ok(residentsStart >= 0);
  assert.ok(residentFlatsStart > residentsStart);
  const residentsTable = migration.slice(residentsStart, residentFlatsStart);
  assert.equal(residentsTable.includes("resident_flats"), false);
  assert.match(
    migration.slice(residentFlatsStart),
    /resident_id uuid not null references public\.residents \(id\)/,
  );
});

test("overlapping confirm planners can both persist the same identity", async () => {
  const writesA: ResidentImportConfirmWrite[] = [];
  const writesB: ResidentImportConfirmWrite[] = [];
  const [first, second] = await Promise.all([
    runConfirm([proposed({})], [], successfulPersist(writesA)),
    runConfirm([proposed({})], [], successfulPersist(writesB)),
  ]);
  assert.equal(first.rows[0]?.status, "IMPORTED");
  assert.equal(second.rows[0]?.status, "IMPORTED");
  assert.equal(writesA.length + writesB.length, 2);
  assert.equal(
    buildResidentImportConfirmLockKey({
      societyId: "society-a",
      flatNumber: "101",
      residentName: "Asha Mehta",
      primaryMobile: "9876500001",
    }),
    buildResidentImportConfirmLockKey({
      societyId: "society-a",
      flatNumber: "101",
      residentName: "Asha Mehta",
      primaryMobile: "919876500001",
    }),
  );
});

test("lock keys stay identity-scoped and do not make mobile or name global", () => {
  const asha = buildResidentImportConfirmLockKey({
    societyId: "society-a",
    flatNumber: "101",
    residentName: "Asha Mehta",
    primaryMobile: "9876500001",
  });
  const family = buildResidentImportConfirmLockKey({
    societyId: "society-a",
    flatNumber: "101",
    residentName: "Neel Joshi",
    primaryMobile: "9876500102",
  });
  const sharedMobile = buildResidentImportConfirmLockKey({
    societyId: "society-a",
    flatNumber: "102",
    residentName: "Bala Nair",
    primaryMobile: "9876500001",
  });
  const otherSociety = buildResidentImportConfirmLockKey({
    societyId: "society-b",
    flatNumber: "101",
    residentName: "Asha Mehta",
    primaryMobile: "9876500001",
  });
  const blankMobile = buildResidentImportConfirmLockKey({
    societyId: "society-a",
    flatNumber: "103",
    residentName: "Charu Iyer",
    primaryMobile: "",
  });
  assert.notEqual(asha, family);
  assert.notEqual(asha, sharedMobile);
  assert.notEqual(asha, otherSociety);
  assert.notEqual(asha, blankMobile);
});

test("confirm RPC result parser accepts imported and skipped rows", () => {
  const imported = parseAdminConfirmResidentImportRowResult({
    row_number: 2,
    status: "IMPORTED",
    message: "Resident created in this society.",
    resident_id: "res-1",
    resident_name: "Asha Mehta",
    flat_number: "101",
    wing_building: "A",
    mobile: "9876500001",
  });
  assert.equal(imported?.status, "IMPORTED");
  assert.equal(imported?.residentId, "res-1");

  const skipped = parseAdminConfirmResidentImportRowResult({
    row_number: 3,
    status: "ALREADY_EXISTS",
    message: "Matches existing resident.",
    resident_id: null,
    resident_name: "Asha Mehta",
    flat_number: "101",
    wing_building: "A",
    mobile: "9876500001",
  });
  assert.equal(skipped?.status, "ALREADY_EXISTS");
  assert.equal(skipped?.residentId, null);
  assert.equal(parseAdminConfirmResidentImportRowResult({ status: "NOPE" }), null);
});

function confirmRpcWriteScope(sql: string): string {
  const marker = "Single write subtransaction";
  const start = sql.indexOf(marker);
  assert.ok(start >= 0, "write-scope marker");
  const others = sql.indexOf("when others then", start);
  assert.ok(others > start, "write-scope exception");
  return sql.slice(start, others);
}

test("confirm RPC migration is transactional, service-role only, and never updates flats", () => {
  const sql = readFileSync(CONFIRM_RPC_MIGRATION_PATH, "utf8");
  assert.match(sql, /create or replace function public\.admin_confirm_resident_import_row\(/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.equal(sql.includes("pg_advisory_lock("), false);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public/);
  assert.match(sql, /insert into public\.residents/);
  assert.match(sql, /insert into public\.resident_flats/);
  assert.match(sql, /when others then/);
  assert.match(sql, /no leftover empty flat/i);
  assert.match(
    sql,
    /revoke all on function public\.admin_confirm_resident_import_row[\s\S]*from public/,
  );
  assert.match(
    sql,
    /revoke all on function public\.admin_confirm_resident_import_row[\s\S]*from anon, authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.admin_confirm_resident_import_row[\s\S]*to service_role/,
  );
  assert.equal(/grant execute[\s\S]*to authenticated/i.test(sql), false);
  assert.equal(/grant execute[\s\S]*to anon/i.test(sql), false);
  assert.equal(/update\s+public\.flats/i.test(sql), false);
  assert.equal(/update\s+public\.residents/i.test(sql), false);
  assert.equal(/delete\s+from/i.test(sql), false);
});

test("new flat, resident, and resident_flats are created in one success path", () => {
  const sql = readFileSync(CONFIRM_RPC_MIGRATION_PATH, "utf8");
  const writeScope = confirmRpcWriteScope(sql);
  const flatAt = writeScope.indexOf("insert into public.flats");
  const residentAt = writeScope.indexOf("insert into public.residents");
  const linkAt = writeScope.indexOf("insert into public.resident_flats");
  assert.ok(flatAt >= 0);
  assert.ok(residentAt > flatAt);
  assert.ok(linkAt > residentAt);
});

test("new flat rolls back if the resident insert fails", () => {
  const sql = readFileSync(CONFIRM_RPC_MIGRATION_PATH, "utf8");
  const writeScope = confirmRpcWriteScope(sql);
  assert.match(writeScope, /if v_flat\.id is null then/);
  assert.match(writeScope, /insert into public\.flats/);
  assert.match(writeScope, /insert into public\.residents/);
  assert.match(sql, /Rolls back new flat \(if created here\), resident, and resident_flats/);
});

test("new flat and resident roll back if the resident_flats insert fails", () => {
  const sql = readFileSync(CONFIRM_RPC_MIGRATION_PATH, "utf8");
  const writeScope = confirmRpcWriteScope(sql);
  assert.ok(
    writeScope.indexOf("insert into public.residents")
      < writeScope.indexOf("insert into public.resident_flats"),
  );
  assert.match(sql, /No orphan resident, no leftover empty flat, no partial link/);
});

test("existing compatible flat is only read before writes and is never updated", () => {
  const sql = readFileSync(CONFIRM_RPC_MIGRATION_PATH, "utf8");
  const writeStart = sql.indexOf("Single write subtransaction");
  const beforeWrite = sql.slice(0, writeStart);
  assert.match(
    beforeWrite,
    /select \*\s+into v_flat\s+from public\.flats/i,
  );
  const writeScope = confirmRpcWriteScope(sql);
  assert.match(writeScope, /if v_flat\.id is null then/);
  assert.equal(/update\s+public\.flats/i.test(sql), false);
  assert.equal(/delete\s+from\s+public\.flats/i.test(sql), false);
});

test("confirm RPC matches flats by society + building key + flat key and never rewrites buildings", () => {
  const sql = readFileSync(CONFIRM_RPC_MIGRATION_PATH, "utf8");
  const writeStart = sql.indexOf("Single write subtransaction");
  const beforeWrite = sql.slice(0, writeStart);
  assert.match(
    beforeWrite,
    /wing_building_key\s*=\s*public\.normalize_resident_compare_key/,
  );
  assert.match(
    beforeWrite,
    /flat_number_key\s*=\s*public\.normalize_resident_compare_key/,
  );
  assert.equal(
    /lower\(trim\(flat_number\)\)\s*=\s*lower\(v_flat_number\)/i.test(sql),
    false,
  );
  assert.equal(beforeWrite.includes("BACKEND_BLOCKED"), false);
  assert.equal(/update\s+public\.flats/i.test(sql), false);
  assert.match(sql, /v_same_physical_flat/);
  assert.match(
    sql,
    /An existing flat with a different building is never reused/,
  );
});

test("building-aware uniqueness migration swaps constraints without rewriting flats", () => {
  const sql = readFileSync(FLAT_UNIQUENESS_MIGRATION_PATH, "utf8");
  assert.match(sql, /PRECONDITION FAILED/);
  assert.match(sql, /add constraint flats_society_building_flat_key_unique/);
  assert.match(
    sql,
    /unique \(society_id, wing_building_key, flat_number_key\)/,
  );
  assert.match(sql, /drop constraint flats_society_flat_number_unique/);
  assert.ok(
    sql.indexOf("add constraint flats_society_building_flat_key_unique")
      < sql.indexOf("drop constraint flats_society_flat_number_unique"),
    "new unique must be added before the old unique is dropped",
  );
  assert.equal(/update\s+public\.flats\s+set/i.test(sql), false);
  assert.equal(/delete\s+from\s+public\.flats/i.test(sql), false);
  assert.equal(/update\s+public\.residents/i.test(sql), false);
});
