import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  accentColor,
  accentTint,
  cardShadow,
  colors,
  layout,
  radius,
  spacing,
  typography,
  type AccentTone,
} from "@/constants/theme";

interface ActionCardProps {
  title: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: AccentTone;
  prominent?: boolean;
  /** Stronger icon presence for primary operational shortcuts. */
  emphasis?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}

export function ActionCard({
  title,
  hint,
  icon,
  accent = "blue",
  prominent = false,
  emphasis = false,
  onPress,
  children,
}: ActionCardProps) {
  const toneColor = accentColor(accent);
  const toneTint = accentTint(accent);
  const iconSize = emphasis ? 30 : prominent ? 28 : 22;
  const iconWrapSize = emphasis ? 54 : prominent ? 52 : layout.touchTarget;

  const content = (
    <>
      <View
        style={[
          styles.iconWrap,
          prominent || emphasis ? styles.iconWrapProminent : null,
          { backgroundColor: toneTint, width: iconWrapSize, height: iconWrapSize },
        ]}
      >
        <Ionicons name={icon} size={iconSize} color={toneColor} />
      </View>
      <Text style={[styles.title, prominent ? styles.titleProminent : null]}>
        {title}
      </Text>
      {hint ? (
        <Text style={[styles.hint, prominent ? styles.hintProminent : null]}>
          {hint}
        </Text>
      ) : null}
      {children}
    </>
  );

  const cardStyle = [
    styles.card,
    prominent ? styles.cardProminent : null,
    accent === "red" ? styles.cardDangerAccent : null,
    cardShadow(),
  ];

  if (!onPress) {
    return <View style={cardStyle}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        ...cardStyle,
        pressed ? styles.pressed : null,
        Platform.OS === "web" && !pressed ? styles.webHover : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: layout.touchTarget * 2,
  },
  cardProminent: {
    padding: spacing.lg,
    gap: spacing.md,
    minHeight: 136,
  },
  cardDangerAccent: {
    borderColor: "#FECACA",
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  webHover: Platform.select({
    web: {
      transitionDuration: "150ms",
    },
    default: {},
  }) as object,
  iconWrap: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapProminent: {
    borderRadius: radius.lg,
  },
  title: {
    ...typography.subtitle,
    fontSize: 15,
  },
  titleProminent: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.navy,
  },
  hint: {
    ...typography.caption,
  },
  hintProminent: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
});
