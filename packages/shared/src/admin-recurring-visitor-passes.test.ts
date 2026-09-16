import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMIN_RECURRING_PASS_STATUS_FILTERS,
  ADMIN_RECURRING_PASS_TYPE_FILTER_ALL,
  ADMIN_RECURRING_PASS_TYPE_FILTERS,
  filterAdminRecurringVisitorPasses,
  formatAdminRecurringPassStatusFilter,
  formatAdminRecurringPassTypeFilter,
  formatRecurringPassAllowedTime,
  formatRecurringPassCalendarDate,
  formatRecurringPassEffectiveStatus,
  resolveAdminRecurringPassEffectiveStatus,
  resolveRecurringPassAdminActions,
  type AdminRecurringVisitorPassListItem,
} from "./admin-recurring-visitor-passes.ts";
import { RECURRING_VISITOR_PASS_STATUSES } from "./recurring-visitor-pass.ts";

/** 2026-09-14 is a Monday in IST. */
const MONDAY_MIDDAY_IST = new Date("2026-09-14T06:30:00.000Z");

function pass(
  overrides: Partial<AdminRecurringVisitorPassListItem> = {},
): AdminRecurringVisitorPassListItem {
  return {
    id: "pass-1",
    societyId: "society-demo",
    visitorName: "Neha Shah",
    visitorMobile: "9876543210",
    visitorTypeCode: "DOMESTIC_HELP",
    visitorTypeLabel: "Domestic Help / Maid",
    flatId: "flat-1",
    flatNumber: "A-101",
    wingBuilding: "A",
    residentId: "res-1",
    residentName: "Rahul Shah",
    destinationText: null,
    destinationLabel: "A · A-101",
    vehicleNumber: null,
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    allowedDaysOfWeek: [1, 2, 3, 4, 5],
    allowedEntryFromTime: "08:00:00",
    allowedEntryToTime: "18:00:00",
    status: "active",
    notes: null,
    createdAt: "2026-09-01T04:00:00.000Z",
    ...overrides,
  };
}

test("effective status derives expired and never uses a persisted expired value", () => {
  assert.deepEqual(
    [...RECURRING_VISITOR_PASS_STATUSES],
    ["active", "suspended", "revoked"],
  );
  assert.deepEqual(
    [...ADMIN_RECURRING_PASS_STATUS_FILTERS],
    ["all", "active", "suspended", "expired", "revoked"],
  );

  assert.equal(
    resolveAdminRecurringPassEffectiveStatus(pass(), MONDAY_MIDDAY_IST),
    "active",
  );
  assert.equal(
    resolveAdminRecurringPassEffectiveStatus(
      pass({ validUntil: "2026-09-13" }),
      MONDAY_MIDDAY_IST,
    ),
    "expired",
  );
  assert.equal(
    resolveAdminRecurringPassEffectiveStatus(
      pass({ status: "suspended", validUntil: "2026-09-13" }),
      MONDAY_MIDDAY_IST,
    ),
    "expired",
  );
  assert.equal(
    resolveAdminRecurringPassEffectiveStatus(
      pass({ status: "revoked", validUntil: "2026-09-13" }),
      MONDAY_MIDDAY_IST,
    ),
    "revoked",
  );
  assert.equal(
    formatRecurringPassEffectiveStatus(pass(), MONDAY_MIDDAY_IST),
    "ACTIVE",
  );
});

test("status filter uses effective status so expired active passes are not Active", () => {
  const items = [
    pass({ id: "live" }),
    pass({ id: "lapsed", validUntil: "2026-09-13" }),
    pass({ id: "paused", status: "suspended" }),
    pass({ id: "ended", status: "revoked" }),
  ];

  assert.deepEqual(
    filterAdminRecurringVisitorPasses(items, {
      status: "active",
      at: MONDAY_MIDDAY_IST,
    }).map((item) => item.id),
    ["live"],
  );
  assert.deepEqual(
    filterAdminRecurringVisitorPasses(items, {
      status: "expired",
      at: MONDAY_MIDDAY_IST,
    }).map((item) => item.id),
    ["lapsed"],
  );
  assert.deepEqual(
    filterAdminRecurringVisitorPasses(items, {
      status: "suspended",
      at: MONDAY_MIDDAY_IST,
    }).map((item) => item.id),
    ["paused"],
  );
  assert.deepEqual(
    filterAdminRecurringVisitorPasses(items, {
      status: "revoked",
      at: MONDAY_MIDDAY_IST,
    }).map((item) => item.id),
    ["ended"],
  );
});

