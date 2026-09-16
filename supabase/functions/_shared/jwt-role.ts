export type AppJwtRole = "guard" | "society_admin";

export function isAllowedAppRole(value: unknown): value is AppJwtRole {
  return value === "guard" || value === "society_admin";
}
