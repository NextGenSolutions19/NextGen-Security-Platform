import type { StatusBadgeTone } from "@/components/ui/StatusBadge";

export function visitorStatusTone(status: string): StatusBadgeTone {
  return status === "checked_in" ? "success" : "danger";
}

export function visitorStatusLabel(status: string): string {
  return status === "checked_in" ? "IN" : "OUT";
}

export function recurringPassStatusTone(statusLabel: string): StatusBadgeTone {
  const normalized = statusLabel.trim().toUpperCase();
  if (normalized.includes("ACTIVE")) {
    return "success";
  }
  if (normalized.includes("SUSPEND")) {
    return "warning";
  }
  if (normalized.includes("REVOKE")) {
    return "danger";
  }
  if (normalized.includes("EXPIR")) {
    return "neutral";
  }
  return "neutral";
}

export function residentStatusTone(isArchived: boolean): StatusBadgeTone {
  return isArchived ? "neutral" : "success";
}

export function guardAccountStatusTone(isActive: boolean): StatusBadgeTone {
  return isActive ? "success" : "neutral";
}
