import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface SelectFieldProps<T extends string> {
  label: string;
  value: T | null;
  options: readonly T[];
  placeholder?: string;
  error?: string;
  getOptionLabel?: (value: T) => string;
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  placeholder = "Select an option",
  error,
  getOptionLabel,
  onChange,
}: SelectFieldProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const labelFor = (option: T) => getOptionLabel?.(option) ?? option;

  return (
    <View style={[styles.container, isOpen ? styles.open : null]}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((current) => !current)}
        style={[styles.trigger, error ? styles.triggerError : null]}
      >
        <Text
          style={value ? styles.triggerValue : styles.triggerPlaceholder}
        >
          {value ? labelFor(value) : placeholder}
        </Text>
        <Text style={styles.triggerIcon}>{isOpen ? "▲" : "▼"}</Text>
      </Pressable>

      {isOpen ? (
        <View style={styles.menu}>
          {options.map((option) => {
            const isSelected = value === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                style={[
                  styles.option,
                  isSelected ? styles.optionSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected ? styles.optionTextSelected : null,
                  ]}
                >
                  {labelFor(option)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  open: {
    zIndex: 20,
    elevation: 20,
  },
  label: {
    ...typography.label,
  },
  trigger: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  triggerError: {
    borderColor: colors.error,
  },
  triggerValue: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  triggerPlaceholder: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 15,
  },
  triggerIcon: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  menu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionSelected: {
    backgroundColor: colors.selectedTint,
  },
  optionText: {
    ...typography.body,
  },
  optionTextSelected: {
    color: colors.accent,
    fontWeight: "600",
  },
  error: {
    color: colors.error,
    fontSize: 13,
  },
});
