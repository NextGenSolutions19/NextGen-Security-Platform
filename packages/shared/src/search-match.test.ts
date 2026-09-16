import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compactSearchValue,
  matchesNormalizedSearch,
} from "./search-match.ts";

test("compact search strips separators used in common flat representations", () => {
  assert.equal(compactSearchValue("B 201"), "b201");
  assert.equal(compactSearchValue("B-201"), "b201");
  assert.equal(compactSearchValue("B · 201"), "b201");
  assert.equal(compactSearchValue("B/201"), "b201");
});

test("combined wing and flat matches common typed representations", () => {
  const fields = {
    identifiers: ["201", "9876543210"],
    locations: ["B · 201", "B", "201"],
    phrases: ["Suresh Nair", "B"],
  };

  for (const query of ["B 201", "B-201", "B · 201", "B/201", "b201"]) {
    assert.equal(matchesNormalizedSearch(query, fields), true, query);
  }
});

test("single-letter building search does not match unrelated Building text", () => {
  const buildingA = {
    identifiers: ["201"],
    locations: ["Building A · 201", "Building A", "201"],
    phrases: ["Kavita Rao", "Building A"],
  };
  const buildingB = {
    identifiers: ["201"],
    locations: ["Building B · 201", "Building B", "201"],
    phrases: ["Suresh Nair", "Building B"],
  };

  assert.equal(matchesNormalizedSearch("B", buildingA), false);
  assert.equal(matchesNormalizedSearch("B", buildingB), true);
  assert.equal(matchesNormalizedSearch("BUILDING A", buildingA), true);
  assert.equal(matchesNormalizedSearch("201", buildingA), true);
});
