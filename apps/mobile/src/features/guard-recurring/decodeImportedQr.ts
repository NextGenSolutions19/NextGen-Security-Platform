import { Platform } from "react-native";
import { GUARD_RECURRING_VALIDATION_MESSAGES } from "@nextgen/shared";
import { decodeQrFromRgba } from "./decodeImportedQrPixels";

const NO_QR = GUARD_RECURRING_VALIDATION_MESSAGES.NO_QR_FOUND;

export { decodeQrFromRgba };

type WebImage = {
  width: number;
  height: number;
};

type WebCanvasContext = {
  drawImage: (image: unknown, x: number, y: number) => void;
  getImageData: (
    x: number,
    y: number,
    width: number,
    height: number,
  ) => { data: Uint8ClampedArray };
};

function failNoQr(): { ok: false; message: string } {
  return { ok: false, message: NO_QR };
}

function getWebDocument() {
  return (
    globalThis as {
      document?: {
        createElement: (tag: string) => {
          width: number;
          height: number;
          getContext: (id: string) => WebCanvasContext | null;
        };
      };
    }
  ).document;
}

async function pixelsFromWebImage(image: WebImage): Promise<string | null> {
  const webDocument = getWebDocument();
  if (!webDocument) {
    return null;
  }
  const canvas = webDocument.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context || image.width < 1 || image.height < 1) {
    return null;
  }
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height);
  return decodeQrFromRgba(pixels.data, image.width, image.height);
}

async function decodeQrFromBlob(blob: unknown): Promise<string | null> {
  if (!blob || typeof blob !== "object") {
    return null;
  }
  const createImageBitmap = (
    globalThis as {
      createImageBitmap?: (image: unknown) => Promise<WebImage>;
    }
  ).createImageBitmap;
  if (createImageBitmap) {
    return pixelsFromWebImage(await createImageBitmap(blob));
  }

  const ImageCtor = (
    globalThis as {
      Image?: new () => {
        onload: (() => void) | null;
        onerror: (() => void) | null;
        src: string;
        width: number;
        height: number;
      };
    }
  ).Image;
  if (!ImageCtor) {
    return null;
  }

  const objectUrlApi = (
    globalThis as {
      URL?: {
        createObjectURL: (value: unknown) => string;
        revokeObjectURL: (value: string) => void;
      };
    }
  ).URL;
  if (!objectUrlApi) {
    return null;
  }
  const objectUrl = objectUrlApi.createObjectURL(blob);
  try {
    const image = await new Promise<WebImage>((resolve, reject) => {
      const element = new ImageCtor();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image load failed"));
      element.src = objectUrl;
    });
    return pixelsFromWebImage(image);
  } finally {
    objectUrlApi.revokeObjectURL(objectUrl);
  }
}

async function decodeQrFromWebImageUri(uri: string): Promise<string | null> {
  const response = await fetch(uri);
  if (!response.ok && !uri.startsWith("blob:") && !uri.startsWith("data:")) {
    return null;
  }
  return decodeQrFromBlob(await response.blob());
}

async function decodeQrFromNativeImageUri(uri: string): Promise<string | null> {
  const Camera = (await import("expo-camera")).Camera;
  if (!Camera?.scanFromURLAsync) {
    return null;
  }
  const results = await Camera.scanFromURLAsync(uri, ["qr"]);
  const payload = results.find((item) => item.data)?.data?.trim();
  return payload || null;
}

export async function decodeQrPayloadFromImageUri(
  uri: string,
  file?: unknown,
): Promise<{ ok: true; payload: string } | { ok: false; message: string }> {
  try {
    const payload =
      Platform.OS === "web"
        ? file
          ? await decodeQrFromBlob(file)
          : await decodeQrFromWebImageUri(uri)
        : await decodeQrFromNativeImageUri(uri);
    if (!payload) {
      return failNoQr();
    }
    return { ok: true, payload };
  } catch {
    return failNoQr();
  }
}
