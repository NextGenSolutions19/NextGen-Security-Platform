import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { VisitorPhotoFullPreview } from "@/features/visitor/VisitorPhotoFullPreview";
import { getRecurringPassPhotoSignedUrl } from "@/features/admin-recurring-passes/adminRecurringPassService";
import { RecurringPassPhotoPlaceholder } from "@/features/admin-recurring-passes/RecurringPassPhotoPlaceholder";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface RecurringPassPhotoAvatarProps {
  visitorName: string;
  passId?: string;
  previewUri?: string | null;
  size?: "compact" | "detail";
  enableFullPreview?: boolean;
}

export function RecurringPassPhotoAvatar({
  visitorName,
  passId,
  previewUri,
  size = "compact",
  enableFullPreview = false,
}: RecurringPassPhotoAvatarProps) {
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";
  const dimension = size === "detail" ? 96 : 56;
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "missing">(
    previewUri ? "ready" : "idle",
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadPhoto = useCallback(async () => {
    if (previewUri || !accessToken || !passId) {
      return;
    }
    setStatus("loading");
    try {
      const result = await getRecurringPassPhotoSignedUrl(accessToken, passId);
      if (result.passId !== passId) {
        setSignedUrl(null);
        setExpiresAt(null);
        setStatus("missing");
        return;
      }
      setSignedUrl(result.signedUrl);
      setExpiresAt(result.expiresAt);
      setStatus("ready");
    } catch {
      setSignedUrl(null);
      setExpiresAt(null);
      setStatus("missing");
    }
  }, [accessToken, passId, previewUri]);

  useEffect(() => {
    if (previewUri) {
      setStatus("ready");
      return;
    }
    void loadPhoto();
  }, [loadPhoto, previewUri]);

  useEffect(() => {
    if (previewUri || !expiresAt || status !== "ready") {
      return;
    }
    const expiresMs = new Date(expiresAt).getTime() - Date.now() - 5000;
    if (expiresMs <= 0) {
      void loadPhoto();
      return;
    }
    const timer = setTimeout(() => {
      void loadPhoto();
    }, expiresMs);
    return () => clearTimeout(timer);
  }, [expiresAt, loadPhoto, previewUri, status]);

  const imageUri = previewUri || signedUrl;
  const showImage = Boolean(imageUri) && status !== "missing";

  const image = showImage ? (
    <Image
      source={{ uri: imageUri! }}
      style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
      accessibilityLabel="Visitor photo"
      onError={() => {
        if (!previewUri) {
          setStatus("missing");
          setSignedUrl(null);
        }
      }}
    />
  ) : status === "loading" ? (
    <View
      style={[
        styles.loading,
        { width: dimension, height: dimension, borderRadius: dimension / 2 },
      ]}
    >
      <ActivityIndicator color={colors.primary} size="small" />
    </View>
  ) : (
    <RecurringPassPhotoPlaceholder visitorName={visitorName} size={size} />
  );

  if (!enableFullPreview || !showImage) {
    return image;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View visitor photo full size"
        onPress={() => setPreviewOpen(true)}
      >
        {image}
      </Pressable>
      <VisitorPhotoFullPreview
        visible={previewOpen}
        imageUri={imageUri}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

interface RecurringPassPhotoPreviewProps {
  imageUri: string | null;
}

export function RecurringPassPhotoPreview({
  imageUri,
}: RecurringPassPhotoPreviewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!imageUri) {
    return null;
  }

  return (
    <View style={styles.previewBlock}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View visitor photo full size"
        onPress={() => setPreviewOpen(true)}
      >
        <Image source={{ uri: imageUri }} style={styles.previewImage} />
        <Text style={styles.hint}>Tap photo to view full size</Text>
      </Pressable>
      <VisitorPhotoFullPreview
        visible={previewOpen}
        imageUri={imageUri}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBlock: {
    gap: spacing.xs,
  },
  previewImage: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  hint: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
  },
});
