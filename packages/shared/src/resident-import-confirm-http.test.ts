import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC,
  buildAdminConfirmResidentImportRpcArgs,
  buildResidentImportConfirmSafeLog,
  buildResidentImportConfirmWrite,
  classifyResidentImportConfirmAuth,
  mapResidentImportConfirmApplicationResult,
  mapResidentImportConfirmRpcArgsFromApprovedRow,
  parseAdminConfirmResidentImportRowResult,
  parseResidentImportConfirmHttpRequest,
  processResidentImportConfirmRows,
  resolveResidentImportConfirmSocietyId,
  sanitizeResidentImportConfirmRpcFailure,
  sanitizeResidentImportConfirmServerError,
  toResidentImportConfirmHttpSuccess,
  type ResidentImportConfirmWrite,
} from "./resident-import-confirm.ts";
import { classifyResidentImportAgainstDatabase } from "./resident-import-db-verify.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONFIRM_FUNCTION_PATH = join(
  ROOT,
  "supabase/functions/admin-resident-import-confirm/index.ts",
);
const CONFIRM_HTTP_SHARED_PATH = join(
  ROOT,
  "supabase/functions/_shared/resident-import-confirm-http.ts",
);
const JWT_SOCIETY = "11111111-1111-1111-1111-111111111101";
const CLIENT_SOCIETY = "11111111-1111-1111-1111-111111111102";

function approvedRow(overrides: Record<string, unknown> = {}) {
  return {
    rowNumber: 2,
    flatNumber: "101",
    residentName: "Asha Mehta",
    residentType: "Owner",
    mobile: "9876500001",
    wingBuilding: "A",
    additionalMobiles: ["9876501999"],
    ...overrides,
  };
}

test("A. missing auth is rejected", () => {
  const missingHeader = classifyResidentImportConfirmAuth({
    bearerToken: null,
    tokenVerification: "missing",
  });
  assert.equal(missingHeader.ok, false);
  if (missingHeader.ok) {
    return;
  }
  assert.equal(missingHeader.code, "UNAUTHORIZED");
  assert.equal(missingHeader.status, 401);
});

test("B. invalid JWT is rejected", () => {
  const invalid = classifyResidentImportConfirmAuth({
    bearerToken: "not-a-jwt",
    tokenVerification: "invalid",
  });
  const expired = classifyResidentImportConfirmAuth({
    bearerToken: "expired.jwt.token",
    tokenVerification: "expired",
    appRole: "society_admin",
  });
  assert.equal(invalid.ok, false);
  assert.equal(expired.ok, false);
  if (!invalid.ok && !expired.ok) {
    assert.equal(invalid.code, "UNAUTHORIZED");
    assert.equal(expired.code, "UNAUTHORIZED");
  }
});

test("C. Guard role is forbidden", () => {
  const guard = classifyResidentImportConfirmAuth({
    bearerToken: "valid-token",
    tokenVerification: "ok",
    appRole: "guard",
  });
  assert.equal(guard.ok, false);
  if (guard.ok) {
    return;
  }
  assert.equal(guard.code, "FORBIDDEN");
  assert.equal(guard.status, 403);
});

test("D. Admin role is accepted", () => {
  const admin = classifyResidentImportConfirmAuth({
    bearerToken: "valid-token",
    tokenVerification: "ok",
    appRole: "society_admin",
  });
  assert.equal(admin.ok, true);
});

