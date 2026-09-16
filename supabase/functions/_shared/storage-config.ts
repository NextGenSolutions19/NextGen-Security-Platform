/**
 * Visitor photo storage configuration.
 * Keep bucket id in sync with supabase/migrations/*visitor*storage*.sql.
 */
export const VISITOR_PHOTO_BUCKET = "visitor-photos" as const;

export const VISITOR_PHOTO_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const VISITOR_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const VISITOR_PHOTO_ALLOWED_MIME_TYPE_SET = new Set<string>(
  VISITOR_PHOTO_ALLOWED_MIME_TYPES,
);

export function normalizeVisitorPhotoContentType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

export function detectVisitorPhotoContentType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.byteLength < 12) {
    return null;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  const header = String.fromCharCode(
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[8],
    bytes[9],
    bytes[10],
    bytes[11],
  );
  if (header.startsWith("RIFF") && header.endsWith("WEBP")) {
    return "image/webp";
  }
  return null;
}

export function isSafeSocietyStoragePath(
  path: string,
  societyId: string,
): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed !== path) {
    return false;
  }
  if (
    trimmed.includes("..") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0") ||
    trimmed.startsWith("/") ||
    trimmed.includes("//")
  ) {
    return false;
  }
  const prefix = `${societyId}/`;
  return trimmed.startsWith(prefix) && trimmed.length > prefix.length;
}
