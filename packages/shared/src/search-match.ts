/**
 * Field-aware search matching for flats, names, and mobiles.
 * Display strings are never rewritten; this is comparison-only.
 */

export function compactSearchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function tokenizeSearchValue(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export interface SearchFieldGroups {
  /** Flat numbers, mobiles, vehicle numbers. */
  identifiers?: Array<string | null | undefined>;
  /** Combined wing/flat labels such as "B · 201". */
  locations?: Array<string | null | undefined>;
  /** Names, purposes, and other phrase fields. */
  phrases?: Array<string | null | undefined>;
}

function isShortAlphaQuery(tokens: string[]): boolean {
  return (
    tokens.length === 1 &&
    tokens[0] !== undefined &&
    tokens[0].length === 1 &&
    !/\d/.test(tokens[0])
  );
}

export function matchesNormalizedSearch(
  query: string,
  fields: SearchFieldGroups,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const compactQuery = compactSearchValue(normalizedQuery);
  const queryTokens = tokenizeSearchValue(normalizedQuery);
  const shortAlpha = isShortAlphaQuery(queryTokens);
  const identifiers = fields.identifiers ?? [];
  const locations = fields.locations ?? [];
  const phrases = fields.phrases ?? [];

  if (compactQuery && !shortAlpha) {
    for (const value of [...identifiers, ...locations]) {
      if (compactSearchValue(value ?? "").includes(compactQuery)) {
        return true;
      }
    }

    for (const value of [...phrases, ...locations]) {
      if ((value ?? "").toLowerCase().includes(normalizedQuery)) {
        return true;
      }
    }
  }

  if (shortAlpha) {
    const token = queryTokens[0] ?? "";
    for (const value of [...locations, ...phrases, ...identifiers]) {
      if (tokenizeSearchValue(value ?? "").includes(token)) {
        return true;
      }
    }
  }

  return false;
}
