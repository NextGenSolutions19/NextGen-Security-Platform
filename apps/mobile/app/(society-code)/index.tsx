import { useState } from "react";
import { societyCodeSchema } from "@nextgen/validation";
import { useAuth } from "@/features/auth/AuthProvider";
import { AuthShell } from "@/components/ui/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { TextField } from "@/components/ui/TextField";

export default function SocietyCodeScreen() {
  const { setSocietyCode, errorMessage, clearError } = useAuth();
  const [societyCode, setSocietyCodeValue] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    clearError();
    setFieldError(undefined);

    const parsed = societyCodeSchema.safeParse({ societyCode });
    if (!parsed.success) {
      setFieldError(parsed.error.flatten().fieldErrors.societyCode?.[0]);
      return;
    }

    setIsSubmitting(true);
    try {
      await setSocietyCode(parsed.data.societyCode);
    } catch {
      // Error message is handled by auth context.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Enter Society Code"
      subtitle="Use the code provided for your residential society to continue."
      footer={
        <Button
          label="Continue"
          loading={isSubmitting}
          onPress={() => void handleContinue()}
        />
      }
    >
      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      <TextField
        label="Society Code"
        value={societyCode}
        onChangeText={(value) => {
          setSocietyCodeValue(value.toUpperCase());
          if (fieldError) {
            setFieldError(undefined);
          }
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="done"
        onSubmitEditing={() => void handleContinue()}
        error={fieldError}
      />
    </AuthShell>
  );
}
