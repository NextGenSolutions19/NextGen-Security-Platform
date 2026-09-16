import type { GuardRecurringEntrySource } from "@nextgen/shared";

export interface GuardRecurringPassPreview {
  passId: string;
  visitorName: string;
  visitorMobile: string;
  visitorType: string;
  destination: string;
  vehicleNumber: string | null;
  validFrom: string;
  validUntil: string;
  allowedDays: string;
  allowedTime: string;
  photoSignedUrl: string | null;
  photoExpiresAt: string | null;
}

export interface PendingRecurringCheckin {
  source: GuardRecurringEntrySource;
  token: string | null;
  passId: string | null;
  preview: GuardRecurringPassPreview;
}

let pending: PendingRecurringCheckin | null = null;

export function rememberPendingRecurringCheckin(
  value: PendingRecurringCheckin,
): void {
  pending = value;
}

export function peekPendingRecurringCheckin(): PendingRecurringCheckin | null {
  return pending;
}

export function clearPendingRecurringCheckin(): void {
  pending = null;
}
