import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
} from "react-native";
import { Redirect, type Href } from "expo-router";
import { changeCredentialsSchema } from "@nextgen/validation";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PasswordField } from "@/components/ui/PasswordField";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { spacing, typography } from "@/constants/theme";

export default function ChangePasswordScreen() {
  const { session, status, changeCredentials, errorMessage, clearError } =
    useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newLoginId, setNewLoginId] = useState(session?.user.loginId ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session || status !== "needs_password_change") {
    return <Redirect href={"/(auth)/login" as Href} />;
  }

  const mustChangePassword = session.user.mustChangePassword;

  const handleSubmit = async () => {
    clearError();
    setFieldErrors({});

    const parsed = changeCredentialsSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
      newLoginId: mustChangePassword ? newLoginId : undefined,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        currentPassword: flattened.currentPassword?.[0] ?? "",
        newPassword: flattened.newPassword?.[0] ?? "",
        confirmPassword: flattened.confirmPassword?.[0] ?? "",
        newLoginId: flattened.newLoginId?.[0] ?? "",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await changeCredentials({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        newLoginId: parsed.data.newLoginId,
      });
    } catch {
      // Error handled by auth context.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      title="Update Your Credentials"
      subtitle="For security, update the initial password and login ID before continuing."
      footer={
        <Button
          label="Save and Continue"
          loading={isSubmitting}
          onPress={() => void handleSubmit()}
        />
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.form}
      >
        <Text style={styles.notice}>
          Initial setup credentials must not remain in use.
        </Text>

        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

        <TextField
          label="New Login ID"
          value={newLoginId}
          onChangeText={setNewLoginId}
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldErrors.newLoginId}
        />

        <PasswordField
          label="Current Password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          error={fieldErrors.currentPassword}
        />

        <PasswordField
          label="New Password"
          value={newPassword}
          onChangeText={setNewPassword}
          error={fieldErrors.newPassword}
        />

        <PasswordField
          label="Confirm New Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={fieldErrors.confirmPassword}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    gap: spacing.md,
  },
  notice: {
    ...typography.caption,
  },
});
