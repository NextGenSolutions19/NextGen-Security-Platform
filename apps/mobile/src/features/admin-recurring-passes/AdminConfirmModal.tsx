import { Modal, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";

type AdminConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  warning?: string | null;
  confirmLabel: string;
  reasonLabel?: string;
  reasonValue?: string;
  reasonError?: string | null;
  requireReason?: boolean;
  isSubmitting?: boolean;
  onChangeReason?: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AdminConfirmModal({
  visible,
  title,
  message,
  warning,
  confirmLabel,
  reasonLabel,
  reasonValue,
  reasonError,
  requireReason = false,
  isSubmitting = false,
  onChangeReason,
  onCancel,
  onConfirm,
}: AdminConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{message}</Text>
          {warning ? <Text style={styles.warning}>{warning}</Text> : null}
          {requireReason ? (
            <TextField
              label={reasonLabel ?? "Reason"}
              value={reasonValue}
              onChangeText={onChangeReason}
              error={reasonError ?? undefined}
              editable={!isSubmitting}
              multiline
            />
          ) : null}
          <View style={styles.actions}>
            <Button
              label={confirmLabel}
              loading={isSubmitting}
              disabled={isSubmitting}
              onPress={onConfirm}
            />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={isSubmitting}
              onPress={onCancel}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.subtitle,
    fontSize: 18,
  },
  body: {
    ...typography.body,
  },
  warning: {
    ...typography.caption,
    color: colors.error,
  },
  actions: {
    gap: spacing.sm,
  },
});
