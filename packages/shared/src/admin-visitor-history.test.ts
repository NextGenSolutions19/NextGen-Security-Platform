import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMIN_VISITOR_PHOTO_PLACEHOLDER,
  FROM_AFTER_TO_DATE_MESSAGE,
  collectAdminVisitorPurposeOptions,
  filterAdminVisitorHistoryItems,
  formatAdminVisitorCheckInAt,
  formatAdminVisitorCheckOutAt,
  PHOTO_UNAVAILABLE_FOR_VISIT,
  sortAdminVisitorHistoryNewestFirst,
  visitorEntryHasPhoto,
  type AdminVisitorHistoryFilterInput,
} from "./admin-visitor-history.ts";
import type { VisitorListItem } from "./visitor.ts";

function item(
  overrides: Partial<VisitorListItem> & Pick<VisitorListItem, "id" | "checkInAt">,
): VisitorListItem {
  return {
    societyId: "society-demo2",
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
    ...overrides,
  };
}

/** 26 Aug 2026, 12:00:00 PM IST */
const newerCheckIn = "2026-08-26T06:30:00.000Z";
/** 20 Aug 2026, 12:00:00 PM IST */
const olderCheckIn = "2026-08-20T06:30:00.000Z";
/** 24 Aug 2026, 12:06:18 AM IST */
const ist24AugMidnightVisit = "2026-08-23T18:36:18.000Z";
/** 23 Aug 2026, 11:59:59 PM IST */
const ist23AugLateVisit = "2026-08-23T18:29:59.000Z";

const entries: VisitorListItem[] = [
  item({
    id: "newer",
    checkInAt: newerCheckIn,
    visitorMobile: "9123456789",
    visitorName: "Asha Mehta",
    purposeLabel: "Guest",
    purpose: "Guest",
    vehicleNumber: "MH12AB1234",
    status: "checked_in",
    checkOutAt: null,
    entryType: "group",
    visitorCount: 3,
  }),
  item({
    id: "older",
    checkInAt: olderCheckIn,
    visitorPhotoUploadId: "photo-1",
  }),
];

const emptyFilters: AdminVisitorHistoryFilterInput = {
  search: "",
  status: "all",
  purpose: "all",
  fromDate: "",
  toDate: "",
};

test("search matches mobile, flat, purpose, vehicle, and resident name", () => {
  assert.equal(
    filterAdminVisitorHistoryItems(entries, { ...emptyFilters, search: "912345" })[0]?.id,
    "newer",
  );
  assert.equal(
    filterAdminVisitorHistoryItems(entries, { ...emptyFilters, search: "a101" }).length,
    2,
  );
  assert.equal(
    filterAdminVisitorHistoryItems(entries, { ...emptyFilters, search: "guest" })[0]?.id,
    "newer",
  );
  assert.equal(
    filterAdminVisitorHistoryItems(entries, { ...emptyFilters, search: "mh12ab" })[0]?.id,
    "newer",
  );
  assert.equal(
    filterAdminVisitorHistoryItems(entries, { ...emptyFilters, search: "meera" }).length,
    2,
  );
  assert.equal(
    filterAdminVisitorHistoryItems(entries, { ...emptyFilters, search: "asha" })[0]?.id,
    "newer",
  );
});

test("status and purpose filters use existing record values", () => {
  assert.deepEqual(
    filterAdminVisitorHistoryItems(entries, { ...emptyFilters, status: "checked_in" }).map(
      (row) => row.id,
    ),
    ["newer"],
  );
  assert.deepEqual(
    filterAdminVisitorHistoryItems(entries, { ...emptyFilters, purpose: "Delivery" }).map(
      (row) => row.id,
    ),
    ["older"],
  );
  assert.deepEqual(collectAdminVisitorPurposeOptions(entries), ["Delivery", "Guest"]);
});

test("date range filters by IST check-in calendar day using DD-MM-YYYY", () => {
  const ranged = filterAdminVisitorHistoryItems(entries, {
    ...emptyFilters,
    fromDate: "26-08-2026",
    toDate: "26-08-2026",
  });
  assert.deepEqual(
    ranged.map((row) => row.id),
    ["newer"],
  );

  const boundaryEntries: VisitorListItem[] = [
    item({ id: "ist-24-aug", checkInAt: ist24AugMidnightVisit }),
    item({ id: "ist-23-aug", checkInAt: ist23AugLateVisit }),
  ];

  assert.deepEqual(
    filterAdminVisitorHistoryItems(boundaryEntries, {
      ...emptyFilters,
      fromDate: "24-08-2026",
      toDate: "24-08-2026",
    }).map((row) => row.id),
    ["ist-24-aug"],
  );
  assert.deepEqual(
    filterAdminVisitorHistoryItems(boundaryEntries, {
      ...emptyFilters,
      fromDate: "23-08-2026",
      toDate: "23-08-2026",
    }).map((row) => row.id),
    ["ist-23-aug"],
  );
  assert.deepEqual(
    filterAdminVisitorHistoryItems(boundaryEntries, {
      ...emptyFilters,
      fromDate: "23-08-2026",
      toDate: "24-08-2026",
    }).map((row) => row.id),
    ["ist-24-aug", "ist-23-aug"],
  );
  assert.deepEqual(
    filterAdminVisitorHistoryItems(boundaryEntries, {
      ...emptyFilters,
      fromDate: "2026-08-24",
      toDate: "2026-08-24",
    }).map((row) => row.id),
    ["ist-24-aug", "ist-23-aug"],
  );
});

