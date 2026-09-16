import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  accentColor,
  accentTint,
  colors,
  layout,
  radius,
  spacing,
  typography,
  type AccentTone,
} from "@/constants/theme";

interface AdminModuleCardProps {
  title: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: AccentTone;
  badge?: string;
  onPress?: () => void;
}

export function AdminModuleCard({
  title,
  description,
  icon,
  accent = "blue",
  badge,
  onPress,
}: AdminModuleCardProps) {
  const toneColor = accentColor(accent);
  const toneTint = accentTint(accent);

  const content = (
    <>
      <View style={[styles.iconWrap, { backgroundColor: toneTint }]}>
        <Ionicons name={icon} size={24} color={toneColor} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.card, styles.cardDisabled]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: layout.touchTarget + 12,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.92,
    backgroundColor: colors.background,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    fontSize: 15,
    color: colors.navy,
  },
  description: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    ...typography.caption,
    color: colors.primaryBlue,
    fontWeight: "600",
  },
});
