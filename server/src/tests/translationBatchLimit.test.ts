import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BATCH_LIMIT,
  getTranslationBatchLimit,
} from "../services/translationBatchLimit.js";

test("uses the default batch limit", () => {
  assert.equal(
    getTranslationBatchLimit(),
    DEFAULT_BATCH_LIMIT
  );
});

test("accepts a custom batch limit", () => {
  assert.equal(
    getTranslationBatchLimit("5"),
    5
  );

  assert.equal(
    getTranslationBatchLimit("25"),
    25
  );
});

test("rejects invalid batch limits", () => {
  for (const value of [
    "0",
    "-1",
    "1.5",
    "abc",
    "1001",
  ]) {
    assert.throws(
      () => getTranslationBatchLimit(value),
      /between 1 and 1000/
    );
  }
});
