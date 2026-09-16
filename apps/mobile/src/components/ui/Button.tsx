import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  type PressableProps,
} from "react-native";
import { colors, layout, radius, spacing, typography } from "@/constants/theme";

interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "warning" | "danger";
  style?: ViewStyle;
}

export function Button({
  label,
  loading = false,
  disabled,
  variant = "primary",
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "primary" || variant === "danger"
              ? "#FFFFFF"
              : colors.primaryBlue
          }
        />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const labelStyles = StyleSheet.create({
  primary: { color: "#FFFFFF" },
  secondary: { color: colors.primaryBlue },
  ghost: { color: colors.primaryBlue },
  warning: { color: colors.warning },
  danger: { color: "#FFFFFF" },
});

const styles = StyleSheet.create({
  base: {
    minHeight: layout.touchTarget + 4,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  primary: {
    backgroundColor: colors.primaryBlue,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  warning: {
    backgroundColor: colors.warningBackground,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    ...typography.button,
  },
});
