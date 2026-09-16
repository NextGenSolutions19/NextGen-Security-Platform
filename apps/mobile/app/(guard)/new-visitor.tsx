import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  allowedVisitorRegistrationModes,
  evaluateVisitorSecurityPolicy,
  formatResidentFlatLabel,
  formatVerificationMethod,
  formatVisitorStatus,
  getEnabledVisitorPurposes,
  getVisitorPurposeById,
  isValidOtpCodeFormat,
  purposeRequiresCustomText,
  purposeRequiresVehicleNumber,
  REGISTRATION_MODE_LABELS,
  resolveOtpVerificationFailure,
  resolveOtpVerificationFailureFromUnknown,
  SECURITY_POLICY_LOAD_FAILED_MESSAGE,
  startOtpVerification,
  type SocietySecurityPolicy,
  type VisitorPurposeCode,
  type VisitorRegistrationMode,
  type VisitorEntry,
  VISITOR_NAME_MAX_LENGTH,
  composeOtherDestinationText,
  resolveVisitorDestinationLabel,
  type OtherDestinationOptionId,
} from "@nextgen/shared";
import {
  normalizeIndianMobileNumber,
  registerVisitorSchema,
} from "@nextgen/validation";
import { useAuth } from "@/features/auth/AuthProvider";
import { useGuardOnDutyRequired } from "@/features/duty/useGuardOnDutyRequired";
import {
  listActiveFlats,
  listLinkedResidentsForFlat,
  registerVisitor,
  sendVisitorOtp,
  verifyVisitorOtp,
} from "@/features/visitor/visitorService";
import { VisitorPhotoInput } from "@/features/visitor/VisitorPhotoInput";
import { OtherDestinationFields } from "@/features/visitor/OtherDestinationFields";
import { getSocietySecurityPolicies } from "@/features/security-policies/societySecurityPolicyService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { Screen } from "@/components/ui/Screen";
import { ScrollScreen } from "@/components/ui/ScrollScreen";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

const GUARD_HOME_ROUTE = "/(guard)/home" as Href;

