import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMIN_REPORT_FILTER_ALL,
  buildAdminReportCsv,
  buildAdminReportCsvFilename,
  filterAdminReportItems,
  formatAdminReportStatus,
  neutralizeCsvFormula,
  resolveAdminReportGuardLabel,
  resolveAdminVisitorRecordedBy,
  summarizeAdminReportItems,
} from "./admin-reports.ts";
import { formatAdminVisitorCheckInAt } from "./admin-visitor-history.ts";
import type { VisitorListItem } from "./visitor.ts";

function item(
  overrides: Partial<VisitorListItem> & Pick<VisitorListItem, "id" | "checkInAt">,
): VisitorListItem {
  return {
    societyId: "society-demo",
    flatId: "flat-1",
    destinationText: null,
    residentId: "res-1",
    visitorName: null,
    visitorMobile: "9876543210",
    purpose: "Delivery",
    purposeCode: "delivery",
    purposeLabel: "Delivery",
    customPurposeText: null,
    registrationMode: "register_without_otp",
    verificationMethod: "OTP_NOT_PERFORMED",
    vehicleNumber: null,
    vehicleVisuallyChecked: false,
    visitorPhotoUploadId: null,
    idType: null,
    idNumber: null,
    notes: null,
    entryType: "single",
    visitorCount: 1,
    status: "checked_out",
    checkOutAt: "2026-08-26T10:00:00.000Z",
    createdByAppUserId: "guard-1",
    createdAt: "2026-08-26T08:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    flatNumber: "A-101",
    residentName: "Meera Shah",
    wingBuilding: "A",
    ...overrides,
  };
}

const entries: VisitorListItem[] = [
  item({
    id: "in",
    checkInAt: "2026-08-26T06:30:00.000Z",
    status: "checked_in",
    checkOutAt: null,
    purposeLabel: "Guest",
    purpose: "Guest",
    visitorMobile: "9123456789",
    createdByAppUserId: "guard-1",
    visitorName: "Asha Mehta",
    vehicleNumber: "GJ01AB1234",
    visitorCount: 2,
    entryType: "group",
  }),
  item({
    id: "out",
    checkInAt: "2026-08-20T06:30:00.000Z",
    wingBuilding: "B",
    flatNumber: "B-202",
    residentName: "Amit Patel",
    createdByAppUserId: "guard-2",
  }),
];

const baseFilters = {
  search: "",
  status: "all" as const,
  purpose: "all",
  fromDate: "",
  toDate: "",
  wingBuilding: ADMIN_REPORT_FILTER_ALL,
  flatNumber: ADMIN_REPORT_FILTER_ALL,
  residentName: ADMIN_REPORT_FILTER_ALL,
  guardId: ADMIN_REPORT_FILTER_ALL,
};

test("report summary counts IN, OUT, and purposes from filtered rows", () => {
  const summary = summarizeAdminReportItems(entries);
  assert.equal(summary.totalVisits, 2);
  assert.equal(summary.currentlyIn, 1);
  assert.equal(summary.checkedOut, 1);
  assert.equal(formatAdminReportStatus("checked_in"), "IN");
  assert.equal(formatAdminReportStatus("checked_out"), "OUT");
});

test("report filters combine wing, flat, resident, guard, status, and date", () => {
  const byWing = filterAdminReportItems(entries, {
    ...baseFilters,
    wingBuilding: "A",
  });
  assert.deepEqual(byWing.map((row) => row.id), ["in"]);

  const byGuard = filterAdminReportItems(entries, {
    ...baseFilters,
    guardId: "guard-2",
  });
  assert.deepEqual(byGuard.map((row) => row.id), ["out"]);

  const combined = filterAdminReportItems(entries, {
    ...baseFilters,
    status: "checked_in",
    search: "912345",
    fromDate: "26-08-2026",
    toDate: "26-08-2026",
    wingBuilding: "A",
    guardId: "guard-1",
  });
  assert.deepEqual(combined.map((row) => row.id), ["in"]);
});

