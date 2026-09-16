import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildEmergencyNotificationMessage,
  buildEmergencyNotificationTitle,
  canAcknowledgeEmergency,
  canResolveEmergency,
  formatRaisedByLabel,
  mapEmergencyToNotification,
  parseAdminEmergencyAction,
  type AdminEmergencyEvent,
} from "./admin-emergency.ts";

const MIGRATION_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations/20260901140000_m03_admin_emergency_monitoring.sql",
);

const SAMPLE_EVENT: AdminEmergencyEvent = {
  id: "55555555-5555-4555-8555-555555555501",
  societyId: "11111111-1111-1111-1111-111111111101",
  emergencyType: "FIRE",
  notes: "Smoke in lobby",
  raisedAt: "2026-09-01T12:00:00.000Z",
  status: "RAISED",
  raisedByAppUserId: "22222222-2222-2222-2222-222222222202",
  raisedByLoginId: "GUARD01",
  acknowledgedAt: null,
  acknowledgedByAppUserId: null,
  resolvedAt: null,
  resolvedByAppUserId: null,
};

test("lifecycle allows acknowledge then resolve, not reverse", () => {
  assert.equal(canAcknowledgeEmergency("RAISED"), true);
  assert.equal(canResolveEmergency("RAISED"), false);
  assert.equal(canAcknowledgeEmergency("ACKNOWLEDGED"), false);
  assert.equal(canResolveEmergency("ACKNOWLEDGED"), true);
  assert.equal(canAcknowledgeEmergency("RESOLVED"), false);
  assert.equal(canResolveEmergency("RESOLVED"), false);
});

test("derived notification reuses the emergency event id", () => {
  const notification = mapEmergencyToNotification(SAMPLE_EVENT, true);
  assert.equal(notification.id, SAMPLE_EVENT.id);
  assert.equal(notification.emergencyEventId, SAMPLE_EVENT.id);
  assert.equal(notification.type, "EMERGENCY");
  assert.equal(notification.unread, true);
  assert.equal(notification.title, buildEmergencyNotificationTitle("FIRE"));
  assert.match(notification.message, /GUARD01/);
  assert.match(notification.message, /Smoke in lobby/);
});

test("missing guard login still shows a Guard label", () => {
  assert.equal(formatRaisedByLabel(null), "Guard");
  assert.match(
    buildEmergencyNotificationMessage({
      emergencyType: "MEDICAL",
      notes: null,
      raisedByLoginId: null,
    }),
    /^Guard raised/,
  );
});

test("admin emergency parser rejects client society identifiers", () => {
  const rejected = parseAdminEmergencyAction({
    action: "list",
    society_id: "11111111-1111-1111-1111-111111111102",
  });
  assert.equal(rejected.ok, false);

  const list = parseAdminEmergencyAction({ action: "list" });
  assert.equal(list.ok, true);

  const missingId = parseAdminEmergencyAction({ action: "acknowledge" });
  assert.equal(missingId.ok, false);
});

test("resolved events remain available as notifications", () => {
  const resolved = mapEmergencyToNotification(
    { ...SAMPLE_EVENT, status: "RESOLVED" },
    false,
  );
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.unread, false);
});

test("prepared migration is additive and does not expose recipients", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  assert.match(sql, /add column resolved_at timestamptz/);
  assert.match(sql, /create table public\.admin_emergency_notification_reads/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth_app_role\(\) = 'society_admin'/);
  assert.equal(/drop table public\.emergency_events/i.test(sql), false);
  assert.equal(/emergency_recipients/i.test(sql), false);
  assert.equal(/delete\s+from/i.test(sql), false);
});
