import { Modal, StyleSheet, Text, View } from "react-native";
import {
  CONFIRM_IMPORT_DIALOG_CANCEL_LABEL,
  CONFIRM_IMPORT_DIALOG_CONFIRM_LABEL,
  CONFIRM_IMPORT_DIALOG_TITLE,
  IMPORTING_RESIDENTS_LABEL,
  formatResidentImportConfirmDialogMessage,
} from "@nextgen/shared";
import { Button } from "@/components/ui/Button";
import { colors, radius, spacing, typography } from "@/constants/theme";

type ConfirmImportDialogProps = {
  visible: boolean;
  count: number;
  isImporting: boolean;
  unsupportedFieldsWarning: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmImportDialog({
  visible,
  count,
  isImporting,
  unsupportedFieldsWarning,
  onCancel,
  onConfirm,
}: ConfirmImportDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{CONFIRM_IMPORT_DIALOG_TITLE}</Text>
          <Text style={styles.body}>
            {formatResidentImportConfirmDialogMessage(count)}
          </Text>
          {unsupportedFieldsWarning ? (
            <Text style={styles.warning}>{unsupportedFieldsWarning}</Text>
          ) : null}
          {isImporting ? (
            <Text style={styles.helper}>{IMPORTING_RESIDENTS_LABEL}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={
                isImporting
                  ? IMPORTING_RESIDENTS_LABEL
                  : CONFIRM_IMPORT_DIALOG_CONFIRM_LABEL
              }
              loading={isImporting}
              disabled={isImporting}
              onPress={onConfirm}
            />
            <Button
              label={CONFIRM_IMPORT_DIALOG_CANCEL_LABEL}
              variant="secondary"
              disabled={isImporting}
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
    color: colors.text,
  },
  helper: {
    ...typography.caption,
  },
  actions: {
    gap: spacing.sm,
  },
});
