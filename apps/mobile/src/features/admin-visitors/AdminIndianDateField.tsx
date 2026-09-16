import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  INDIAN_CALENDAR_MONTH_LABELS,
  INDIAN_DATE_PLACEHOLDER,
  applyAdminCalendarMonth,
  applyAdminCalendarYear,
  buildAdminCalendarYearOptions,
  canonicalizeIndianDateInput,
  formatAdminCalendarMonthLabel,
  formatIndianDate,
  getIstCalendarParts,
  parseIndianDateInput,
  shiftAdminCalendarMonth,
  type IndianDateParts,
} from "@nextgen/shared";
import { Button } from "@/components/ui/Button";
import { colors, radius, spacing, typography } from "@/constants/theme";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface AdminIndianDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildCalendarCells(year: number, month: number): Array<number | null> {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lastDay = daysInMonth(year, month);
  const cells: Array<number | null> = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function AdminIndianDateField({
  label,
  value,
  onChange,
  error,
}: AdminIndianDateFieldProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<"month" | "year" | null>(null);
  const istToday = useMemo(() => getIstCalendarParts(new Date()), []);
  const selected = parseIndianDateInput(value);
  const selectedParts = selected.status === "valid" ? selected.parts : null;

  const initialView =
    selectedParts ?? ({ year: istToday.year, month: istToday.month, day: 1 } as IndianDateParts);

  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);

  const cells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const yearOptions = useMemo(
    () => buildAdminCalendarYearOptions(istToday.year, viewYear),
    [istToday.year, viewYear],
  );

  const openCalendar = () => {
    const nextView = selectedParts ?? istToday;
    setViewYear(nextView.year);
    setViewMonth(nextView.month);
    setOpenSelect(null);
    setCalendarOpen(true);
  };

  const closeCalendar = () => {
    setOpenSelect(null);
    setCalendarOpen(false);
  };

  const selectDay = (day: number) => {
    onChange(formatIndianDate({ year: viewYear, month: viewMonth, day }));
    closeCalendar();
  };

  const goMonth = (delta: number) => {
    const next = shiftAdminCalendarMonth({ year: viewYear, month: viewMonth }, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
    setOpenSelect(null);
  };

  const selectMonth = (month: number) => {
    const next = applyAdminCalendarMonth({ year: viewYear, month: viewMonth }, month);
    setViewYear(next.year);
    setViewMonth(next.month);
    setOpenSelect(null);
  };

  const selectYear = (year: number) => {
    const next = applyAdminCalendarYear({ year: viewYear, month: viewMonth }, year);
    setViewYear(next.year);
    setViewMonth(next.month);
    setOpenSelect(null);
  };

  const dropdownMaxHeight = Math.min(200, Math.max(windowHeight * 0.28, 140));

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(canonicalizeIndianDateInput(text))}
          placeholder={INDIAN_DATE_PLACEHOLDER}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          maxLength={10}
          accessibilityLabel={label}
          style={[styles.input, error ? styles.inputError : null]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open calendar to select ${label.toLowerCase()}`}
          onPress={openCalendar}
          style={({ pressed }) => [
            styles.calendarButton,
            pressed ? styles.calendarButtonPressed : null,
          ]}
        >
          <Text style={styles.calendarButtonText}>📅</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal
        visible={calendarOpen}
        transparent
        animationType="fade"
        onRequestClose={closeCalendar}
      >
        <View style={styles.modalRoot}>
          <View
            style={[
              styles.calendarCard,
              { maxHeight: Math.max(windowHeight - 48, 320) },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={styles.calendarScroll}
            >
              <View style={styles.calendarHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  onPress={() => goMonth(-1)}
                  style={styles.monthNav}
                >
                  <Text style={styles.monthNavText}>‹</Text>
                </Pressable>

                <View style={styles.selectsRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: openSelect === "month" }}
                    accessibilityLabel="Select month"
                    onPress={() =>
                      setOpenSelect((current) => (current === "month" ? null : "month"))
                    }
                    style={styles.monthTrigger}
                  >
                    <Text style={styles.triggerValue} numberOfLines={1}>
                      {formatAdminCalendarMonthLabel(viewMonth)}
                    </Text>
                    <Text style={styles.triggerIcon}>
                      {openSelect === "month" ? "▲" : "▼"}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: openSelect === "year" }}
                    accessibilityLabel="Select year"
                    onPress={() =>
                      setOpenSelect((current) => (current === "year" ? null : "year"))
                    }
                    style={styles.yearTrigger}
                  >
                    <Text style={styles.triggerValue}>{viewYear}</Text>
                    <Text style={styles.triggerIcon}>
                      {openSelect === "year" ? "▲" : "▼"}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  onPress={() => goMonth(1)}
                  style={styles.monthNav}
                >
                  <Text style={styles.monthNavText}>›</Text>
                </Pressable>
              </View>

              {openSelect === "month" ? (
                <ScrollView
                  style={[styles.dropdownMenu, { maxHeight: dropdownMaxHeight }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {INDIAN_CALENDAR_MONTH_LABELS.map((monthLabel, index) => {
                    const month = index + 1;
                    const isSelected = viewMonth === month;
                    return (
                      <Pressable
                        key={monthLabel}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={monthLabel}
                        onPress={() => selectMonth(month)}
                        style={[
                          styles.dropdownOption,
                          isSelected ? styles.dropdownOptionSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            isSelected ? styles.dropdownOptionTextSelected : null,
                          ]}
                        >
                          {monthLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              {openSelect === "year" ? (
                <ScrollView
                  style={[styles.dropdownMenu, { maxHeight: dropdownMaxHeight }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {yearOptions.map((year) => {
                    const isSelected = viewYear === year;
                    return (
                      <Pressable
                        key={year}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={String(year)}
                        onPress={() => selectYear(year)}
                        style={[
                          styles.dropdownOption,
                          isSelected ? styles.dropdownOptionSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            isSelected ? styles.dropdownOptionTextSelected : null,
                          ]}
                        >
                          {year}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((weekday, index) => (
                  <Text key={`${weekday}-${index}`} style={styles.weekday}>
                    {weekday}
                  </Text>
                ))}
              </View>

              <View style={styles.dayGrid}>
                {cells
                  .reduce<Array<Array<number | null>>>((weeks, day, index) => {
                    if (index % 7 === 0) {
                      weeks.push([]);
                    }
                    weeks[weeks.length - 1]?.push(day);
                    return weeks;
                  }, [])
                  .map((week, weekIndex) => (
                    <View key={`week-${weekIndex}`} style={styles.weekRow}>
                      {week.map((day, dayIndex) => {
                        if (day === null) {
                          return (
                            <View
                              key={`empty-${weekIndex}-${dayIndex}`}
                              style={styles.dayCell}
                            />
                          );
                        }

                        const isSelected =
                          selectedParts?.year === viewYear &&
                          selectedParts.month === viewMonth &&
                          selectedParts.day === day;
                        const isToday =
                          istToday.year === viewYear &&
                          istToday.month === viewMonth &&
                          istToday.day === day;

                        return (
                          <Pressable
                            key={`day-${day}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${formatIndianDate({
                              year: viewYear,
                              month: viewMonth,
                              day,
                            })}`}
                            onPress={() => selectDay(day)}
                            style={[
                              styles.dayCell,
                              isSelected ? styles.dayCellSelected : null,
                              isToday && !isSelected ? styles.dayCellToday : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayLabel,
                                isSelected ? styles.dayLabelSelected : null,
                              ]}
                            >
                              {day}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
              </View>
            </ScrollView>

            <Button label="Close" variant="secondary" onPress={closeCalendar} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  inputError: {
    borderColor: colors.error,
  },
  calendarButton: {
    width: 48,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarButtonPressed: {
    opacity: 0.85,
  },
  calendarButtonText: {
    fontSize: 20,
  },
  error: {
    color: colors.error,
    fontSize: 13,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.lg,
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  calendarScroll: {
    flexGrow: 0,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  monthNav: {
    width: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  monthNavText: {
    ...typography.title,
    fontSize: 28,
    lineHeight: 32,
  },
  selectsRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    minWidth: 0,
  },
  monthTrigger: {
    flexGrow: 1,
    flexBasis: 112,
    minHeight: 40,
    minWidth: 112,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  yearTrigger: {
    flexGrow: 0,
    flexBasis: 84,
    width: 84,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  triggerValue: {
    ...typography.body,
    flexShrink: 1,
    fontWeight: "600",
  },
  triggerIcon: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
  },
  dropdownOption: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownOptionSelected: {
    backgroundColor: "#EFF6FF",
  },
  dropdownOptionText: {
    ...typography.body,
  },
  dropdownOptionTextSelected: {
    color: colors.accent,
    fontWeight: "600",
  },
  weekdayRow: {
    flexDirection: "row",
    marginTop: spacing.sm,
  },
  weekday: {
    ...typography.caption,
    flex: 1,
    textAlign: "center",
    fontWeight: "600",
  },
  dayGrid: {
    gap: spacing.xs,
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  dayCellSelected: {
    backgroundColor: colors.accent,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  dayLabel: {
    ...typography.body,
  },
  dayLabelSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