test("slash and hyphen From/To dates produce the same IST filter result", () => {
  const hyphen = filterAdminVisitorHistoryItems(entries, {
    ...emptyFilters,
    fromDate: "26-08-2026",
    toDate: "26-08-2026",
  }).map((row) => row.id);
  const slash = filterAdminVisitorHistoryItems(entries, {
    ...emptyFilters,
    fromDate: "26/08/2026",
    toDate: "26/08/2026",
  }).map((row) => row.id);

  assert.deepEqual(hyphen, ["newer"]);
  assert.deepEqual(slash, hyphen);
});

test("inverted from/to range does not hide records; YYYY-MM-DD is not accepted as input", () => {
  const inverted = filterAdminVisitorHistoryItems(entries, {
    ...emptyFilters,
    fromDate: "26-08-2026",
    toDate: "23-08-2026",
  });
  assert.equal(inverted.length, entries.length);
  assert.equal(FROM_AFTER_TO_DATE_MESSAGE, "From date cannot be after To date.");
});

test("combined search, status, purpose, and IST date filters still apply together", () => {
  const combinedEntries: VisitorListItem[] = [
    item({
      id: "target",
      checkInAt: "2026-08-23T20:00:00.000Z",
      visitorMobile: "7777777777",
      purpose: "Guest",
      purposeLabel: "Guest",
      status: "checked_out",
      checkOutAt: "2026-08-24T04:00:00.000Z",
    }),
    item({
      id: "wrong-mobile",
      checkInAt: "2026-08-23T20:00:00.000Z",
      visitorMobile: "9999999999",
      purpose: "Guest",
      purposeLabel: "Guest",
      status: "checked_out",
    }),
    item({
      id: "wrong-status",
      checkInAt: "2026-08-23T20:00:00.000Z",
      visitorMobile: "7777777777",
      purpose: "Guest",
      purposeLabel: "Guest",
      status: "checked_in",
      checkOutAt: null,
    }),
    item({
      id: "outside-range",
      checkInAt: "2026-08-20T06:30:00.000Z",
      visitorMobile: "7777777777",
      purpose: "Guest",
      purposeLabel: "Guest",
      status: "checked_out",
    }),
  ];

  assert.deepEqual(
    filterAdminVisitorHistoryItems(combinedEntries, {
      search: "7777777777",
      status: "checked_out",
      purpose: "Guest",
      fromDate: "23-08-2026",
      toDate: "24-08-2026",
    }).map((row) => row.id),
    ["target"],
  );
});

test("Admin timestamps use IST Indian format and not US month-first dates", () => {
  assert.equal(
    formatAdminVisitorCheckInAt("2026-08-23T18:36:18.000Z"),
    "24-08-2026, 12:06:18 AM",
  );
  assert.equal(formatAdminVisitorCheckOutAt(null), "—");
  assert.equal(
    formatAdminVisitorCheckOutAt("2026-08-24T06:30:00.000Z"),
    "24-08-2026, 12:00:00 PM",
  );
});

test("newest check-in remains first after filtering", () => {
  const sorted = sortAdminVisitorHistoryNewestFirst(entries);
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["newer", "older"],
  );
  const filtered = filterAdminVisitorHistoryItems(sorted, emptyFilters);
  assert.deepEqual(
    filtered.map((row) => row.id),
    ["newer", "older"],
  );
});

test("group rows stay as a single history record", () => {
  const group = filterAdminVisitorHistoryItems(entries, {
    ...emptyFilters,
    search: "9123456789",
  })[0];
  assert.equal(group?.entryType, "group");
  assert.equal(group?.visitorCount, 3);
});

test("photo presence is a boolean and never exposes a storage path", () => {
  assert.equal(visitorEntryHasPhoto(entries[0]!), false);
  assert.equal(visitorEntryHasPhoto(entries[1]!), true);
  assert.equal(PHOTO_UNAVAILABLE_FOR_VISIT, "Photo unavailable for this visit.");
  assert.equal(ADMIN_VISITOR_PHOTO_PLACEHOLDER, PHOTO_UNAVAILABLE_FOR_VISIT);
  assert.equal(PHOTO_UNAVAILABLE_FOR_VISIT.includes("storage"), false);
});

test("search matches Other destination text and not Unknown flat", () => {
  const other = item({
    id: "other-dest",
    checkInAt: newerCheckIn,
    flatId: null,
    destinationText: "Society Office",
    flatNumber: "",
    residentId: null,
    residentName: null,
  });
  assert.equal(
    filterAdminVisitorHistoryItems([other], { ...emptyFilters, search: "society office" })[0]?.id,
    "other-dest",
  );
  assert.equal(
    filterAdminVisitorHistoryItems([other], { ...emptyFilters, search: "Unknown flat" }).length,
    0,
  );
});

