import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectVisitorPhotoContentType,
  isSafeSocietyStoragePath,
  normalizeVisitorPhotoContentType,
} from "./storage-config.ts";

const societyId = "11111111-1111-4111-8111-111111111101";
const otherSociety = "22222222-2222-4222-8222-222222222201";

test("society storage paths reject traversal and cross-tenant prefixes", () => {
  assert.equal(
    isSafeSocietyStoragePath(`${societyId}/guard/photo.jpg`, societyId),
    true,
  );
  assert.equal(
    isSafeSocietyStoragePath(
      `${societyId}/recurring-passes/pass/photo.jpg`,
      societyId,
    ),
    true,
  );
  assert.equal(
    isSafeSocietyStoragePath(`${otherSociety}/guard/photo.jpg`, societyId),
    false,
  );
  assert.equal(
    isSafeSocietyStoragePath(`${societyId}/../${otherSociety}/photo.jpg`, societyId),
    false,
  );
  assert.equal(isSafeSocietyStoragePath(`/${societyId}/photo.jpg`, societyId), false);
  assert.equal(isSafeSocietyStoragePath(`${societyId}//photo.jpg`, societyId), false);
  assert.equal(isSafeSocietyStoragePath("", societyId), false);
});

test("image magic bytes detect jpeg/png/webp and reject non-images", () => {
  assert.equal(
    detectVisitorPhotoContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(8)])),
    "image/jpeg",
  );
  assert.equal(
    detectVisitorPhotoContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Uint8Array(8)])),
    "image/png",
  );
  const webp = new Uint8Array(12);
  webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(detectVisitorPhotoContentType(webp), "image/webp");
  assert.equal(
    detectVisitorPhotoContentType(new Uint8Array([0x25, 0x50, 0x44, 0x46, ...new Uint8Array(8)])),
    null,
  );
  assert.equal(normalizeVisitorPhotoContentType("image/jpg"), "image/jpeg");
});
