import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { VisitorError } from "@nextgen/shared";
import { uploadVisitorPhoto } from "./visitorService";

/** Keep aligned with supabase/functions/_shared/storage-config.ts */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type VisitorPhotoInputMethod = "camera" | "library";

export interface SelectedVisitorPhoto {
  uri: string;
  mimeType: string;
  base64?: string | null;
}

export function validateVisitorPhotoAsset(
  asset: ImagePicker.ImagePickerAsset,
): string | null {
  const mimeType = (asset.mimeType ?? inferMimeTypeFromUri(asset.uri)).toLowerCase();

  if (!mimeType.startsWith("image/") || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return "Select a supported image file (JPEG, PNG, or WebP).";
  }

  if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
    return "Photo exceeds the maximum allowed size (5 MB).";
  }

  return null;
}

function inferMimeTypeFromUri(uri: string): string {
  const extension = uri.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function normalizeAsset(
  asset: ImagePicker.ImagePickerAsset,
): SelectedVisitorPhoto {
  return {
    uri: asset.uri,
    mimeType: (asset.mimeType ?? inferMimeTypeFromUri(asset.uri)).toLowerCase(),
    base64: asset.base64 ?? null,
  };
}

export async function readSelectedVisitorPhotoBase64(
  photo: SelectedVisitorPhoto,
): Promise<string> {
  if (photo.base64) {
    return photo.base64;
  }

  return FileSystem.readAsStringAsync(photo.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function uploadSelectedVisitorPhoto(
  accessToken: string,
  photo: SelectedVisitorPhoto,
): Promise<{ photoUploadId: string; expiresAt: string }> {
  const base64 = await readSelectedVisitorPhotoBase64(photo);
  return uploadVisitorPhoto(accessToken, base64, photo.mimeType);
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: true,
  quality: 0.7,
  base64: Platform.OS === "web",
};

export async function pickVisitorPhotoFromCamera(): Promise<
  SelectedVisitorPhoto | "cancelled" | "permission_denied"
> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return "permission_denied";
  }

  const result = await ImagePicker.launchCameraAsync(pickerOptions);
  if (result.canceled || !result.assets[0]) {
    return "cancelled";
  }

  const validationError = validateVisitorPhotoAsset(result.assets[0]);
  if (validationError) {
    throw new VisitorError(validationError, "PHOTO_ERROR");
  }

  return normalizeAsset(result.assets[0]);
}

export async function pickVisitorPhotoFromLibrary(): Promise<
  SelectedVisitorPhoto | "cancelled" | "permission_denied"
> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return "permission_denied";
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    ...pickerOptions,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
  });

  if (result.canceled || !result.assets[0]) {
    return "cancelled";
  }

  const validationError = validateVisitorPhotoAsset(result.assets[0]);
  if (validationError) {
    throw new VisitorError(validationError, "PHOTO_ERROR");
  }

  return normalizeAsset(result.assets[0]);
}
