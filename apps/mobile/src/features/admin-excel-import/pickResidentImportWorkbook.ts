import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import {
  MAX_RESIDENT_IMPORT_FILE_BYTES,
  RESIDENT_IMPORT_XLSX_MIME,
  getResidentImportAdminMessage,
  isResidentImportXlsxFileName,
} from "@nextgen/shared";

export type PickedResidentImportFile =
  | { status: "cancelled" }
  | {
      status: "ready";
      fileName: string;
      sizeBytes: number;
      mimeType: string | null;
      bytes: Uint8Array;
    }
  | { status: "rejected"; message: string };

type WebPickedFile = {
  size?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function getWebPickedFile(
  asset: DocumentPicker.DocumentPickerAsset,
): WebPickedFile | undefined {
  if (!("file" in asset)) {
    return undefined;
  }
  const file = (asset as { file?: WebPickedFile }).file;
  return file ?? undefined;
}

function decodeBase64(value: string): Uint8Array {
  const binary = (globalThis as unknown as { atob: (input: string) => string }).atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function readPickedBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  const webFile = getWebPickedFile(asset);
  if (webFile) {
    return new Uint8Array(await webFile.arrayBuffer());
  }

  try {
    const response = await fetch(asset.uri);
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }
  } catch {
    // Native content URIs often need the file-system fallback below.
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
}

export async function pickResidentImportWorkbook(): Promise<PickedResidentImportFile> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [RESIDENT_IMPORT_XLSX_MIME, "application/octet-stream"],
    copyToCacheDirectory: Platform.OS !== "web",
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return { status: "cancelled" };
  }

  const asset = result.assets[0];
  const fileName = asset.name?.trim() || "workbook.xlsx";

  if (!isResidentImportXlsxFileName(fileName) && !isResidentImportXlsxFileName(asset.uri)) {
    return {
      status: "rejected",
      message: getResidentImportAdminMessage("unsupported_extension"),
    };
  }

  const knownSize = asset.size ?? webFileSize(asset);
  if (knownSize != null && knownSize > MAX_RESIDENT_IMPORT_FILE_BYTES) {
    return {
      status: "rejected",
      message: getResidentImportAdminMessage("file_too_large"),
    };
  }

  if (asset.uri && Platform.OS !== "web") {
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (info.exists && "size" in info && typeof info.size === "number") {
      if (info.size > MAX_RESIDENT_IMPORT_FILE_BYTES) {
        return {
          status: "rejected",
          message: getResidentImportAdminMessage("file_too_large"),
        };
      }
    }
  }

  const bytes = await readPickedBytes(asset);
  if (bytes.byteLength === 0) {
    return {
      status: "rejected",
      message: getResidentImportAdminMessage("empty_file"),
    };
  }
  if (bytes.byteLength > MAX_RESIDENT_IMPORT_FILE_BYTES) {
    return {
      status: "rejected",
      message: getResidentImportAdminMessage("file_too_large"),
    };
  }

  return {
    status: "ready",
    fileName,
    sizeBytes: bytes.byteLength,
    mimeType: asset.mimeType ?? null,
    bytes,
  };
}

function webFileSize(asset: DocumentPicker.DocumentPickerAsset): number | null {
  const size = getWebPickedFile(asset)?.size;
  return typeof size === "number" ? size : null;
}

