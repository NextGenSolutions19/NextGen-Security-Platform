import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canStartNewOtpSend,
  getResendAvailableAt,
  resolveShouldExposeDevOtpCode,
} from "./visitor-security.ts";

const DEV_TOKEN = "local-dev-otp-client-token";

test("OTP codes stay hidden unless all dev expose conditions are met", () => {
  assert.equal(resolveShouldExposeDevOtpCode({}), false);
  assert.equal(resolveShouldExposeDevOtpCode({ exposeFlag: "false" }), false);
  assert.equal(
    resolveShouldExposeDevOtpCode({
      exposeFlag: "true",
      smsProvider: "twilio",
      clientDevToken: DEV_TOKEN,
      expectedClientToken: DEV_TOKEN,
    }),
    false,
  );
  assert.equal(
    resolveShouldExposeDevOtpCode({
      exposeFlag: "true",
      smsProvider: "dev",
      clientDevToken: DEV_TOKEN,
      expectedClientToken: DEV_TOKEN,
    }),
    true,
  );
  assert.equal(
    resolveShouldExposeDevOtpCode({
      exposeFlag: "true",
      clientDevToken: DEV_TOKEN,
      expectedClientToken: DEV_TOKEN,
    }),
    true,
  );
  assert.equal(
    resolveShouldExposeDevOtpCode({
      exposeFlag: "true",
      smsProvider: "dev",
      expectedClientToken: DEV_TOKEN,
    }),
    false,
  );
  assert.equal(
    resolveShouldExposeDevOtpCode({
      exposeFlag: "true",
      smsProvider: "dev",
      clientDevToken: DEV_TOKEN,
    }),
    false,
  );
  assert.equal(
    resolveShouldExposeDevOtpCode({
      exposeFlag: "true",
      smsProvider: "dev",
      clientDevToken: "wrong-token",
      expectedClientToken: DEV_TOKEN,
    }),
    false,
  );
});

test("new OTP sends reuse the existing resend cooldown", () => {
  const lastSentAt = new Date().toISOString();
  assert.equal(canStartNewOtpSend(lastSentAt).ok, false);
  assert.equal(
    canStartNewOtpSend(new Date(Date.now() - 31_000).toISOString()).ok,
    true,
  );
  assert.equal(
    new Date(getResendAvailableAt(lastSentAt)).getTime() > Date.now(),
    true,
  );
});
