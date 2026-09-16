/**
 * Admin Create Recurring Pass form parsing.
 *
 * Server-side Edge Function validation is duplicated in
 * supabase/functions/_shared/admin-recurring-pass.ts because Deno cannot import
 * this workspace package. Keep both in sync.
 */

import {
  INDIAN_MOBILE_VALIDATION_MESSAGE,
  isValidIndianMobileNumber,
  normalizeIndianMobileNumber,
} from "./admin-resident-directory.ts";
import {
  isoDateFromIndianParts,
  parseIndianDateInput,
} from "./admin-visitor-history.ts";
import { parseVisitorDestinationInput } from "./visitor-destination.ts";
import { parseRequiredVisitorName } from "./visitor-name.ts";
import {
  RECURRING_PASS_PHOTO_REQUIRED_MESSAGE,
  RECURRING_PASS_VALID_FROM_REQUIRED_MESSAGE,
  RECURRING_PASS_VALID_UNTIL_REQUIRED_MESSAGE,
  normalizeAllowedDaysOfWeek,
  parseOptionalRecurringPassNotes,
  parseOptionalRecurringPassVehicle,
  parseRecurringPassTimeWindow,
  parseRecurringPassValidityRange,
  resolvePersistedRecurringVisitorType,
  type RecurringVisitorTypeCode,
} from "./recurring-visitor-pass.ts";

export interface AdminCreateRecurringPassFormInput {
  visitorName: string;
  visitorMobile: string;
  visitorTypeCode: RecurringVisitorTypeCode | null;
  customVisitorType: string;
  flatId: string | null;
  residentId: string | null;
  destinationText: string | null;
  vehicleNumber: string;
  validFromDisplay: string;
  validUntilDisplay: string;
  allowedDaysOfWeek: readonly number[];
  allowedEntryFromTime: string;
  allowedEntryToTime: string;
  notes: string;
  hasPhoto: boolean;
}

export type AdminCreateRecurringPassFormField =
  | "visitorName"
  | "visitorMobile"
  | "visitorTypeCode"
  | "customVisitorType"
  | "flatId"
  | "destinationText"
  | "residentId"
  | "vehicleNumber"
  | "validFrom"
  | "validUntil"
  | "allowedDaysOfWeek"
  | "allowedEntryFromTime"
  | "allowedEntryToTime"
  | "notes"
  | "photo";

export type AdminCreateRecurringPassFormErrors = Partial<
  Record<AdminCreateRecurringPassFormField, string>
>;

export interface AdminCreateRecurringPassPayload {
  visitorName: string;
  visitorMobile: string;
  visitorTypeCode: RecurringVisitorTypeCode;
  visitorTypeLabel: string;
  flatId: string | null;
  residentId: string | null;
  destinationText: string | null;
  vehicleNumber: string | null;
  validFrom: string;
  validUntil: string;
  allowedDaysOfWeek: number[];
  allowedEntryFromTime: string | null;
  allowedEntryToTime: string | null;
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

export function parseAdminCreateRecurringPassForm(
  input: AdminCreateRecurringPassFormInput,
):
  | { ok: true; value: AdminCreateRecurringPassPayload }
  | { ok: false; errors: AdminCreateRecurringPassFormErrors } {
  const errors: AdminCreateRecurringPassFormErrors = {};

  const name = parseRequiredVisitorName(input.visitorName);
  if (!name.ok) {
    errors.visitorName = name.message;
  }

  const visitorMobile = normalizeIndianMobileNumber(input.visitorMobile);
  if (!isValidIndianMobileNumber(visitorMobile)) {
    errors.visitorMobile = INDIAN_MOBILE_VALIDATION_MESSAGE;
  }

  const visitorType = resolvePersistedRecurringVisitorType({
    code: input.visitorTypeCode,
    customLabel: input.customVisitorType,
  });
  if (!visitorType.ok) {
    errors[visitorType.field] = visitorType.message;
  }

  const destination = parseVisitorDestinationInput({
    flatId: input.flatId,
    destinationText: input.destinationText,
    residentId: input.residentId,
  });
  if (!destination.ok) {
    errors[destination.field] = destination.message;
  }

  const vehicle = parseOptionalRecurringPassVehicle(input.vehicleNumber);
  if (!vehicle.ok) {
    errors.vehicleNumber = vehicle.message;
  }

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

  const notes = parseOptionalRecurringPassNotes(input.notes);
  if (!notes.ok) {
    errors.notes = notes.message;
  }

  if (!input.hasPhoto) {
    errors.photo = RECURRING_PASS_PHOTO_REQUIRED_MESSAGE;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (
    !name.ok ||
    !visitorType.ok ||
    !destination.ok ||
    !vehicle.ok ||
    !validFrom.ok ||
    !validUntil.ok ||
    !days.ok ||
    !timeWindow.ok ||
    !notes.ok
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      visitorName: name.visitorName,
      visitorMobile,
      visitorTypeCode: visitorType.code,
      visitorTypeLabel: visitorType.label,
      flatId: destination.flatId,
      residentId: destination.residentId,
      destinationText: destination.destinationText,
      vehicleNumber: vehicle.vehicleNumber,
      validFrom: validFrom.isoDate,
      validUntil: validUntil.isoDate,
      allowedDaysOfWeek: days.days,
      allowedEntryFromTime: timeWindow.from,
      allowedEntryToTime: timeWindow.to,
      notes: notes.notes,
    },
  };
}
