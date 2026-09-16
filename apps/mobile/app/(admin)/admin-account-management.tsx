import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ADMIN_ACCOUNT_STATUS_UPDATED_MESSAGE,
  ADMIN_DEMOTE_CONFIRM_MESSAGE,
  ADMIN_DEMOTE_CONFIRM_TITLE,
  ADMIN_DEMOTED_MESSAGE,
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_PASSWORD_RESET_MESSAGE,
  ADMIN_PROMOTE_CONFIRM_MESSAGE,
  ADMIN_PROMOTE_CONFIRM_TITLE,
  ADMIN_PROMOTED_MESSAGE,
  formatAdminAccountStatus,
  formatAdminCreatedMessage,
  formatAdminRoleLabel,
  getAdminDeactivateBlockReason,
  getAdminDemoteBlockReason,
  getAdminPromoteBlockReason,
  parseAdminProfileSave,
  parseNewPassword,
  type AdminAccount,
  type AdminProfile,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { replaceAdminDashboard } from "@/features/admin-dashboard/adminDashboardModules";
import {
  createAdminAccount,
  getAdminProfile,
  listAdminAccounts,
  resetAdminAccountPassword,
  setAdminAccountStatus,
  setAdminAuthorized,
  updateAdminAccount,
} from "@/features/admin-management/adminManagementService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoCard } from "@/components/ui/InfoCard";
import { PasswordField } from "@/components/ui/PasswordField";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";
import { SuccessBanner } from "@/components/ui/SuccessBanner";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface AdminIdentityDraft {
  adminName: string;
  mobileNumber: string;
  email: string;
}

type ConfirmAction =
  | { type: "promote"; admin: AdminAccount }
  | { type: "demote"; admin: AdminAccount }
  | { type: "deactivate"; admin: AdminAccount };

const DEACTIVATE_CONFIRM_TITLE = "Deactivate Admin?";
const DEACTIVATE_CONFIRM_MESSAGE =
  "This Admin will no longer be able to sign in or access the society account until reactivated.";

const EMPTY_IDENTITY: AdminIdentityDraft = {
  adminName: "",
  mobileNumber: "",
  email: "",
};

function toIdentityDraft(admin: AdminAccount): AdminIdentityDraft {
  return {
    adminName: admin.adminName ?? "",
    mobileNumber: admin.mobileNumber ?? "",
    email: admin.email ?? "",
  };
}

