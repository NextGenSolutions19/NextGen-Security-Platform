import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  GUARD_ACCOUNT_STATUS_UPDATED_MESSAGE,
  GUARD_ACCOUNT_UPDATED_MESSAGE,
  GUARD_DEACTIVATE_CONFIRM_MESSAGE,
  GUARD_DEACTIVATE_CONFIRM_TITLE,
  GUARD_PASSWORD_RESET_MESSAGE,
  formatGuardAccountStatus,
  formatGuardCreatedMessage,
  formatGuardDutyLabel,
  parseGuardPassword,
  parseGuardProfileSave,
  type GuardAccount,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { replaceAdminDashboard } from "@/features/admin-dashboard/adminDashboardModules";
import {
  createGuardAccount,
  listGuardAccounts,
  resetGuardAccountPassword,
  setGuardAccountStatus,
  updateGuardAccount,
} from "@/features/guard-management/guardManagementService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { PasswordField } from "@/components/ui/PasswordField";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface GuardDraft {
  guardName: string;
  mobileNumber: string;
}

const EMPTY_DRAFT: GuardDraft = { guardName: "", mobileNumber: "" };

export default function GuardManagementScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [guards, setGuards] = useState<GuardAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<GuardDraft>(EMPTY_DRAFT);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<GuardDraft>(EMPTY_DRAFT);
  const [editError, setEditError] = useState<string | null>(null);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<GuardAccount | null>(null);

  const loadGuards = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setGuards(await listGuardAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load guard accounts.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadGuards();
  }, [loadGuards]);

  const handleCreate = async () => {
    if (!accessToken || isSaving) {
      return;
    }
    const profileParsed = parseGuardProfileSave(createDraft);
    const passwordParsed = parseGuardPassword(newPassword);
    const errors: Record<string, string> = {};
    if (!profileParsed.ok) {
      if (/mobile/i.test(profileParsed.message)) {
        errors.mobileNumber = profileParsed.message;
      } else {
        errors.guardName = profileParsed.message;
      }
    }
    if (!passwordParsed.ok) {
      errors.password = passwordParsed.message;
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    if (Object.keys(errors).length > 0 || !profileParsed.ok || !passwordParsed.ok) {
      setCreateErrors(errors);
      return;
    }

    setIsSaving(true);
    setCreateErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const created = await createGuardAccount(accessToken, {
        guardName: profileParsed.value.guardName,
        mobileNumber: profileParsed.value.mobileNumber,
        password: passwordParsed.password,
      });
      setCreateDraft(EMPTY_DRAFT);
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage(formatGuardCreatedMessage(created.loginId));
      setGuards(await listGuardAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create guard account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (guard: GuardAccount) => {
    if (!accessToken || isSaving) {
      return;
    }
    const parsed = parseGuardProfileSave(editDraft);
    if (!parsed.ok) {
      setEditError(parsed.message);
      return;
    }
    setIsSaving(true);
    setEditError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateGuardAccount(accessToken, {
        guardId: guard.id,
        guardName: parsed.value.guardName,
        mobileNumber: parsed.value.mobileNumber,
      });
      setEditTargetId(null);
      setSuccessMessage(GUARD_ACCOUNT_UPDATED_MESSAGE);
      setGuards(await listGuardAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update guard account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetStatus = async (guard: GuardAccount, status: "active" | "disabled") => {
    if (!accessToken || isSaving) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await setGuardAccountStatus(accessToken, { guardId: guard.id, status });
      setDeactivateTarget(null);
      setSuccessMessage(GUARD_ACCOUNT_STATUS_UPDATED_MESSAGE);
      setGuards(await listGuardAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update guard account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async (guard: GuardAccount) => {
    if (!accessToken || isSaving) {
      return;
    }
    const passwordParsed = parseGuardPassword(resetPassword);
    if (!passwordParsed.ok) {
      setResetError(passwordParsed.message);
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError("Passwords do not match.");
      return;
    }
    setIsSaving(true);
    setResetError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await resetGuardAccountPassword(accessToken, {
        guardId: guard.id,
        password: passwordParsed.password,
      });
      setResetTargetId(null);
      setResetPassword("");
      setResetConfirm("");
      setSuccessMessage(GUARD_PASSWORD_RESET_MESSAGE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to reset password.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (deactivateTarget) {
    return (
      <AdminScrollScreen
        title={GUARD_DEACTIVATE_CONFIRM_TITLE}
        subtitle={GUARD_DEACTIVATE_CONFIRM_MESSAGE}
        footer={
          <View style={styles.confirmFooter}>
            <Button
              label="Deactivate Guard"
              loading={isSaving}
              disabled={isSaving}
              onPress={() => void handleSetStatus(deactivateTarget, "disabled")}
            />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={isSaving}
              onPress={() => {
                if (!isSaving) {
                  setErrorMessage(null);
                  setDeactivateTarget(null);
                }
              }}
            />
          </View>
        }
      >
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        <InfoCard
          label="Guard Name"
          value={deactivateTarget.guardName?.trim() || deactivateTarget.loginId}
        />
        <InfoCard label="Login ID" value={deactivateTarget.loginId} />
      </AdminScrollScreen>
    );
  }

  return (
    <AdminScrollScreen
      title="Guard Management"
      subtitle="Guard accounts in your society only. Login ID is generated automatically."
      footer={
        <Button
          label="Back to Dashboard"
          variant="secondary"
          disabled={isSaving}
          onPress={() => replaceAdminDashboard(router as never)}
        />
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      {successMessage ? <SuccessBanner message={successMessage} /> : null}

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading guard accounts...</Text>
        </View>
      ) : null}

      {!isLoading && errorMessage && guards.length === 0 ? (
        <Button label="Retry" variant="secondary" onPress={() => void loadGuards()} />
      ) : null}

      <Text style={styles.sectionTitle}>Add guard</Text>
      <TextField
        label="Guard Name"
        value={createDraft.guardName}
        autoCapitalize="words"
        onChangeText={(value) => {
          setCreateDraft((current) => ({ ...current, guardName: value }));
          setCreateErrors((current) => ({ ...current, guardName: "" }));
        }}
        error={createErrors.guardName}
        editable={!isSaving}
      />
      <TextField
        label="Mobile Number"
        value={createDraft.mobileNumber}
        keyboardType="phone-pad"
        onChangeText={(value) => {
          setCreateDraft((current) => ({ ...current, mobileNumber: value }));
          setCreateErrors((current) => ({ ...current, mobileNumber: "" }));
        }}
        error={createErrors.mobileNumber}
        editable={!isSaving}
      />
      <PasswordField
        label="Temporary password"
        value={newPassword}
        onChangeText={(value) => {
          setNewPassword(value);
          setCreateErrors((current) => ({ ...current, password: "" }));
        }}
        error={createErrors.password}
        editable={!isSaving}
      />
      <PasswordField
        label="Confirm password"
        value={confirmPassword}
        onChangeText={(value) => {
          setConfirmPassword(value);
          setCreateErrors((current) => ({ ...current, confirmPassword: "" }));
        }}
        error={createErrors.confirmPassword}
        editable={!isSaving}
      />
      <Text style={styles.caption}>
        Login ID is assigned automatically as GUARD01, GUARD02, and so on. New
        guards must change this password on first login. Minimum{" "}
        {ADMIN_PASSWORD_MIN_LENGTH} characters.
      </Text>
      <Button
        label={isSaving ? "Creating..." : "Create Guard"}
        loading={isSaving}
        disabled={isSaving || !createDraft.guardName.trim() || !newPassword}
        onPress={() => void handleCreate()}
      />

      <Text style={styles.sectionTitle}>Guards in this society</Text>
      {guards.map((guard) => (
        <View key={guard.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {guard.guardName?.trim() || guard.loginId}
          </Text>
          <Text style={styles.cardMeta}>
            {formatGuardAccountStatus(guard.status)} · {formatGuardDutyLabel(guard.onDuty)}
          </Text>
          <Text style={styles.cardId}>Login ID {guard.loginId}</Text>
          {guard.mobileNumber ? (
            <Text style={styles.cardId}>Mobile {guard.mobileNumber}</Text>
          ) : null}
          <View style={styles.cardActions}>
            <Button
              label={editTargetId === guard.id ? "Cancel edit" : "Edit"}
              variant="secondary"
              disabled={isSaving}
              onPress={() => {
                setEditTargetId((current) => (current === guard.id ? null : guard.id));
                setEditDraft({
                  guardName: guard.guardName ?? "",
                  mobileNumber: guard.mobileNumber ?? "",
                });
                setEditError(null);
              }}
            />
            {guard.status === "active" ? (
              <Button
                label="Deactivate"
                variant="secondary"
                disabled={isSaving}
                onPress={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setDeactivateTarget(guard);
                }}
              />
            ) : (
              <Button
                label="Reactivate"
                variant="secondary"
                disabled={isSaving}
                onPress={() => void handleSetStatus(guard, "active")}
              />
            )}
            <Button
              label={resetTargetId === guard.id ? "Cancel reset" : "Reset Password"}
              variant="secondary"
              disabled={isSaving}
              onPress={() => {
                setResetTargetId((current) => (current === guard.id ? null : guard.id));
                setResetPassword("");
                setResetConfirm("");
                setResetError(null);
              }}
            />
          </View>
          {editTargetId === guard.id ? (
            <View style={styles.resetBox}>
              <TextField
                label="Guard Name"
                value={editDraft.guardName}
                autoCapitalize="words"
                onChangeText={(value) => {
                  setEditDraft((current) => ({ ...current, guardName: value }));
                  setEditError(null);
                }}
                editable={!isSaving}
              />
              <TextField
                label="Mobile Number"
                value={editDraft.mobileNumber}
                keyboardType="phone-pad"
                onChangeText={(value) => {
                  setEditDraft((current) => ({ ...current, mobileNumber: value }));
                  setEditError(null);
                }}
                error={editError ?? undefined}
                editable={!isSaving}
              />
              <Button
                label="Save details"
                disabled={isSaving || !editDraft.guardName.trim()}
                onPress={() => void handleUpdate(guard)}
              />
            </View>
          ) : null}
          {resetTargetId === guard.id ? (
            <View style={styles.resetBox}>
              <PasswordField
                label="New temporary password"
                value={resetPassword}
                onChangeText={(value) => {
                  setResetPassword(value);
                  setResetError(null);
                }}
                editable={!isSaving}
              />
              <PasswordField
                label="Confirm password"
                value={resetConfirm}
                onChangeText={(value) => {
                  setResetConfirm(value);
                  setResetError(null);
                }}
                error={resetError ?? undefined}
                editable={!isSaving}
              />
              <Button
                label="Save new password"
                disabled={isSaving || !resetPassword}
                onPress={() => void handleResetPassword(guard)}
              />
            </View>
          ) : null}
        </View>
      ))}
    </AdminScrollScreen>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
  },
  caption: {
    ...typography.caption,
  },
  sectionTitle: {
    ...typography.subtitle,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.subtitle,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
  },
  cardId: {
    ...typography.caption,
  },
  cardActions: {
    gap: spacing.sm,
  },
  resetBox: {
    gap: spacing.sm,
  },
  confirmFooter: {
    gap: spacing.sm,
  },
});