test("E. client-supplied society_id cannot override JWT society", () => {
  const parsed = parseResidentImportConfirmHttpRequest({
    society_id: CLIENT_SOCIETY,
    societyId: "should-be-ignored",
    society_code: "DEMO2",
    rows: [approvedRow()],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal("society_id" in parsed.rows[0], false);

  const args = mapResidentImportConfirmRpcArgsFromApprovedRow({
    jwtSocietyId: JWT_SOCIETY,
    clientSocietyId: CLIENT_SOCIETY,
    row: parsed.rows[0],
  });
  assert.equal(args.p_society_id, JWT_SOCIETY);
  assert.notEqual(args.p_society_id, CLIENT_SOCIETY);
  assert.equal(
    resolveResidentImportConfirmSocietyId(JWT_SOCIETY, {
      society_id: CLIENT_SOCIETY,
    }),
    JWT_SOCIETY,
  );
});

test("F. invalid primary mobile is rejected", () => {
  const short = parseResidentImportConfirmHttpRequest({
    rows: [approvedRow({ mobile: "12345" })],
  });
  const sliced = parseResidentImportConfirmHttpRequest({
    rows: [approvedRow({ mobile: "9876500001999" })],
  });
  assert.equal(short.ok, false);
  assert.equal(sliced.ok, false);
  if (!short.ok && !sliced.ok) {
    assert.equal(short.code, "VALIDATION_ERROR");
    assert.equal(sliced.code, "VALIDATION_ERROR");
    assert.match(sliced.message, /Primary Mobile/);
  }
});

test("G. invalid resident type is rejected", () => {
  const result = parseResidentImportConfirmHttpRequest({
    rows: [approvedRow({ residentType: "Chairman" })],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "VALIDATION_ERROR");
    assert.match(result.message, /Owner, Tenant, Family Member, or Other/);
  }
});

test("H. invalid additional mobile is rejected", () => {
  const result = parseResidentImportConfirmHttpRequest({
    rows: [approvedRow({ additionalMobiles: ["12345"] })],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "VALIDATION_ERROR");
    assert.match(result.message, /additional mobile/);
  }
});

test("I. valid request maps correctly to RPC parameters", () => {
  const parsed = parseResidentImportConfirmHttpRequest({
    society_id: CLIENT_SOCIETY,
    rows: [
      approvedRow({
        rowNumber: 4,
        mobile: "919876500001",
        additionalMobiles: ["9876501999"],
      }),
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const args = mapResidentImportConfirmRpcArgsFromApprovedRow({
    jwtSocietyId: JWT_SOCIETY,
    clientSocietyId: CLIENT_SOCIETY,
    row: parsed.rows[0],
  });
  assert.equal(args.p_society_id, JWT_SOCIETY);
  assert.equal(args.p_row_number, 4);
  assert.equal(args.p_flat_number, "101");
  assert.equal(args.p_resident_name, "Asha Mehta");
  assert.equal(args.p_resident_type, "Owner");
  assert.equal(args.p_mobile, "9876500001");
  assert.equal(args.p_wing_building, "A");
  assert.deepEqual(args.p_additional_mobiles, ["9876501999"]);
});

test("J. IMPORTED response mapping", () => {
  assert.equal(mapResidentImportConfirmApplicationResult("IMPORTED"), "IMPORTED");
  const mapped = toResidentImportConfirmHttpSuccess({
    version: 1,
    summary: {
      rowsSubmitted: 1,
      imported: 1,
      alreadyExists: 0,
      possibleConflicts: 0,
      backendBlocked: 0,
      invalid: 0,
      failed: 0,
    },
    rows: [
      {
        rowNumber: 2,
        status: "IMPORTED",
        message: "Resident created in this society.",
      },
    ],
  });
  assert.equal(mapped.rows[0]?.result, "IMPORTED");
});

test("K. ALREADY_EXISTS response mapping", () => {
  assert.equal(
    mapResidentImportConfirmApplicationResult("ALREADY_EXISTS"),
    "ALREADY_EXISTS",
  );
  assert.equal(
    mapResidentImportConfirmApplicationResult("POSSIBLE_DATABASE_CONFLICT"),
    "CONFLICT",
  );
  assert.equal(
    mapResidentImportConfirmApplicationResult("BACKEND_BLOCKED"),
    "BLOCKED",
  );
});

test("L. RPC/database error is sanitized", () => {
  const leaked = {
    message: 'duplicate key value violates unique constraint "residents_pkey"',
    details: "service_role key leaked",
    hint: "JWT_SECRET=super-secret",
  };
  const rpcFailure = sanitizeResidentImportConfirmRpcFailure();
  const serverError = sanitizeResidentImportConfirmServerError();
  assert.equal(rpcFailure.status, "FAILED");
  assert.equal(serverError.code, "SERVER_ERROR");
  assert.equal(serverError.status, 500);
  assert.equal(rpcFailure.message.includes(leaked.message), false);
  assert.equal(rpcFailure.message.includes("service_role"), false);
  assert.equal(serverError.message.includes("JWT_SECRET"), false);
  assert.equal(serverError.message.includes("stack"), false);
  assert.equal(
    mapResidentImportConfirmApplicationResult("FAILED"),
    "SERVER_ERROR",
  );
});

test("M. no direct resident/flat/link write path exists in the function", () => {
  const source = readFileSync(CONFIRM_FUNCTION_PATH, "utf8");
  const httpShared = readFileSync(CONFIRM_HTTP_SHARED_PATH, "utf8");
  assert.match(source, /authenticateAdminRequest/);
  assert.match(source, /auth\.context\.society\.id/);
  assert.match(source, /parseResidentImportConfirmHttpRequest/);
  assert.match(source, /ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC/);
  assert.match(source, /p_society_id:\s*args\.p_society_id/);
  assert.match(source, /sanitizeResidentImportConfirmRpcFailure/);
  assert.match(source, /buildResidentImportConfirmSafeLog/);
  assert.equal(ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC, "admin_confirm_resident_import_row");
  assert.equal(source.includes(".from(\"residents\")"), false);
  assert.equal(source.includes(".from(\"flats\")"), false);
  assert.equal(source.includes(".insert("), false);
  assert.equal(source.includes(".update("), false);
  assert.equal(source.includes(".delete("), false);
  assert.equal(source.includes("\"admin-resident\""), false);
  assert.equal(httpShared.includes(".from(\"residents\")"), false);
  assert.equal(httpShared.includes(".insert("), false);
});

test("malformed JSON shape, row number, and missing required fields are rejected", () => {
  assert.equal(parseResidentImportConfirmHttpRequest(null).ok, false);
  assert.equal(parseResidentImportConfirmHttpRequest("rows").ok, false);
  assert.equal(
    parseResidentImportConfirmHttpRequest({
      rows: [approvedRow({ rowNumber: 1 })],
    }).ok,
    false,
  );
  assert.equal(
    parseResidentImportConfirmHttpRequest({
      rows: [approvedRow({ rowNumber: 2.5 })],
    }).ok,
    false,
  );
  assert.equal(
    parseResidentImportConfirmHttpRequest({
      rows: [approvedRow({ flatNumber: "" })],
    }).ok,
    false,
  );
  assert.equal(
    parseResidentImportConfirmHttpRequest({
      rows: [approvedRow({ residentName: "" })],
    }).ok,
    false,
  );
  assert.equal(
    parseResidentImportConfirmHttpRequest({
      rows: [approvedRow()],
      extra: true,
    }).ok,
    false,
  );
});

test("91-prefix primary mobile remains valid and extra digits are not sliced valid", () => {
  const valid = parseResidentImportConfirmHttpRequest({
    rows: [approvedRow({ mobile: "+91 9876500001", primaryMobile: undefined })],
  });
  assert.equal(valid.ok, true);
  const write = buildResidentImportConfirmWrite(
    valid.ok ? valid.rows[0] : approvedRow() as never,
  );
  assert.equal(write.mobile, "9876500001");
});

test("safe logs include society, row, and result only", () => {
  const log = buildResidentImportConfirmSafeLog({
    societyId: JWT_SOCIETY,
    rowNumber: 2,
    result: "IMPORTED",
  });
  assert.deepEqual(Object.keys(log).sort(), ["result", "rowNumber", "societyId"]);
  assert.equal(log.societyId, JWT_SOCIETY);
  assert.equal(JSON.stringify(log).includes("9876500001"), false);
});

test("planner IMPORTED and ALREADY_EXISTS still map after a mocked persist", async () => {
  const imported = await processResidentImportConfirmRows({
    proposed: [
      {
        rowNumber: 2,
        building: "A",
        wing: "",
        flatNumber: "101",
        residentName: "Asha Mehta",
        residentType: "Owner",
        primaryMobile: "9876500001",
        additionalMobiles: [],
      },
    ],
    existing: [],
    societyId: JWT_SOCIETY,
    classifyAgainstDatabase: classifyResidentImportAgainstDatabase,
    persist: async (write: ResidentImportConfirmWrite) => ({
      ok: true,
      existing: {
        societyId: JWT_SOCIETY,
        residentName: write.residentName,
        flatNumber: write.flatNumber,
        wingBuilding: write.wingBuilding,
        primaryMobile: write.mobile,
        additionalMobiles: [],
        status: "active",
      },
    }),
  });
  assert.equal(
    toResidentImportConfirmHttpSuccess(imported).rows[0]?.result,
    "IMPORTED",
  );

  const exists = await processResidentImportConfirmRows({
    proposed: [
      {
        rowNumber: 2,
        building: "A",
        wing: "",
        flatNumber: "101",
        residentName: "Asha Mehta",
        residentType: "Owner",
        primaryMobile: "9876500001",
        additionalMobiles: [],
      },
    ],
    existing: [
      {
        societyId: JWT_SOCIETY,
        residentName: "Asha Mehta",
        flatNumber: "101",
        wingBuilding: "A",
        primaryMobile: "9876500001",
        additionalMobiles: [],
        status: "active",
      },
    ],
    societyId: JWT_SOCIETY,
    classifyAgainstDatabase: classifyResidentImportAgainstDatabase,
    persist: async () => {
      throw new Error("persist must not run for ALREADY_EXISTS");
    },
  });
  assert.equal(
    toResidentImportConfirmHttpSuccess(exists).rows[0]?.result,
    "ALREADY_EXISTS",
  );
});

test("RPC args builder uses JWT society even when write is already built", () => {
  const write = buildResidentImportConfirmWrite({
    rowNumber: 8,
    building: "B",
    wing: "2",
    flatNumber: "202",
    residentName: "Neel Joshi",
    residentType: "Tenant",
    primaryMobile: "9876500102",
    additionalMobiles: [],
  });
  const args = buildAdminConfirmResidentImportRpcArgs({
    societyId: JWT_SOCIETY,
    write,
  });
  assert.equal(args.p_society_id, JWT_SOCIETY);
  assert.equal(args.p_row_number, 8);
  assert.equal(args.p_resident_type, "Tenant");
  assert.equal(args.p_wing_building, "B 2");
  assert.equal(
    parseAdminConfirmResidentImportRowResult({
      row_number: 8,
      status: "IMPORTED",
      message: "Resident created in this society.",
      resident_id: "res-1",
    })?.status,
    "IMPORTED",
  );
});
