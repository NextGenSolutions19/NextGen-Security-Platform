import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Button } from "@/components/ui/Button";
import { colors, radius, spacing, typography } from "@/constants/theme";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;

interface VisitorPhotoFullPreviewProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(scale.toFixed(2))));
}

function clampPan(
  x: number,
  y: number,
  currentScale: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (currentScale <= MIN_SCALE) {
    return { x: 0, y: 0 };
  }

  const extraX = (width * (currentScale - 1)) / 2;
  const extraY = (height * (currentScale - 1)) / 2;
  return {
    x: Math.min(extraX, Math.max(-extraX, x)),
    y: Math.min(extraY, Math.max(-extraY, y)),
  };
}

export function VisitorPhotoFullPreview({
  visible,
  imageUri,
  onClose,
}: VisitorPhotoFullPreviewProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const previewWidth = Math.max(windowWidth - 32, 1);
  const previewHeight = Math.max(windowHeight - 220, 1);
  const [scale, setScale] = useState(MIN_SCALE);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(scale);
  const sizeRef = useRef({ width: previewWidth, height: previewHeight });

  scaleRef.current = scale;
  sizeRef.current = { width: previewWidth, height: previewHeight };

  const resetPan = () => {
    pan.setValue({ x: 0, y: 0 });
    panStart.current = { x: 0, y: 0 };
    dragOrigin.current = { x: 0, y: 0 };
  };

  const applyPan = (x: number, y: number, currentScale: number) => {
    const next = clampPan(
      x,
      y,
      currentScale,
      sizeRef.current.width,
      sizeRef.current.height,
    );
    pan.setValue(next);
    return next;
  };

  const applyScale = (nextScale: number) => {
    const clamped = clampScale(nextScale);
    if (clamped <= MIN_SCALE) {
      resetPan();
    } else {
      panStart.current = applyPan(
        panStart.current.x,
        panStart.current.y,
        clamped,
      );
    }
    setScale(clamped);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => scaleRef.current > MIN_SCALE,
      onMoveShouldSetPanResponder: (_, gesture) =>
        scaleRef.current > MIN_SCALE &&
        (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
      onStartShouldSetPanResponderCapture: () => scaleRef.current > MIN_SCALE,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        scaleRef.current > MIN_SCALE &&
        (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragOrigin.current = { ...panStart.current };
      },
      onPanResponderMove: (_, gesture) => {
        if (scaleRef.current <= MIN_SCALE) {
          return;
        }
        applyPan(
          dragOrigin.current.x + gesture.dx,
          dragOrigin.current.y + gesture.dy,
          scaleRef.current,
        );
      },
      onPanResponderRelease: (_, gesture) => {
        panStart.current = applyPan(
          dragOrigin.current.x + gesture.dx,
          dragOrigin.current.y + gesture.dy,
          scaleRef.current,
        );
      },
      onPanResponderTerminate: (_, gesture) => {
        panStart.current = applyPan(
          dragOrigin.current.x + gesture.dx,
          dragOrigin.current.y + gesture.dy,
          scaleRef.current,
        );
      },
    }),
  ).current;

  useEffect(() => {
    if (!visible) {
      setScale(MIN_SCALE);
      resetPan();
    }
  }, [visible]);

  const zoomIn = () => {
    applyScale(scale + SCALE_STEP);
  };

  const zoomOut = () => {
    applyScale(scale - SCALE_STEP);
  };

  const resetZoom = () => {
    setScale(MIN_SCALE);
    resetPan();
  };

  const handleClose = () => {
    setScale(MIN_SCALE);
    resetPan();
    onClose();
  };

  return (
    <Modal
      visible={visible && Boolean(imageUri)}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.previewRoot}>
        <View
          collapsable={false}
          {...panResponder.panHandlers}
          style={styles.previewImageWrap}
        >
          {imageUri ? (
            <Animated.View
              style={{
                width: previewWidth,
                height: previewHeight,
                transform: pan.getTranslateTransform(),
              }}
            >
              <Image
                source={{ uri: imageUri }}
                style={{
                  width: previewWidth,
                  height: previewHeight,
                  transform: [{ scale }],
                }}
                resizeMode="contain"
                accessibilityLabel="Full visitor photo"
              />
            </Animated.View>
          ) : null}
        </View>
        <View style={styles.zoomRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
            disabled={scale >= MAX_SCALE}
            onPress={zoomIn}
            style={({ pressed }) => [
              styles.zoomButton,
              scale >= MAX_SCALE ? styles.zoomButtonDisabled : null,
              pressed && scale < MAX_SCALE ? styles.zoomButtonPressed : null,
            ]}
          >
            <Text style={styles.zoomButtonLabel}>Zoom In (+)</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom out"
            disabled={scale <= MIN_SCALE}
            onPress={zoomOut}
            style={({ pressed }) => [
              styles.zoomButton,
              scale <= MIN_SCALE ? styles.zoomButtonDisabled : null,
              pressed && scale > MIN_SCALE ? styles.zoomButtonPressed : null,
            ]}
          >
            <Text style={styles.zoomButtonLabel}>Zoom Out (-)</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset photo to fit"
            onPress={resetZoom}
            style={({ pressed }) => [
              styles.zoomButton,
              pressed ? styles.zoomButtonPressed : null,
            ]}
          >
            <Text style={styles.zoomButtonLabel}>Reset / Fit</Text>
          </Pressable>
        </View>
        <Button label="Close" variant="secondary" onPress={handleClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  previewRoot: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.92)",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  previewImageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  zoomRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  zoomButton: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  zoomButtonPressed: {
    opacity: 0.9,
  },
  zoomButtonDisabled: {
    opacity: 0.55,
  },
  zoomButtonLabel: {
    ...typography.subtitle,
    fontSize: 15,
    color: colors.primary,
  },
});
