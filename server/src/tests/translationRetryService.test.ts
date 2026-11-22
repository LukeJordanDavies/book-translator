import test from "node:test";
import assert from "node:assert/strict";

import {
  EmptyTranslationError,
  retryTranslationOutput,
} from "../services/translationRetryService.js";

const italicTag = {
  id: 1,
  tagName: "em",
  attributes: {},
};

test("accepts a valid translation immediately", async () => {
  let attempts = 0;

  const result = await retryTranslationOutput(
    async () => {
      attempts++;
      return "[[OPEN_1]]Bonjour[[CLOSE_1]]";
    },
    [italicTag],
    { baseDelayMs: 0 }
  );

  assert.equal(
    result,
    "[[OPEN_1]]Bonjour[[CLOSE_1]]"
  );

  assert.equal(attempts, 1);
});

test("retries a translation with missing markers", async () => {
  let attempts = 0;

  const result = await retryTranslationOutput(
    async () => {
      attempts++;

      return attempts === 1
        ? "Bonjour"
        : "[[OPEN_1]]Bonjour[[CLOSE_1]]";
    },
    [italicTag],
    { baseDelayMs: 0 }
  );

  assert.equal(
    result,
    "[[OPEN_1]]Bonjour[[CLOSE_1]]"
  );

  assert.equal(attempts, 2);
});

test("stops after the maximum invalid output attempts", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      retryTranslationOutput(
        async () => {
          attempts++;
          return "Missing formatting markers";
        },
        [italicTag],
        {
          maxAttempts: 2,
          baseDelayMs: 0,
        }
      ),
    /Translation output invalid after 2 attempts/
  );

  assert.equal(attempts, 2);
});

test("retries an empty translation response", async () => {
  let attempts = 0;

  const result = await retryTranslationOutput(
    async () => {
      attempts++;

      if (attempts === 1) {
        throw new EmptyTranslationError();
      }

      return "Bonjour";
    },
    [],
    { baseDelayMs: 0 }
  );

  assert.equal(result, "Bonjour");
  assert.equal(attempts, 2);
});

test("does not add retries for API failures", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      retryTranslationOutput(
        async () => {
          attempts++;
          throw new Error("API unavailable");
        },
        [],
        {
          maxAttempts: 2,
          baseDelayMs: 0,
        }
      ),
    /API unavailable/
  );

  assert.equal(attempts, 1);
});
