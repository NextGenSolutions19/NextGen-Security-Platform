import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { VisitorPhotoFullPreview } from "@/features/visitor/VisitorPhotoFullPreview";
import { colors, radius, spacing, typography } from "@/constants/theme";
import {
  pickVisitorPhotoFromCamera,
  pickVisitorPhotoFromLibrary,
  type SelectedVisitorPhoto,
  type VisitorPhotoInputMethod,
} from "@/features/visitor/visitorPhotoPipeline";

interface RecurringPassPhotoPickerProps {
  photoUri: string | null;
  selectedPhoto: SelectedVisitorPhoto | null;
  fieldError?: string;
  onChange: (photo: SelectedVisitorPhoto | null) => void;
  onClearFieldError: () => void;
  onError: (message: string | null) => void;
}

export function RecurringPassPhotoPicker({
  photoUri,
  selectedPhoto,
  fieldError,
  onChange,
  onClearFieldError,
  onError,
}: RecurringPassPhotoPickerProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const hasPreview = Boolean(photoUri);

  const processPhoto = async (
    method: VisitorPhotoInputMethod,
    picker: () => Promise<
      SelectedVisitorPhoto | "cancelled" | "permission_denied"
    >,
  ) => {
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
      onChange(picked);
    } catch (error) {
      onChange(null);
      onError(
        error instanceof Error
          ? error.message
          : "Unable to select a visitor photo.",
      );
    }
  };

  useEffect(() => {
    setPreviewOpen(false);
  }, [photoUri]);

  return (
    <View style={styles.container}>
      <Text style={styles.fieldLabel}>Visitor Photo *</Text>
      {!hasPreview ? (
        <Text style={styles.helperText}>
          An Admin-approved photo is required for every recurring pass.
        </Text>
      ) : null}

      {hasPreview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View visitor photo full size"
          onPress={() => setPreviewOpen(true)}
        >
          <Image source={{ uri: photoUri! }} style={styles.preview} />
          <Text style={styles.hint}>Tap photo to view full size</Text>
        </Pressable>
      ) : null}

      {hasPreview && selectedPhoto ? (
        <Text style={styles.successHint}>Photo selected. Preview before creating the pass.</Text>
      ) : null}

      <View style={styles.actionRow}>
        <Button
          label={hasPreview ? "Retake Photo" : "Take Photo"}
          variant="secondary"
          style={styles.actionButton}
          onPress={() => void processPhoto("camera", pickVisitorPhotoFromCamera)}
        />
        <Button
          label={hasPreview ? "Import New" : "Import Photo"}
          variant="secondary"
          style={styles.actionButton}
          onPress={() =>
            void processPhoto("library", pickVisitorPhotoFromLibrary)
          }
        />
      </View>

      {fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}

      <VisitorPhotoFullPreview
        visible={previewOpen && hasPreview}
        imageUri={photoUri}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  fieldLabel: { ...typography.label },
  helperText: { ...typography.caption },
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
