import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  MAX_EMERGENCY_NOTES_LENGTH,
  NATIONAL_EMERGENCY_CONTACTS,
  SOCIETY_EMERGENCY_CONTACTS_EMPTY_MESSAGE,
  SOCIETY_EMERGENCY_TYPES,
  SOCIETY_EMERGENCY_TYPE_LABELS,
  buildEmergencyTelUrl,
  formatEmergencyRaisedAt,
  formatEmergencyStatus,
  formatEmergencyTypeLabel,
  type RaisedEmergencyEvent,
  type SocietyEmergencyType,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { raiseEmergencyAlert } from "@/features/emergency/emergencyAlertService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

const GUARD_HOME_ROUTE = "/(guard)/home" as Href;

type EmergencyPhase = "form" | "confirm" | "success";

async function openEmergencyCall(number: string): Promise<void> {
  const url = buildEmergencyTelUrl(number);
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error("Calling is not available on this device.");
  }

  await Linking.openURL(url);
}

export default function GuardEmergencyScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [phase, setPhase] = useState<EmergencyPhase>("form");
  const [emergencyType, setEmergencyType] = useState<SocietyEmergencyType | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [typeError, setTypeError] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [raisedEvent, setRaisedEvent] = useState<RaisedEmergencyEvent | null>(
    null,
  );

  const handleCall = async (number: string) => {
    setErrorMessage(null);
    try {
      await openEmergencyCall(number);
    } catch {
      setErrorMessage(
        "Calling is not available here. Use a phone to dial this number.",
      );
    }
  };

  const handleOpenConfirmation = () => {
    if (!emergencyType) {
      setTypeError("Select an emergency type.");
      return;
    }

    setTypeError(undefined);
    setErrorMessage(null);
    setPhase("confirm");
  };

  const handleCancelConfirmation = () => {
    if (isSubmitting) {
      return;
    }
    setErrorMessage(null);
    setPhase("form");
  };

  const handleConfirmEmergency = async () => {
    if (!emergencyType || isSubmitting) {
      return;
    }

    if (!accessToken) {
      setErrorMessage("Your session has expired. Please login again.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const event = await raiseEmergencyAlert(
        accessToken,
        emergencyType,
        notes,
      );
      setRaisedEvent(event);
      setPhase("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Emergency alert could not be sent. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (phase === "success" && raisedEvent) {
    return (
      <ScrollScreen
        title="Emergency Alert Raised"
        subtitle="The society emergency system has been notified."
        footer={
          <Button
            label="Back to Dashboard"
            onPress={() => router.replace(GUARD_HOME_ROUTE)}
          />
        }
      >
        <InfoCard
          label="Emergency type"
          value={formatEmergencyTypeLabel(raisedEvent.emergencyType)}
        />
        <InfoCard
          label="Raised time"
          value={formatEmergencyRaisedAt(raisedEvent.raisedAt)}
        />
        <InfoCard
          label="Status"
          value={formatEmergencyStatus(raisedEvent.status)}
        />
      </ScrollScreen>
    );
  }

  if (phase === "confirm" && emergencyType) {
    return (
      <ScrollScreen
        title="Raise Emergency Alert?"
        subtitle="This will notify the society emergency system."
        footer={
          <View style={styles.footerActions}>
            <Button
              label="Confirm Emergency"
              variant="danger"
              loading={isSubmitting}
              disabled={isSubmitting}
              onPress={() => void handleConfirmEmergency()}
            />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={isSubmitting}
              onPress={handleCancelConfirmation}
            />
          </View>
        }
      >
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        <InfoCard
          label="Emergency type"
          value={SOCIETY_EMERGENCY_TYPE_LABELS[emergencyType]}
        />
        {notes.trim() ? <InfoCard label="Notes" value={notes.trim()} /> : null}
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen
      title="Emergency"
      subtitle="Quick access to emergency contacts."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          onPress={() => router.back()}
        />
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <View style={styles.raiseCard}>
        <Text style={styles.raiseTitle}>Raise Society Emergency Alert</Text>
        <Text style={styles.raiseCaption}>
          Alert your society administration about an emergency.
        </Text>

        <SelectField
          label="Emergency type"
          value={emergencyType}
          options={SOCIETY_EMERGENCY_TYPES}
          placeholder="Select an emergency type"
          getOptionLabel={(value) => SOCIETY_EMERGENCY_TYPE_LABELS[value]}
          error={typeError}
          onChange={(value) => {
            setEmergencyType(value);
            setTypeError(undefined);
          }}
        />

        <TextField
          label="Notes (Optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Add brief details if needed"
          multiline
          maxLength={MAX_EMERGENCY_NOTES_LENGTH}
          textAlignVertical="top"
          style={styles.notesInput}
        />
        <Text style={styles.notesCount}>
          {notes.length}/{MAX_EMERGENCY_NOTES_LENGTH}
        </Text>

        <Button
          label="Raise Emergency Alert"
          variant="danger"
          onPress={handleOpenConfirmation}
        />
      </View>

      <Text style={styles.sectionTitle}>National Emergency Contacts</Text>
      {NATIONAL_EMERGENCY_CONTACTS.map((contact) => (
        <View key={contact.id} style={styles.contactRow}>
          <View style={styles.contactText}>
            <Text style={styles.contactLabel}>{contact.label}</Text>
            <Text style={styles.contactNumber}>{contact.number}</Text>
          </View>
          <Button
            label="Call"
            onPress={() => void handleCall(contact.number)}
            accessibilityLabel={`Call ${contact.label} at ${contact.number}`}
            style={styles.callButton}
          />
        </View>
      ))}

      <Text style={styles.sectionTitle}>Society Emergency Contacts</Text>
      <View style={styles.emptySociety}>
        <Text style={styles.emptySocietyText}>
          {SOCIETY_EMERGENCY_CONTACTS_EMPTY_MESSAGE}
        </Text>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  raiseCard: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.danger,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
    gap: spacing.md,
    padding: spacing.md,
  },
  raiseTitle: {
    ...typography.subtitle,
  },
  raiseCaption: {
    ...typography.body,
    color: colors.textSecondary,
  },
  notesInput: {
    minHeight: 96,
    paddingVertical: spacing.sm,
  },
  notesCount: {
    ...typography.caption,
    marginTop: -spacing.sm,
    textAlign: "right",
  },
  sectionTitle: {
    ...typography.subtitle,
  },
  contactRow: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  contactText: {
    flex: 1,
    gap: 2,
  },
  contactLabel: {
    ...typography.body,
  },
  contactNumber: {
    ...typography.subtitle,
    fontSize: 22,
    letterSpacing: 0.5,
  },
  callButton: {
    minWidth: 88,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  emptySociety: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  emptySocietyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footerActions: {
    gap: spacing.sm,
  },
});
