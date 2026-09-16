import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DUTY_ALREADY_OFF_MESSAGE,
  DUTY_ALREADY_ON_MESSAGE,
  DUTY_FORBIDDEN_MESSAGE,
  DUTY_NETWORK_MESSAGE,
  DUTY_SESSION_EXPIRED_MESSAGE,
  GUARD_OFF_DUTY_CHECKIN_MESSAGE,
  isActiveDutySession,
  isAlreadyOffDutyError,
  isAlreadyOnDutyError,
  mapDutyUserMessage,
  mapGuardDutySession,
} from "./guard-duty.ts";

test("active duty session is endedAt null", () => {
  assert.equal(
    isActiveDutySession({
      id: "1",
      startedAt: "2026-08-24T12:00:00.000Z",
      endedAt: null,
    }),
    true,
  );
  assert.equal(
    isActiveDutySession({
      id: "1",
      startedAt: "2026-08-24T12:00:00.000Z",
      endedAt: "2026-08-24T18:00:00.000Z",
    }),
    false,
  );
  assert.equal(isActiveDutySession(null), false);
});

test("maps database rows without exposing society or account ids", () => {
  const session = mapGuardDutySession({
    id: "sess-1",
    started_at: "2026-08-24T12:00:00.000Z",
    ended_at: null,
  });
  assert.deepEqual(Object.keys(session).sort(), ["endedAt", "id", "startedAt"]);
  assert.equal("societyId" in session, false);
  assert.equal("appUserId" in session, false);
});

test("maps duty RPC errors to Guard-safe copy", () => {
  assert.equal(
    mapDutyUserMessage({ message: "ALREADY_ON_DUTY" }),
    DUTY_ALREADY_ON_MESSAGE,
  );
  assert.equal(
    mapDutyUserMessage({ message: "ALREADY_OFF_DUTY" }),
    DUTY_ALREADY_OFF_MESSAGE,
  );
  assert.equal(
    mapDutyUserMessage({ message: "FORBIDDEN" }),
    DUTY_FORBIDDEN_MESSAGE,
  );
  assert.equal(
    mapDutyUserMessage({ message: "UNAUTHORIZED" }),
    DUTY_SESSION_EXPIRED_MESSAGE,
  );
  assert.equal(
    GUARD_OFF_DUTY_CHECKIN_MESSAGE,
    "You are currently off duty. Please go On Duty before registering or checking in visitors.",
  );
  assert.equal(
    mapDutyUserMessage({ message: "duplicate key value violates unique constraint" }),
    DUTY_NETWORK_MESSAGE,
  );
  assert.equal(isAlreadyOnDutyError({ message: "ALREADY_ON_DUTY" }), true);
  assert.equal(isAlreadyOffDutyError({ message: "ALREADY_OFF_DUTY" }), true);
});