test("search matches name, mobile, type, and destination", () => {
  const items = [
    pass({ id: "maid" }),
    pass({
      id: "driver",
      visitorName: "Amit Patel",
      visitorMobile: "9123456789",
      visitorTypeCode: "DRIVER",
      visitorTypeLabel: "Driver",
      flatId: null,
      flatNumber: null,
      wingBuilding: null,
      residentId: null,
      residentName: null,
      destinationText: "Clubhouse",
      destinationLabel: "Clubhouse",
    }),
  ];

  assert.equal(
    filterAdminRecurringVisitorPasses(items, { search: "neha" })[0]?.id,
    "maid",
  );
  assert.equal(
    filterAdminRecurringVisitorPasses(items, { search: "912345" })[0]?.id,
    "driver",
  );
  assert.equal(
    filterAdminRecurringVisitorPasses(items, { search: "driver" })[0]?.id,
    "driver",
  );
  assert.equal(
    filterAdminRecurringVisitorPasses(items, { search: "clubhouse" })[0]?.id,
    "driver",
  );
  assert.equal(
    filterAdminRecurringVisitorPasses(items, { search: "a101" })[0]?.id,
    "maid",
  );
  assert.equal(
    filterAdminRecurringVisitorPasses(
      [
        ...items,
        pass({
          id: "gardener",
          visitorTypeCode: "OTHER",
          visitorTypeLabel: "Gardener",
          visitorName: "Ravi Mehta",
          visitorMobile: "9000000001",
        }),
      ],
      { search: "Gardener" },
    )[0]?.id,
    "gardener",
  );
});

test("visitor type filter reuses shared recurring type codes", () => {
  assert.equal(ADMIN_RECURRING_PASS_TYPE_FILTERS[0], ADMIN_RECURRING_PASS_TYPE_FILTER_ALL);
  assert.ok(ADMIN_RECURRING_PASS_TYPE_FILTERS.includes("DOMESTIC_HELP"));
  assert.equal(
    formatAdminRecurringPassTypeFilter("DOMESTIC_HELP"),
    "Domestic Help / Maid",
  );
  assert.equal(formatAdminRecurringPassTypeFilter("all"), "All Types");
  assert.equal(formatAdminRecurringPassStatusFilter("expired"), "EXPIRED");

  const items = [
    pass({ id: "maid" }),
    pass({
      id: "driver",
      visitorTypeCode: "DRIVER",
      visitorTypeLabel: "Driver",
    }),
    pass({
      id: "gardener",
      visitorTypeCode: "OTHER",
      visitorTypeLabel: "Gardener",
    }),
  ];
  assert.deepEqual(
    filterAdminRecurringVisitorPasses(items, { visitorType: "DRIVER" }).map(
      (item) => item.id,
    ),
    ["driver"],
  );
  assert.equal(formatAdminRecurringPassTypeFilter("OTHER"), "Other");
  assert.deepEqual(
    filterAdminRecurringVisitorPasses(items, { visitorType: "OTHER" }).map(
      (item) => item.id,
    ),
    ["gardener"],
  );
});

test("calendar dates display as DD-MM-YYYY and time windows omit when unset", () => {
  assert.equal(formatRecurringPassCalendarDate("2026-09-14"), "14-09-2026");
  assert.equal(
    formatRecurringPassAllowedTime("08:00:00", "18:00:00"),
    "08:00 – 18:00",
  );
  assert.equal(formatRecurringPassAllowedTime(null, null), null);
});

test("Admin lifecycle actions follow effective status and credential presence", () => {
  const active = resolveRecurringPassAdminActions(
    { ...pass(), hasActiveCredential: false },
    MONDAY_MIDDAY_IST,
  );
  assert.equal(active.issueQr, true);
  assert.equal(active.replaceQr, false);
  assert.equal(active.suspend, true);
  assert.equal(active.reactivate, false);
  assert.equal(active.revoke, true);
  assert.equal(active.renew, true);
  assert.equal(active.editSchedule, true);

  const activeWithQr = resolveRecurringPassAdminActions(
    { ...pass(), hasActiveCredential: true, hasSessionQrToken: true },
    MONDAY_MIDDAY_IST,
  );
  assert.equal(activeWithQr.issueQr, false);
  assert.equal(activeWithQr.replaceQr, true);
  assert.equal(activeWithQr.viewIssuedQr, true);

  const suspended = resolveRecurringPassAdminActions(
    { ...pass({ status: "suspended" }), hasActiveCredential: true },
    MONDAY_MIDDAY_IST,
  );
  assert.equal(suspended.suspend, false);
  assert.equal(suspended.reactivate, true);
  assert.equal(suspended.replaceQr, true);
  assert.equal(suspended.renew, true);

  const expired = resolveRecurringPassAdminActions(
    { ...pass({ validUntil: "2026-09-13" }), hasActiveCredential: false },
    MONDAY_MIDDAY_IST,
  );
  assert.equal(expired.issueQr, false);
  assert.equal(expired.replaceQr, false);
  assert.equal(expired.suspend, false);
  assert.equal(expired.reactivate, false);
  assert.equal(expired.renew, true);
  assert.equal(expired.revoke, true);

  const expiredSuspended = resolveRecurringPassAdminActions(
    {
      ...pass({ status: "suspended", validUntil: "2026-09-13" }),
      hasActiveCredential: true,
    },
    MONDAY_MIDDAY_IST,
  );
  assert.equal(expiredSuspended.reactivate, false);
  assert.equal(expiredSuspended.renew, true);

  const revoked = resolveRecurringPassAdminActions(
    { ...pass({ status: "revoked" }), hasActiveCredential: false },
    MONDAY_MIDDAY_IST,
  );
  assert.deepEqual(revoked, {
    issueQr: false,
    replaceQr: false,
    viewIssuedQr: false,
    editSchedule: false,
    suspend: false,
    reactivate: false,
    revoke: false,
    renew: false,
  });
});
