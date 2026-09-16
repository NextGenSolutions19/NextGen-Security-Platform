import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  DESTINATION_BOTH_REJECTED_MESSAGE,
  DESTINATION_OTHER_RESIDENT_REJECTED_MESSAGE,
  DESTINATION_REQUIRED_MESSAGE,
  DESTINATION_TEXT_MAX_LENGTH,
  DESTINATION_TEXT_REQUIRED_MESSAGE,
  DESTINATION_TEXT_TOO_LONG_MESSAGE,
  OTHER_DESTINATION_OPTION_REQUIRED_MESSAGE,
  BROKER_DESTINATION_PREFIX,
  BROKER_FLAT_MAX_LENGTH,
  BROKER_FLAT_REQUIRED_MESSAGE,
  composeOtherDestinationText,
  parseRequiredDestinationText,
  parseVisitorDestinationInput,
  readStoredDestinationText,
  resolveVisitorDestinationLabel,
  resolveVisitorDestinationLabelForCsvExport,
} from "./visitor-destination.ts";

test("Other destination trims, rejects blank, and allows spaces/punctuation", () => {
  assert.deepEqual(parseRequiredDestinationText("  Clubhouse  "), {
    ok: true,
    destinationText: "Clubhouse",
  });
  assert.deepEqual(parseRequiredDestinationText(""), {
    ok: false,
    message: DESTINATION_TEXT_REQUIRED_MESSAGE,
  });
  assert.deepEqual(parseRequiredDestinationText("   "), {
    ok: false,
    message: DESTINATION_TEXT_REQUIRED_MESSAGE,
  });
  assert.deepEqual(
    parseRequiredDestinationText("A".repeat(DESTINATION_TEXT_MAX_LENGTH + 1)),
    { ok: false, message: DESTINATION_TEXT_TOO_LONG_MESSAGE },
  );
  assert.deepEqual(parseRequiredDestinationText("Shop 2 / Terrace"), {
    ok: true,
    destinationText: "Shop 2 / Terrace",
  });
  assert.equal(readStoredDestinationText(null), null);
  assert.equal(readStoredDestinationText("   "), null);
});

test("destination XOR accepts flat only or Other only", () => {
  assert.deepEqual(
    parseVisitorDestinationInput({
      flatId: "33333333-3333-4333-a333-333333333301",
      residentId: "44444444-4444-4444-a444-444444444401",
    }),
    {
      ok: true,
      flatId: "33333333-3333-4333-a333-333333333301",
      destinationText: null,
      residentId: "44444444-4444-4444-a444-444444444401",
    },
  );
  assert.deepEqual(
    parseVisitorDestinationInput({ destinationText: "Society Office" }),
    {
      ok: true,
      flatId: null,
      destinationText: "Society Office",
      residentId: null,
    },
  );
});

test("destination XOR rejects neither, both, blank Other, and Other+resident", () => {
  const neither = parseVisitorDestinationInput({});
  assert.equal(neither.ok, false);
  if (!neither.ok) {
    assert.equal(neither.message, DESTINATION_REQUIRED_MESSAGE);
  }

  const both = parseVisitorDestinationInput({
    flatId: "33333333-3333-4333-a333-333333333301",
    destinationText: "Clubhouse",
  });
  assert.equal(both.ok, false);
  if (!both.ok) {
    assert.equal(both.message, DESTINATION_BOTH_REJECTED_MESSAGE);
  }

  const blank = parseVisitorDestinationInput({ destinationText: "   " });
  assert.equal(blank.ok, false);

  const withResident = parseVisitorDestinationInput({
    destinationText: "Clubhouse",
    residentId: "44444444-4444-4444-a444-444444444401",
  });
  assert.equal(withResident.ok, false);
  if (!withResident.ok) {
    assert.equal(withResident.message, DESTINATION_OTHER_RESIDENT_REJECTED_MESSAGE);
    assert.equal(withResident.field, "residentId");
  }
});

test("CSV export flat labels use ASCII hyphen instead of the UI middle dot", () => {
  assert.equal(
    resolveVisitorDestinationLabelForCsvExport({
      flatId: "flat-1",
      wingBuilding: "B",
      flatNumber: "201",
      destinationText: null,
    }),
    "B-201",
  );
  assert.equal(
    resolveVisitorDestinationLabelForCsvExport({
      flatId: "flat-1",
      wingBuilding: "A",
      flatNumber: "A-101",
      destinationText: null,
    }),
    "A-101",
  );
  assert.equal(
    resolveVisitorDestinationLabelForCsvExport({
      flatId: null,
      flatNumber: "",
      destinationText: "Clubhouse",
    }),
    "Clubhouse",
  );
  assert.equal(
    resolveVisitorDestinationLabel({
      flatId: "flat-1",
      wingBuilding: "B",
      flatNumber: "201",
      destinationText: null,
    }),
    "B · 201",
  );
});

