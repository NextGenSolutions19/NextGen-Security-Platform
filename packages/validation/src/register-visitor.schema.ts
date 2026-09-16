import {
  CAB_TAXI_PURPOSE_CODE,
  DEFAULT_VISITOR_COUNT,
  DEFAULT_VISITOR_ENTRY_TYPE,
  getEnabledVisitorPurposes,
  getVisitorPurposeById,
  GROUP_VISITOR_MAX_COUNT,
  GROUP_VISITOR_MIN_COUNT,
  OTHERS_PURPOSE_CODE,
  OTP_FALLBACK_REASON_MAX_LENGTH,
  VISITOR_NAME_MAX_LENGTH,
  VISITOR_NAME_REQUIRED_MESSAGE,
  VISITOR_NAME_TOO_LONG_MESSAGE,
  parseVisitorDestinationInput,
  purposeRequiresCustomText,
  purposeRequiresVehicleNumber,
  resolveVisitorPurposeLabel,
  VISITOR_ENTRY_TYPES,
  VISITOR_PURPOSE_DEFINITIONS,
  type VisitorPurposeCode,
  type VisitorPurposeDefinition,
} from "@nextgen/shared";
import { z } from "zod";

export {
  CAB_TAXI_PURPOSE_CODE,
  OTHERS_PURPOSE_CODE,
  getEnabledVisitorPurposes,
  getVisitorPurposeById,
  purposeRequiresCustomText,
  purposeRequiresVehicleNumber,
  resolveVisitorPurposeLabel,
  VISITOR_PURPOSE_DEFINITIONS,
  type VisitorPurposeCode,
  type VisitorPurposeDefinition,
};

export const INDIAN_MOBILE_NUMBER_PATTERN = /^[6-9][0-9]{9}$/;
export const INDIAN_MOBILE_VALIDATION_MESSAGE =
  "Enter a valid 10-digit Indian mobile number.";

const INDIAN_VEHICLE_NUMBER_PATTERN = /^[A-Z0-9]{4,15}$/;

const enabledPurposeCodes = getEnabledVisitorPurposes().map(
  (purpose: VisitorPurposeDefinition) => purpose.id,
) as [VisitorPurposeCode, ...VisitorPurposeCode[]];

export function normalizeIndianMobileNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    return digits.slice(2);
  }
  return digits.slice(0, 10);
}

export function isValidIndianMobileNumber(value: string): boolean {
  return INDIAN_MOBILE_NUMBER_PATTERN.test(normalizeIndianMobileNumber(value));
}

export function normalizeVehicleNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

function isValidVehicleNumber(value: string): boolean {
  const normalized = normalizeVehicleNumber(value);
  if (!normalized) {
    return false;
  }
  return INDIAN_VEHICLE_NUMBER_PATTERN.test(normalized);
}

const indianMobileSchema = z
  .string()
  .transform((value) => normalizeIndianMobileNumber(value))
  .pipe(
    z
      .string()
      .regex(INDIAN_MOBILE_NUMBER_PATTERN, INDIAN_MOBILE_VALIDATION_MESSAGE),
  );

