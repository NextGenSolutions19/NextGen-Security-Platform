import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, layout, radius, spacing, typography } from "@/constants/theme";

interface PasswordFieldProps extends Omit<TextInputProps, "secureTextEntry"> {
  label: string;
  error?: string;
}

/**
 * Password input with per-field show/hide toggle.
 * Visibility is local UI state only — never fetches or reveals stored credentials.
 */
export function PasswordField({
  label,
  error,
  style,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused && !error ? styles.inputRowFocused : null,
          error ? styles.inputRowError : null,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, style]}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          {...props}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          accessibilityState={{ selected: visible }}
          hitSlop={8}
          onPress={() => setVisible((current) => !current)}
          style={({ pressed }) => [
            styles.toggle,
            pressed ? styles.togglePressed : null,
          ]}
        >
          <Ionicons
            name={visible ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
  },
  inputRow: {
    minHeight: layout.touchTarget + 4,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingRight: spacing.xs,
    overflow: "hidden",
  },
  inputRowFocused: {
    borderColor: colors.primaryBlue,
  },
  inputRowError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    minHeight: layout.touchTarget + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    color: colors.text,
    fontSize: 15,
    borderWidth: 0,
    backgroundColor: "transparent",
    ...Platform.select({
      web: {
        outlineStyle: "none",
        outlineWidth: 0,
      },
      default: {},
    }),
  },
  toggle: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  togglePressed: {
    opacity: 0.7,
  },
  error: {
    color: colors.error,
    fontSize: 13,
  },
});
