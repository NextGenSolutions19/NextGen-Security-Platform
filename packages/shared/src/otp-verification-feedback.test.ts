import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  completeOtpVerificationFailure,
  completeOtpVerificationSuccess,
  createOtpVerifySessionState,
  OTP_VERIFICATION_MESSAGES,
  resolveOtpVerificationFailure,
  resolveOtpVerificationFailureFromUnknown,
  startOtpVerification,
} from "./otp-verification-feedback.ts";

test("correct OTP -> verified", () => {
  let session = createOtpVerifySessionState();
  const started = startOtpVerification(session);
  assert.equal(started.accepted, true);
  session = completeOtpVerificationSuccess("server-issued-token");
  assert.equal(session.verificationToken, "server-issued-token");
  assert.equal(session.verificationMethod, "OTP_VERIFIED");
  assert.equal(session.fieldError, "");
  assert.equal(session.isVerifying, false);
});

test("incorrect OTP -> visible error and never OTP Verified", () => {
  const failure = resolveOtpVerificationFailure({
    otpCode: "1234",
    backendCode: "OTP_INVALID",
  });
  const session = completeOtpVerificationFailure(failure);
  assert.equal(failure.fieldError, OTP_VERIFICATION_MESSAGES.incorrect);
  assert.equal(session.verificationToken, null);
  assert.notEqual(session.verificationMethod, "OTP_VERIFIED");
  assert.notEqual(session.verificationMethod, "OTP_NOT_PERFORMED");
});

test("expired OTP -> visible error", () => {
  const failure = resolveOtpVerificationFailure({
    otpCode: "1234",
    backendCode: "OTP_EXPIRED",
  });
  assert.equal(failure.fieldError, OTP_VERIFICATION_MESSAGES.expired);
  assert.equal(failure.verified, false);
});

test("malformed OTP -> visible validation error", () => {
  const failure = resolveOtpVerificationFailure({ otpCode: "12" });
  assert.equal(failure.fieldError, OTP_VERIFICATION_MESSAGES.invalidFormat);
  const session = completeOtpVerificationFailure(failure);
  assert.equal(session.verificationToken, null);
});

test("backend/network failure -> visible error", () => {
  const failure = resolveOtpVerificationFailure({
    otpCode: "1234",
    visitorErrorCode: "NETWORK_ERROR",
  });
  assert.equal(failure.fieldError, OTP_VERIFICATION_MESSAGES.network);
});

test("retry after wrong OTP -> correct OTP can subsequently verify", () => {
  let session = createOtpVerifySessionState();
  session = startOtpVerification(session).state;
  session = completeOtpVerificationFailure(
    resolveOtpVerificationFailure({ otpCode: "1111", backendCode: "OTP_INVALID" }),
  );
  assert.equal(session.fieldError, OTP_VERIFICATION_MESSAGES.incorrect);
  assert.equal(session.verificationToken, null);

  const retry = startOtpVerification(session);
  assert.equal(retry.accepted, true);
  session = completeOtpVerificationSuccess("server-issued-token-2");
  assert.equal(session.verificationToken, "server-issued-token-2");
  assert.equal(session.verificationMethod, "OTP_VERIFIED");
  assert.equal(session.fieldError, "");
});

test("wrong OTP must never produce OTP Verified", () => {
  const codes = ["OTP_INVALID", "OTP_VERIFICATION_INVALID"];
  for (const backendCode of codes) {
    const session = completeOtpVerificationFailure(
      resolveOtpVerificationFailure({ otpCode: "0000", backendCode }),
    );
    assert.notEqual(session.verificationMethod, "OTP_VERIFIED");
    assert.equal(session.verificationToken, null);
  }
});

test("duplicate verification while in progress is rejected", () => {
  let session = createOtpVerifySessionState();
  const first = startOtpVerification(session);
  assert.equal(first.accepted, true);
  session = first.state;
  const second = startOtpVerification(session);
  assert.equal(second.accepted, false);
  assert.equal(second.state.isVerifying, true);
});

