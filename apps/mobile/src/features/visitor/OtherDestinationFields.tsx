import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  BROKER_FLAT_MAX_LENGTH,
  DESTINATION_TEXT_MAX_LENGTH,
  OTHER_DESTINATION_OPTIONS,
  type OtherDestinationOptionId,
} from "@nextgen/shared";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface OtherDestinationFieldsProps {
  optionId: OtherDestinationOptionId | null;
  extraText: string;
  error?: string;
  onSelectOption: (optionId: OtherDestinationOptionId) => void;
  onChangeExtraText: (value: string) => void;
}

export function OtherDestinationFields({
  optionId,
  extraText,
  error,
  onSelectOption,
  onChangeExtraText,
}: OtherDestinationFieldsProps) {
  const showBrokerField = optionId === "broker_property_visit";
  const showCustomField = optionId === "other_destination";

  return (
    <View style={styles.container}>
      <View style={styles.optionList}>
        {OTHER_DESTINATION_OPTIONS.map((option) => {
          const isSelected = optionId === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectOption(option.id)}
              style={[
                styles.optionCard,
                isSelected ? styles.optionCardSelected : null,
              ]}
            >
              <Text style={styles.optionTitle}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {showBrokerField ? (
        <TextField
          label="Enter Unregistered Flat Number / Destination *"
          value={extraText}
          onChangeText={onChangeExtraText}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={BROKER_FLAT_MAX_LENGTH}
          placeholder="e.g. A-704"
          error={error}
        />
      ) : null}

      {showCustomField ? (
        <TextField
          label="Enter Flat / Destination *"
          value={extraText}
          onChangeText={onChangeExtraText}
          autoCapitalize="words"
          maxLength={DESTINATION_TEXT_MAX_LENGTH}
          placeholder="e.g. Gym"
          error={error}
        />
      ) : null}

      {error && !showBrokerField && !showCustomField ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  optionList: {
    gap: spacing.sm,
  },
  optionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  optionCardSelected: {
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
  },
  optionTitle: {
    ...typography.body,
    fontWeight: "600",
  },
  fieldError: {
    ...typography.caption,
    color: colors.error,
  },
});
