import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  formatRecurringPassCalendarDate,
  formatRecurringPassEffectiveStatus,
  formatStoredRecurringVisitorType,
  parseAdminRecurringPassRenewDate,
  validateRecurringPassRenewalRange,
  type AdminRecurringVisitorPassListItem,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminIndianDateField } from "@/features/admin-visitors/AdminIndianDateField";
import {
  getAdminSocietyRecurringPass,
  renewAdminRecurringPassValidity,
} from "@/features/admin-recurring-passes/adminRecurringPassService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { colors, spacing } from "@/constants/theme";

function detailsRoute(passId: string): Href {
  return `/(admin)/recurring-passes/${passId}` as Href;
}

export default function AdminRenewRecurringPassValidityScreen() {
  const router = useRouter();
  const { passId } = useLocalSearchParams<{ passId: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const jwtSocietyId = session?.user.societyId ?? "";

  const [item, setItem] = useState<AdminRecurringVisitorPassListItem | null>(null);
  const [validUntilDisplay, setValidUntilDisplay] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadPass = useCallback(async () => {
    if (!accessToken || !jwtSocietyId || !passId) {
      setIsLoading(false);
      setErrorMessage("Recurring visitor pass not found.");
      return;
    }

    setIsLoading(true);
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
      if (found.status === "revoked") {
        setItem(found);
        setErrorMessage("A revoked pass cannot have its validity extended.");
        return;
      }
      setItem(found);
      setValidUntilDisplay(formatRecurringPassCalendarDate(found.validUntil));
      setErrorMessage(null);
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

  const save = async () => {
    if (!item || !accessToken) {
      return;
    }

    const parsed = parseAdminRecurringPassRenewDate(validUntilDisplay);
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    const range = validateRecurringPassRenewalRange({
      validFrom: item.validFrom,
      currentValidUntil: item.validUntil,
      nextValidUntil: parsed.validUntil,
    });
    if (!range.ok) {
      setFieldError(range.message);
      return;
    }

    setFieldError(null);
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await renewAdminRecurringPassValidity(accessToken, item.id, parsed.validUntil);
      setSuccessMessage("Validity extended.");
      setTimeout(() => {
        router.replace(detailsRoute(item.id));
      }, 400);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to renew the recurring visitor pass.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminScrollScreen
        title="Renew / Extend Validity"
        subtitle="Choose a later Valid Until date."
        footer={
          <Button
            label="Back to Pass Details"
            variant="secondary"
            onPress={() =>
              router.replace(passId ? detailsRoute(passId) : ("/(admin)/recurring-passes" as Href))
            }
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
        title="Renew / Extend Validity"
        subtitle="Choose a later Valid Until date."
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

  return (
    <AdminScrollScreen
      title="Renew / Extend Validity"
      subtitle="This does not issue a new QR. The existing credential stays associated."
      footer={
        <>
          {item.status !== "revoked" ? (
            <Button
              label="Save New Valid Until"
              loading={isSaving}
              disabled={isSaving}
              onPress={() => void save()}
            />
          ) : null}
          <Button
            label="Back to Pass Details"
            variant="secondary"
            style={item.status !== "revoked" ? styles.stacked : undefined}
            onPress={() => router.replace(detailsRoute(item.id))}
          />
        </>
      }
      contentContainerStyle={styles.content}
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {successMessage ? <SuccessBanner message={successMessage} /> : null}
      <InfoCard label="Visitor name" value={item.visitorName} />
      <InfoCard
        label="Visitor type"
        value={formatStoredRecurringVisitorType(item)}
      />
      <InfoCard
        label="Effective status"
        value={formatRecurringPassEffectiveStatus(item)}
      />
      <InfoCard
        label="Current valid from"
        value={formatRecurringPassCalendarDate(item.validFrom)}
      />
      <InfoCard
        label="Current valid until"
        value={formatRecurringPassCalendarDate(item.validUntil)}
      />
      <AdminIndianDateField
        label="New valid until"
        value={validUntilDisplay}
        onChange={setValidUntilDisplay}
        error={fieldError}
      />
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  stacked: {
    marginTop: 8,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
});
