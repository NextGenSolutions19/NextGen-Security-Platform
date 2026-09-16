import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  SECURITY_POLICY_SAVE_SUCCESS_MESSAGE,
  societySecurityPoliciesEqual,
  type SocietySecurityPolicy,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  getSocietySecurityPolicies,
  saveSocietySecurityPolicies,
  type SocietySecurityPolicySource,
} from "@/features/security-policies/societySecurityPolicyService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { colors, radius, spacing, typography } from "@/constants/theme";

const ADMIN_DASHBOARD_ROUTE = "/(admin)/dashboard" as Href;

export default function AdminSecurityPoliciesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [loadedPolicy, setLoadedPolicy] = useState<SocietySecurityPolicy | null>(
    null,
  );
  const [draftPolicy, setDraftPolicy] = useState<SocietySecurityPolicy | null>(
    null,
  );
  const [source, setSource] = useState<SocietySecurityPolicySource>("defaults");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isDirty = useMemo(() => {
    if (!loadedPolicy || !draftPolicy) {
      return false;
    }
    return !societySecurityPoliciesEqual(loadedPolicy, draftPolicy);
  }, [draftPolicy, loadedPolicy]);

  const canSave = Boolean(draftPolicy) && !isLoading && !isSaving && (isDirty || source === "defaults");

  const loadPolicies = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await getSocietySecurityPolicies(accessToken);
      setLoadedPolicy(result.policy);
      setDraftPolicy(result.policy);
      setSource(result.source);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load security policies.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const handleSave = async () => {
    if (!accessToken || !draftPolicy || isSaving || !canSave) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await saveSocietySecurityPolicies(accessToken, draftPolicy);
      setLoadedPolicy(result.policy);
      setDraftPolicy(result.policy);
      setSource(result.source);
      setSuccessMessage(SECURITY_POLICY_SAVE_SUCCESS_MESSAGE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save security policies.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminScrollScreen
      title="Security Policies"
      subtitle="Visitor rules for your society. These apply to Guard New Visitor and Group Visitor."
      footer={
        <View style={styles.footer}>
          <Button
            label={isSaving ? "Saving..." : "Save policies"}
            loading={isSaving}
            disabled={!canSave}
            onPress={() => void handleSave()}
          />
          <Button
            label="Back to Dashboard"
            variant="secondary"
            disabled={isSaving}
            onPress={() => router.replace(ADMIN_DASHBOARD_ROUTE)}
          />
        </View>
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {successMessage ? <SuccessBanner message={successMessage} /> : null}

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading security policies...</Text>
        </View>
      ) : null}

      {!isLoading && errorMessage && !draftPolicy ? (
        <Button label="Retry" variant="secondary" onPress={() => void loadPolicies()} />
      ) : null}

      {draftPolicy ? (
        <>
          <Text style={styles.caption}>
            {source === "defaults"
              ? "These are the current product defaults for your society. Save to store them, or change a setting first."
              : "Showing saved policies for your society."}
          </Text>

          <PolicyChoice
            title="Visitor OTP"
            description="When required, Guards must verify the visitor mobile number with OTP. Register without OTP is turned off."
            value={draftPolicy.otpRequired}
            trueLabel="Required"
            falseLabel="Optional"
            disabled={isSaving}
            onChange={(otpRequired) => {
              setSuccessMessage(null);
              setDraftPolicy({ ...draftPolicy, otpRequired });
            }}
          />

          <View style={styles.fixedCard}>
            <Text style={styles.fixedTitle}>Always enforced</Text>
            <Text style={styles.fixedItem}>Visitor photo is required for every registration.</Text>
            <Text style={styles.fixedItem}>
              Every visit requires a destination: an existing Resident Master flat, or Other with a destination.
            </Text>
            <Text style={styles.fixedItem}>
              Cab / Taxi always requires a vehicle number and visual check.
            </Text>
            <Text style={styles.fixedItem}>
              Register without OTP always requires a reason when that mode is allowed.
            </Text>
          </View>
        </>
      ) : null}
    </AdminScrollScreen>
  );
}

function PolicyChoice({
  title,
  description,
  value,
  trueLabel,
  falseLabel,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  trueLabel: string;
  falseLabel: string;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.policyCard}>
      <Text style={styles.policyTitle}>{title}</Text>
      <Text style={styles.policyDescription}>{description}</Text>
      <View style={styles.optionList}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: !value }}
          disabled={disabled}
          onPress={() => onChange(false)}
          style={[styles.optionCard, !value ? styles.optionCardSelected : null]}
        >
          <Text style={styles.optionTitle}>{falseLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: value }}
          disabled={disabled}
          onPress={() => onChange(true)}
          style={[styles.optionCard, value ? styles.optionCardSelected : null]}
        >
          <Text style={styles.optionTitle}>{trueLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: spacing.sm,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  caption: {
    ...typography.caption,
  },
  policyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  policyTitle: {
    ...typography.subtitle,
  },
  policyDescription: {
    ...typography.body,
    color: colors.textSecondary,
  },
  optionList: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  optionCard: {
    flex: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  optionCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.background,
  },
  optionTitle: {
    ...typography.body,
    fontWeight: "600",
    textAlign: "center",
  },
  fixedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  fixedTitle: {
    ...typography.subtitle,
  },
  fixedItem: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
