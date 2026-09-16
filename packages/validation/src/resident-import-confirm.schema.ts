import {
  RESIDENT_IMPORT_CONFIRM_MAX_ROWS,
  canonicalizeResidentImportType,
  isStrictResidentImportConfirmMobile,
} from "@nextgen/shared";
import { z } from "zod";

const optionalMobile = z
  .string()
  .refine(
    (value) => value.trim() === "" || isStrictResidentImportConfirmMobile(value),
    {
      message: "Primary Mobile must contain a valid 10-digit Indian mobile number.",
    },
  );

export const residentImportConfirmRowSchema = z
  .object({
    rowNumber: z
      .number({ invalid_type_error: "Each planned import row needs a valid Excel row number." })
      .int("Each planned import row needs a valid Excel row number.")
      .gte(2, "Each planned import row needs a valid Excel row number."),
    flatNumber: z.string().trim().min(1, "Flat Number is required."),
    residentName: z.string().trim().min(1, "Resident Name is required."),
    residentType: z.string(),
    mobile: optionalMobile.optional(),
    primaryMobile: optionalMobile.optional(),
    wingBuilding: z.string().optional(),
    building: z.string().optional(),
    wing: z.string().optional(),
    additionalMobiles: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (
      row.residentType.trim() !== ""
      && canonicalizeResidentImportType(row.residentType) == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["residentType"],
        message: "Resident Type must be Owner, Tenant, Family Member, or Other.",
      });
    }
    if (
      row.mobile
      && row.primaryMobile
      && row.mobile.trim() !== ""
      && row.primaryMobile.trim() !== ""
      && row.mobile.trim() !== row.primaryMobile.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mobile"],
        message: "mobile and primaryMobile must match when both are sent.",
      });
    }
    for (const [index, extra] of (row.additionalMobiles ?? []).entries()) {
      if (extra.trim() === "") {
        continue;
      }
      if (!isStrictResidentImportConfirmMobile(extra)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["additionalMobiles", index],
          message:
            "Each additional mobile must be a valid 10-digit Indian mobile number.",
        });
      }
    }
  });

export const residentImportConfirmRequestSchema = z
  .object({
    rows: z
      .array(residentImportConfirmRowSchema)
      .max(RESIDENT_IMPORT_CONFIRM_MAX_ROWS, "Too many rows were submitted for confirmation."),
  })
  .strict();

export type ResidentImportConfirmRequestValues = z.infer<
  typeof residentImportConfirmRequestSchema
>;