test("destination resolver uses real flat labels and Other text, never Unknown flat for Other", () => {
  assert.equal(
    resolveVisitorDestinationLabel({
      flatId: "flat-1",
      wingBuilding: "A",
      flatNumber: "101",
      destinationText: null,
    }),
    "A · 101",
  );
  assert.equal(
    resolveVisitorDestinationLabel({
      flatId: null,
      flatNumber: "Unknown flat",
      destinationText: "Clubhouse",
    }),
    "Clubhouse",
  );
  assert.equal(
    resolveVisitorDestinationLabel({
      flatId: "flat-1",
      flatNumber: "",
      destinationText: null,
    }),
    "Unknown flat",
  );
});

test("additive destination migration does not backfill or rewrite historical rows", () => {
  const sql = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../supabase/migrations/20260907120000_m03_visitor_destination_other.sql",
    ),
    "utf8",
  );
  assert.match(sql, /add column destination_text text/);
  assert.match(sql, /alter column flat_id drop not null/);
  assert.match(sql, /visitor_entries_destination_present/);
  assert.match(sql, /visitor_entries_other_has_no_resident/);
  assert.match(sql, /if new\.flat_id is not null then/);
  assert.equal(/update\s+public\.visitor_entries/i.test(sql), false);
  assert.equal(/backfill/i.test(sql), false);
});

test("structured Other destinations compose valid destinationText values", () => {
  assert.deepEqual(composeOtherDestinationText({ optionId: "clubhouse" }), {
    ok: true,
    destinationText: "Clubhouse",
  });
  assert.deepEqual(composeOtherDestinationText({ optionId: "society_office" }), {
    ok: true,
    destinationText: "Society Office",
  });
  assert.deepEqual(
    composeOtherDestinationText({
      optionId: "broker_property_visit",
      extraText: "  A-704  ",
    }),
    {
      ok: true,
      destinationText: "Broker / Property Visit - A-704",
    },
  );
  assert.deepEqual(
    composeOtherDestinationText({
      optionId: "other_destination",
      extraText: "  Gym  ",
    }),
    { ok: true, destinationText: "Gym" },
  );
});

test("structured Other destinations reject missing option, blank broker, and blank custom text", () => {
  const missingOption = composeOtherDestinationText({});
  assert.equal(missingOption.ok, false);
  if (!missingOption.ok) {
    assert.equal(missingOption.message, OTHER_DESTINATION_OPTION_REQUIRED_MESSAGE);
  }

  const blankBroker = composeOtherDestinationText({
    optionId: "broker_property_visit",
    extraText: "   ",
  });
  assert.equal(blankBroker.ok, false);
  if (!blankBroker.ok) {
    assert.equal(blankBroker.message, BROKER_FLAT_REQUIRED_MESSAGE);
  }

  const blankCustom = composeOtherDestinationText({
    optionId: "other_destination",
    extraText: "",
  });
  assert.equal(blankCustom.ok, false);
  if (!blankCustom.ok) {
    assert.equal(blankCustom.message, DESTINATION_TEXT_REQUIRED_MESSAGE);
  }
});

test("switching Other options does not keep stale extra text in composed destination", () => {
  const broker = composeOtherDestinationText({
    optionId: "broker_property_visit",
    extraText: "A-704",
  });
  assert.equal(broker.ok, true);

  const clubhouseAfterBroker = composeOtherDestinationText({
    optionId: "clubhouse",
    extraText: "A-704",
  });
  assert.deepEqual(clubhouseAfterBroker, {
    ok: true,
    destinationText: "Clubhouse",
  });

  const customAfterBroker = composeOtherDestinationText({
    optionId: "other_destination",
    extraText: "",
  });
  assert.equal(customAfterBroker.ok, false);
});

test("broker composed destination stays within the 80-character destination_text limit", () => {
  assert.equal(
    `${BROKER_DESTINATION_PREFIX}${"A".repeat(BROKER_FLAT_MAX_LENGTH)}`.length,
    DESTINATION_TEXT_MAX_LENGTH,
  );
  const atLimit = composeOtherDestinationText({
    optionId: "broker_property_visit",
    extraText: "A".repeat(BROKER_FLAT_MAX_LENGTH),
  });
  assert.equal(atLimit.ok, true);
});

