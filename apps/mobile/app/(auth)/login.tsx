import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { loginSchema } from "@nextgen/validation";
import { useAuth } from "@/features/auth/AuthProvider";
import { AuthShell } from "@/components/ui/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { PasswordField } from "@/components/ui/PasswordField";
import { SocietyContextChip } from "@/components/ui/SocietyContextChip";
import { TextField } from "@/components/ui/TextField";
import { colors } from "@/constants/theme";

export default function LoginScreen() {
  const { societyContext, signIn, changeSociety, errorMessage, clearError } =
    useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    loginId?: string;
    password?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    clearError();
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ loginId, password });
    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        loginId: flattened.loginId?.[0],
        password: flattened.password?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(parsed.data);
    } catch {
      // Error message is handled by auth context.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign In"
      subtitle="Enter your Guard or Society Admin credentials."
      footer={
        <Button
          label="Sign In"
          loading={isSubmitting}
          onPress={() => void handleSignIn()}
        />
      }
    >
      {societyContext ? (
        <SocietyContextChip
          societyName={societyContext.societyName}
          societyCode={societyContext.societyCode}
        />
      ) : null}

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <TextField
        label="Login ID"
        value={loginId}
        onChangeText={(value) => {
          setLoginId(value);
          if (fieldErrors.loginId) {
            setFieldErrors((current) => ({ ...current, loginId: undefined }));
          }
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        returnKeyType="next"
        error={fieldErrors.loginId}
      />

      <PasswordField
        label="Password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (fieldErrors.password) {
            setFieldErrors((current) => ({
              ...current,
              password: undefined,
            }));
          }
        }}
        autoComplete="password"
        returnKeyType="done"
        onSubmitEditing={() => void handleSignIn()}
        error={fieldErrors.password}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => void changeSociety()}
        style={styles.linkButton}
      >
        <Text style={styles.linkText}>Change society code</Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  linkButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  linkText: {
    color: colors.primaryBlue,
    fontSize: 14,
    fontWeight: "600",
  },
});