export default function AdminAccountManagementScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const actorId = session?.user.id ?? "";

  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<AdminIdentityDraft>(EMPTY_IDENTITY);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AdminIdentityDraft>(EMPTY_IDENTITY);
  const [editError, setEditError] = useState<string | null>(null);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const activeAuthorizedCount = useMemo(
    () =>
      admins.filter(
        (admin) => admin.isAuthorizedAdmin && admin.status === "active",
      ).length,
    [admins],
  );

  const loadAccounts = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const current = await getAdminProfile(accessToken);
      setProfile(current);
      if (!current.isAuthorizedAdmin) {
        setAdmins([]);
        return;
      }
      setAdmins(await listAdminAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load admin accounts.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const handleCreate = async () => {
    if (!accessToken || isSaving) {
      return;
    }

    const profileParsed = parseAdminProfileSave(createDraft);
    const passwordParsed = parseNewPassword(newPassword);
    const errors: Record<string, string> = {};
    if (!profileParsed.ok) {
      if (/name/i.test(profileParsed.message)) {
        errors.adminName = profileParsed.message;
      } else if (/mobile/i.test(profileParsed.message)) {
        errors.mobileNumber = profileParsed.message;
      } else if (/email/i.test(profileParsed.message)) {
        errors.email = profileParsed.message;
      } else {
        errors.adminName = profileParsed.message;
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
      const created = await createAdminAccount(accessToken, {
        adminName: profileParsed.value.adminName,
        mobileNumber: profileParsed.value.mobileNumber,
        email: profileParsed.value.email,
        password: passwordParsed.password,
      });
      setCreateDraft(EMPTY_IDENTITY);
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage(formatAdminCreatedMessage(created.loginId));
      setAdmins(await listAdminAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create admin account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (admin: AdminAccount) => {
    if (!accessToken || isSaving) {
      return;
    }

    const parsed = parseAdminProfileSave(editDraft);
    if (!parsed.ok) {
      setEditError(parsed.message);
      return;
    }

    setIsSaving(true);
    setEditError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateAdminAccount(accessToken, {
        adminId: admin.id,
        adminName: parsed.value.adminName,
        mobileNumber: parsed.value.mobileNumber,
        email: parsed.value.email,
      });
      setEditTargetId(null);
      setSuccessMessage("Admin details saved.");
      setAdmins(await listAdminAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update admin account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetStatus = async (
    admin: AdminAccount,
    status: "active" | "disabled",
  ) => {
    if (!accessToken || isSaving) {
      return;
    }

    const block = getAdminDeactivateBlockReason({
      actorId,
      targetId: admin.id,
      targetIsAuthorizedAdmin: admin.isAuthorizedAdmin,
      targetStatus: admin.status,
      newStatus: status,
      activeAuthorizedAdminCount: activeAuthorizedCount,
    });
    if (block) {
      setErrorMessage(block);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await setAdminAccountStatus(accessToken, { adminId: admin.id, status });
      setConfirmAction(null);
      setSuccessMessage(ADMIN_ACCOUNT_STATUS_UPDATED_MESSAGE);
      setAdmins(await listAdminAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update admin account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async (admin: AdminAccount) => {
    if (!accessToken || isSaving) {
      return;
    }

    const passwordParsed = parseNewPassword(resetPassword);
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
      await resetAdminAccountPassword(accessToken, {
        adminId: admin.id,
        password: passwordParsed.password,
      });
      setResetTargetId(null);
      setResetPassword("");
      setResetConfirm("");
      setSuccessMessage(ADMIN_PASSWORD_RESET_MESSAGE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to reset password.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetAuthorized = async (admin: AdminAccount, isAuthorizedAdmin: boolean) => {
    if (!accessToken || isSaving) {
      return;
    }

    const block = isAuthorizedAdmin
      ? getAdminPromoteBlockReason({
          targetIsAuthorizedAdmin: admin.isAuthorizedAdmin,
          targetStatus: admin.status,
        })
      : getAdminDemoteBlockReason({
          targetIsAuthorizedAdmin: admin.isAuthorizedAdmin,
          targetStatus: admin.status,
          activeAuthorizedAdminCount: activeAuthorizedCount,
        });
    if (block) {
      setErrorMessage(block);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await setAdminAuthorized(accessToken, {
        adminId: admin.id,
        isAuthorizedAdmin,
      });
      setConfirmAction(null);
      setSuccessMessage(
        isAuthorizedAdmin ? ADMIN_PROMOTED_MESSAGE : ADMIN_DEMOTED_MESSAGE,
      );
      setAdmins(await listAdminAccounts(accessToken));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update admin account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const canManage = profile?.isAuthorizedAdmin === true;

  if (confirmAction) {
    const isDeactivate = confirmAction.type === "deactivate";
    const isPromote = confirmAction.type === "promote";
    const title = isDeactivate
      ? DEACTIVATE_CONFIRM_TITLE
      : isPromote
        ? ADMIN_PROMOTE_CONFIRM_TITLE
        : ADMIN_DEMOTE_CONFIRM_TITLE;
    const subtitle = isDeactivate
      ? DEACTIVATE_CONFIRM_MESSAGE
      : isPromote
        ? ADMIN_PROMOTE_CONFIRM_MESSAGE
        : ADMIN_DEMOTE_CONFIRM_MESSAGE;
    const confirmLabel = isDeactivate
      ? "Deactivate Admin"
      : isPromote
        ? "Make Authorized Admin"
        : "Remove Authorized Access";
    return (
      <AdminScrollScreen
        title={title}
        subtitle={subtitle}
        footer={
          <View style={styles.confirmFooter}>
            <Button
              label={confirmLabel}
              loading={isSaving}
              disabled={isSaving}
              onPress={() => {
                if (isDeactivate) {
                  void handleSetStatus(confirmAction.admin, "disabled");
                  return;
                }
                void handleSetAuthorized(
                  confirmAction.admin,
                  confirmAction.type === "promote",
                );
              }}
            />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={isSaving}
              onPress={() => {
                if (!isSaving) {
                  setErrorMessage(null);
                  setConfirmAction(null);
                }
              }}
            />
          </View>
        }
      >
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
        <InfoCard
          label="Admin Name"
          value={confirmAction.admin.adminName?.trim() || confirmAction.admin.loginId}
        />
        <InfoCard label="Login ID" value={confirmAction.admin.loginId} />
        {isDeactivate ? null : (
          <InfoCard
            label="Current role"
            value={formatAdminRoleLabel(confirmAction.admin.isAuthorizedAdmin)}
          />
        )}
      </AdminScrollScreen>
    );
  }

  return (
    <AdminScrollScreen
      title="Admin Account Management"
      subtitle="Admin accounts in your society only. Login ID is generated automatically. Authorized admins cannot be created from this screen."
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
          <Text style={styles.loadingText}>Loading admin accounts...</Text>
        </View>
      ) : null}

      {!isLoading && errorMessage && !profile ? (
        <Button label="Retry" variant="secondary" onPress={() => void loadAccounts()} />
      ) : null}

      {profile && !canManage ? (
        <Text style={styles.caption}>
          Only an authorized admin can manage other admin accounts. Your role is
          Admin.
        </Text>
      ) : null}

      {canManage ? (
        <>
          <Text style={styles.sectionTitle}>Add admin</Text>
          <TextField
            label="Admin Name"
            value={createDraft.adminName}
            autoCapitalize="words"
            onChangeText={(value) => {
              setCreateDraft((current) => ({ ...current, adminName: value }));
              setCreateErrors((current) => ({ ...current, adminName: "" }));
            }}
            error={createErrors.adminName}
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
          <TextField
            label="Email"
            value={createDraft.email}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={(value) => {
              setCreateDraft((current) => ({ ...current, email: value }));
              setCreateErrors((current) => ({ ...current, email: "" }));
            }}
            error={createErrors.email}
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
            Login ID is assigned automatically. New admins are created as Admin
            (not Authorized Admin) and must change this password on first login.
            Minimum {ADMIN_PASSWORD_MIN_LENGTH} characters.
          </Text>
          <Button
            label={isSaving ? "Creating..." : "Create Admin"}
            loading={isSaving}
            disabled={isSaving || !createDraft.adminName.trim() || !newPassword}
            onPress={() => void handleCreate()}
          />

          <Text style={styles.sectionTitle}>Admins in this society</Text>
          {admins.map((admin) => {
            const deactivateBlock = getAdminDeactivateBlockReason({
              actorId,
              targetId: admin.id,
              targetIsAuthorizedAdmin: admin.isAuthorizedAdmin,
              targetStatus: admin.status,
              newStatus: "disabled",
              activeAuthorizedAdminCount: activeAuthorizedCount,
            });
            const promoteBlock = getAdminPromoteBlockReason({
              targetIsAuthorizedAdmin: admin.isAuthorizedAdmin,
              targetStatus: admin.status,
            });
            const demoteBlock = getAdminDemoteBlockReason({
              targetIsAuthorizedAdmin: admin.isAuthorizedAdmin,
              targetStatus: admin.status,
              activeAuthorizedAdminCount: activeAuthorizedCount,
            });
            const isSelf = admin.id === actorId;
            const canEdit = !admin.isAuthorizedAdmin;
            const canPromote = !admin.isAuthorizedAdmin && admin.status === "active";
            const canShowDemote = admin.isAuthorizedAdmin;
            return (
              <View key={admin.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {admin.adminName?.trim() || admin.loginId}
                </Text>
                <Text style={styles.cardMeta}>
                  {formatAdminRoleLabel(admin.isAuthorizedAdmin)} ·{" "}
                  {formatAdminAccountStatus(admin.status)}
                </Text>
                <Text style={styles.cardId}>Login ID {admin.loginId}</Text>
                {admin.mobileNumber ? (
                  <Text style={styles.cardId}>Mobile {admin.mobileNumber}</Text>
                ) : null}
                {admin.email ? (
                  <Text style={styles.cardId}>Email {admin.email}</Text>
                ) : null}
                <View style={styles.cardActions}>
                  {canEdit ? (
                    <Button
                      label={editTargetId === admin.id ? "Cancel edit" : "Edit"}
                      variant="secondary"
                      disabled={isSaving}
                      onPress={() => {
                        setEditTargetId((current) =>
                          current === admin.id ? null : admin.id,
                        );
                        setEditDraft(toIdentityDraft(admin));
                        setEditError(null);
                      }}
                    />
                  ) : null}
                  {admin.status === "active" ? (
                    <Button
                      label="Deactivate"
                      variant="secondary"
                      disabled={isSaving || Boolean(deactivateBlock)}
                      onPress={() => {
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        setConfirmAction({ type: "deactivate", admin });
                      }}
                    />
                  ) : (
                    <Button
                      label="Reactivate"
                      variant="secondary"
                      disabled={isSaving || isSelf}
                      onPress={() => void handleSetStatus(admin, "active")}
                    />
                  )}
                  <Button
                    label={resetTargetId === admin.id ? "Cancel reset" : "Reset Password"}
                    variant="secondary"
                    disabled={isSaving || isSelf}
                    onPress={() => {
                      setResetTargetId((current) =>
                        current === admin.id ? null : admin.id,
                      );
                      setResetPassword("");
                      setResetConfirm("");
                      setResetError(null);
                    }}
                  />
                  {canPromote ? (
                    <Button
                      label="Make Authorized Admin"
                      variant="secondary"
                      disabled={isSaving || Boolean(promoteBlock)}
                      onPress={() => {
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        setConfirmAction({ type: "promote", admin });
                      }}
                    />
                  ) : null}
                  {canShowDemote ? (
                    <Button
                      label="Remove Authorized Access"
                      variant="secondary"
                      disabled={isSaving || Boolean(demoteBlock)}
                      onPress={() => {
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        setConfirmAction({ type: "demote", admin });
                      }}
                    />
                  ) : null}
                </View>
                {deactivateBlock && admin.status === "active" ? (
                  <Text style={styles.caption}>{deactivateBlock}</Text>
                ) : null}
                {canShowDemote && demoteBlock ? (
                  <Text style={styles.caption}>{demoteBlock}</Text>
                ) : null}
                {editTargetId === admin.id ? (
                  <View style={styles.resetBox}>
                    <TextField
                      label="Admin Name"
                      value={editDraft.adminName}
                      autoCapitalize="words"
                      onChangeText={(value) => {
                        setEditDraft((current) => ({ ...current, adminName: value }));
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
                      editable={!isSaving}
                    />
                    <TextField
                      label="Email"
                      value={editDraft.email}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      onChangeText={(value) => {
                        setEditDraft((current) => ({ ...current, email: value }));
                        setEditError(null);
                      }}
                      error={editError ?? undefined}
                      editable={!isSaving}
                    />
                    <Button
                      label="Save details"
                      disabled={isSaving || !editDraft.adminName.trim()}
                      onPress={() => void handleUpdate(admin)}
                    />
                  </View>
                ) : null}
                {resetTargetId === admin.id ? (
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
                      onPress={() => void handleResetPassword(admin)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
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
