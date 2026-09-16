import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PHOTO_UNAVAILABLE_FOR_VISIT } from "@nextgen/shared";
import { useAuth } from "@/features/auth/AuthProvider";
import { getVisitorPhotoSignedUrl } from "@/features/visitor/visitorPhotoService";
import { VisitorPhotoFullPreview } from "@/features/visitor/VisitorPhotoFullPreview";
import { colors, radius, spacing, typography } from "@/constants/theme";

interface AdminVisitorPhotoSectionProps {
  visitorEntryId: string;
}

function isMissingPhotoError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("photo_not_found") ||
    message.includes("no visitor photo") ||
    message.includes("photo is not available") ||
    message.includes("photo_not_ready")
  );
}

export function AdminVisitorPhotoSection({
  visitorEntryId,
}: AdminVisitorPhotoSectionProps) {
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
      setExpiresAt(null);
      return;
    }

    setStatus("loading");
    try {
      const result = await getVisitorPhotoSignedUrl(accessToken, visitorEntryId);
      if (result.visitorEntryId !== visitorEntryId) {
        setSignedUrl(null);
        setExpiresAt(null);
        setStatus("missing");
        return;
      }

      setSignedUrl(result.signedUrl);
      setExpiresAt(result.expiresAt);
      setStatus("ready");
    } catch (error) {
      setSignedUrl(null);
      setExpiresAt(null);
      setStatus(isMissingPhotoError(error) ? "missing" : "error");
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

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Visitor Photo</Text>

      {status === "loading" ? (
        <View style={styles.thumbnailFrame}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.caption}>Loading photo...</Text>
        </View>
      ) : null}

      {status === "missing" ? (
        <View style={styles.thumbnailFrame}>
          <Text style={styles.caption}>{PHOTO_UNAVAILABLE_FOR_VISIT}</Text>
        </View>
      ) : null}

      {status === "error" ? (
        <View style={styles.thumbnailFrame}>
          <Text style={styles.caption}>{PHOTO_UNAVAILABLE_FOR_VISIT}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading visitor photo"
            onPress={() => void loadPhoto()}
          >
            <Text style={styles.retry}>Tap to retry</Text>
          </Pressable>
        </View>
      ) : null}

      {status === "ready" && signedUrl ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View visitor photo full size"
            onPress={() => setPreviewOpen(true)}
            style={styles.thumbnailFrame}
          >
            <Image
              source={{ uri: signedUrl }}
              style={styles.thumbnailImage}
              resizeMode="contain"
              accessibilityLabel="Visitor photo preview"
              onError={() => {
                setStatus("error");
                setSignedUrl(null);
              }}
            />
          </Pressable>
          <Text style={styles.hint}>Tap photo to view full size</Text>
        </>
      ) : null}

      <VisitorPhotoFullPreview
        visible={previewOpen}
        imageUri={signedUrl}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.subtitle,
  },
  thumbnailFrame: {
    width: "100%",
    height: 240,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: spacing.sm,
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  caption: {
    ...typography.caption,
    textAlign: "center",
  },
  hint: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
  },
  retry: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
});
