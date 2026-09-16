import { Pressable, StyleSheet, Text, View } from "react-native";
import { RECURRING_PASS_WEEKDAYS } from "@nextgen/shared";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface AdminRecurringPassScheduleFieldsProps {
  allowedDays: readonly number[];
  allowedEntryFromTime: string;
  allowedEntryToTime: string;
  errors: {
    allowedDaysOfWeek?: string;
    allowedEntryFromTime?: string;
    allowedEntryToTime?: string;
  };
  onToggleDay: (day: number) => void;
  onSelectAllDays: () => void;
  onChangeFromTime: (value: string) => void;
  onChangeToTime: (value: string) => void;
}

export function AdminRecurringPassScheduleFields({
  allowedDays,
  allowedEntryFromTime,
  allowedEntryToTime,
  errors,
  onToggleDay,
  onSelectAllDays,
  onChangeFromTime,
  onChangeToTime,
}: AdminRecurringPassScheduleFieldsProps) {
  const selected = new Set(allowedDays);

  return (
    <View style={styles.section}>
      <View style={styles.daysHeader}>
        <Text style={styles.sectionTitle}>Allowed Days *</Text>
        <Pressable accessibilityRole="button" onPress={onSelectAllDays}>
          <Text style={styles.selectAll}>Select All</Text>
        </Pressable>
      </View>
      <View style={styles.days}>
        {RECURRING_PASS_WEEKDAYS.map((weekday) => {
          const isSelected = selected.has(weekday.day);
          return (
            <Pressable
              key={weekday.day}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onToggleDay(weekday.day)}
              style={[styles.dayChip, isSelected ? styles.dayChipSelected : null]}
            >
              <Text
                style={[
                  styles.dayChipText,
                  isSelected ? styles.dayChipTextSelected : null,
                ]}
              >
                {weekday.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {errors.allowedDaysOfWeek ? (
        <Text style={styles.fieldError}>{errors.allowedDaysOfWeek}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>Allowed Entry Time Window</Text>
      <Text style={styles.helper}>
        Optional. Leave both blank for unrestricted time. Overnight windows are
        not allowed.
      </Text>
      <TextField
        label="Allowed Entry From"
        value={allowedEntryFromTime}
        onChangeText={onChangeFromTime}
        placeholder="HH:MM"
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        maxLength={8}
        error={errors.allowedEntryFromTime}
      />
      <TextField
        label="Allowed Entry To"
        value={allowedEntryToTime}
        onChangeText={onChangeToTime}
        placeholder="HH:MM"
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        maxLength={8}
        error={errors.allowedEntryToTime}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.subtitle,
  },
  daysHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectAll: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
  },
  days: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  dayChip: {
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  dayChipSelected: {
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
  },
  dayChipText: {
    ...typography.caption,
    fontWeight: "600",
  },
  dayChipTextSelected: {
    color: colors.accent,
  },
  helper: {
    ...typography.caption,
  },
  fieldError: {
    ...typography.caption,
    color: colors.error,
  },
});
