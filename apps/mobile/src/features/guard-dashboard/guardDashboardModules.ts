import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import type { AccentTone } from "@/constants/theme";

export interface GuardDashboardAction {
  title: string;
  hint: string;
  route: Href;
  icon: keyof typeof Ionicons.glyphMap;
  accent: AccentTone;
  /** Primary operational shortcuts with stronger icon presence. */
  emphasis?: boolean;
}

export const GUARD_DASHBOARD_ACTIONS: GuardDashboardAction[] = [
  {
    title: "QR Scanner",
    hint: "Scan, import, or search recurring visitors",
    route: "/(guard)/recurring-qr",
    icon: "scan-outline",
    accent: "teal",
    emphasis: true,
  },
  {
    title: "New Visitor",
    hint: "Register a visitor check-in",
    route: "/(guard)/new-visitor",
    icon: "person-add-outline",
    accent: "blue",
    emphasis: true,
  },
  {
    title: "Group Visitor",
    hint: "Register a group visiting the same flat",
    route: "/(guard)/group-visitor",
    icon: "people-circle-outline",
    accent: "purple",
  },
  {
    title: "Visitor List",
    hint: "View currently checked-in visitors",
    route: "/(guard)/visitor-list",
    icon: "id-card-outline",
    accent: "amber",
  },
  {
    title: "Checkout",
    hint: "Check out an active visitor",
    route: "/(guard)/checkout",
    icon: "exit-outline",
    accent: "amber",
    emphasis: true,
  },
  {
    title: "Visitor History",
    hint: "View previous visitor entries",
    route: "/(guard)/visitor-history",
    icon: "hourglass-outline",
    accent: "blue",
  },
  {
    title: "Residents",
    hint: "View residents in your society",
    route: "/(guard)/residents",
    icon: "home-outline",
    accent: "green",
  },
  {
    title: "Frequent Visitors",
    hint: "View repeat visitors in your society",
    route: "/(guard)/frequent-visitors",
    icon: "repeat-outline",
    accent: "purple",
  },
  {
    title: "Emergency",
    hint: "Raise a society alert or call emergency numbers",
    route: "/(guard)/emergency",
    icon: "alert-circle-outline",
    accent: "red",
    emphasis: true,
  },
  {
    title: "Profile",
    hint: "View your guard account details",
    route: "/(guard)/profile",
    icon: "person-circle-outline",
    accent: "neutral",
  },
];