test("CSV export includes only supplied filtered rows and same-society guard labels", () => {
  const csv = buildAdminReportCsv(
    filterAdminReportItems(entries, { ...baseFilters, status: "checked_in" }),
    [{ id: "guard-1", loginId: "GUARD01", name: "Gate Guard" }],
  );
  assert.match(
    csv,
    /^Status,Visitor Mobile,Visitor Name,Vehicle Number,No. of Visitors,Purpose,Visitor Type/,
  );
  assert.match(csv, /IN,9123456789,Asha Mehta,GJ01AB1234,2,Guest,/);
  assert.match(csv, /Gate Guard/);
  assert.equal(csv.includes("Amit Patel"), false);
  assert.equal(csv.includes("GUARD02"), false);
});

test("CSV export includes Vehicle Number and No. of Visitors for the filtered rows", () => {
  const csv = buildAdminReportCsv(
    filterAdminReportItems(entries, { ...baseFilters, status: "checked_in" }),
    [{ id: "guard-1", loginId: "GUARD01", name: "Gate Guard" }],
  );
  const [header, dataRow] = csv.split("\n");
  const columns = header.split(",");
  const vehicleIndex = columns.indexOf("Vehicle Number");
  const visitorCountIndex = columns.indexOf("No. of Visitors");
  const cells = dataRow.split(",");
  assert.ok(vehicleIndex >= 0);
  assert.ok(visitorCountIndex >= 0);
  assert.equal(cells[vehicleIndex], "GJ01AB1234");
  assert.equal(cells[visitorCountIndex], "2");
  assert.equal(
    buildAdminReportCsv(
      filterAdminReportItems(entries, { ...baseFilters, status: "checked_out" }),
      [{ id: "guard-2", loginId: "GUARD02", name: "Lobby Guard" }],
    ).includes("GJ01AB1234"),
    false,
  );
});

test("Guard labels use name or Login ID and never fall back to the raw UUID", () => {
  const guardUuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assert.equal(resolveAdminReportGuardLabel(guardUuid, []), "Guard");
  assert.equal(
    resolveAdminReportGuardLabel(guardUuid, [
      { id: guardUuid, loginId: "GUARD01", name: "  " },
    ]),
    "GUARD01",
  );
  assert.equal(
    resolveAdminReportGuardLabel(guardUuid, [
      { id: guardUuid, loginId: "GUARD01", name: "Gate Guard" },
    ]),
    "Gate Guard",
  );

  const csv = buildAdminReportCsv(
    [
      item({
        id: "unknown-guard",
        checkInAt: "2026-08-26T06:30:00.000Z",
        createdByAppUserId: guardUuid,
      }),
    ],
    [],
  );
  assert.equal(csv.includes(guardUuid), false);
  assert.match(csv, /,Guard$/m);
});

test("visitor details attribution exposes Guard ID and name without UUIDs", () => {
  const recorded = resolveAdminVisitorRecordedBy("guard-2", [
    { id: "guard-2", loginId: "GUARD02", name: "Lobby Guard" },
  ]);
  assert.equal(recorded.guardId, "GUARD02");
  assert.equal(recorded.guardName, "Lobby Guard");

  const unknown = resolveAdminVisitorRecordedBy(
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    [],
  );
  assert.equal(unknown.guardId, "Guard");
  assert.equal(unknown.guardName, null);
});

test("CSV filename uses the IST calendar date", () => {
  assert.equal(
    buildAdminReportCsvFilename(new Date("2026-09-03T18:29:00.000Z")),
    "visitor-report-03-09-2026.csv",
  );
  assert.equal(
    buildAdminReportCsvFilename(new Date("2026-09-03T18:30:00.000Z")),
    "visitor-report-04-09-2026.csv",
  );
});

