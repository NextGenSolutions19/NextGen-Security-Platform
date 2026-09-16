import {
  allocateGeneratedGuardLoginId,
  mapGuardAccount,
  parseGuardManagementAction,
  parseGuardUserId,
} from "../_shared/admin-guard-management.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

Deno.test("rejects client society identifiers", () => {
  const result = parseGuardManagementAction({
    action: "list_guards",
    society_id: "11111111-1111-1111-1111-111111111102",
  });
  assert(!result.ok, "client society_id must be rejected");
});

Deno.test("accepts guard actions without client society", () => {
  assert(parseGuardManagementAction({ action: "list_guards" }).ok, "list should parse");
  assert(parseGuardManagementAction({ action: "create_guard" }).ok, "create should parse");
  assert(
    parseGuardManagementAction({ action: "set_guard_status" }).ok,
    "status should parse",
  );
});

Deno.test("generated guard ids skip globally taken values and keep GUARD01", () => {
  const next = allocateGeneratedGuardLoginId({
    societyLoginIds: ["GUARD01"],
    globallyTakenLoginIds: ["GUARD02"],
  });
  assert(next === "GUARD03", "next id should skip taken GUARD02");
  assert(next !== "GUARD01", "existing GUARD01 must not be rewritten");
});

Deno.test("guard mapping never includes a password hash", () => {
  const mapped = mapGuardAccount({
    id: "22222222-2222-2222-2222-222222222211",
    login_id: "GUARD01",
    role: "guard",
    status: "active",
  });
  assert(mapped?.loginId === "GUARD01", "login id should map");
  assert(!("passwordHash" in (mapped ?? {})), "password hash must not be mapped");
  assert(!parseGuardUserId("GUARD01").ok, "login id is not a guard uuid");
});
