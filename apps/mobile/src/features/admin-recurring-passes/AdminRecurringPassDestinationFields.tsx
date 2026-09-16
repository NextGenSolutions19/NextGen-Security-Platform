import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatResidentFlatLabel,
  type FlatSummary,
  type LinkedResident,
  type OtherDestinationOptionId,
} from "@nextgen/shared";
import { OtherDestinationFields } from "@/features/visitor/OtherDestinationFields";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface AdminRecurringPassDestinationFieldsProps {
  destinationMode: "flat" | "other";
  flats: FlatSummary[];
  flatSearch: string;
  selectedFlat: FlatSummary | null;
  linkedResidents: LinkedResident[];
  selectedResidentId: string | null;
  otherOptionId: OtherDestinationOptionId | null;
  otherExtraText: string;
  isLoadingFlats: boolean;
  isLoadingResidents: boolean;
  errors: {
    flatId?: string;
    destinationText?: string;
    residentId?: string;
  };
  onSelectFlatMode: () => void;
  onSelectOtherMode: () => void;
  onChangeFlatSearch: (value: string) => void;
  onSelectFlat: (flat: FlatSummary) => void;
  onSelectResident: (residentId: string) => void;
  onSelectOtherOption: (optionId: OtherDestinationOptionId) => void;
  onChangeOtherExtraText: (value: string) => void;
}

export function AdminRecurringPassDestinationFields({
  destinationMode,
  flats,
  flatSearch,
  selectedFlat,
  linkedResidents,
  selectedResidentId,
  otherOptionId,
  otherExtraText,
  isLoadingFlats,
  isLoadingResidents,
  errors,
  onSelectFlatMode,
  onSelectOtherMode,
  onChangeFlatSearch,
  onSelectFlat,
  onSelectResident,
  onSelectOtherOption,
  onChangeOtherExtraText,
}: AdminRecurringPassDestinationFieldsProps) {
  const query = flatSearch.trim().toLowerCase();
  const filteredFlats = flats.filter((flat) => {
    if (!query) {
      return true;
    }
    return formatResidentFlatLabel(flat.wingBuilding, flat.flatNumber)
      .toLowerCase()
      .includes(query);
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Destination *</Text>
      <View style={styles.optionList}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: destinationMode === "flat" }}
          onPress={onSelectFlatMode}
          style={[
            styles.optionCard,
            destinationMode === "flat" ? styles.optionCardSelected : null,
          ]}
        >
          <Text style={styles.optionTitle}>Select Flat</Text>
          <Text style={styles.optionCaption}>
            Choose an existing Resident Master flat
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: destinationMode === "other" }}
          onPress={onSelectOtherMode}
          style={[
            styles.optionCard,
            destinationMode === "other" ? styles.optionCardSelected : null,
          ]}
        >
          <Text style={styles.optionTitle}>Other Destination</Text>
          <Text style={styles.optionCaption}>
            Clubhouse, society office, unlisted flat, or another destination
          </Text>
        </Pressable>
      </View>

      {destinationMode === "other" ? (
        <OtherDestinationFields
          optionId={otherOptionId}
          extraText={otherExtraText}
          error={errors.destinationText}
          onSelectOption={onSelectOtherOption}
          onChangeExtraText={onChangeOtherExtraText}
        />
      ) : (
        <View style={styles.flatBlock}>
          <TextField
            label="Search flat number"
            value={flatSearch}
            onChangeText={onChangeFlatSearch}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. A-101"
          />
          {isLoadingFlats ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading flats...</Text>
            </View>
          ) : (
            <View style={styles.optionList}>
              {filteredFlats.map((flat) => {
                const isSelected = selectedFlat?.id === flat.id;
                return (
                  <Pressable
                    key={flat.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => onSelectFlat(flat)}
                    style={[
                      styles.optionCard,
                      isSelected ? styles.optionCardSelected : null,
                    ]}
                  >
                    <Text style={styles.optionTitle}>
                      {formatResidentFlatLabel(flat.wingBuilding, flat.flatNumber)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {errors.flatId ? <Text style={styles.fieldError}>{errors.flatId}</Text> : null}
        </View>
      )}

      {selectedFlat && destinationMode === "flat" ? (
        <View style={styles.linkedBlock}>
          <Text style={styles.sectionTitle}>Linked resident</Text>
          <Text style={styles.optionCaption}>
            Flat {formatResidentFlatLabel(selectedFlat.wingBuilding, selectedFlat.flatNumber)}
          </Text>
          {isLoadingResidents ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading residents...</Text>
            </View>
          ) : linkedResidents.length === 0 ? (
            <Text style={styles.emptyText}>
              No residents are linked to this flat. The pass can still be created for the flat.
            </Text>
          ) : (
            <View style={styles.optionList}>
              {linkedResidents.map((resident) => {
                const isSelected = selectedResidentId === resident.id;
                return (
                  <Pressable
                    key={resident.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => onSelectResident(resident.id)}
                    style={[
                      styles.optionCard,
                      isSelected ? styles.optionCardSelected : null,
                    ]}
                  >
                    <Text style={styles.optionTitle}>{resident.name}</Text>
                    <Text style={styles.optionCaption}>
                      {resident.mobile ?? "No mobile on file"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {errors.residentId ? (
            <Text style={styles.fieldError}>{errors.residentId}</Text>
          ) : null}
        </View>
      ) : null}
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
  optionCaption: {
    ...typography.caption,
  },
  flatBlock: {
    gap: spacing.sm,
  },
  linkedBlock: {
    gap: spacing.sm,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
  },
  emptyText: {
    ...typography.caption,
  },
  fieldError: {
    ...typography.caption,
    color: colors.error,
  },
});
