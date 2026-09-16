import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  buildUpdateResidentRequest,
  isAdminResidentType,
  type AdminResidentDirectoryItem,
  type AdminResidentFormErrors,
  type AdminResidentType,
  validateAdminResidentForm,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminResidentFormFields } from "@/features/admin-residents/AdminResidentFormFields";
import { getAdminSocietyResident } from "@/features/admin-residents/adminResidentDirectoryService";
import { mutateAdminResident } from "@/features/admin-residents/adminResidentMutationService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { colors, spacing, typography } from "@/constants/theme";

const LIST_ROUTE = {
  pathname: "/(admin)/residents",
  params: { notice: "updated" },
} as Href;

function initialType(
  value: string | null,
): AdminResidentType | null {
  return isAdminResidentType(value) ? value : null;
}

export default function EditResidentScreen() {
  const router = useRouter();
  const { residentFlatId } = useLocalSearchParams<{ residentFlatId: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [item, setItem] = useState<AdminResidentDirectoryItem | null>(null);
  const [flatNumber, setFlatNumber] = useState("");
  const [residentName, setResidentName] = useState("");
  const [mobile, setMobile] = useState("");
  const [wingBuilding, setWingBuilding] = useState("");
  const [residentType, setResidentType] = useState<AdminResidentType | null>(
    null,
  );
  const [errors, setErrors] = useState<AdminResidentFormErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadResident = useCallback(async () => {
    if (!accessToken || !jwtSocietyId || !residentFlatId) {
      setIsLoading(false);
      setErrorMessage("Resident not found.");
      return;
    }

    try {
      const found = await getAdminSocietyResident(
        accessToken,
        jwtSocietyId,
        residentFlatId,
      );
      if (!found) {
        setErrorMessage("Resident not found.");
        setItem(null);
        return;
      }

      setItem(found);
      setFlatNumber(found.flatNumber);
      setResidentName(found.residentName);
      setMobile(found.mobile ?? "");
      setWingBuilding(found.wingBuilding ?? "");
      setResidentType(initialType(found.residentType));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load resident.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, jwtSocietyId, residentFlatId]);

  useEffect(() => {
    void loadResident();
  }, [loadResident]);

  const clearFieldError = (field: keyof AdminResidentFormErrors) => {
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleSubmit = async () => {
    if (!item || isSubmitting) {
      return;
    }

    const parsed = validateAdminResidentForm({
      flatNumber,
      residentName,
      mobile,
      wingBuilding,
      residentType,
    });

    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }

    if (!accessToken) {
      setErrorMessage("Your session has expired. Please login again.");
      return;
    }

    setErrors({});
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await mutateAdminResident(
        accessToken,
        buildUpdateResidentRequest(item.residentId, item.id, parsed.value),
      );
      router.replace(LIST_ROUTE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update resident.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminScrollScreen
        title="Edit Resident"
        subtitle="Update resident details for your society."
        footer={
          <Button
            label="Back"
            variant="secondary"
            onPress={() => router.back()}
          />
        }
      >
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading resident...</Text>
        </View>
      </AdminScrollScreen>
    );
  }

  if (!item) {
    return (
      <AdminScrollScreen
        title="Edit Resident"
        subtitle="Update resident details for your society."
        footer={
          <Button
            label="Back"
            variant="secondary"
            onPress={() => router.back()}
          />
        }
      >
        <ErrorBanner message={errorMessage ?? "Resident not found."} />
      </AdminScrollScreen>
    );
  }

  return (
    <AdminScrollScreen
      title="Edit Resident"
      subtitle="Update resident details for your society."
      footer={
        <>
          <Button
            label="Save Changes"
            loading={isSubmitting}
            disabled={isSubmitting}
            onPress={() => void handleSubmit()}
          />
          <Button
            label="Cancel"
            variant="secondary"
            disabled={isSubmitting}
            onPress={() => router.back()}
            style={{ marginTop: 8 }}
          />
        </>
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      <AdminResidentFormFields
        flatNumber={flatNumber}
        residentName={residentName}
        mobile={mobile}
        wingBuilding={wingBuilding}
        residentType={residentType}
        errors={errors}
        onChangeFlatNumber={(value) => {
          setFlatNumber(value);
          clearFieldError("flatNumber");
        }}
        onChangeResidentName={(value) => {
          setResidentName(value);
          clearFieldError("residentName");
        }}
        onChangeMobile={(value) => {
          setMobile(value);
          clearFieldError("mobile");
        }}
        onChangeWingBuilding={setWingBuilding}
        onChangeResidentType={(value) => {
          setResidentType(value);
          clearFieldError("residentType");
        }}
      />
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
