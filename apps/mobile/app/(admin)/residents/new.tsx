import { useState } from "react";
import { useRouter, type Href } from "expo-router";
import {
  buildCreateResidentRequest,
  type AdminResidentFormErrors,
  type AdminResidentType,
  validateAdminResidentForm,
} from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { AdminResidentFormFields } from "@/features/admin-residents/AdminResidentFormFields";
import { mutateAdminResident } from "@/features/admin-residents/adminResidentMutationService";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { AdminScrollScreen } from "@/components/admin/AdminScrollScreen";

const LIST_ROUTE = {
  pathname: "/(admin)/residents",
  params: { notice: "added" },
} as Href;

export default function AddResidentScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [flatNumber, setFlatNumber] = useState("");
  const [residentName, setResidentName] = useState("");
  const [mobile, setMobile] = useState("");
  const [wingBuilding, setWingBuilding] = useState("");
  const [residentType, setResidentType] = useState<AdminResidentType | null>(
    null,
  );
  const [errors, setErrors] = useState<AdminResidentFormErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearFieldError = (field: keyof AdminResidentFormErrors) => {
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
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
        buildCreateResidentRequest(parsed.value),
      );
      router.replace(LIST_ROUTE);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to add resident.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminScrollScreen
      title="Add Resident"
      subtitle="Register a resident in your society."
      footer={
        <>
          <Button
            label="Save Resident"
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
