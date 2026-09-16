import { StyleSheet, Text, View } from "react-native";
import { colors, typography } from "@/constants/theme";

interface RecurringPassPhotoPlaceholderProps {
  visitorName: string;
  size?: "compact" | "detail";
}

function visitorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return `${first}${last}`.toUpperCase();
}

export function RecurringPassPhotoPlaceholder({
  visitorName,
  size = "compact",
}: RecurringPassPhotoPlaceholderProps) {
  const dimension = size === "detail" ? 96 : 56;

  return (
    <View
      accessibilityLabel="Visitor photo unavailable"
      style={[
        styles.avatar,
        { width: dimension, height: dimension, borderRadius: dimension / 2 },
      ]}
    >
      <Text style={[styles.initials, size === "detail" ? styles.initialsDetail : null]}>
        {visitorInitials(visitorName)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    ...typography.body,
    fontWeight: "700",
    color: colors.accent,
  },
  initialsDetail: {
    ...typography.subtitle,
    color: colors.accent,
  },
});