test("CSV exports a blank Checked Out cell when checkout is missing", () => {
  const csv = buildAdminReportCsv(
    filterAdminReportItems(entries, { ...baseFilters, status: "checked_in" }),
    [{ id: "guard-1", loginId: "GUARD01", name: "Gate Guard" }],
  );
  const checkIn = formatAdminVisitorCheckInAt("2026-08-26T06:30:00.000Z");
  assert.equal(csv.includes("—"), false);
  assert.equal(csv.includes("â€”"), false);
  assert.equal(csv.includes("null"), false);
  assert.equal(csv.includes("undefined"), false);
  assert.equal(csv.includes(`"${checkIn}",,Gate Guard`), true);
});

test("CSV exports Visitor Name after Visitor Mobile and blanks legacy names", () => {
  const named = buildAdminReportCsv(
    filterAdminReportItems(entries, { ...baseFilters, status: "checked_in" }),
    [{ id: "guard-1", loginId: "GUARD01", name: "Gate Guard" }],
  );
  const [namedHeader, namedRow] = named.split("\n");
  const namedColumns = namedHeader.split(",");
  const nameIndex = namedColumns.indexOf("Visitor Name");
  assert.equal(nameIndex, namedColumns.indexOf("Visitor Mobile") + 1);
  assert.equal(namedRow.split(",")[nameIndex], "Asha Mehta");

  const legacy = buildAdminReportCsv(
    filterAdminReportItems(entries, { ...baseFilters, status: "checked_out" }),
    [{ id: "guard-2", loginId: "GUARD02", name: "Lobby Guard" }],
  );
  const [legacyHeader, legacyRow] = legacy.split("\n");
  const legacyNameIndex = legacyHeader.split(",").indexOf("Visitor Name");
  assert.equal(legacyRow.split(",")[legacyNameIndex], "");
  assert.equal(legacy.includes("null"), false);
  assert.equal(legacy.includes("undefined"), false);
  assert.equal(legacy.includes("—"), false);
});

test("report search matches Visitor Name", () => {
  const byName = filterAdminReportItems(entries, {
    ...baseFilters,
    search: "asha",
  });
  assert.deepEqual(byName.map((row) => row.id), ["in"]);
});

test("report search matches equivalent flat representations and not unrelated Building text", () => {
  const buildingRecords: VisitorListItem[] = [
    item({
      id: "b-201",
      checkInAt: "2026-08-26T06:30:00.000Z",
      wingBuilding: "B",
      flatNumber: "201",
      visitorName: "Suresh Nair",
      visitorMobile: "9000000001",
    }),
    item({
      id: "building-a",
      checkInAt: "2026-08-26T06:30:00.000Z",
      wingBuilding: "Building A",
      flatNumber: "201",
      visitorName: "Kavita Rao",
      visitorMobile: "9000000002",
    }),
  ];

  const byCompound = filterAdminReportItems(buildingRecords, {
    ...baseFilters,
    search: "B 201",
  });
  assert.deepEqual(byCompound.map((row) => row.id), ["b-201"]);

  const byLetter = filterAdminReportItems(buildingRecords, {
    ...baseFilters,
    search: "B",
  });
  assert.deepEqual(byLetter.map((row) => row.id), ["b-201"]);

  const byBuilding = filterAdminReportItems(buildingRecords, {
    ...baseFilters,
    search: "BUILDING A",
  });
  assert.deepEqual(byBuilding.map((row) => row.id), ["building-a"]);
});

test("CSV keeps the checkout timestamp when the visitor is OUT", () => {
  const checkout = formatAdminVisitorCheckInAt("2026-08-26T10:00:00.000Z");
  const csv = buildAdminReportCsv(
    filterAdminReportItems(entries, { ...baseFilters, status: "checked_out" }),
    [{ id: "guard-2", loginId: "GUARD02", name: "Lobby Guard" }],
  );
  assert.equal(csv.includes(checkout), true);
  assert.equal(csv.includes("—"), false);
});

