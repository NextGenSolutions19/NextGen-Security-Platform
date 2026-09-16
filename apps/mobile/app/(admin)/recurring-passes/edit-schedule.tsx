import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  RECURRING_PASS_NOTES_MAX_LENGTH,
  RECURRING_PASS_REVOKED_EDIT_MESSAGE,
  RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH,
  RECURRING_PASS_WEEKDAYS,
  formatRecurringPassEffectiveStatus,
  formatStoredRecurringVisitorType,
  parseAdminRecurringPassScheduleForm,
  recurringPassScheduleFormDefaults,
  type AdminRecurringPassScheduleFormErrors,
  type AdminRecurringVisitorPassListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminIndianDateField } from "@/features/admin-visitors/AdminIndianDateField";
import { AdminRecurringPassScheduleFields } from "@/features/admin-recurring-passes/AdminRecurringPassScheduleFields";
import {
  getAdminSocietyRecurringPass,
  updateAdminRecurringPassSchedule,
} from "@/features/admin-recurring-passes/adminRecurringPassService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { TextField } from "@/components/ui/TextField";
import { colors, spacing } from "@/constants/theme";

function detailsRoute(passId: string): Href {
  return `/(admin)/recurring-passes/${passId}` as Href;
}

export default function AdminEditRecurringPassScheduleScreen() {
  const router = useRouter();
  const { passId } = useLocalSearchParams<{ passId: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [item, setItem] = useState<AdminRecurringVisitorPassListItem | null>(null);
  const [validFromDisplay, setValidFromDisplay] = useState("");
  const [validUntilDisplay, setValidUntilDisplay] = useState("");
  const [allowedDays, setAllowedDays] = useState<number[]>([]);
  const [allowedEntryFromTime, setAllowedEntryFromTime] = useState("");
  const [allowedEntryToTime, setAllowedEntryToTime] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AdminRecurringPassScheduleFormErrors>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const applyPass = (pass: AdminRecurringVisitorPassListItem) => {
    const defaults = recurringPassScheduleFormDefaults(pass);
    setItem(pass);
    setValidFromDisplay(defaults.validFromDisplay);
    setValidUntilDisplay(defaults.validUntilDisplay);
    setAllowedDays([...defaults.allowedDaysOfWeek]);
    setAllowedEntryFromTime(defaults.allowedEntryFromTime);
    setAllowedEntryToTime(defaults.allowedEntryToTime);
    setVehicleNumber(defaults.vehicleNumber);
    setNotes(defaults.notes);
  };

  const loadPass = useCallback(async () => {
    if (!accessToken || !jwtSocietyId || !passId) {
      setIsLoading(false);
      setErrorMessage("Recurring visitor pass not found.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const found = await getAdminSocietyRecurringPass(
        accessToken,
        jwtSocietyId,
        passId,
      );
      if (!found) {
        setItem(null);
        setErrorMessage("Recurring visitor pass not found.");
        return;
      }
      applyPass(found);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the recurring visitor pass.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, jwtSocietyId, passId]);

  useEffect(() => {
    void loadPass();
  }, [loadPass]);

  const clearFieldError = (field: keyof AdminRecurringPassScheduleFormErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleSave = async () => {
    if (!passId || !item) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    if (item.status === "revoked") {
      setErrorMessage(RECURRING_PASS_REVOKED_EDIT_MESSAGE);
      return;
    }

    const parsed = parseAdminRecurringPassScheduleForm({
      validFromDisplay,
      validUntilDisplay,
      allowedDaysOfWeek: allowedDays,
      allowedEntryFromTime,
      allowedEntryToTime,
      vehicleNumber,
      notes,
    });

    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }

    setFieldErrors({});
    setIsSaving(true);

    try {
      await updateAdminRecurringPassSchedule(accessToken, passId, parsed.value);
      const refreshed = await getAdminSocietyRecurringPass(
        accessToken,
        jwtSocietyId,
        passId,
      );
      if (refreshed) {
        applyPass(refreshed);
      }
      setSuccessMessage("Access schedule updated.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the access schedule.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const backToDetails = () => {
    if (passId) {
      router.replace(detailsRoute(passId));
      return;
    }
    router.replace("/(admin)/recurring-passes" as Href);
  };

  if (isLoading) {
    return (
      <AdminScrollScreen
        title="Edit Access Schedule"
        subtitle="Update validity, days, and entry time for this pass."
        footer={
          <Button
            label="Back to Pass Details"
            variant="secondary"
            onPress={backToDetails}
          />
        }
      >
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </AdminScrollScreen>
    );
  }

  if (!item) {
    return (
      <AdminScrollScreen
        title="Edit Access Schedule"
        subtitle="Update validity, days, and entry time for this pass."
        footer={
          <Button
            label="Back to Recurring Passes"
            variant="secondary"
            onPress={() => router.replace("/(admin)/recurring-passes" as Href)}
          />
        }
      >
        <ErrorBanner message={errorMessage ?? "Recurring visitor pass not found."} />
      </AdminScrollScreen>
    );
  }

  const isRevoked = item.status === "revoked";

  return (
    <AdminScrollScreen
      title="Edit Access Schedule"
      subtitle="Change validity and access hours. Identity, destination, and photo stay the same."
      footer={
        <>
          {!isRevoked ? (
            <Button
              label="Save Access Schedule"
              loading={isSaving}
              disabled={isSaving}
              onPress={() => void handleSave()}
            />
          ) : null}
          <Button
            label="Back to Pass Details"
            variant="secondary"
            onPress={backToDetails}
            style={!isRevoked ? { marginTop: 8 } : undefined}
          />
        </>
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {successMessage ? <SuccessBanner message={successMessage} /> : null}

      <View style={styles.body}>
        <InfoCard label="Visitor name" value={item.visitorName} />
        <InfoCard
          label="Visitor type"
          value={formatStoredRecurringVisitorType(item)}
        />
        <InfoCard label="Destination" value={item.destinationLabel || "—"} />
        <InfoCard
          label="Status"
          value={formatRecurringPassEffectiveStatus(item)}
        />

        {isRevoked ? (
          <ErrorBanner message={RECURRING_PASS_REVOKED_EDIT_MESSAGE} />
        ) : (
          <>
            <AdminIndianDateField
              label="Valid From *"
              value={validFromDisplay}
              onChange={(value) => {
                setValidFromDisplay(value);
                clearFieldError("validFrom");
              }}
              error={fieldErrors.validFrom}
            />
            <AdminIndianDateField
              label="Valid Until *"
              value={validUntilDisplay}
              onChange={(value) => {
                setValidUntilDisplay(value);
                clearFieldError("validUntil");
              }}
              error={fieldErrors.validUntil}
            />

            <AdminRecurringPassScheduleFields
              allowedDays={allowedDays}
              allowedEntryFromTime={allowedEntryFromTime}
              allowedEntryToTime={allowedEntryToTime}
              errors={{
                allowedDaysOfWeek: fieldErrors.allowedDaysOfWeek,
                allowedEntryFromTime: fieldErrors.allowedEntryFromTime,
                allowedEntryToTime: fieldErrors.allowedEntryToTime,
              }}
              onToggleDay={(day) => {
                setAllowedDays((current) =>
                  current.includes(day)
                    ? current.filter((value) => value !== day)
                    : [...current, day].sort((left, right) => left - right),
                );
                clearFieldError("allowedDaysOfWeek");
              }}
              onSelectAllDays={() => {
                setAllowedDays(RECURRING_PASS_WEEKDAYS.map((weekday) => weekday.day));
                clearFieldError("allowedDaysOfWeek");
              }}
              onChangeFromTime={(value) => {
                setAllowedEntryFromTime(value);
                clearFieldError("allowedEntryFromTime");
                clearFieldError("allowedEntryToTime");
              }}
              onChangeToTime={(value) => {
                setAllowedEntryToTime(value);
                clearFieldError("allowedEntryFromTime");
                clearFieldError("allowedEntryToTime");
              }}
            />

            <TextField
              label="Vehicle Number"
              value={vehicleNumber}
              onChangeText={(value) => {
                setVehicleNumber(value);
                clearFieldError("vehicleNumber");
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH}
              placeholder="Optional"
              error={fieldErrors.vehicleNumber}
            />
            <TextField
              label="Notes"
              value={notes}
              onChangeText={(value) => {
                setNotes(value);
                clearFieldError("notes");
              }}
              autoCapitalize="sentences"
              maxLength={RECURRING_PASS_NOTES_MAX_LENGTH}
              placeholder="Optional"
              multiline
              error={fieldErrors.notes}
            />
          </>
        )}
      </View>
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
});
