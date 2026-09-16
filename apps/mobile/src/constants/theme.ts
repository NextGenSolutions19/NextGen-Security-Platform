import { Platform } from "react-native";

export const colors = {
  navy: "#0B1F3A",
  primaryBlue: "#2563EB",
  teal: "#14B8A6",
  lightBlue: "#EAF4FF",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#0F172A",
  textSecondary: "#64748B",
  border: "#B8C4D4",
  success: "#16A34A",
  successBackground: "#F0FDF4",
  warning: "#F59E0B",
  warningBackground: "#FFFBEB",
  danger: "#DC2626",
  errorBackground: "#FEF2F2",
  disabled: "#94A3B8",
  slate: "#64748B",
  overlay: "rgba(15, 23, 42, 0.45)",
  /** Branding / headings */
  primary: "#0B1F3A",
  primaryDark: "#071528",
  /** Primary actions */
  accent: "#2563EB",
  /** Errors / emergency */
  error: "#DC2626",
  selectedTint: "#EAF4FF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const layout = {
  authMaxWidth: 440,
  formMaxWidth: 560,
  contentMaxWidth: 1080,
  touchTarget: 44,
} as const;

export const typography = {
  brandTitle: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: colors.navy,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: colors.text,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: colors.text,
  },
  body: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: colors.text,
  },
  button: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
};

export function cardShadow() {
  return Platform.select({
    web: {
      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
    },
    default: {
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 2,
    },
  });
}

export type AccentTone =
  | "blue"
  | "teal"
  | "amber"
  | "red"
  | "neutral"
  | "purple"
  | "green"
  | "cyan";

export function accentColor(tone: AccentTone): string {
  switch (tone) {
    case "teal":
      return colors.teal;
    case "amber":
      return colors.warning;
    case "red":
      return colors.danger;
    case "neutral":
      return colors.textSecondary;
    case "purple":
      return "#7C3AED";
    case "green":
      return colors.success;
    case "cyan":
      return "#0891B2";
    default:
      return colors.primaryBlue;
  }
}

export function accentTint(tone: AccentTone): string {
  switch (tone) {
    case "teal":
      return "#ECFDF9";
    case "amber":
      return colors.warningBackground;
    case "red":
      return colors.errorBackground;
    case "neutral":
      return colors.background;
    case "purple":
      return "#F5F3FF";
    case "green":
      return colors.successBackground;
    case "cyan":
      return "#ECFEFF";
    default:
      return colors.lightBlue;
  }
}
