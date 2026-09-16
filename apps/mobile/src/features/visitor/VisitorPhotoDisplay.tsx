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
import { getVisitorPhotoSignedUrl } from "@/features/visitor/visitorPhotoService";
import { VisitorPhotoFullPreview } from "@/features/visitor/VisitorPhotoFullPreview";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface VisitorPhotoDisplayProps {
  visitorEntryId: string;
  /** Larger image for detail screens; compact for cards. */
  size?: "compact" | "detail";
}

function stopCardPress(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

export function VisitorPhotoDisplay({
  visitorEntryId,
  size = "compact",
}: VisitorPhotoDisplayProps) {
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? "";

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">(
    "loading",
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadPhoto = useCallback(async () => {
    if (!accessToken || !visitorEntryId) {
      setStatus("missing");
      setSignedUrl(null);
      return;
    }

    setStatus("loading");
    try {
      const result = await getVisitorPhotoSignedUrl(accessToken, visitorEntryId);
      setSignedUrl(result.signedUrl);
      setExpiresAt(result.expiresAt);
      setStatus("ready");
    } catch (error) {
      setSignedUrl(null);
      setExpiresAt(null);
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("PHOTO_NOT_FOUND") ||
        message.toLowerCase().includes("no visitor photo")
      ) {
        setStatus("missing");
      } else {
        setStatus("error");
      }
    }
  }, [accessToken, visitorEntryId]);

  useEffect(() => {
    setPreviewOpen(false);
    void loadPhoto();
  }, [loadPhoto]);

  useEffect(() => {
    if (!expiresAt || status !== "ready") {
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
  }, [expiresAt, status, loadPhoto]);

  const height = size === "detail" ? 220 : 140;

  if (status === "loading") {
    return (
      <View style={[styles.frame, { height }]}>
        <ActivityIndicator color={colors.primaryBlue} />
        <Text style={styles.caption}>Loading photo...</Text>
      </View>
    );
  }

  if (status === "missing") {
    return (
      <View style={[styles.frame, { height }]}>
        <Text style={styles.caption}>No photo available</Text>
      </View>
    );
  }

  if (status === "error" || !signedUrl) {
    return (
      <View style={[styles.frame, { height }]}>
        <Text style={styles.caption}>Photo unavailable</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading visitor photo"
          onPress={() => void loadPhoto()}
        >
          <Text style={styles.retry}>Tap to retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View visitor photo full size"
        style={styles.photoPressable}
        onPress={(event) => {
          stopCardPress(event);
          setPreviewOpen(true);
        }}
      >
        <Image
          source={{ uri: signedUrl }}
          style={[styles.image, { height }]}
          accessibilityLabel="Visitor photo"
          onError={() => {
            setPreviewOpen(false);
            setStatus("error");
            setSignedUrl(null);
          }}
        />
        {size === "detail" ? (
          <Text style={styles.hint}>Tap photo to view full size</Text>
        ) : null}
      </Pressable>
      <VisitorPhotoFullPreview
        visible={previewOpen}
        imageUri={signedUrl}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.sm,
  },
  image: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: radius.lg,
    backgroundColor: colors.border,
  },
  caption: {
    ...typography.caption,
    textAlign: "center",
  },
  hint: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  photoPressable: {
    width: "100%",
    alignSelf: "stretch",
  },
  retry: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
  },
});
