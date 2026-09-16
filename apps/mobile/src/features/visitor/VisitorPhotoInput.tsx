import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { VisitorPhotoFullPreview } from "@/features/visitor/VisitorPhotoFullPreview";
import { colors, radius, spacing, typography } from "@/constants/theme";
import {
  pickVisitorPhotoFromCamera,
  pickVisitorPhotoFromLibrary,
  uploadSelectedVisitorPhoto,
  type SelectedVisitorPhoto,
  type VisitorPhotoInputMethod,
} from "./visitorPhotoPipeline";

export interface VisitorPhotoValue {
  photoUri: string | null;
  photoUploadId: string | null;
}

interface VisitorPhotoInputProps {
  accessToken: string;
  value: VisitorPhotoValue;
  isUploading: boolean;
  fieldError?: string;
  onValueChange: (value: VisitorPhotoValue) => void;
  onUploadingChange: (uploading: boolean) => void;
  onError: (message: string | null) => void;
  onClearFieldError: () => void;
}

export function VisitorPhotoInput({
  accessToken,
  value,
  isUploading,
  fieldError,
  onValueChange,
  onUploadingChange,
  onError,
  onClearFieldError,
}: VisitorPhotoInputProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const processPhoto = async (
    method: VisitorPhotoInputMethod,
    picker: () => Promise<
      SelectedVisitorPhoto | "cancelled" | "permission_denied"
    >,
  ) => {
    if (!accessToken) {
      return;
    }

    onError(null);
    onClearFieldError();

    try {
      const picked = await picker();
      if (picked === "cancelled") {
        return;
      }

      if (picked === "permission_denied") {
        onError(
          method === "camera"
            ? "Camera permission is required to capture a visitor photo."
            : "Photo library permission is required to import a visitor photo.",
        );
        return;
      }

      onValueChange({ photoUri: picked.uri, photoUploadId: null });
      onUploadingChange(true);

      const upload = await uploadSelectedVisitorPhoto(accessToken, picked);
      onValueChange({
        photoUri: picked.uri,
        photoUploadId: upload.photoUploadId,
      });
    } catch (error) {
      onValueChange({ photoUri: null, photoUploadId: null });
      onError(
        error instanceof Error
          ? error.message
          : "Unable to upload visitor photo.",
      );
    } finally {
      onUploadingChange(false);
    }
  };

  const handleTakePhoto = () =>
    void processPhoto("camera", pickVisitorPhotoFromCamera);

  const handleImportPhoto = () =>
    void processPhoto("library", pickVisitorPhotoFromLibrary);

  const hasPreview = Boolean(value.photoUri);

  useEffect(() => {
    setPreviewOpen(false);
  }, [value.photoUri]);
  const isReady = Boolean(value.photoUploadId);

  return (
    <View style={styles.container}>
      <Text style={styles.fieldLabel}>Visitor photo *</Text>
      {!hasPreview ? (
        <Text style={styles.helperText}>
          A visitor photo is required for every registration.
        </Text>
      ) : null}

      {hasPreview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View visitor photo full size"
          onPress={() => setPreviewOpen(true)}
        >
          <Image source={{ uri: value.photoUri! }} style={styles.preview} />
          <Text style={styles.hint}>Tap photo to view full size</Text>
        </Pressable>
      ) : null}

      {isUploading ? (
        <Text style={styles.statusText}>Uploading visitor photo...</Text>
      ) : isReady ? (
        <Text style={styles.successHint}>Visitor photo uploaded and ready.</Text>
      ) : hasPreview ? (
        <Text style={styles.statusText}>Waiting for photo upload...</Text>
      ) : null}

      <View style={styles.actionRow}>
        <Button
          label={hasPreview ? "Retake Photo" : "Take Photo"}
          variant="secondary"
          loading={isUploading}
          disabled={isUploading}
          style={styles.actionButton}
          onPress={handleTakePhoto}
        />
        <Button
          label={hasPreview ? "Import New" : "Import Photo"}
          variant="secondary"
          loading={isUploading}
          disabled={isUploading}
          style={styles.actionButton}
          onPress={handleImportPhoto}
        />
      </View>

      {fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}

      <VisitorPhotoFullPreview
        visible={previewOpen && hasPreview}
        imageUri={value.photoUri}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  fieldLabel: { ...typography.label },
  helperText: { ...typography.caption },
  statusText: { ...typography.caption, color: colors.textSecondary },
  successHint: { ...typography.caption, color: colors.success },
  hint: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  fieldError: { color: colors.error, fontSize: 13 },
});