test("error messages must not include an expected OTP value", () => {
  const messages = Object.values(OTP_VERIFICATION_MESSAGES);
  for (const message of messages) {
    assert.equal(/\d{4}/.test(message), false);
    assert.equal(/expected/i.test(message), false);
  }
});

test("backend error objects map to inline OTP failures", () => {
  const incorrect = resolveOtpVerificationFailureFromUnknown(
    { code: "OTP_ERROR", backendCode: "OTP_INVALID" },
    "1234",
  );
  assert.equal(incorrect.fieldError, OTP_VERIFICATION_MESSAGES.incorrect);
  assert.equal(incorrect.verified, false);

  const expired = resolveOtpVerificationFailureFromUnknown(
    { code: "OTP_ERROR", backendCode: "OTP_EXPIRED" },
    "1234",
  );
  assert.equal(expired.fieldError, OTP_VERIFICATION_MESSAGES.expired);

  const network = resolveOtpVerificationFailureFromUnknown(
    { code: "NETWORK_ERROR" },
    "1234",
  );
  assert.equal(network.fieldError, OTP_VERIFICATION_MESSAGES.network);
});

describe("New Visitor OTP feedback", () => {
  test("correct OTP -> verified", () => {
    const started = startOtpVerification(createOtpVerifySessionState());
    assert.equal(started.accepted, true);
    const session = completeOtpVerificationSuccess("new-visitor-token");
    assert.equal(session.verificationToken, "new-visitor-token");
    assert.equal(session.verificationMethod, "OTP_VERIFIED");
    assert.equal(session.fieldError, "");
  });

  test("incorrect OTP -> inline error", () => {
    const failure = resolveOtpVerificationFailureFromUnknown(
      { code: "OTP_ERROR", backendCode: "OTP_INVALID" },
      "1234",
    );
    const session = completeOtpVerificationFailure(failure);
    assert.equal(session.fieldError, OTP_VERIFICATION_MESSAGES.incorrect);
    assert.equal(session.verificationToken, null);
  });

  test("expired OTP -> inline error", () => {
    const failure = resolveOtpVerificationFailureFromUnknown(
      { code: "OTP_ERROR", backendCode: "OTP_EXPIRED" },
      "1234",
    );
    assert.equal(failure.fieldError, OTP_VERIFICATION_MESSAGES.expired);
  });

  test("malformed OTP -> validation error", () => {
    const failure = resolveOtpVerificationFailure({ otpCode: "12a" });
    assert.equal(failure.fieldError, OTP_VERIFICATION_MESSAGES.invalidFormat);
  });

  test("network/backend failure -> inline error", () => {
    const failure = resolveOtpVerificationFailureFromUnknown(
      { code: "NETWORK_ERROR" },
      "1234",
    );
    assert.equal(failure.fieldError, OTP_VERIFICATION_MESSAGES.network);
  });

  test("retry after wrong OTP -> later correct OTP verifies", () => {
    let session = completeOtpVerificationFailure(
      resolveOtpVerificationFailure({ otpCode: "1111", backendCode: "OTP_INVALID" }),
    );
    assert.equal(session.fieldError, OTP_VERIFICATION_MESSAGES.incorrect);
    const retry = startOtpVerification(session);
    assert.equal(retry.accepted, true);
    session = completeOtpVerificationSuccess("new-visitor-retry-token");
    assert.equal(session.verificationToken, "new-visitor-retry-token");
    assert.equal(session.verificationMethod, "OTP_VERIFIED");
    assert.equal(session.fieldError, "");
  });

  test("wrong OTP never produces OTP Verified", () => {
    const session = completeOtpVerificationFailure(
      resolveOtpVerificationFailure({ otpCode: "0000", backendCode: "OTP_INVALID" }),
    );
    assert.notEqual(session.verificationMethod, "OTP_VERIFIED");
    assert.notEqual(session.verificationMethod, "OTP_NOT_PERFORMED");
    assert.equal(session.verificationToken, null);
  });
});

