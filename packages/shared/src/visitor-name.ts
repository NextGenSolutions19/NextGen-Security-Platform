export const VISITOR_NAME_MAX_LENGTH = 80;
export const VISITOR_NAME_REQUIRED_MESSAGE = "Enter the visitor's full name.";
export const VISITOR_NAME_TOO_LONG_MESSAGE =
  `Full name must be ${VISITOR_NAME_MAX_LENGTH} characters or fewer.`;

export function normalizeVisitorName(value: string): string {
  return value.trim();
}

export function readStoredVisitorName(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeVisitorName(value ?? "");
  return normalized ? normalized : null;
}

export function resolveVisitorPrimaryIdentifier(item: {
  visitorName?: string | null;
  visitorMobile: string;
}): string {
  return readStoredVisitorName(item.visitorName) ?? item.visitorMobile;
}

export function parseRequiredVisitorName(
  value: unknown,
):
  | { ok: true; visitorName: string }
  | { ok: false; message: string } {
  const visitorName = normalizeVisitorName(String(value ?? ""));
  if (!visitorName) {
    return { ok: false, message: VISITOR_NAME_REQUIRED_MESSAGE };
  }
  if (visitorName.length > VISITOR_NAME_MAX_LENGTH) {
    return { ok: false, message: VISITOR_NAME_TOO_LONG_MESSAGE };
  }
  return { ok: true, visitorName };
}