export const registerVisitorSchema = z
  .object({
    flatId: z.string().uuid("Select a valid flat.").optional().nullable(),
    destinationText: z.string().optional().nullable(),
    residentId: z.string().uuid().optional().nullable(),
    visitorName: z
      .string({ required_error: VISITOR_NAME_REQUIRED_MESSAGE })
      .trim()
      .min(1, VISITOR_NAME_REQUIRED_MESSAGE)
      .max(VISITOR_NAME_MAX_LENGTH, VISITOR_NAME_TOO_LONG_MESSAGE),
    visitorMobile: indianMobileSchema,
    registrationMode: z.enum(["verify_with_otp", "register_without_otp"], {
      required_error: "Select a verification method.",
    }),
    purposeCode: z.enum(enabledPurposeCodes, {
      required_error: "Select a purpose.",
    }),
    customPurposeText: z.string().trim().optional(),
    vehicleNumber: z.string().trim().optional(),
    vehicleVisuallyChecked: z.boolean().optional(),
    photoUploadId: z.string().uuid("Capture a visitor photo before submitting."),
    otpVerificationToken: z.string().trim().optional(),
    otpFallbackReason: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    entryType: z.enum(VISITOR_ENTRY_TYPES).optional(),
    visitorCount: z.coerce.number().int().optional(),
  })
  .superRefine((data, context) => {
    const destination = parseVisitorDestinationInput({
      flatId: data.flatId,
      destinationText: data.destinationText,
      residentId: data.residentId,
    });
    if (!destination.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [destination.field],
        message: destination.message,
      });
    }

    const purpose = getVisitorPurposeById(data.purposeCode);
    if (!purpose || !purpose.enabled) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purposeCode"],
        message: "Select a valid purpose.",
      });
      return;
    }

    if (purposeRequiresCustomText(purpose) && !data.customPurposeText?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customPurposeText"],
        message: "Enter purpose.",
      });
    }

    const vehicleValue = data.vehicleNumber?.trim() ?? "";
    if (purposeRequiresVehicleNumber(purpose) && !vehicleValue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vehicleNumber"],
        message: "Car number is required for Cab / Taxi.",
      });
    } else if (vehicleValue && !isValidVehicleNumber(vehicleValue)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vehicleNumber"],
        message: "Enter a valid vehicle registration number.",
      });
    }

    if (purposeRequiresVehicleNumber(purpose) && !data.vehicleVisuallyChecked) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vehicleVisuallyChecked"],
        message: "Confirm the vehicle number was visually checked.",
      });
    }

    if (data.registrationMode === "verify_with_otp" && !data.otpVerificationToken?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["otpVerificationToken"],
        message: "Verify the mobile number with OTP before submitting.",
      });
    }

    if (data.registrationMode === "register_without_otp") {
      const reason = data.otpFallbackReason?.trim() ?? "";
      if (!reason) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["otpFallbackReason"],
          message: "Enter a reason for registering without OTP.",
        });
      } else if (reason.length > OTP_FALLBACK_REASON_MAX_LENGTH) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["otpFallbackReason"],
          message: `Reason must be ${OTP_FALLBACK_REASON_MAX_LENGTH} characters or fewer.`,
        });
      }
    }

    const entryType = data.entryType ?? DEFAULT_VISITOR_ENTRY_TYPE;
    if (entryType === "group") {
      const visitorCount = data.visitorCount;
      if (
        visitorCount === undefined ||
        Number.isNaN(visitorCount) ||
        visitorCount < GROUP_VISITOR_MIN_COUNT
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["visitorCount"],
          message: `Enter at least ${GROUP_VISITOR_MIN_COUNT} visitors for a group. Use New Visitor for one person.`,
        });
      } else if (visitorCount > GROUP_VISITOR_MAX_COUNT) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["visitorCount"],
          message: `Group visitor count cannot exceed ${GROUP_VISITOR_MAX_COUNT}.`,
        });
      }
    } else if (
      data.visitorCount !== undefined &&
      data.visitorCount !== DEFAULT_VISITOR_COUNT
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["visitorCount"],
        message: "Single visitor registrations must have a visitor count of 1.",
      });
    }
  })
  .transform((data) => {
    const purpose = getVisitorPurposeById(data.purposeCode)!;
    const destination = parseVisitorDestinationInput({
      flatId: data.flatId,
      destinationText: data.destinationText,
      residentId: data.residentId,
    });
    const resolvedDestination = destination.ok
      ? destination
      : { flatId: null, destinationText: null, residentId: null };
    return {
      flatId: resolvedDestination.flatId,
      destinationText: resolvedDestination.destinationText,
      residentId: resolvedDestination.residentId,
      visitorName: data.visitorName,
      visitorMobile: data.visitorMobile,
      registrationMode: data.registrationMode,
      purposeCode: purpose.id,
      purposeLabel: purpose.label,
      purposeText: resolveVisitorPurposeLabel(
        purpose,
        data.customPurposeText,
      ),
      customPurposeText: data.customPurposeText?.trim() || null,
      vehicleNumber: data.vehicleNumber?.trim()
        ? normalizeVehicleNumber(data.vehicleNumber)
        : null,
      vehicleVisuallyChecked: Boolean(data.vehicleVisuallyChecked),
      photoUploadId: data.photoUploadId,
      otpVerificationToken: data.otpVerificationToken?.trim() || null,
      otpFallbackReason:
        data.registrationMode === "register_without_otp"
          ? data.otpFallbackReason?.trim() || null
          : null,
      notes: data.notes?.trim() ? data.notes.trim() : null,
      entryType: data.entryType ?? DEFAULT_VISITOR_ENTRY_TYPE,
      visitorCount:
        (data.entryType ?? DEFAULT_VISITOR_ENTRY_TYPE) === "group"
          ? data.visitorCount ?? GROUP_VISITOR_MIN_COUNT
          : DEFAULT_VISITOR_COUNT,
    };
  });

export type RegisterVisitorFormValues = z.input<typeof registerVisitorSchema>;
export type RegisterVisitorSubmitValues = z.output<typeof registerVisitorSchema>;
