import {
  ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC,
  buildResidentImportConfirmLockKey,
  parseAdminConfirmResidentImportRowResult,
  parseResidentImportConfirmRequest,
  processResidentImportConfirmRows,
  residentImportBuildingReuseBlocked,
  type ResidentImportConfirmWrite,
} from "../_shared/resident-import-confirm.ts";
import {
  classifyResidentImportConfirmAuth,
  parseResidentImportConfirmHttpRequest,
} from "../_shared/resident-import-confirm-http.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("confirm request ignores client society identifiers", () => {
  const result = parseResidentImportConfirmRequest({
    society_id: "11111111-1111-1111-1111-111111111102",
    societyId: "should-be-ignored",
    society_code: "DEMO2",
    rows: [
      {
        rowNumber: 2,
        building: "A",
        wing: "",
        flatNumber: "101",
        residentName: "Asha",
        residentType: "Owner",
        primaryMobile: "9876500001",
        additionalMobiles: [],
      },
    ],
  });

  assert(result.ok, "expected parse to succeed");
  if (!result.ok) {
    return;
  }
  assert(result.rows.length === 1, "one row");
  assert(!("society_id" in result.rows[0]), "society_id must not be copied");
  assert(result.rows[0]?.flatNumber === "101", "flat kept");
});

Deno.test("tenant isolation drops existing residents from another society", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await processResidentImportConfirmRows({
    societyId: "society-a",
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
        societyId: "society-b",
        residentName: "Asha Mehta",
        flatNumber: "101",
        wingBuilding: "A",
        primaryMobile: "9876500001",
        additionalMobiles: [],
        status: "active",
      },
    ],
    persist: async (write) => {
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

  assert(result.rows[0]?.status === "IMPORTED", "other society ignored");
  assert(writes.length === 1, "one write");
});

Deno.test("exact match in the JWT society is not written", async () => {
  const writes: ResidentImportConfirmWrite[] = [];
  const result = await processResidentImportConfirmRows({
    societyId: "society-a",
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
        societyId: "society-a",
        residentName: "Asha Mehta",
        flatNumber: "101",
        wingBuilding: "A",
        primaryMobile: "9876500001",
        additionalMobiles: [],
        status: "active",
      },
    ],
    persist: async (write) => {
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

  assert(result.rows[0]?.status === "ALREADY_EXISTS", "exact match");
  assert(writes.length === 0, "no write");
});

Deno.test("existing flat building is never reused when it differs", () => {
  assert(residentImportBuildingReuseBlocked("A", "B") === true, "named conflict");
  assert(residentImportBuildingReuseBlocked("A", null) === true, "blank vs named");
  assert(residentImportBuildingReuseBlocked("A", "A") === false, "compatible");
});

Deno.test("confirm RPC name and lock keys stay identity-scoped", () => {
  assert(
    ADMIN_CONFIRM_RESIDENT_IMPORT_ROW_RPC === "admin_confirm_resident_import_row",
    "rpc name",
  );
  const left = buildResidentImportConfirmLockKey({
    societyId: "society-a",
    flatNumber: "101",
    residentName: "Asha Mehta",
    primaryMobile: "9876500001",
  });
  const right = buildResidentImportConfirmLockKey({
    societyId: "society-a",
    flatNumber: "101",
    residentName: "Asha Mehta",
    primaryMobile: "919876500001",
  });
  const family = buildResidentImportConfirmLockKey({
    societyId: "society-a",
    flatNumber: "101",
    residentName: "Neel Joshi",
    primaryMobile: "9876500102",
  });
  assert(left === right, "same identity shares a lock key");
  assert(left !== family, "family member has a different lock key");
});

Deno.test("HTTP request rejects invalid mobile, type, and extra mobiles", () => {
  const missingAuth = classifyResidentImportConfirmAuth({
    bearerToken: null,
    tokenVerification: "missing",
  });
  const guard = classifyResidentImportConfirmAuth({
    bearerToken: "token",
    tokenVerification: "ok",
    appRole: "guard",
  });
  assert(missingAuth.ok === false && missingAuth.code === "UNAUTHORIZED", "missing auth");
  assert(guard.ok === false && guard.code === "FORBIDDEN", "guard forbidden");
  assert(
    parseResidentImportConfirmHttpRequest({
      rows: [{
        rowNumber: 2,
        flatNumber: "101",
        residentName: "Asha",
        residentType: "Owner",
        mobile: "12345",
        additionalMobiles: [],
      }],
    }).ok === false,
    "invalid mobile",
  );
  assert(
    parseResidentImportConfirmHttpRequest({
      rows: [{
        rowNumber: 2,
        flatNumber: "101",
        residentName: "Asha",
        residentType: "Chairman",
        mobile: "9876500001",
        additionalMobiles: [],
      }],
    }).ok === false,
    "invalid type",
  );
  assert(
    parseResidentImportConfirmHttpRequest({
      rows: [{
        rowNumber: 2,
        flatNumber: "101",
        residentName: "Asha",
        residentType: "Owner",
        mobile: "9876500001",
        additionalMobiles: ["12345"],
      }],
    }).ok === false,
    "invalid additional",
  );
});

Deno.test("confirm RPC result parser accepts a skipped row", () => {
  const parsed = parseAdminConfirmResidentImportRowResult({
    row_number: 2,
    status: "BACKEND_BLOCKED",
    message: "Incompatible building.",
    resident_id: null,
  });
  assert(parsed !== null, "parsed");
  assert(parsed?.status === "BACKEND_BLOCKED", "blocked");
  assert(parsed?.residentId === null, "no resident");
});
