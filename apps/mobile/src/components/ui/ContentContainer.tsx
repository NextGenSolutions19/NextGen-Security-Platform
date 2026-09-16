import { StyleSheet, View, type ViewProps } from "react-native";
import { layout } from "@/constants/theme";

type ContentWidth = "auth" | "form" | "wide" | "full";

interface ContentContainerProps extends ViewProps {
  width?: ContentWidth;
}

const maxWidthByVariant: Record<ContentWidth, number | undefined> = {
  auth: layout.authMaxWidth,
  form: layout.formMaxWidth,
  wide: layout.contentMaxWidth,
  full: undefined,
};

export function ContentContainer({
  width = "full",
  style,
  children,
  ...props
}: ContentContainerProps) {
  const maxWidth = maxWidthByVariant[width];

  return (
    <View
      style={[
        styles.container,
        maxWidth ? { maxWidth, alignSelf: "center" as const } : null,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
});
