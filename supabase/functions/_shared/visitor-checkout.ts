const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CheckoutVisitorInput {
  visitor_entry_id?: unknown;
  society_id?: unknown;
  status?: unknown;
  check_out_at?: unknown;
}

export interface CheckoutValidationSuccess {
  ok: true;
  value: {
    visitorEntryId: string;
  };
}

export interface CheckoutValidationFailure {
  ok: false;
  code: string;
  message: string;
  status: number;
}

export type CheckoutValidationResult =
  | CheckoutValidationSuccess
  | CheckoutValidationFailure;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function validateCheckoutVisitorInput(
  body: CheckoutVisitorInput,
): CheckoutValidationResult {
  const forbiddenFields = ["society_id", "status", "check_out_at"] as const;

  for (const field of forbiddenFields) {
    if (field in body) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Server-derived fields must not be supplied by the client.",
        status: 400,
      };
    }
  }

  const visitorEntryId = String(body?.visitor_entry_id ?? "").trim();

  if (!visitorEntryId) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "visitor_entry_id is required.",
      status: 400,
    };
  }

  if (!isUuid(visitorEntryId)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "visitor_entry_id must be a valid UUID.",
      status: 400,
    };
  }

  return {
    ok: true,
    value: { visitorEntryId },
  };
}
