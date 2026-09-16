import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedAppRole } from "./jwt-role.ts";

test("JWT app_role accepts only guard and society_admin", () => {
  assert.equal(isAllowedAppRole("guard"), true);
  assert.equal(isAllowedAppRole("society_admin"), true);
  assert.equal(isAllowedAppRole("platform_owner"), false);
  assert.equal(isAllowedAppRole("authenticated"), false);
  assert.equal(isAllowedAppRole(""), false);
  assert.equal(isAllowedAppRole(null), false);
});
