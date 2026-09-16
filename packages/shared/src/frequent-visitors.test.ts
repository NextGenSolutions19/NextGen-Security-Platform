import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFrequentVisitorDetailsPath,
  deriveFrequentVisitors,
  filterFrequentVisitors,
  formatFrequentVisitCount,
  formatFrequentVisitorEntryType,
  selectFrequentVisitorHistory,
  type FrequentVisitorHistoryVisit,
  type VisitorVisitRecord,
} from "./frequent-visitors.ts";

function visit(
  overrides: Partial<VisitorVisitRecord> &
    Pick<VisitorVisitRecord, "id" | "visitorMobile" | "checkInAt">,
): VisitorVisitRecord {
  return {
    purpose: "Guest",
    purposeLabel: "Guest",
    flatNumber: "A-101",
    residentName: "Rahul Shah",
    entryType: "single",
    visitorCount: 1,
    ...overrides,
  };
}

function historyVisit(
  overrides: Partial<FrequentVisitorHistoryVisit> &
    Pick<FrequentVisitorHistoryVisit, "id" | "visitorMobile" | "checkInAt">,
): FrequentVisitorHistoryVisit {
  return {
    visitorName: null,
    purpose: "Guest",
    purposeLabel: "Guest",
    customPurposeText: null,
    flatNumber: "A-101",
    residentName: "Rahul Shah",
    checkOutAt: "2026-08-20T12:00:00.000Z",
    status: "checked_out",
    entryType: "single",
    visitorCount: 1,
    verificationMethod: "OTP_NOT_PERFORMED",
    registrationMode: "register_without_otp",
    vehicleNumber: null,
    notes: null,
    idType: null,
    idNumber: null,
    ...overrides,
  };
}

