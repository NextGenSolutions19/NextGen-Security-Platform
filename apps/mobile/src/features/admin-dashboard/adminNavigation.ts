import { Ionicons } from "@expo/vector-icons";
import {
  ADMIN_DASHBOARD_MODULES,
  adminModuleIcon,
} from "@/features/admin-dashboard/adminDashboardModules";

export interface AdminNavItem {
  id: string;
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  description?: string;
}

export const ADMIN_DASHBOARD_NAV: AdminNavItem = {
  id: "dashboard",
  label: "Dashboard",
  route: "/(admin)/dashboard",
  icon: "apps-outline",
  description: "Control center overview",
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  ADMIN_DASHBOARD_NAV,
  ...ADMIN_DASHBOARD_MODULES.filter((module) => module.enabled && module.route).map(
    (module) => ({
      id: module.id,
      label: module.label,
      route: module.route!,
      icon: adminModuleIcon(module.id),
      description: module.description,
    }),
  ),
];

export function normalizeAdminPath(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/dashboard";
}

export function isAdminNavItemActive(pathname: string, route: string): boolean {
  const current = normalizeAdminPath(pathname);
  const target = route.replace("/(admin)", "") || "/dashboard";
  if (target === "/dashboard") {
    return current === "/dashboard" || current.endsWith("/dashboard");
  }
  return current === target || current.startsWith(`${target}/`);
}

export function getAdminNavItemLabel(pathname: string): string {
  const match = ADMIN_NAV_ITEMS.find((item) =>
    isAdminNavItemActive(pathname, item.route),
  );
  return match?.label ?? "Admin";
}
