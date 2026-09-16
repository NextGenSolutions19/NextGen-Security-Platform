/**
 * Admin edit of recurring-pass validity and access schedule.
 *
 * Server-side Edge Function validation is duplicated in
 * supabase/functions/_shared/admin-recurring-pass.ts because Deno cannot import
 * this workspace package. Keep both in sync.
 */

import {
  isoDateFromIndianParts,
  parseIndianDateInput,
} from "./admin-visitor-history.ts";
import {
  formatRecurringPassCalendarDate,
  formatRecurringPassClockTime,
} from "./admin-recurring-visitor-passes.ts";
import {
  RECURRING_PASS_VALID_FROM_REQUIRED_MESSAGE,
  RECURRING_PASS_VALID_UNTIL_REQUIRED_MESSAGE,
  normalizeAllowedDaysOfWeek,
  parseOptionalRecurringPassNotes,
  parseOptionalRecurringPassVehicle,
  parseRecurringPassTimeWindow,
  parseRecurringPassValidityRange,
} from "./recurring-visitor-pass.ts";

export const RECURRING_PASS_REVOKED_EDIT_MESSAGE =
  "A revoked pass cannot have its access schedule edited.";

export interface AdminRecurringPassScheduleFormInput {
  validFromDisplay: string;
  validUntilDisplay: string;
  allowedDaysOfWeek: readonly number[];
  allowedEntryFromTime: string;
  allowedEntryToTime: string;
  vehicleNumber: string;
  notes: string;
}

export type AdminRecurringPassScheduleFormField =
  | "validFrom"
  | "validUntil"
  | "allowedDaysOfWeek"
  | "allowedEntryFromTime"
  | "allowedEntryToTime"
  | "vehicleNumber"
  | "notes";

export type AdminRecurringPassScheduleFormErrors = Partial<
  Record<AdminRecurringPassScheduleFormField, string>
>;

export interface AdminRecurringPassSchedulePayload {
  validFrom: string;
  validUntil: string;
  allowedDaysOfWeek: number[];
  allowedEntryFromTime: string | null;
  allowedEntryToTime: string | null;
  vehicleNumber: string | null;
  notes: string | null;
}

function displayDateToIso(
  value: string,
  requiredMessage: string,
): { ok: true; isoDate: string } | { ok: false; message: string } {
  const parsed = parseIndianDateInput(value);
  if (parsed.status !== "valid") {
    return { ok: false, message: requiredMessage };
  }
  return { ok: true, isoDate: isoDateFromIndianParts(parsed.parts) };
}

export function recurringPassScheduleFormDefaults(item: {
  validFrom: string;
  validUntil: string;
  allowedDaysOfWeek: readonly number[];
  allowedEntryFromTime: string | null;
  allowedEntryToTime: string | null;
  vehicleNumber: string | null;
  notes: string | null;
}): AdminRecurringPassScheduleFormInput {
  return {
    validFromDisplay: formatRecurringPassCalendarDate(item.validFrom),
    validUntilDisplay: formatRecurringPassCalendarDate(item.validUntil),
    allowedDaysOfWeek: [...item.allowedDaysOfWeek],
    allowedEntryFromTime: item.allowedEntryFromTime
      ? formatRecurringPassClockTime(item.allowedEntryFromTime)
      : "",
    allowedEntryToTime: item.allowedEntryToTime
      ? formatRecurringPassClockTime(item.allowedEntryToTime)
      : "",
    vehicleNumber: item.vehicleNumber ?? "",
    notes: item.notes ?? "",
  };
}

export function parseAdminRecurringPassScheduleForm(
  input: AdminRecurringPassScheduleFormInput,
):
  | { ok: true; value: AdminRecurringPassSchedulePayload }
  | { ok: false; errors: AdminRecurringPassScheduleFormErrors } {
  const errors: AdminRecurringPassScheduleFormErrors = {};

  const validFrom = displayDateToIso(
    input.validFromDisplay,
    RECURRING_PASS_VALID_FROM_REQUIRED_MESSAGE,
  );
  const validUntil = displayDateToIso(
    input.validUntilDisplay,
    RECURRING_PASS_VALID_UNTIL_REQUIRED_MESSAGE,
  );
  if (!validFrom.ok) {
    errors.validFrom = validFrom.message;
  }
  if (!validUntil.ok) {
    errors.validUntil = validUntil.message;
  }
  if (validFrom.ok && validUntil.ok) {
    const range = parseRecurringPassValidityRange({
      validFrom: validFrom.isoDate,
      validUntil: validUntil.isoDate,
    });
    if (!range.ok) {
      errors[range.field] = range.message;
    }
  }

  const days = normalizeAllowedDaysOfWeek(input.allowedDaysOfWeek);
  if (!days.ok) {
    errors.allowedDaysOfWeek = days.message;
  }

  const timeWindow = parseRecurringPassTimeWindow({
    from: input.allowedEntryFromTime,
    to: input.allowedEntryToTime,
  });
  if (!timeWindow.ok) {
    errors[timeWindow.field] = timeWindow.message;
  }

  const vehicle = parseOptionalRecurringPassVehicle(input.vehicleNumber);
  if (!vehicle.ok) {
    errors.vehicleNumber = vehicle.message;
  }

  const notes = parseOptionalRecurringPassNotes(input.notes);
  if (!notes.ok) {
    errors.notes = notes.message;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (!validFrom.ok || !validUntil.ok || !days.ok || !timeWindow.ok || !vehicle.ok || !notes.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      validFrom: validFrom.isoDate,
      validUntil: validUntil.isoDate,
      allowedDaysOfWeek: days.days,
      allowedEntryFromTime: timeWindow.from,
      allowedEntryToTime: timeWindow.to,
      vehicleNumber: vehicle.vehicleNumber,
      notes: notes.notes,
    },
  };
}
