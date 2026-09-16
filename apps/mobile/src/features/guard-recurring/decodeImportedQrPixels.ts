import jsQR from "jsqr";

export function decodeQrFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  const result = jsQR(data, width, height, {
    inversionAttempts: "attemptBoth",
  });
  const payload = result?.data?.trim();
  return payload ? payload : null;
}
