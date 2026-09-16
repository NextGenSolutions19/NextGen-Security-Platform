import assert from "node:assert/strict";
import { test } from "node:test";
import QRCode from "qrcode";
import { decodeQrFromRgba } from "./decodeImportedQrPixels.ts";

const SAMPLE_TOKEN = "NGSP1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function rgbaFromQrToken(token: string): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const qr = QRCode.create(token, { errorCorrectionLevel: "M" });
  const moduleCount = qr.modules.size;
  const scale = 4;
  const width = moduleCount * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = qr.modules.get(Math.floor(x / scale), Math.floor(y / scale));
      const index = (y * width + x) * 4;
      const value = dark ? 0 : 255;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width, height: width };
}

test("imported QR pixels decode back to the opaque credential", () => {
  const image = rgbaFromQrToken(SAMPLE_TOKEN);
  const payload = decodeQrFromRgba(image.data, image.width, image.height);
  assert.equal(payload, SAMPLE_TOKEN);
});

test("an image with no QR returns null instead of a credential", () => {
  const width = 32;
  const data = new Uint8ClampedArray(width * width * 4);
  data.fill(255);
  assert.equal(decodeQrFromRgba(data, width, width), null);
});