test("CSV Flat column uses Excel-safe hyphen formatting for building and flat", () => {
  const csv = buildAdminReportCsv(
    [
      item({
        id: "ramesh-flat",
        checkInAt: "2026-08-26T06:30:00.000Z",
        visitorName: "Ramesh Patil",
        wingBuilding: "B",
        flatNumber: "201",
        purpose: "Recurring Service",
        purposeCode: "recurring_service",
        purposeLabel: "Recurring Service",
        customPurposeText: "Driver",
      }),
    ],
    [{ id: "guard-2", loginId: "GUARD02", name: "Lobby Guard" }],
  );
  assert.match(csv, /Recurring Service,Driver,B,B-201,/);
  assert.equal(csv.includes("Â·"), false);
  assert.equal(csv.includes(" · "), false);
  assert.match(csv, /Recurring Service,Driver,/);
});

test("CSV Flat column shows Other destination and never Unknown flat", () => {
  const csv = buildAdminReportCsv(
    [
      item({
        id: "other-dest",
        checkInAt: "2026-08-26T06:30:00.000Z",
        flatId: null,
        destinationText: "Clubhouse",
        flatNumber: "",
        wingBuilding: null,
        residentId: null,
        residentName: null,
      }),
    ],
    [{ id: "guard-1", loginId: "GUARD01", name: "Gate Guard" }],
  );
  assert.match(csv, /,Clubhouse,/);
  assert.equal(csv.includes("Unknown flat"), false);
});

test("CSV export includes recurring visitor type without replacing entry type", () => {
  const csv = buildAdminReportCsv(
    [
      item({
        id: "recurring-driver",
        checkInAt: "2026-08-26T06:30:00.000Z",
        visitorName: "Ramesh Patil",
        purpose: "Recurring Service",
        purposeCode: "recurring_service",
        purposeLabel: "Recurring Service",
        customPurposeText: "Driver",
      }),
      item({
        id: "recurring-gardener",
        checkInAt: "2026-08-26T07:30:00.000Z",
        visitorName: "Suresh Yadav",
        purpose: "Recurring Service",
        purposeCode: "recurring_service",
        purposeLabel: "Recurring Service",
        customPurposeText: "Gardener",
      }),
    ],
    [{ id: "guard-1", loginId: "GUARD01", name: "Gate Guard" }],
  );
  assert.match(csv, /Recurring Service,Driver,/);
  assert.match(csv, /Recurring Service,Gardener,/);
  assert.equal(
    summarizeAdminReportItems([
      item({
        id: "recurring-driver",
        checkInAt: "2026-08-26T06:30:00.000Z",
        purpose: "Recurring Service",
        purposeCode: "recurring_service",
        purposeLabel: "Recurring Service",
        customPurposeText: "Driver",
      }),
    ]).purposeCounts[0]?.purpose,
    "Driver (Recurring Service)",
  );
});

test("CSV formula-injection protection prefixes formula trigger characters", () => {
  assert.equal(neutralizeCsvFormula("Clubhouse"), "Clubhouse");
  assert.equal(neutralizeCsvFormula("=CMD"), "'=CMD");
  assert.equal(neutralizeCsvFormula("+1+1"), "'+1+1");
  assert.equal(neutralizeCsvFormula("-1+1"), "'-1+1");
  assert.equal(neutralizeCsvFormula("@SUM(A1)"), "'@SUM(A1)");

  const csv = buildAdminReportCsv(
    [
      item({
        id: "formula",
        checkInAt: "2026-08-26T06:30:00.000Z",
        flatId: null,
        destinationText: "=HYPERLINK(\"http://evil\")",
        flatNumber: "",
        wingBuilding: null,
        visitorName: "+123",
        residentId: null,
        residentName: null,
      }),
    ],
    [{ id: "guard-1", loginId: "GUARD01", name: "Gate Guard" }],
  );
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'\+123/);
  assert.equal(csv.includes("=HYPERLINK"), true);
});
