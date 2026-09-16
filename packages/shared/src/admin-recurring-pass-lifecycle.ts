/**
 * Admin renew / extend validity form parsing.
 *
 * Server-side Edge Function validation is duplicated in
 * supabase/functions/_shared/admin-recurring-pass-lifecycle.ts because Deno
 * cannot import this workspace package. Keep both in sync.
 */

import {
  isoDateFromIndianParts,
  parseIndianDateInput,
} from "./admin-visitor-history.ts";
import { RECURRING_PASS_VALID_UNTIL_REQUIRED_MESSAGE } from "./recurring-visitor-pass.ts";

export const RECURRING_PASS_RENEW_NOT_AFTER_CURRENT_MESSAGE =
  "New Valid Until must be later than the current Valid Until.";
export const RECURRING_PASS_RENEW_BEFORE_FROM_MESSAGE =
  "Valid Until cannot be before Valid From.";
export const RECURRING_PASS_REVOKED_RENEW_MESSAGE =
  "A revoked pass cannot have its validity extended.";
export const RECURRING_PASS_REVOKED_LIFECYCLE_MESSAGE =
  "A revoked pass cannot be changed.";

export function parseAdminRecurringPassRenewDate(
  validUntilDisplay: string,
): { ok: true; validUntil: string } | { ok: false; message: string } {
  const parsed = parseIndianDateInput(validUntilDisplay);
  if (parsed.status !== "valid") {
    return { ok: false, message: RECURRING_PASS_VALID_UNTIL_REQUIRED_MESSAGE };
  }
  return { ok: true, validUntil: isoDateFromIndianParts(parsed.parts) };
}

export function validateRecurringPassRenewalRange(input: {
  validFrom: string;
  currentValidUntil: string;
  nextValidUntil: string;
}): { ok: true } | { ok: false; message: string } {
  if (input.nextValidUntil < input.validFrom) {
    return { ok: false, message: RECURRING_PASS_RENEW_BEFORE_FROM_MESSAGE };
  }
  if (input.nextValidUntil <= input.currentValidUntil) {
    return { ok: false, message: RECURRING_PASS_RENEW_NOT_AFTER_CURRENT_MESSAGE };
  }
  return { ok: true };
}