test("same mobile + different purposes = one Frequent Visitor", () => {
  const result = deriveFrequentVisitors([
    visit({
      id: "guest",
      visitorMobile: "7777777777",
      checkInAt: "2026-08-10T10:00:00.000Z",
      purposeLabel: "Guest",
    }),
    visit({
      id: "electrician",
      visitorMobile: "7777777777",
      checkInAt: "2026-08-11T10:00:00.000Z",
      purposeLabel: "Electrician",
    }),
    visit({
      id: "plumber",
      visitorMobile: "7777777777",
      checkInAt: "2026-08-12T10:00:00.000Z",
      purposeLabel: "Plumber",
    }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.visitorMobile, "7777777777");
  assert.equal(result[0]?.visitCount, 3);
});

test("visitor with 1 visit is excluded", () => {
  const result = deriveFrequentVisitors([
    visit({
      id: "one",
      visitorMobile: "9876543210",
      checkInAt: "2026-08-20T10:00:00.000Z",
    }),
  ]);

  assert.deepEqual(result, []);
});

test("visitor with 2+ visits is included and card uses latest summary", () => {
  const result = deriveFrequentVisitors([
    visit({
      id: "first",
      visitorMobile: "9876543210",
      checkInAt: "2026-08-20T10:00:00.000Z",
      purposeLabel: "Guest",
      flatNumber: "A-101",
      residentName: "Older Resident",
      visitorName: "Older Name",
    }),
    visit({
      id: "second",
      visitorMobile: "9876543210",
      checkInAt: "2026-08-21T10:00:00.000Z",
      purposeLabel: "Delivery",
      flatNumber: "B-204",
      residentName: "Newer Resident",
      visitorName: "Asha Mehta",
    }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.visitCount, 2);
  assert.equal(result[0]?.lastVisitorEntryId, "second");
  assert.equal(result[0]?.lastPurpose, "Delivery");
  assert.equal(result[0]?.lastFlatNumber, "B-204");
  assert.equal(result[0]?.lastResidentName, "Newer Resident");
  assert.equal(result[0]?.lastVisitorName, "Asha Mehta");
});

test("recurring service latest purpose includes visitor type", () => {
  const result = deriveFrequentVisitors([
    visit({
      id: "first",
      visitorMobile: "8888888888",
      checkInAt: "2026-08-20T10:00:00.000Z",
      purpose: "Recurring Service",
      purposeLabel: "Recurring Service",
      purposeCode: "recurring_service",
      customPurposeText: "Driver",
    }),
    visit({
      id: "second",
      visitorMobile: "8888888888",
      checkInAt: "2026-08-21T10:00:00.000Z",
      purpose: "Recurring Service",
      purposeLabel: "Recurring Service",
      purposeCode: "recurring_service",
      customPurposeText: "Driver",
    }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.lastPurpose, "Recurring Service - Driver");
});

test("group entry counts as one visit regardless of visitor_count", () => {
  const result = deriveFrequentVisitors([
    visit({
      id: "group-1",
      visitorMobile: "9123456789",
      checkInAt: "2026-08-20T10:00:00.000Z",
      entryType: "group",
      visitorCount: 5,
    }),
    visit({
      id: "single-2",
      visitorMobile: "9123456789",
      checkInAt: "2026-08-21T11:00:00.000Z",
    }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.visitCount, 2);
});

test("clicking a card builds the details path for that mobile", () => {
  assert.equal(
    buildFrequentVisitorDetailsPath("7777777777"),
    "/(guard)/frequent-visitors/7777777777",
  );
});

test("complete visit history is newest to oldest and keeps per-visit fields", () => {
  const history = selectFrequentVisitorHistory(
    [
      historyVisit({
        id: "photo-a",
        visitorMobile: "7777777777",
        checkInAt: "2026-08-10T10:00:00.000Z",
        purposeLabel: "Guest",
        flatNumber: "A-101",
        residentName: "Resident A",
        status: "checked_out",
      }),
      historyVisit({
        id: "photo-b",
        visitorMobile: "7777777777",
        checkInAt: "2026-08-11T10:00:00.000Z",
        purposeLabel: "Electrician",
        flatNumber: "B-202",
        residentName: "Resident B",
        status: "checked_out",
      }),
      historyVisit({
        id: "photo-c",
        visitorMobile: "7777777777",
        checkInAt: "2026-08-12T10:00:00.000Z",
        purposeLabel: "Plumber",
        flatNumber: "C-303",
        residentName: "Resident C",
        status: "checked_in",
        checkOutAt: null,
      }),
      historyVisit({
        id: "other-mobile",
        visitorMobile: "9000000000",
        checkInAt: "2026-08-13T10:00:00.000Z",
        purposeLabel: "Ignored",
      }),
    ],
    "7777777777",
  );

  assert.deepEqual(
    history.map((item) => item.purposeLabel),
    ["Plumber", "Electrician", "Guest"],
  );
  assert.deepEqual(
    history.map((item) => item.flatNumber),
    ["C-303", "B-202", "A-101"],
  );
  assert.deepEqual(
    history.map((item) => item.residentName),
    ["Resident C", "Resident B", "Resident A"],
  );
  assert.deepEqual(
    history.map((item) => item.id),
    ["photo-c", "photo-b", "photo-a"],
  );
  assert.ok(history.some((item) => item.status === "checked_in"));
  assert.ok(history.some((item) => item.status === "checked_out"));
  assert.notEqual(history[0]?.id, history[1]?.id);
  assert.notEqual(history[1]?.id, history[2]?.id);
});

test("group visitor count is displayed as Individual or Group Visitor", () => {
  const history = selectFrequentVisitorHistory(
    [
      historyVisit({
        id: "group",
        visitorMobile: "9123456789",
        checkInAt: "2026-08-20T10:00:00.000Z",
        entryType: "group",
        visitorCount: 5,
      }),
      historyVisit({
        id: "single",
        visitorMobile: "9123456789",
        checkInAt: "2026-08-21T10:00:00.000Z",
        entryType: "single",
        visitorCount: 1,
      }),
    ],
    "9123456789",
  );

  assert.equal(formatFrequentVisitorEntryType(history[0]?.entryType ?? "single"), "Individual");
  assert.equal(history[0]?.visitorCount, 1);
  assert.equal(formatFrequentVisitorEntryType(history[1]?.entryType ?? "single"), "Group Visitor");
  assert.equal(history[1]?.visitorCount, 5);
});

test("search matches older purpose and older flat", () => {
  const items = deriveFrequentVisitors([
    visit({
      id: "older",
      visitorMobile: "7777777777",
      checkInAt: "2026-08-10T10:00:00.000Z",
      purposeLabel: "Guest",
      flatNumber: "B-202",
    }),
    visit({
      id: "newer",
      visitorMobile: "7777777777",
      checkInAt: "2026-08-12T10:00:00.000Z",
      purposeLabel: "Electrician",
      flatNumber: "A-101",
    }),
  ]);

  assert.equal(items[0]?.lastPurpose, "Electrician");
  assert.equal(items[0]?.lastFlatNumber, "A-101");
  assert.equal(filterFrequentVisitors(items, "guest")[0]?.visitorMobile, "7777777777");
  assert.equal(filterFrequentVisitors(items, "b202")[0]?.visitorMobile, "7777777777");
  assert.equal(filterFrequentVisitors(items, "Z-999").length, 0);
});

test("latest non-null visitor name is summarized and searchable without grouping by name", () => {
  const items = deriveFrequentVisitors([
    visit({
      id: "legacy",
      visitorMobile: "8000000001",
      checkInAt: "2026-08-10T10:00:00.000Z",
    }),
    visit({
      id: "named",
      visitorMobile: "8000000001",
      checkInAt: "2026-08-12T10:00:00.000Z",
      visitorName: "Ravi Shah",
    }),
    visit({
      id: "other-name-1",
      visitorMobile: "8000000002",
      checkInAt: "2026-08-11T10:00:00.000Z",
      visitorName: "Ravi Shah",
    }),
    visit({
      id: "other-name-2",
      visitorMobile: "8000000002",
      checkInAt: "2026-08-13T10:00:00.000Z",
      visitorName: "Ravi Shah",
    }),
  ]);

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.visitorMobile).sort(),
    ["8000000001", "8000000002"],
  );
  assert.equal(
    items.find((item) => item.visitorMobile === "8000000001")?.lastVisitorName,
    "Ravi Shah",
  );
  assert.equal(filterFrequentVisitors(items, "ravi").length, 2);
});

test("empty state when no visitor has 2+ visits", () => {
  const result = deriveFrequentVisitors([
    visit({
      id: "solo-1",
      visitorMobile: "9000000010",
      checkInAt: "2026-08-20T10:00:00.000Z",
    }),
  ]);

  assert.equal(result.length, 0);
  assert.equal(formatFrequentVisitCount(2), "2 visits");
});

test("history lookup has no society parameter and cannot mix unseen societies", () => {
  assert.equal(selectFrequentVisitorHistory.length, 2);
  assert.equal(deriveFrequentVisitors.length, 1);

  const demoOnly = selectFrequentVisitorHistory(
    [
      historyVisit({
        id: "demo-1",
        visitorMobile: "7777777777",
        checkInAt: "2026-08-10T10:00:00.000Z",
      }),
      historyVisit({
        id: "demo-2",
        visitorMobile: "7777777777",
        checkInAt: "2026-08-11T10:00:00.000Z",
      }),
    ],
    "7777777777",
  );

  assert.equal(demoOnly.length, 2);
  assert.ok(demoOnly.every((item) => item.id.startsWith("demo-")));
  assert.ok(!demoOnly.some((item) => item.id.startsWith("demo2-")));
});

test("route parameter is a mobile lookup only", () => {
  const history = selectFrequentVisitorHistory(
    [
      historyVisit({
        id: "keep",
        visitorMobile: "7777777777",
        checkInAt: "2026-08-11T10:00:00.000Z",
      }),
    ],
    " 7777777777 ",
  );

  assert.equal(history.length, 1);
  assert.equal("societyId" in (history[0] ?? {}), false);
});

test("one failed photo does not remove other history visits", () => {
  const history = selectFrequentVisitorHistory(
    [
      historyVisit({
        id: "photo-ok",
        visitorMobile: "9777777777",
        checkInAt: "2026-08-21T10:00:00.000Z",
      }),
      historyVisit({
        id: "photo-missing",
        visitorMobile: "9777777777",
        checkInAt: "2026-08-20T10:00:00.000Z",
      }),
    ],
    "9777777777",
  );

  assert.equal(history.length, 2);
  assert.ok(!("signedUrl" in history[0]));
  assert.ok(!("photoUrl" in history[1]));
});

test("frequent visitor helpers expose no mutation controls", () => {
  const history = selectFrequentVisitorHistory(
    [
      historyVisit({
        id: "read-only",
        visitorMobile: "9666666666",
        checkInAt: "2026-08-20T10:00:00.000Z",
      }),
      historyVisit({
        id: "read-only-2",
        visitorMobile: "9666666666",
        checkInAt: "2026-08-21T10:00:00.000Z",
      }),
    ],
    "9666666666",
  );

  for (const item of history) {
    assert.equal("onEdit" in item, false);
    assert.equal("onDelete" in item, false);
    assert.equal("canApprove" in item, false);
    assert.equal("canMarkFrequent" in item, false);
  }
});

test("Other destination displays on frequent visitors and does not break same-mobile grouping", () => {
  const grouped = deriveFrequentVisitors([
    visit({
      id: "other-1",
      visitorMobile: "9000000001",
      checkInAt: "2026-08-22T10:00:00.000Z",
      flatNumber: "Clubhouse",
      destinationText: "Clubhouse",
      residentName: null,
    }),
    visit({
      id: "flat-1",
      visitorMobile: "9000000001",
      checkInAt: "2026-08-21T10:00:00.000Z",
      flatNumber: "A-101",
      destinationText: null,
    }),
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.visitCount, 2);
  assert.equal(grouped[0]?.lastFlatNumber, "Clubhouse");
  assert.equal(grouped[0]?.lastFlatNumber.includes("Unknown"), false);
  assert.equal(
    filterFrequentVisitors(grouped, "clubhouse")[0]?.visitorMobile,
    "9000000001",
  );
});