export default function NewVisitorScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const { isOffDuty, offDutyMessage } = useGuardOnDutyRequired(accessToken);

  const purposeDefinitions = useMemo(() => getEnabledVisitorPurposes(), []);
  const purposeCodes = useMemo(
    () => purposeDefinitions.map((purpose) => purpose.id as VisitorPurposeCode),
    [purposeDefinitions],
  );

  const [flats, setFlats] = useState<Awaited<ReturnType<typeof listActiveFlats>>>([]);
  const [flatSearch, setFlatSearch] = useState("");
  const [selectedFlat, setSelectedFlat] = useState<
    Awaited<ReturnType<typeof listActiveFlats>>[number] | null
  >(null);
  const [linkedResidents, setLinkedResidents] = useState<
    Awaited<ReturnType<typeof listLinkedResidentsForFlat>>
  >([]);
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null);
  const [destinationMode, setDestinationMode] = useState<"flat" | "other">("flat");
  const [otherOptionId, setOtherOptionId] =
    useState<OtherDestinationOptionId | null>(null);
  const [otherExtraText, setOtherExtraText] = useState("");

  const [registrationMode, setRegistrationMode] =
    useState<VisitorRegistrationMode>("verify_with_otp");
  const [visitorName, setVisitorName] = useState("");
  const [visitorMobile, setVisitorMobile] = useState("");
  const [purposeCode, setPurposeCode] = useState<VisitorPurposeCode | null>(null);
  const [customPurposeText, setCustomPurposeText] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleVisuallyChecked, setVehicleVisuallyChecked] = useState(false);
  const [notes, setNotes] = useState("");
  const [otpFallbackReason, setOtpFallbackReason] = useState("");
  const [policy, setPolicy] = useState<SocietySecurityPolicy | null>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(true);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerificationToken, setOtpVerificationToken] = useState<string | null>(null);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const isVerifyingOtpRef = useRef(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploadId, setPhotoUploadId] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [isLoadingFlats, setIsLoadingFlats] = useState(true);
  const [isLoadingResidents, setIsLoadingResidents] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successEntry, setSuccessEntry] = useState<VisitorEntry | null>(null);

  const selectedPurpose = purposeCode
    ? getVisitorPurposeById(purposeCode)
    : undefined;
  const requiresCustomPurpose = selectedPurpose
    ? purposeRequiresCustomText(selectedPurpose)
    : false;
  const requiresVehicle = selectedPurpose
    ? purposeRequiresVehicleNumber(selectedPurpose)
    : false;
  const isOtpMode = registrationMode === "verify_with_otp";
  const registrationModes: VisitorRegistrationMode[] = policy
    ? allowedVisitorRegistrationModes(policy)
    : ["verify_with_otp"];

  const loadPolicies = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoadingPolicy(true);
    setPolicyError(null);
    try {
      const result = await getSocietySecurityPolicies(accessToken);
      setPolicy(result.policy);
      if (result.policy.otpRequired) {
        setRegistrationMode("verify_with_otp");
      }
    } catch (error) {
      setPolicy(null);
      setPolicyError(
        error instanceof Error
          ? error.message
          : SECURITY_POLICY_LOAD_FAILED_MESSAGE,
      );
    } finally {
      setIsLoadingPolicy(false);
    }
  }, [accessToken]);

  const filteredFlats = useMemo(() => {
    const query = flatSearch.trim().toLowerCase();
    if (!query) {
      return flats;
    }
    return flats.filter((flat) =>
      formatResidentFlatLabel(flat.wingBuilding, flat.flatNumber)
        .toLowerCase()
        .includes(query),
    );
  }, [flatSearch, flats]);

  const selectedResident = useMemo(
    () => linkedResidents.find((resident) => resident.id === selectedResidentId) ?? null,
    [linkedResidents, selectedResidentId],
  );

  const composedOtherDestination = useMemo(
    () =>
      composeOtherDestinationText({
        optionId: otherOptionId,
        extraText: otherExtraText,
      }),
    [otherOptionId, otherExtraText],
  );

  const canSubmit = Boolean(
    policy &&
      (destinationMode === "other"
        ? composedOtherDestination.ok
        : selectedFlat) &&
      purposeCode &&
      photoUploadId &&
      (!isOtpMode || otpVerificationToken) &&
      (isOtpMode || otpFallbackReason.trim()),
  );

  const loadFlats = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoadingFlats(true);
    setErrorMessage(null);
    try {
      setFlats(await listActiveFlats(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load flats.",
      );
    } finally {
      setIsLoadingFlats(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadFlats();
  }, [loadFlats]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  useEffect(() => {
    setOtpChallengeId(null);
    setOtpCode("");
    setOtpVerificationToken(null);
    setDevOtpHint(null);
  }, [registrationMode, visitorMobile]);

  const handleSelectFlat = async (
    flat: Awaited<ReturnType<typeof listActiveFlats>>[number],
  ) => {
    if (!accessToken) {
      return;
    }

    setSelectedFlat(flat);
    setDestinationMode("flat");
    setOtherOptionId(null);
    setOtherExtraText("");
    setSelectedResidentId(null);
    setLinkedResidents([]);
    setFieldErrors((current) => ({ ...current, flatId: "", destinationText: "" }));
    setErrorMessage(null);
    setIsLoadingResidents(true);

    try {
      const residents = await listLinkedResidentsForFlat(accessToken, flat.id);
      setLinkedResidents(residents);
      if (residents.length === 1) {
        setSelectedResidentId(residents[0].id);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load residents for this flat.",
      );
    } finally {
      setIsLoadingResidents(false);
    }
  };

  const handleSelectFlatDestination = () => {
    setDestinationMode("flat");
    setOtherOptionId(null);
    setOtherExtraText("");
    setFieldErrors((current) => ({ ...current, destinationText: "", flatId: "" }));
    setErrorMessage(null);
  };

  const handleSelectOtherDestination = () => {
    setDestinationMode("other");
    setSelectedFlat(null);
    setSelectedResidentId(null);
    setLinkedResidents([]);
    setOtherOptionId(null);
    setOtherExtraText("");
    setFieldErrors((current) => ({
      ...current,
      flatId: "",
      residentId: "",
      destinationText: "",
    }));
    setErrorMessage(null);
  };

  const handleSelectOtherOption = (optionId: OtherDestinationOptionId) => {
    if (optionId !== otherOptionId) {
      setOtherExtraText("");
    }
    setOtherOptionId(optionId);
    setFieldErrors((current) => ({ ...current, destinationText: "" }));
    setErrorMessage(null);
  };

  const handleSendOtp = async () => {
    if (!accessToken) {
      return;
    }
    if (isOffDuty) {
      setErrorMessage(offDutyMessage);
      return;
    }

    const normalizedMobile = normalizeIndianMobileNumber(visitorMobile);
    setVisitorMobile(normalizedMobile);
    setErrorMessage(null);
    setFieldErrors((current) => ({ ...current, visitorMobile: "" }));
    setIsSendingOtp(true);

    try {
      const result = await sendVisitorOtp(
        accessToken,
        normalizedMobile,
        otpChallengeId,
      );
      setOtpChallengeId(result.challengeId);
      setOtpVerificationToken(null);
      setDevOtpHint(result.devOtpCode ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send OTP.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!accessToken || !otpChallengeId) {
      return;
    }
    if (isOffDuty) {
      setErrorMessage(offDutyMessage);
      return;
    }

    const start = startOtpVerification({
      isVerifying: isVerifyingOtpRef.current || isVerifyingOtp,
      verificationToken: otpVerificationToken,
      fieldError: fieldErrors.otpVerificationToken ?? "",
      verificationMethod: null,
    });
    if (!start.accepted) {
      return;
    }

    if (!isValidOtpCodeFormat(otpCode)) {
      const failure = resolveOtpVerificationFailure({ otpCode });
      setOtpVerificationToken(null);
      setFieldErrors((current) => ({
        ...current,
        otpVerificationToken: failure.fieldError,
      }));
      return;
    }

    isVerifyingOtpRef.current = true;
    setErrorMessage(null);
    setFieldErrors((current) => ({ ...current, otpVerificationToken: "" }));
    setOtpVerificationToken(null);
    setIsVerifyingOtp(true);

    try {
      const result = await verifyVisitorOtp(accessToken, otpChallengeId, otpCode);
      setOtpVerificationToken(result.verificationToken);
      setDevOtpHint(null);
    } catch (error) {
      setOtpVerificationToken(null);
      const failure = resolveOtpVerificationFailureFromUnknown(error, otpCode);
      setFieldErrors((current) => ({
        ...current,
        otpVerificationToken: failure.fieldError,
      }));
    } finally {
      isVerifyingOtpRef.current = false;
      setIsVerifyingOtp(false);
    }
  };

  const handleSubmit = async () => {
    if (!accessToken) {
      return;
    }
    if (isOffDuty) {
      setErrorMessage(offDutyMessage);
      return;
    }

    if (destinationMode === "flat" && !selectedFlat) {
      setErrorMessage("Select a flat before registering a visitor.");
      return;
    }

    if (destinationMode === "other") {
      if (!composedOtherDestination.ok) {
        setFieldErrors((current) => ({
          ...current,
          destinationText: composedOtherDestination.message,
        }));
        setErrorMessage(composedOtherDestination.message);
        return;
      }
    }

    if (!policy) {
      setErrorMessage(SECURITY_POLICY_LOAD_FAILED_MESSAGE);
      return;
    }

    setErrorMessage(null);
    setFieldErrors({});

    const normalizedMobile = normalizeIndianMobileNumber(visitorMobile);
    if (normalizedMobile !== visitorMobile) {
      setVisitorMobile(normalizedMobile);
    }

    const parsed = registerVisitorSchema.safeParse({
      flatId: destinationMode === "flat" ? selectedFlat?.id : undefined,
      destinationText:
        destinationMode === "other" && composedOtherDestination.ok
          ? composedOtherDestination.destinationText
          : undefined,
      residentId: destinationMode === "flat" ? selectedResidentId : undefined,
      visitorName: visitorName.trim(),
      visitorMobile: normalizedMobile,
      registrationMode,
      purposeCode: purposeCode ?? undefined,
      customPurposeText: requiresCustomPurpose ? customPurposeText : undefined,
      vehicleNumber: vehicleNumber.trim() ? vehicleNumber : undefined,
      vehicleVisuallyChecked: requiresVehicle ? vehicleVisuallyChecked : false,
      photoUploadId: photoUploadId ?? undefined,
      otpVerificationToken: isOtpMode ? otpVerificationToken ?? undefined : undefined,
      otpFallbackReason: isOtpMode ? undefined : otpFallbackReason,
      notes: notes.trim() ? notes : undefined,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        flatId: flattened.flatId?.[0] ?? "",
        destinationText: flattened.destinationText?.[0] ?? "",
        visitorName: flattened.visitorName?.[0] ?? "",
        visitorMobile: flattened.visitorMobile?.[0] ?? "",
        registrationMode: flattened.registrationMode?.[0] ?? "",
        purposeCode: flattened.purposeCode?.[0] ?? "",
        customPurposeText: flattened.customPurposeText?.[0] ?? "",
        vehicleNumber: flattened.vehicleNumber?.[0] ?? "",
        vehicleVisuallyChecked: flattened.vehicleVisuallyChecked?.[0] ?? "",
        photoUploadId: flattened.photoUploadId?.[0] ?? "",
        otpVerificationToken: flattened.otpVerificationToken?.[0] ?? "",
        otpFallbackReason: flattened.otpFallbackReason?.[0] ?? "",
        notes: flattened.notes?.[0] ?? "",
        residentId: flattened.residentId?.[0] ?? "",
      });
      return;
    }

    const policyCheck = evaluateVisitorSecurityPolicy({
      policy,
      registrationMode: parsed.data.registrationMode,
      otpFallbackReason: parsed.data.otpFallbackReason,
      residentId: parsed.data.residentId,
      purposeCode: parsed.data.purposeCode,
    });
    if (!policyCheck.ok) {
      setFieldErrors((current) => ({
        ...current,
        [policyCheck.field]: policyCheck.message,
      }));
      setErrorMessage(policyCheck.message);
      return;
    }

    setIsSubmitting(true);
    try {
      const entry = await registerVisitor(accessToken, {
        flatId: parsed.data.flatId,
        destinationText: parsed.data.destinationText,
        residentId: parsed.data.residentId,
        visitorName: parsed.data.visitorName,
        visitorMobile: parsed.data.visitorMobile,
        registrationMode: parsed.data.registrationMode,
        purposeCode: parsed.data.purposeCode,
        purposeLabel: parsed.data.purposeLabel,
        purposeText: parsed.data.purposeText,
        customPurposeText: parsed.data.customPurposeText,
        vehicleNumber: parsed.data.vehicleNumber,
        vehicleVisuallyChecked: parsed.data.vehicleVisuallyChecked,
        photoUploadId: parsed.data.photoUploadId,
        otpVerificationToken: parsed.data.otpVerificationToken,
        otpFallbackReason: parsed.data.otpFallbackReason,
        notes: parsed.data.notes,
      });
      setSuccessEntry(entry);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to register visitor.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successEntry) {
    return (
      <ScrollScreen
        title="Visitor Registered"
        subtitle="The visitor has been checked in successfully."
        footer={
          <Button
            label="Back to Dashboard"
            onPress={() => router.replace(GUARD_HOME_ROUTE)}
          />
        }
      >
        <View style={styles.successCards}>
          <InfoCard
            label="Flat"
            value={resolveVisitorDestinationLabel({
              flatId: successEntry.flatId,
              flatNumber: selectedFlat?.flatNumber,
              wingBuilding: selectedFlat?.wingBuilding,
              destinationText: successEntry.destinationText,
            })}
          />
          {selectedResident ? (
            <InfoCard label="Resident" value={selectedResident.name} />
          ) : null}
          {successEntry.visitorName ? (
            <InfoCard label="Full Name" value={successEntry.visitorName} />
          ) : null}
          <InfoCard label="Visitor Mobile" value={successEntry.visitorMobile} />
          <InfoCard label="Purpose" value={successEntry.purpose} />
          <InfoCard
            label="Verification"
            value={formatVerificationMethod(successEntry.verificationMethod)}
          />
          {successEntry.vehicleNumber ? (
            <InfoCard label="Car Number" value={successEntry.vehicleNumber} />
          ) : null}
          {successEntry.vehicleVisuallyChecked ? (
            <InfoCard
              label="Vehicle Check"
              value="Vehicle number visually checked by guard"
            />
          ) : null}
          {successEntry.otpFallbackReason ? (
            <InfoCard
              label="Registered without OTP"
              value={successEntry.otpFallbackReason}
            />
          ) : null}
          {successEntry.notes ? (
            <InfoCard label="Notes" value={successEntry.notes} />
          ) : null}
          <InfoCard label="Status" value={formatVisitorStatus(successEntry.status)} />
        </View>
      </ScrollScreen>
    );
  }

  return (
    <Screen
      title="New Visitor"
      subtitle="Register a visitor for a flat in your society."
      footer={
        <View style={styles.footerActions}>
          <Button
            label="Register Visitor"
            loading={isSubmitting}
            disabled={
              isOffDuty ||
              !canSubmit ||
              isLoadingFlats ||
              isUploadingPhoto ||
              isLoadingPolicy ||
              !policy
            }
            onPress={() => void handleSubmit()}
          />
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
        </View>
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.form}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {isOffDuty ? <ErrorBanner message={offDutyMessage} /> : null}
          {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
          {policyError ? (
            <View style={styles.section}>
              <ErrorBanner message={policyError} />
              <Button
                label="Retry policies"
                variant="secondary"
                onPress={() => void loadPolicies()}
              />
            </View>
          ) : null}
          {isLoadingPolicy ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Loading society security policies...</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verification method</Text>
            <View style={styles.optionList}>
              {registrationModes.map((mode) => {
                const isSelected = registrationMode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setRegistrationMode(mode)}
                    style={[
                      styles.optionCard,
                      isSelected ? styles.optionCardSelected : null,
                    ]}
                  >
                    <Text style={styles.optionTitle}>
                      {REGISTRATION_MODE_LABELS[mode]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select destination</Text>
            <View style={styles.optionList}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: destinationMode === "flat" }}
                onPress={handleSelectFlatDestination}
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
                onPress={handleSelectOtherDestination}
                style={[
                  styles.optionCard,
                  destinationMode === "other" ? styles.optionCardSelected : null,
                ]}
              >
                <Text style={styles.optionTitle}>Other</Text>
                <Text style={styles.optionCaption}>
                  Clubhouse, society office, unlisted flat, or another destination
                </Text>
              </Pressable>
            </View>
            {destinationMode === "other" ? (
              <OtherDestinationFields
                optionId={otherOptionId}
                extraText={otherExtraText}
                error={fieldErrors.destinationText}
                onSelectOption={handleSelectOtherOption}
                onChangeExtraText={(value) => {
                  setOtherExtraText(value);
                  if (fieldErrors.destinationText) {
                    setFieldErrors((current) => ({ ...current, destinationText: "" }));
                  }
                }}
              />
            ) : (
              <View>
                <TextField
                  label="Search flat number"
                  value={flatSearch}
                  onChangeText={setFlatSearch}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="e.g. M02-T101"
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
                          onPress={() => void handleSelectFlat(flat)}
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
                {fieldErrors.flatId ? (
                  <Text style={styles.fieldError}>{fieldErrors.flatId}</Text>
                ) : null}
              </View>
            )}
          </View>

          {selectedFlat ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Linked residents</Text>
              {isLoadingResidents ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.loadingText}>Loading residents...</Text>
                </View>
              ) : linkedResidents.length === 0 ? (
                <Text style={styles.emptyText}>
                  No residents are linked to this flat. You can still register the visitor.
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
                        onPress={() => setSelectedResidentId(resident.id)}
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
              {fieldErrors.residentId ? (
                <Text style={styles.fieldError}>{fieldErrors.residentId}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visitor details</Text>

            <TextField
              label="Full Name *"
              value={visitorName}
              onChangeText={(value) => {
                setVisitorName(value);
                if (fieldErrors.visitorName) {
                  setFieldErrors((current) => ({ ...current, visitorName: "" }));
                }
              }}
              autoCapitalize="words"
              maxLength={VISITOR_NAME_MAX_LENGTH}
              placeholder="Visitor full name"
              error={fieldErrors.visitorName}
            />

            <TextField
              label="Visitor mobile number *"
              value={visitorMobile}
              onChangeText={(value) => {
                setVisitorMobile(normalizeIndianMobileNumber(value));
                if (fieldErrors.visitorMobile) {
                  setFieldErrors((current) => ({ ...current, visitorMobile: "" }));
                }
              }}
              keyboardType="phone-pad"
              maxLength={14}
              placeholder="8465123135"
              error={fieldErrors.visitorMobile}
            />

            {isOtpMode ? (
              <View style={styles.subSection}>
                <Text style={styles.fieldLabel}>Mobile OTP verification *</Text>
                <View style={styles.inlineActions}>
                  <Button
                    label={otpChallengeId ? "Resend OTP" : "Send OTP"}
                    variant="secondary"
                    loading={isSendingOtp}
                    onPress={() => void handleSendOtp()}
                  />
                </View>
                {__DEV__ && devOtpHint ? (
                  <Text style={styles.devHint}>Dev OTP: {devOtpHint}</Text>
                ) : null}
                {otpChallengeId ? (
                  <>
                    <TextField
                      label="Enter 4-digit OTP *"
                      value={otpCode}
                      onChangeText={(value) => {
                        setOtpCode(value.replace(/\D/g, "").slice(0, 4));
                        if (fieldErrors.otpVerificationToken) {
                          setFieldErrors((current) => ({
                            ...current,
                            otpVerificationToken: "",
                          }));
                        }
                      }}
                      keyboardType="number-pad"
                      maxLength={4}
                      error={fieldErrors.otpVerificationToken}
                    />
                    <Button
                      label="Verify OTP"
                      variant="secondary"
                      loading={isVerifyingOtp}
                      disabled={isVerifyingOtp}
                      onPress={() => void handleVerifyOtp()}
                    />
                    {otpVerificationToken ? (
                      <Text style={styles.successHint}>Mobile number verified.</Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : (
              <>
                <TextField
                  label="Reason for registering without OTP *"
                  value={otpFallbackReason}
                  onChangeText={(value) => {
                    setOtpFallbackReason(value);
                    if (fieldErrors.otpFallbackReason) {
                      setFieldErrors((current) => ({
                        ...current,
                        otpFallbackReason: "",
                      }));
                    }
                  }}
                  autoCapitalize="sentences"
                  placeholder="e.g. Visitor phone has no network"
                  error={fieldErrors.otpFallbackReason}
                />
                <Text style={styles.helperText}>
                  OTP will not be performed for this registration.
                </Text>
              </>
            )}

            <SelectField
              label="Purpose *"
              value={purposeCode}
              options={purposeCodes}
              placeholder="Select purpose"
              getOptionLabel={(code) =>
                getVisitorPurposeById(code)?.label ?? code
              }
              error={fieldErrors.purposeCode}
              onChange={(code) => {
                setPurposeCode(code);
                if (!purposeRequiresCustomText(getVisitorPurposeById(code)!)) {
                  setCustomPurposeText("");
                }
                if (!purposeRequiresVehicleNumber(getVisitorPurposeById(code)!)) {
                  setVehicleNumber("");
                  setVehicleVisuallyChecked(false);
                }
                setFieldErrors((current) => ({
                  ...current,
                  purposeCode: "",
                  customPurposeText: "",
                  vehicleNumber: "",
                  vehicleVisuallyChecked: "",
                }));
              }}
            />

            {requiresCustomPurpose ? (
              <TextField
                label="Enter purpose *"
                value={customPurposeText}
                onChangeText={setCustomPurposeText}
                autoCapitalize="sentences"
                error={fieldErrors.customPurposeText}
              />
            ) : null}

            <TextField
              label={requiresVehicle ? "Car Number *" : "Car Number (optional)"}
              value={vehicleNumber}
              onChangeText={setVehicleNumber}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="MH01AB1234"
              error={fieldErrors.vehicleNumber}
            />

            {requiresVehicle ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: vehicleVisuallyChecked }}
                onPress={() => setVehicleVisuallyChecked((current) => !current)}
                style={styles.checkboxRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    vehicleVisuallyChecked ? styles.checkboxChecked : null,
                  ]}
                />
                <Text style={styles.checkboxLabel}>
                  Vehicle number visually checked by guard *
                </Text>
              </Pressable>
            ) : null}
            {fieldErrors.vehicleVisuallyChecked ? (
              <Text style={styles.fieldError}>{fieldErrors.vehicleVisuallyChecked}</Text>
            ) : null}

            <VisitorPhotoInput
              accessToken={accessToken}
              value={{ photoUri, photoUploadId }}
              isUploading={isUploadingPhoto}
              fieldError={fieldErrors.photoUploadId}
              onValueChange={({ photoUri: nextUri, photoUploadId: nextUploadId }) => {
                setPhotoUri(nextUri);
                setPhotoUploadId(nextUploadId);
              }}
              onUploadingChange={setIsUploadingPhoto}
              onError={setErrorMessage}
              onClearFieldError={() =>
                setFieldErrors((current) => ({ ...current, photoUploadId: "" }))
              }
            />

            <TextField
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={styles.notesInput}
              error={fieldErrors.notes}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1 },
  scrollContent: { gap: spacing.lg, paddingBottom: spacing.lg },
  footerActions: { gap: spacing.sm },
  section: { gap: spacing.sm },
  subSection: { gap: spacing.sm },
  sectionTitle: { ...typography.subtitle },
  fieldLabel: { ...typography.label },
  helperText: { ...typography.caption },
  devHint: { ...typography.caption, color: colors.accent },
  successHint: { ...typography.caption, color: colors.success },
  optionList: { gap: spacing.sm },
  optionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  optionCardSelected: {
    borderColor: colors.primaryBlue,
    backgroundColor: colors.selectedTint,
  },
  optionTitle: { ...typography.body, fontWeight: "600" },
  optionCaption: { ...typography.caption },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loadingText: { ...typography.caption },
  emptyText: { ...typography.caption },
  fieldError: { color: colors.error, fontSize: 13 },
  inlineActions: { flexDirection: "row", gap: spacing.sm },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxLabel: { ...typography.body, flex: 1 },
  notesInput: {
    minHeight: 96,
    textAlignVertical: "top",
    paddingTop: spacing.md,
  },
  successCards: { gap: spacing.md },
});
