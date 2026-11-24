import test from "node:test";
import assert from "node:assert/strict";

import {
  acquireTranslationLock,
  isTranslationLocked,
} from "../services/translationProcessingLock.js";

const settings = {
  targetLanguage: "French",
  style: "literary" as const,
  contextMode: "previous" as const,
};

test("prevents duplicate translation operations", () => {
  const release = acquireTranslationLock(
    1,
    settings
  );

  assert.ok(release);

  try {
    assert.equal(
      isTranslationLocked(1, settings),
      true
    );

    const second = acquireTranslationLock(
      1,
      settings
    );

    assert.equal(second, null);
  } finally {
    release();
  }
});

test("allows different translation settings", () => {
  const releaseFrench = acquireTranslationLock(
    1,
    settings
  );

  const releaseGerman = acquireTranslationLock(
    1,
    {
      ...settings,
      targetLanguage: "German",
    }
  );

  assert.ok(releaseFrench);
  assert.ok(releaseGerman);

  releaseFrench();
  releaseGerman();
});

test("releases a lock safely", () => {
  const release = acquireTranslationLock(
    2,
    settings
  );

  assert.ok(release);

  release();
  release();

  assert.equal(
    isTranslationLocked(2, settings),
    false
  );

  const second = acquireTranslationLock(
    2,
    settings
  );

  assert.ok(second);
  second();
});
