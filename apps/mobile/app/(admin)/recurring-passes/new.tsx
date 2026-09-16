import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  RECURRING_PASS_NOTES_MAX_LENGTH,
  RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH,
  RECURRING_PASS_WEEKDAYS,
  VISITOR_NAME_MAX_LENGTH,
  composeOtherDestinationText,
  formatIndianDate,
  formatRecurringPassCalendarDate,
  formatResidentFlatLabel,
  getIstCalendarParts,
  normalizeIndianMobileNumber,
  parseAdminCreateRecurringPassForm,
  resolveVisitorDestinationLabel,
  type AdminCreateRecurringPassFormErrors,
  type FlatSummary,
  type LinkedResident,
  type OtherDestinationOptionId,
  type RecurringVisitorTypeCode,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminIndianDateField } from "@/features/admin-visitors/AdminIndianDateField";
import { AdminRecurringPassDestinationFields } from "@/features/admin-recurring-passes/AdminRecurringPassDestinationFields";
import { AdminRecurringPassScheduleFields } from "@/features/admin-recurring-passes/AdminRecurringPassScheduleFields";
import { AdminRecurringVisitorTypeFields } from "@/features/admin-recurring-passes/AdminRecurringVisitorTypeFields";
import { RecurringPassPhotoPicker } from "@/features/admin-recurring-passes/RecurringPassPhotoPicker";
import { RecurringPassPhotoPreview } from "@/features/admin-recurring-passes/RecurringPassPhotoAvatar";
import {
  createAdminRecurringPass,
  listAdminLinkedResidentsForFlat,
  listAdminSocietyActiveFlats,
} from "@/features/admin-recurring-passes/adminRecurringPassService";
import {
  readSelectedVisitorPhotoBase64,
  type SelectedVisitorPhoto,
} from "@/features/visitor/visitorPhotoPipeline";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { TextField } from "@/components/ui/TextField";
import { spacing } from "@/constants/theme";

const LIST_ROUTE = "/(admin)/recurring-passes" as Href;

interface CreatedPassSummary {
  passId: string;
  visitorName: string;
  visitorTypeLabel: string;
  destinationLabel: string;
  validFrom: string;
  validUntil: string;
  photoUri: string | null;
}

export default function AdminCreateRecurringPassScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [visitorName, setVisitorName] = useState("");
  const [visitorMobile, setVisitorMobile] = useState("");
  const [visitorTypeCode, setVisitorTypeCode] =
    useState<RecurringVisitorTypeCode | null>(null);
  const [customVisitorType, setCustomVisitorType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [validFromDisplay, setValidFromDisplay] = useState(
    formatIndianDate(getIstCalendarParts()),
  );
  const [validUntilDisplay, setValidUntilDisplay] = useState("");
  const [allowedDays, setAllowedDays] = useState<number[]>([]);
  const [allowedEntryFromTime, setAllowedEntryFromTime] = useState("");
  const [allowedEntryToTime, setAllowedEntryToTime] = useState("");

  const [destinationMode, setDestinationMode] = useState<"flat" | "other">("flat");
  const [flats, setFlats] = useState<FlatSummary[]>([]);
  const [flatSearch, setFlatSearch] = useState("");
  const [selectedFlat, setSelectedFlat] = useState<FlatSummary | null>(null);
  const [linkedResidents, setLinkedResidents] = useState<LinkedResident[]>([]);
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null);
  const [otherOptionId, setOtherOptionId] =
    useState<OtherDestinationOptionId | null>(null);
  const [otherExtraText, setOtherExtraText] = useState("");
  const [isLoadingFlats, setIsLoadingFlats] = useState(true);
  const [isLoadingResidents, setIsLoadingResidents] = useState(false);

  const [selectedPhoto, setSelectedPhoto] = useState<SelectedVisitorPhoto | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<AdminCreateRecurringPassFormErrors>(
    {},
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdPass, setCreatedPass] = useState<CreatedPassSummary | null>(null);

  const composedOtherDestination = useMemo(
    () =>
      composeOtherDestinationText({
        optionId: otherOptionId,
        extraText: otherExtraText,
      }),
    [otherOptionId, otherExtraText],
  );

  const loadFlats = useCallback(async () => {
    if (!accessToken || !jwtSocietyId) {
      setIsLoadingFlats(false);
      return;
    }
    setIsLoadingFlats(true);
    try {
      setFlats(await listAdminSocietyActiveFlats(accessToken, jwtSocietyId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load flats.",
      );
    } finally {
      setIsLoadingFlats(false);
    }
  }, [accessToken, jwtSocietyId]);

  useEffect(() => {
    void loadFlats();
  }, [loadFlats]);

  const clearFieldError = (field: keyof AdminCreateRecurringPassFormErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleVisitorTypeChange = (code: RecurringVisitorTypeCode) => {
    setVisitorTypeCode(code);
    setCustomVisitorType("");
    setFieldErrors((current) => ({
      ...current,
      visitorTypeCode: undefined,
      customVisitorType: undefined,
    }));
  };

  const handleSelectFlatMode = () => {
    setDestinationMode("flat");
    setOtherOptionId(null);
    setOtherExtraText("");
    setFieldErrors((current) => ({
      ...current,
      destinationText: undefined,
      flatId: undefined,
      residentId: undefined,
    }));
  };

  const handleSelectOtherMode = () => {
    setDestinationMode("other");
    setSelectedFlat(null);
    setSelectedResidentId(null);
    setLinkedResidents([]);
    setFlatSearch("");
    setOtherOptionId(null);
    setOtherExtraText("");
    setFieldErrors((current) => ({
      ...current,
      destinationText: undefined,
      flatId: undefined,
      residentId: undefined,
    }));
  };

  const handleSelectOtherOption = (optionId: OtherDestinationOptionId) => {
    if (optionId !== otherOptionId) {
      setOtherExtraText("");
    }
    setOtherOptionId(optionId);
    clearFieldError("destinationText");
  };

  const handleSelectFlat = async (flat: FlatSummary) => {
    if (!accessToken || !jwtSocietyId || flat.societyId !== jwtSocietyId) {
      setErrorMessage("Flat does not belong to your society.");
      return;
    }

    setSelectedFlat(flat);
    setSelectedResidentId(null);
    setLinkedResidents([]);
    setOtherOptionId(null);
    setOtherExtraText("");
    clearFieldError("flatId");
    clearFieldError("destinationText");
    setIsLoadingResidents(true);

    try {
      const residents = await listAdminLinkedResidentsForFlat(
        accessToken,
        jwtSocietyId,
        flat.id,
      );
      setLinkedResidents(residents);
      if (residents.length === 1) {
        setSelectedResidentId(residents[0].id);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load residents.",
      );
    } finally {
      setIsLoadingResidents(false);
    }
  };

  const handleToggleDay = (day: number) => {
    setAllowedDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right),
    );
    clearFieldError("allowedDaysOfWeek");
  };

  const handleCreate = async () => {
    setErrorMessage(null);

    const destinationText =
      destinationMode === "other" && composedOtherDestination.ok
        ? composedOtherDestination.destinationText
        : destinationMode === "other"
          ? otherExtraText
          : null;

    const parsed = parseAdminCreateRecurringPassForm({
      visitorName,
      visitorMobile,
      visitorTypeCode,
      customVisitorType,
      flatId: destinationMode === "flat" ? selectedFlat?.id ?? null : null,
      residentId: destinationMode === "flat" ? selectedResidentId : null,
      destinationText,
      vehicleNumber,
      validFromDisplay,
      validUntilDisplay,
      allowedDaysOfWeek: allowedDays,
      allowedEntryFromTime,
      allowedEntryToTime,
      notes,
      hasPhoto: Boolean(selectedPhoto),
    });

    if (!parsed.ok) {
      if (destinationMode === "other" && !composedOtherDestination.ok) {
        parsed.errors.destinationText = composedOtherDestination.message;
      }
      if (destinationMode === "flat" && !selectedFlat && parsed.errors.destinationText) {
        parsed.errors.flatId = parsed.errors.destinationText;
      }
      setFieldErrors(parsed.errors);
      return;
    }

    if (!accessToken || !selectedPhoto) {
      setFieldErrors({ photo: "A visitor photo is required." });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const imageBase64 = await readSelectedVisitorPhotoBase64(selectedPhoto);
      const created = await createAdminRecurringPass(accessToken, parsed.value, {
        imageBase64,
        contentType: selectedPhoto.mimeType,
      });

      const destinationLabel =
        parsed.value.flatId && selectedFlat
          ? [
              formatResidentFlatLabel(
                selectedFlat.wingBuilding,
                selectedFlat.flatNumber,
              ),
              linkedResidents.find((resident) => resident.id === parsed.value.residentId)
                ?.name,
            ]
              .filter(Boolean)
              .join(" · ")
          : resolveVisitorDestinationLabel({
              flatId: parsed.value.flatId,
              destinationText: parsed.value.destinationText,
            });

      setCreatedPass({
        passId: created.passId,
        visitorName: created.visitorName,
        visitorTypeLabel: created.visitorTypeLabel,
        destinationLabel,
        validFrom: created.validFrom,
        validUntil: created.validUntil,
        photoUri: selectedPhoto.uri,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create the recurring visitor pass.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (createdPass) {
    return (
      <AdminScrollScreen
        title="Recurring Pass Created"
        subtitle="The pass is active. QR credentials are issued in a later step."
        footer={
          <Button
            label="Back to Recurring Visitor Passes"
            onPress={() => router.replace(LIST_ROUTE)}
          />
        }
      >
        <SuccessBanner message="Recurring Pass Created" />
        <RecurringPassPhotoPreview imageUri={createdPass.photoUri} />
        <InfoCard label="Visitor name" value={createdPass.visitorName} />
        <InfoCard label="Visitor type" value={createdPass.visitorTypeLabel} />
        <InfoCard label="Destination" value={createdPass.destinationLabel || "—"} />
        <InfoCard
          label="Validity"
          value={`${formatRecurringPassCalendarDate(createdPass.validFrom)} – ${formatRecurringPassCalendarDate(createdPass.validUntil)}`}
        />
      </AdminScrollScreen>
    );
  }

  return (
    <AdminScrollScreen
      title="Create Pass"
      subtitle="Create an Admin-approved recurring visitor pass for your society."
      footer={
        <>
          <Button
            label="Create Pass"
            loading={isSubmitting}
            disabled={isSubmitting}
            onPress={() => void handleCreate()}
          />
          <Button
            label="Back to Recurring Passes"
            variant="secondary"
            onPress={() => router.replace(LIST_ROUTE)}
            style={{ marginTop: 8 }}
          />
        </>
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <View style={styles.body}>
        <TextField
          label="Visitor Full Name *"
          value={visitorName}
          onChangeText={(value) => {
            setVisitorName(value);
            clearFieldError("visitorName");
          }}
          autoCapitalize="words"
          maxLength={VISITOR_NAME_MAX_LENGTH}
          placeholder="Visitor full name"
          error={fieldErrors.visitorName}
        />

        <TextField
          label="Mobile Number *"
          value={visitorMobile}
          onChangeText={(value) => {
            setVisitorMobile(normalizeIndianMobileNumber(value));
            clearFieldError("visitorMobile");
          }}
          keyboardType="phone-pad"
          maxLength={14}
          placeholder="9876543210"
          error={fieldErrors.visitorMobile}
        />

        <AdminRecurringVisitorTypeFields
          visitorTypeCode={visitorTypeCode}
          customVisitorType={customVisitorType}
          errors={{
            visitorTypeCode: fieldErrors.visitorTypeCode,
            customVisitorType: fieldErrors.customVisitorType,
          }}
          onChangeVisitorTypeCode={handleVisitorTypeChange}
          onChangeCustomVisitorType={(value) => {
            setCustomVisitorType(value);
            clearFieldError("customVisitorType");
          }}
        />

        <RecurringPassPhotoPicker
          photoUri={selectedPhoto?.uri ?? null}
          selectedPhoto={selectedPhoto}
          fieldError={fieldErrors.photo}
          onChange={setSelectedPhoto}
          onClearFieldError={() => clearFieldError("photo")}
          onError={setErrorMessage}
        />

        <AdminRecurringPassDestinationFields
          destinationMode={destinationMode}
          flats={flats}
          flatSearch={flatSearch}
          selectedFlat={selectedFlat}
          linkedResidents={linkedResidents}
          selectedResidentId={selectedResidentId}
          otherOptionId={otherOptionId}
          otherExtraText={otherExtraText}
          isLoadingFlats={isLoadingFlats}
          isLoadingResidents={isLoadingResidents}
          errors={{
            flatId: fieldErrors.flatId,
            destinationText: fieldErrors.destinationText,
            residentId: fieldErrors.residentId,
          }}
          onSelectFlatMode={handleSelectFlatMode}
          onSelectOtherMode={handleSelectOtherMode}
          onChangeFlatSearch={setFlatSearch}
          onSelectFlat={(flat) => void handleSelectFlat(flat)}
          onSelectResident={(residentId) => {
            setSelectedResidentId(residentId);
            clearFieldError("residentId");
          }}
          onSelectOtherOption={handleSelectOtherOption}
          onChangeOtherExtraText={(value) => {
            setOtherExtraText(value);
            clearFieldError("destinationText");
          }}
        />

        <TextField
          label="Vehicle Number"
          value={vehicleNumber}
          onChangeText={setVehicleNumber}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={RECURRING_PASS_VEHICLE_NUMBER_MAX_LENGTH}
          placeholder="Optional"
          error={fieldErrors.vehicleNumber}
        />

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
          onToggleDay={handleToggleDay}
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
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          autoCapitalize="sentences"
          maxLength={RECURRING_PASS_NOTES_MAX_LENGTH}
          placeholder="Optional"
          multiline
          error={fieldErrors.notes}
        />
      </View>
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
});
