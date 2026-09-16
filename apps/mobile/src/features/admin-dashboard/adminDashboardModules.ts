import { Ionicons } from "@expo/vector-icons";
import type { AccentTone } from "@/constants/theme";

export interface AdminDashboardModule {
  id: string;
  label: string;
  description?: string;
  route?: string;
  enabled: boolean;
  badge?: string;
}

export const ADMIN_DASHBOARD_MODULES: AdminDashboardModule[] = [
  {
    id: "guard-management",
    label: "Guard Management",
    description: "Manage Guard accounts in your society",
    route: "/(admin)/guard-management",
    enabled: true,
  },
  {
    id: "resident-management",
    label: "Resident Management",
    description: "View residents registered in your society",
    route: "/(admin)/residents",
    enabled: true,
  },
  {
    id: "excel-import",
    label: "Excel Import",
    description: "Preview an Excel workbook before import",
    route: "/(admin)/excel-import",
    enabled: true,
  },
  {
    id: "visitor-history",
    label: "Visitor History",
    description: "View visitor records for your society",
    route: "/(admin)/visitor-history",
    enabled: true,
  },
  {
    id: "recurring-visitor-passes",
    label: "Recurring Visitor Passes",
    description: "Manage recurring staff and QR access",
    route: "/(admin)/recurring-passes",
    enabled: true,
  },
  {
    id: "security-policies",
    label: "Security Policies",
    description: "Visitor OTP and resident selection rules for your society",
    route: "/(admin)/security-policies",
    enabled: true,
  },
  {
    id: "society-information",
    label: "Society Information",
    description: "View and update your society details",
    route: "/(admin)/society-information",
    enabled: true,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Emergency alerts for your society",
    route: "/(admin)/notifications",
    enabled: true,
  },
  {
    id: "reports",
    label: "Reports",
    description: "Same-society visitor reports and CSV export",
    route: "/(admin)/reports",
    enabled: true,
  },
  {
    id: "admin-profile",
    label: "Admin Profile",
    description: "View your admin account and change your password",
    route: "/(admin)/admin-profile",
    enabled: true,
  },
  {
    id: "admin-account-management",
    label: "Admin Account Management",
    description: "Manage admin accounts in your society",
    route: "/(admin)/admin-account-management",
    enabled: true,
  },
  {
    id: "emergency-monitoring",
    label: "Emergency Monitoring",
    description: "View, acknowledge, and resolve society emergencies",
    route: "/(admin)/emergency-monitoring",
    enabled: true,
  },
];

export function isAdminDashboardModuleActive(
  module: AdminDashboardModule,
): module is AdminDashboardModule & { route: string } {
  return Boolean(module.enabled && module.route);
}

export function pushAdminRoute(
  router: { push: (href: string) => unknown },
  route: string,
): void {
  router.push(route);
}

export function replaceAdminDashboard(router: {
  replace: (href: string) => unknown;
}): void {
  router.replace("/(admin)/dashboard");
}

export function adminModuleIcon(
  moduleId: string,
): keyof typeof Ionicons.glyphMap {
  switch (moduleId) {
    case "guard-management":
      return "shield-half-outline";
    case "resident-management":
      return "people-circle-outline";
    case "excel-import":
      return "cloud-upload-outline";
    case "visitor-history":
      return "hourglass-outline";
    case "recurring-visitor-passes":
      return "scan-circle-outline";
    case "security-policies":
      return "shield-checkmark-outline";
    case "society-information":
      return "business-outline";
    case "notifications":
      return "notifications-outline";
    case "reports":
      return "stats-chart-outline";
    case "admin-profile":
      return "person-circle-outline";
    case "admin-account-management":
      return "key-outline";
    case "emergency-monitoring":
      return "alert-circle-outline";
    default:
      return "ellipse-outline";
  }
}

export function adminModuleAccent(moduleId: string): AccentTone {
  switch (moduleId) {
    case "guard-management":
      return "blue";
    case "resident-management":
      return "purple";
    case "excel-import":
      return "green";
    case "visitor-history":
      return "amber";
    case "recurring-visitor-passes":
      return "teal";
    case "security-policies":
      return "red";
    case "society-information":
      return "cyan";
    case "notifications":
      return "amber";
    case "reports":
      return "purple";
    case "admin-profile":
      return "teal";
    case "admin-account-management":
      return "neutral";
    case "emergency-monitoring":
      return "red";
    default:
      return "neutral";
  }
}
