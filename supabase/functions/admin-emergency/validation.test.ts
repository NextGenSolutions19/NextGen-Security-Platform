import { parseAdminEmergencyAction } from "../_shared/admin-emergency.ts";
import { mapAdminEmergencyEventDto } from "../_shared/admin-emergency.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("rejects client society identifiers", () => {
  const result = parseAdminEmergencyAction({
    action: "acknowledge",
    eventId: "55555555-5555-4555-8555-555555555501",
    societyId: "11111111-1111-1111-1111-111111111102",
  });
  assert(!result.ok, "client society must be rejected");
});

Deno.test("accepts list without event id", () => {
  const result = parseAdminEmergencyAction({ action: "list" });
  assert(result.ok, "list should parse");
});

Deno.test("resolved events expose updated_at as resolvedAt when resolved_at is absent", () => {
  const mapped = mapAdminEmergencyEventDto(
    {
      id: "55555555-5555-4555-8555-555555555501",
      society_id: "11111111-1111-1111-1111-111111111101",
      raised_by_app_user_id: "22222222-2222-2222-2222-222222222202",
      emergency_type: "FIRE",
      notes: null,
      raised_at: "2026-09-01T12:00:00.000Z",
      status: "RESOLVED",
      acknowledged_at: "2026-09-01T12:05:00.000Z",
      acknowledged_by_app_user_id: "22222222-2222-2222-2222-222222222201",
      updated_at: "2026-09-01T12:10:00.000Z",
    },
    "GUARD01",
  );
  assert(mapped.resolvedAt === "2026-09-01T12:10:00.000Z", "resolvedAt should use updated_at");
  assert(mapped.raisedAt === "2026-09-01T12:00:00.000Z", "raisedAt must stay unchanged");
  assert(
    mapped.acknowledgedAt === "2026-09-01T12:05:00.000Z",
    "acknowledgedAt must stay unchanged",
  );
});

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("rejects client society identifiers", () => {
  const result = parseAdminEmergencyAction({
    action: "acknowledge",
    eventId: "55555555-5555-4555-8555-555555555501",
    societyId: "11111111-1111-1111-1111-111111111102",
  });
  assert(!result.ok, "client society must be rejected");
});

Deno.test("accepts list without event id", () => {
  const result = parseAdminEmergencyAction({ action: "list" });
  assert(result.ok, "list should parse");
});
