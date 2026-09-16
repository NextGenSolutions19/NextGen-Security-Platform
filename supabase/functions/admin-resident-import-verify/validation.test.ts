import {
  classifyResidentImportAgainstDatabase,
  parseResidentImportVerifyRequest,
} from "../_shared/resident-import-verify.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("verify request ignores client society identifiers", () => {
  const result = parseResidentImportVerifyRequest({
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

Deno.test("tenant isolation drops existing residents from another society", () => {
  const result = classifyResidentImportAgainstDatabase({
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
  });

  assert(result.rows[0]?.status === "READY_TO_IMPORT", "other society ignored");
  assert(result.readOnly === true, "verification is read-only");
});

Deno.test("exact match in the JWT society is Already Exists", () => {
  const result = classifyResidentImportAgainstDatabase({
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
  });

  assert(result.rows[0]?.status === "ALREADY_EXISTS", "exact match");
});
