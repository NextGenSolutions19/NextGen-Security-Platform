import type { AccountStatus } from "./index";
import { formatResidentFlatLabel } from "./resident-import-foundation.ts";
import { matchesNormalizedSearch } from "./search-match.ts";
import type { VisitorEntryType } from "./visitor-entry-type";
import type {
  VisitorRegistrationMode,
  VisitorVerificationMethod,
} from "./visitor-verification";

export interface FlatSummary {
  id: string;
  flatNumber: string;
  societyId: string;
  status: AccountStatus;
  wingBuilding?: string | null;
}

export interface LinkedResident {
  id: string;
  name: string;
  mobile: string | null;
  status: AccountStatus;
}

export interface RegisterVisitorFormInput {
  flatId?: string | null;
  destinationText?: string | null;
  residentId?: string | null;
  visitorName: string;
  visitorMobile: string;
  registrationMode: VisitorRegistrationMode;
  purposeCode: string;
  purposeLabel: string;
  purposeText: string;
  customPurposeText?: string | null;
  vehicleNumber?: string | null;
  vehicleVisuallyChecked: boolean;
  photoUploadId: string;
  otpVerificationToken?: string | null;
  otpFallbackReason?: string | null;
  notes?: string | null;
  entryType?: VisitorEntryType;
  visitorCount?: number;
}

export interface VisitorEntry {
  id: string;
  societyId: string;
  flatId: string | null;
  destinationText: string | null;
  residentId: string | null;
  visitorName: string | null;
  visitorMobile: string;
  purpose: string;
  purposeCode: string;
  purposeLabel: string;
  customPurposeText: string | null;
  registrationMode: VisitorRegistrationMode;
  verificationMethod: VisitorVerificationMethod;
  vehicleNumber: string | null;
  vehicleVisuallyChecked: boolean;
  visitorPhotoUploadId: string | null;
  idType: string | null;
  idNumber: string | null;
  notes: string | null;
  otpFallbackReason?: string | null;
  entryType: VisitorEntryType;
  visitorCount: number;
  status: "checked_in" | "checked_out";
  checkInAt: string;
  checkOutAt: string | null;
  createdByAppUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtpChallengeResult {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
  devOtpCode?: string;
}

export interface OtpVerificationResult {
  verificationToken: string;
  expiresAt: string;
}

export interface PhotoUploadResult {
  photoUploadId: string;
  expiresAt: string;
}

export function formatVisitorStatus(
  status: VisitorEntry["status"],
): string {
  switch (status) {
    case "checked_in":
      return "Checked In";
    case "checked_out":
      return "Checked Out";
    default:
      return status;
  }
}

export function formatVerificationMethod(
  method: VisitorVerificationMethod,
): string {
  switch (method) {
    case "OTP_VERIFIED":
      return "OTP Verified";
    case "OTP_NOT_PERFORMED":
      return "OTP Not Performed";
    default:
      return method;
  }
}

export interface VisitorListItem extends VisitorEntry {
  flatNumber: string;
  residentName: string | null;
  wingBuilding?: string | null;
}

export function formatCheckInAt(checkInAt: string): string {
  const date = new Date(checkInAt);
  if (Number.isNaN(date.getTime())) {
    return checkInAt;
  }

  return date.toLocaleString();
}

export function formatCheckOutAt(checkOutAt: string | null): string {
  if (!checkOutAt) {
    return "—";
  }

  return formatCheckInAt(checkOutAt);
}

export function filterVisitorListItems(
  items: VisitorListItem[],
  query: string,
): VisitorListItem[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) =>
    matchesNormalizedSearch(normalizedQuery, {
      identifiers: [
        item.visitorMobile,
        item.flatNumber,
        item.vehicleNumber,
        item.destinationText,
        String(item.visitorCount),
      ],
      locations: [
        formatResidentFlatLabel(item.wingBuilding, item.flatNumber),
        item.wingBuilding,
        item.flatNumber,
        item.destinationText,
      ],
      phrases: [
        item.visitorName,
        item.purpose,
        item.purposeLabel,
        item.customPurposeText,
        item.residentName,
        item.wingBuilding,
        item.entryType,
        item.entryType === "group" ? "group visitor" : "single visitor",
      ],
    }),
  );
}

export type VisitorErrorCode =
  | "BACKEND_NOT_CONFIGURED"
  | "QUERY_FAILED"
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NETWORK_ERROR"
  | "OTP_ERROR"
  | "PHOTO_ERROR"
  | "UNKNOWN";

export class VisitorError extends Error {
  readonly code: VisitorErrorCode;
  readonly backendCode?: string;

  constructor(message: string, code: VisitorErrorCode, backendCode?: string) {
    super(message);
    this.name = "VisitorError";
    this.code = code;
    this.backendCode = backendCode;
  }
}
