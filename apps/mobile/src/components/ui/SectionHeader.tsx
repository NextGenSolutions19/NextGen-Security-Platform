import { StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "@/constants/theme";

interface SectionHeaderProps {
  title: string;
  caption?: string;
}

export function SectionHeader({ title, caption }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.sectionTitle,
  },
  caption: {
    ...typography.caption,
  },
});
