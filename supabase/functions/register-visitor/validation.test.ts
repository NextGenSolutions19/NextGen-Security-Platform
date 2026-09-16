import {
  validateRegisterVisitorInput,
} from "../_shared/visitor-registration.ts";

const flatId = "33333333-3333-4333-a333-333333333301";
const photoUploadId = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    flat_id: flatId,
    visitor_name: "Asha Mehta",
    visitor_mobile: "8465123135",
    registration_mode: "register_without_otp",
    purpose_code: "guest",
    photo_upload_id: photoUploadId,
    otp_fallback_reason: "Phone has no network",
    ...overrides,
  };
}

Deno.test("rejects invalid indian mobile", () => {
  const result = validateRegisterVisitorInput(
    validPayload({ visitor_mobile: "5123456789" }),
  );
  assert(!result.ok, "expected failure");
});

Deno.test("accepts valid indian mobile starting with 8", () => {
  const result = validateRegisterVisitorInput(validPayload());
  assert(result.ok, "expected success");
});

Deno.test("requires otp token for verify_with_otp mode", () => {
  const result = validateRegisterVisitorInput(
    validPayload({
      registration_mode: "verify_with_otp",
      otp_fallback_reason: undefined,
    }),
  );
  assert(!result.ok, "expected failure");
});

Deno.test("requires vehicle for cab_taxi purpose", () => {
  const result = validateRegisterVisitorInput(
    validPayload({ purpose_code: "cab_taxi" }),
  );
  assert(!result.ok, "expected failure");
});

Deno.test("requires custom purpose text for others", () => {
  const result = validateRegisterVisitorInput(
    validPayload({ purpose_code: "others" }),
  );
  assert(!result.ok, "expected failure");
});

Deno.test("accepts valid no-otp payload", () => {
  const result = validateRegisterVisitorInput(validPayload());
  assert(result.ok, "expected success");
  if (result.ok) {
    assert(result.value.purposeCode === "guest", "purpose code mismatch");
    assert(result.value.visitorMobile === "8465123135", "mobile mismatch");
    assert(result.value.visitorName === "Asha Mehta", "visitor name mismatch");
  }
});

Deno.test("rejects client-supplied verification_method", () => {
  const result = validateRegisterVisitorInput(
    validPayload({ verification_method: "OTP_VERIFIED" }),
  );
  assert(!result.ok, "expected failure");
});

Deno.test("requires a fallback reason for Register without OTP", () => {
  const result = validateRegisterVisitorInput(
    validPayload({ otp_fallback_reason: undefined }),
  );
  assert(!result.ok, "expected fallback reason");
});

Deno.test("requires visitor full name and trims surrounding whitespace", () => {
  assert(!validateRegisterVisitorInput(validPayload({ visitor_name: "" })).ok);
  assert(!validateRegisterVisitorInput(validPayload({ visitor_name: "   " })).ok);
  assert(
    !validateRegisterVisitorInput(
      validPayload({ visitor_name: `${"A".repeat(81)}` }),
    ).ok,
  );

  const trimmed = validateRegisterVisitorInput(
    validPayload({ visitor_name: "  Asha Mehta  " }),
  );
  assert(trimmed.ok, "trimmed name should pass");
  if (trimmed.ok) {
    assert(trimmed.value.visitorName === "Asha Mehta", "name should be trimmed");
  }

  const unicode = validateRegisterVisitorInput(
    validPayload({ visitor_name: "José O'Neill-Patel" }),
  );
  assert(unicode.ok, "punctuation/unicode names should pass");

  const group = validateRegisterVisitorInput(
    validPayload({
      visitor_name: "Ravi Shah",
      entry_type: "group",
      visitor_count: 4,
    }),
  );
  assert(group.ok, "group leader name should pass");
  if (group.ok) {
    assert(group.value.visitorName === "Ravi Shah", "leader name kept");
    assert(group.value.visitorCount === 4, "group count unchanged");
    assert(group.value.entryType === "group", "entry type unchanged");
  }
});

Deno.test("accepts Other destination without a flat", () => {
  const result = validateRegisterVisitorInput(
    validPayload({
      flat_id: undefined,
      destination_text: "  Clubhouse  ",
    }),
  );
  assert(result.ok, "other destination should pass");
  if (result.ok) {
    assert(result.value.flatId === null, "flat must be null");
    assert(result.value.destinationText === "Clubhouse", "destination trimmed");
    assert(result.value.residentId === null, "resident must be null");
  }
});

Deno.test("rejects neither destination, both destinations, blank Other, and Other+resident", () => {
  assert(
    !validateRegisterVisitorInput(validPayload({ flat_id: undefined })).ok,
    "neither must fail",
  );
  assert(
    !validateRegisterVisitorInput(
      validPayload({ destination_text: "Clubhouse" }),
    ).ok,
    "both must fail",
  );
  assert(
    !validateRegisterVisitorInput(
      validPayload({ flat_id: undefined, destination_text: "   " }),
    ).ok,
    "whitespace other must fail",
  );
  assert(
    !validateRegisterVisitorInput(
      validPayload({
        flat_id: undefined,
        destination_text: "A".repeat(81),
      }),
    ).ok,
    "overlong other must fail",
  );
  assert(
    !validateRegisterVisitorInput(
      validPayload({
        flat_id: undefined,
        destination_text: "Clubhouse",
        resident_id: "44444444-4444-4444-a444-444444444401",
      }),
    ).ok,
    "other plus resident must fail",
  );
});

Deno.test("Cab/Taxi still requires a destination", () => {
  const missing = validateRegisterVisitorInput(
    validPayload({
      purpose_code: "cab_taxi",
      vehicle_number: "GJ01AB1234",
      vehicle_visually_checked: true,
      flat_id: undefined,
    }),
  );
  assert(!missing.ok, "cab/taxi without destination must fail");

  const other = validateRegisterVisitorInput(
    validPayload({
      purpose_code: "cab_taxi",
      vehicle_number: "GJ01AB1234",
      vehicle_visually_checked: true,
      flat_id: undefined,
      destination_text: "Society Gate",
    }),
  );
  assert(other.ok, "cab/taxi with other destination should pass");
});

Deno.test("Group Visitor accepts Other destination", () => {
  const result = validateRegisterVisitorInput(
    validPayload({
      flat_id: undefined,
      destination_text: "Terrace",
      entry_type: "group",
      visitor_count: 3,
    }),
  );
  assert(result.ok, "group other destination should pass");
});

